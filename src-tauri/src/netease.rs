use aes::Aes128;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use cbc::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use num_bigint::BigUint;
use num_traits::Num;
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

type Aes128CbcEnc = cbc::Encryptor<Aes128>;

const PRESET_KEY: &[u8; 16] = b"0CoJUm6Qyw8W8jud";
const IV: &[u8; 16] = b"0102030405060708";
const BASE62: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/// NetEase weapi RSA modulus (hex) + public exponent 0x10001
/// Updated key used by current clients (empty body usually means wrong key/encrypt).
const RSA_N_HEX: &str = "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";
const RSA_E_HEX: &str = "010001";
const DEFAULT_COOKIE: &str = "os=pc; appver=2.9.7; channel=netease";
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

#[derive(Debug, thiserror::Error)]
pub enum NeteaseError {
    #[error("crypto: {0}")]
    Crypto(String),
    #[error("http: {0}")]
    Http(String),
}

impl Serialize for NeteaseError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NeteaseResponse {
    pub status: u16,
    pub body: Value,
    pub cookies: Vec<String>,
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .cookie_store(false)
            .build()
            .expect("failed to build http client")
    })
}

fn aes_encrypt(data: &[u8], key: &[u8]) -> Result<String, NeteaseError> {
    let encryptor = Aes128CbcEnc::new_from_slices(key, IV)
        .map_err(|e| NeteaseError::Crypto(e.to_string()))?;
    let ciphertext = encryptor.encrypt_padded_vec_mut::<Pkcs7>(data);
    Ok(BASE64.encode(ciphertext))
}

fn rsa_encrypt(data: &[u8]) -> Result<String, NeteaseError> {
    let mut buffer = vec![0u8; 128];
    if data.len() > 128 {
        return Err(NeteaseError::Crypto("rsa payload too large".into()));
    }
    buffer[128 - data.len()..].copy_from_slice(data);

    let n = BigUint::from_str_radix(RSA_N_HEX, 16)
        .map_err(|e| NeteaseError::Crypto(e.to_string()))?;
    let e = BigUint::from_str_radix(RSA_E_HEX, 16)
        .map_err(|e| NeteaseError::Crypto(e.to_string()))?;
    let m = BigUint::from_bytes_be(&buffer);
    let c = m.modpow(&e, &n);
    let mut hex = c.to_str_radix(16);
    while hex.len() < 256 {
        hex.insert(0, '0');
    }
    Ok(hex)
}

fn random_secret_key() -> String {
    let mut rng = rand::thread_rng();
    (0..16)
        .map(|_| BASE62[rng.gen_range(0..BASE62.len())] as char)
        .collect()
}

pub fn weapi_encrypt(object: &Value) -> Result<(String, String), NeteaseError> {
    let text = serde_json::to_string(object)
        .map_err(|e| NeteaseError::Crypto(e.to_string()))?;
    let secret_key = random_secret_key();
    let first = aes_encrypt(text.as_bytes(), PRESET_KEY)?;
    let params = aes_encrypt(first.as_bytes(), secret_key.as_bytes())?;
    let reversed: String = secret_key.chars().rev().collect();
    let enc_sec_key = rsa_encrypt(reversed.as_bytes())?;
    Ok((params, enc_sec_key))
}

fn merge_cookies(existing: Option<&str>, set_cookies: &[String]) -> String {
    let mut map: HashMap<String, String> = HashMap::new();

    if let Some(raw) = existing {
        for part in raw.split(';') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            if let Some((k, v)) = part.split_once('=') {
                map.insert(k.trim().to_string(), v.trim().to_string());
            }
        }
    }

    for sc in set_cookies {
        let first = sc.split(';').next().unwrap_or("").trim();
        if let Some((k, v)) = first.split_once('=') {
            let key = k.trim();
            let val = v.trim();
            if val.eq_ignore_ascii_case("deleted") || val.is_empty() {
                map.remove(key);
            } else {
                map.insert(key.to_string(), val.to_string());
            }
        }
    }

    map.into_iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("; ")
}

pub async fn weapi_request(
    path: &str,
    data: Value,
    cookie: Option<String>,
) -> Result<NeteaseResponse, NeteaseError> {
    let (params, enc_sec_key) = weapi_encrypt(&data)?;
    let url = if path.starts_with("http") {
        path.to_string()
    } else {
        format!("https://music.163.com{path}")
    };

    let form = [
        ("params", params.as_str()),
        ("encSecKey", enc_sec_key.as_str()),
    ];

    let mut cookie_header = DEFAULT_COOKIE.to_string();
    if let Some(ref c) = cookie {
        if !c.is_empty() {
            cookie_header = format!("{DEFAULT_COOKIE}; {c}");
        }
    }

    let response = http_client()
        .post(&url)
        .header("Referer", "https://music.163.com")
        .header("Origin", "https://music.163.com")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Cookie", cookie_header)
        .form(&form)
        .send()
        .await
        .map_err(|e| NeteaseError::Http(e.to_string()))?;

    let status = response.status().as_u16();
    let set_cookies: Vec<String> = response
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();

    let text = response
        .text()
        .await
        .map_err(|e| NeteaseError::Http(e.to_string()))?;

    let body: Value = serde_json::from_str(&text).unwrap_or_else(|_| Value::String(text));

    let mut cookies = Vec::new();
    if !set_cookies.is_empty() {
        let merged = merge_cookies(cookie.as_deref(), &set_cookies);
        if !merged.is_empty() {
            cookies.push(merged);
        }
    }

    Ok(NeteaseResponse {
        status,
        body,
        cookies,
    })
}

pub fn qr_login_url(uni_key: &str) -> String {
    format!("https://music.163.com/login?codekey={uni_key}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn weapi_produces_params() {
        let (params, enc) = weapi_encrypt(&json!({"type": 1})).unwrap();
        assert!(!params.is_empty());
        assert_eq!(enc.len(), 256);
        assert!(enc.chars().all(|c| c.is_ascii_hexdigit()));
    }
}

#[cfg(test)]
mod live_tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn unikey_live() {
        let res = weapi_request(
            "/weapi/login/qrcode/unikey",
            json!({ "type": 1 }),
            None,
        )
        .await
        .expect("request");
        println!("status={} body={}", res.status, res.body);
        assert_eq!(res.status, 200);
        assert!(res.body.get("unikey").is_some() || res.body.get("code") == Some(&json!(200)));
    }
}
