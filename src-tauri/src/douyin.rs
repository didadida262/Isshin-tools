//! Douyin (抖音) cookie login + works/likes list + download.
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, COOKIE, REFERER, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

const USER_AGENT_VALUE: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36";
const REFERER_VALUE: &str = "https://www.douyin.com/";
const AID: &str = "6383";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DouyinProfile {
    pub sec_uid: String,
    pub uid: String,
    pub nickname: String,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DouyinAweme {
    pub aweme_id: String,
    pub desc: String,
    pub cover_url: String,
    pub play_url: String,
    pub duration_ms: u64,
    pub digg_count: u64,
    pub create_time: u64,
    pub author_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DouyinListResult {
    pub items: Vec<DouyinAweme>,
    pub max_cursor: u64,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DouyinDownloadResult {
    pub path: String,
    pub aweme_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DouyinDownloadedEntry {
    pub aweme_id: String,
    pub kind: String,
    pub path: String,
    pub title: String,
    pub downloaded_at: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct DownloadIndex {
    version: u32,
    #[serde(default)]
    entries: HashMap<String, DouyinDownloadedEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DouyinQrSession {
    pub token: String,
    pub qr_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DouyinQrPollResult {
    /// pending | scanned | confirmed | expired | error
    pub status: String,
    pub cookie: Option<String>,
    pub message: Option<String>,
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT_VALUE)
            .http1_only()
            .timeout(Duration::from_secs(45))
            .connect_timeout(Duration::from_secs(15))
            .pool_max_idle_per_host(0)
            .cookie_store(false)
            .build()
            .expect("douyin http client")
    })
}

/// 视频拉取不设总超时，避免长视频被 45s 掐断；仅保留连接超时。
fn download_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT_VALUE)
            .http1_only()
            .connect_timeout(Duration::from_secs(15))
            .pool_max_idle_per_host(0)
            .cookie_store(false)
            .build()
            .expect("douyin download client")
    })
}

fn index_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn normalize_cookie(raw: &str) -> Result<String, String> {
    let cookie = raw
        .trim()
        .trim_start_matches("Cookie:")
        .trim_start_matches("cookie:")
        .trim()
        .to_string();
    if cookie.is_empty() {
        return Err("Cookie 为空".into());
    }
    let lower = cookie.to_ascii_lowercase();
    if !(lower.contains("sessionid=") || lower.contains("sessionid_ss=")) {
        return Err("Cookie 中缺少 sessionid，请从已登录的 douyin.com 复制完整 Cookie".into());
    }
    Ok(cookie)
}

fn header_map(cookie: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_VALUE));
    headers.insert(REFERER, HeaderValue::from_static(REFERER_VALUE));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json, text/plain, */*"));
    headers.insert(
        reqwest::header::ACCEPT_LANGUAGE,
        HeaderValue::from_static("zh-CN,zh;q=0.9"),
    );
    headers.insert(
        COOKIE,
        HeaderValue::from_str(cookie).map_err(|e| format!("Cookie 非法: {e}"))?,
    );
    Ok(headers)
}

fn abogus_script() -> Result<PathBuf, String> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "无法定位项目根目录".to_string())?
        .join("scripts")
        .join("douyin_abogus.py");
    if !path.is_file() {
        return Err(format!("缺少签名脚本: {}", path.display()));
    }
    Ok(path)
}

fn sign_a_bogus(params: &Value) -> Result<String, String> {
    let script = abogus_script()?;
    let payload = serde_json::to_string(params).map_err(|e| e.to_string())?;
    let output = Command::new("python3")
        .arg(&script)
        .arg(&payload)
        .output()
        .map_err(|e| {
            format!("无法执行 python3 签名脚本（请确认本机已安装 Python3）: {e}")
        })?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("a_bogus 签名失败: {}", err.trim()));
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        return Err("a_bogus 签名结果为空".into());
    }
    Ok(value)
}

fn common_params() -> serde_json::Map<String, Value> {
    let mut m = serde_json::Map::new();
    m.insert("device_platform".into(), json!("webapp"));
    m.insert("aid".into(), json!(AID));
    m.insert("channel".into(), json!("channel_pc_web"));
    m.insert("pc_client_type".into(), json!("1"));
    m.insert("version_code".into(), json!("170400"));
    m.insert("version_name".into(), json!("17.4.0"));
    m.insert("cookie_enabled".into(), json!("true"));
    m.insert("screen_width".into(), json!("1920"));
    m.insert("screen_height".into(), json!("1080"));
    m.insert("browser_language".into(), json!("zh-CN"));
    m.insert("browser_platform".into(), json!("Win32"));
    m.insert("browser_name".into(), json!("Chrome"));
    m.insert("browser_version".into(), json!("90.0.4430.212"));
    m.insert("browser_online".into(), json!("true"));
    m.insert("engine_name".into(), json!("Blink"));
    m.insert("engine_version".into(), json!("90.0.4430.212"));
    m.insert("os_name".into(), json!("Windows"));
    m.insert("os_version".into(), json!("10"));
    m.insert("cpu_core_num".into(), json!("8"));
    m.insert("device_memory".into(), json!("8"));
    m.insert("platform".into(), json!("PC"));
    m.insert("downsample".into(), json!("1"));
    m.insert("update_version_code".into(), json!("170400"));
    m
}

fn build_query(params: &serde_json::Map<String, Value>) -> String {
    let mut parts = Vec::new();
    for (k, v) in params {
        let s = match v {
            Value::String(x) => x.clone(),
            Value::Number(n) => n.to_string(),
            Value::Bool(b) => b.to_string(),
            _ => v.to_string().trim_matches('"').to_string(),
        };
        parts.push(format!(
            "{}={}",
            urlencoding_encode(k),
            urlencoding_encode(&s)
        ));
    }
    parts.join("&")
}

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

async fn signed_get(cookie: &str, path: &str, mut params: serde_json::Map<String, Value>) -> Result<Value, String> {
    let bogus = sign_a_bogus(&Value::Object(params.clone()))?;
    params.insert("a_bogus".into(), json!(bogus));
    let url = format!("https://www.douyin.com{path}?{}", build_query(&params));
    let resp = http_client()
        .get(&url)
        .headers(header_map(cookie)?)
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;
    if text.trim().is_empty() {
        return Err(format!(
            "接口返回空响应 (HTTP {status})，可能 Cookie 失效或触发风控，请重新复制登录 Cookie"
        ));
    }
    if !status.is_success() {
        let snippet: String = text.chars().take(160).collect();
        return Err(format!("HTTP {status} · {snippet}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("JSON 解析失败: {e} · {}", text.chars().take(120).collect::<String>()))
}

async fn signed_post(
    cookie: &str,
    path: &str,
    mut query: serde_json::Map<String, Value>,
    form: &[(String, String)],
) -> Result<Value, String> {
    let bogus = sign_a_bogus(&Value::Object(query.clone()))?;
    query.insert("a_bogus".into(), json!(bogus));
    let url = format!("https://www.douyin.com{path}?{}", build_query(&query));
    let body = form
        .iter()
        .map(|(k, v)| format!("{}={}", urlencoding_encode(k), urlencoding_encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    let mut headers = header_map(cookie)?;
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded; charset=UTF-8"),
    );

    let resp = http_client()
        .post(&url)
        .headers(headers)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;
    if text.trim().is_empty() {
        return Err(format!(
            "接口返回空响应 (HTTP {status})，可能 Cookie 失效或触发风控，请重新复制登录 Cookie"
        ));
    }
    if !status.is_success() {
        let snippet: String = text.chars().take(160).collect();
        return Err(format!("HTTP {status} · {snippet}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("JSON 解析失败: {e} · {}", text.chars().take(120).collect::<String>()))
}

fn first_url(list: Option<&Vec<Value>>) -> String {
    list.and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn pick_play_url(video: &Value) -> String {
    let candidates = [
        video.pointer("/play_addr/url_list"),
        video.pointer("/download_addr/url_list"),
        video.pointer("/play_addr_h264/url_list"),
    ];
    for c in candidates {
        if let Some(Value::Array(arr)) = c {
            if let Some(u) = arr.iter().find_map(|x| x.as_str()) {
                if !u.is_empty() {
                    return u.to_string();
                }
            }
        }
    }
    if let Some(Value::Array(rates)) = video.get("bit_rate") {
        for rate in rates {
            if let Some(Value::Array(arr)) = rate.pointer("/play_addr/url_list") {
                if let Some(u) = arr.iter().find_map(|x| x.as_str()) {
                    if !u.is_empty() {
                        return u.to_string();
                    }
                }
            }
        }
    }
    String::new()
}

fn parse_aweme(item: &Value) -> Option<DouyinAweme> {
    let aweme_id = item.get("aweme_id")?.as_str()?.to_string();
    let desc = item
        .get("desc")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let video = item.get("video")?;
    let play_url = pick_play_url(video);
    if play_url.is_empty() {
        return None;
    }
    let cover_url = first_url(
        video
            .pointer("/cover/url_list")
            .and_then(|v| v.as_array())
            .or_else(|| video.pointer("/origin_cover/url_list").and_then(|v| v.as_array())),
    );
    let duration_ms = video
        .get("duration")
        .and_then(|v| v.as_u64())
        .or_else(|| item.get("duration").and_then(|v| v.as_u64()))
        .unwrap_or(0);
    let digg_count = item
        .pointer("/statistics/digg_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let create_time = item.get("create_time").and_then(|v| v.as_u64()).unwrap_or(0);
    let author_name = item
        .pointer("/author/nickname")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Some(DouyinAweme {
        aweme_id,
        desc,
        cover_url,
        play_url,
        duration_ms,
        digg_count,
        create_time,
        author_name,
    })
}

fn resolve_download_root(app: &AppHandle) -> Result<PathBuf, String> {
    let from_manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|root| root.join("downloads").join("抖音"));
    if let Some(dir) = from_manifest {
        let marker = dir
            .parent()
            .and_then(|p| p.parent())
            .map(|root| root.join("package.json"));
        if marker.map(|m| m.is_file()).unwrap_or(false) || cfg!(debug_assertions) {
            return Ok(dir);
        }
    }
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
    Ok(base.join("downloads").join("抖音"))
}

fn index_path(root: &Path) -> PathBuf {
    root.join("index.json")
}

fn index_entry_key(kind_folder: &str, aweme_id: &str) -> String {
    format!("{kind_folder}:{aweme_id}")
}

fn normalize_kind_folder(kind: &str) -> &'static str {
    match kind.trim().to_ascii_lowercase().as_str() {
        "favorite" | "like" | "likes" => "likes",
        _ => "works",
    }
}

/// Migrate legacy index keys (`aweme_id` only) to `likes|works:aweme_id`.
fn migrate_index_keys(index: &mut DownloadIndex) -> bool {
    let mut changed = false;
    let mut next: HashMap<String, DouyinDownloadedEntry> = HashMap::new();
    for (key, mut entry) in index.entries.drain() {
        let folder = normalize_kind_folder(&entry.kind);
        if entry.kind != folder {
            entry.kind = folder.to_string();
            changed = true;
        }
        let proper = index_entry_key(folder, &entry.aweme_id);
        if key != proper {
            changed = true;
        }
        if let Some(prev) = next.get(&proper) {
            if prev.downloaded_at >= entry.downloaded_at {
                continue;
            }
        }
        next.insert(proper, entry);
    }
    index.entries = next;
    changed
}

async fn load_index(root: &Path) -> Result<DownloadIndex, String> {
    let path = index_path(root);
    if !path.is_file() {
        return Ok(DownloadIndex {
            version: 1,
            entries: HashMap::new(),
        });
    }
    let text = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("读取下载索引失败: {e}"))?;
    let mut index: DownloadIndex =
        serde_json::from_str(&text).map_err(|e| format!("解析下载索引失败: {e}"))?;
    if migrate_index_keys(&mut index) {
        index.version = 1;
        save_index(root, &index).await?;
    }
    Ok(index)
}

async fn save_index(root: &Path, index: &DownloadIndex) -> Result<(), String> {
    fs::create_dir_all(root)
        .await
        .map_err(|e| format!("创建下载目录失败: {e}"))?;
    let text = serde_json::to_string_pretty(index).map_err(|e| format!("序列化索引失败: {e}"))?;
    fs::write(index_path(root), text)
        .await
        .map_err(|e| format!("写入下载索引失败: {e}"))
}

fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "douyin".into()
    } else {
        trimmed.chars().take(80).collect()
    }
}

#[tauri::command]
pub async fn douyin_login_cookie(cookie: String) -> Result<DouyinProfile, String> {
    let cookie = normalize_cookie(&cookie)?;
    // profile/self often works without a_bogus
    let url = format!(
        "https://www.douyin.com/aweme/v1/web/user/profile/self/?device_platform=webapp&aid={AID}&channel=channel_pc_web"
    );
    let resp = http_client()
        .get(&url)
        .headers(header_map(&cookie)?)
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;
    let status = resp.status();
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析资料失败: {e}"))?;
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    let code = body.get("status_code").and_then(|v| v.as_i64()).unwrap_or(-1);
    if code != 0 {
        let msg = body
            .get("status_msg")
            .and_then(|v| v.as_str())
            .unwrap_or("登录失败");
        return Err(format!("{msg}（code={code}）"));
    }
    let user = body
        .get("user")
        .ok_or_else(|| "未返回用户信息，请确认 Cookie 有效".to_string())?;
    let sec_uid = user
        .get("sec_uid")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if sec_uid.is_empty() {
        return Err("用户 sec_uid 为空".into());
    }
    let uid = user
        .get("uid")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .or_else(|| user.get("uid").and_then(|v| v.as_u64()).map(|n| n.to_string()))
        .unwrap_or_default();
    let nickname = user
        .get("nickname")
        .and_then(|v| v.as_str())
        .unwrap_or("抖音用户")
        .to_string();
    let avatar_url = user
        .pointer("/avatar_thumb/url_list")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .or_else(|| {
            user.pointer("/avatar_medium/url_list")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.as_str())
        })
        .unwrap_or("")
        .to_string();
    Ok(DouyinProfile {
        sec_uid,
        uid,
        nickname,
        avatar_url,
    })
}

#[tauri::command]
pub async fn douyin_qr_start() -> Result<DouyinQrSession, String> {
    // Best-effort Douyin web QR. May be risk-controlled on some networks.
    let url = format!(
        "https://login.douyin.com/passport/web/get_qrcode/?next=https%3A%2F%2Fwww.douyin.com&aid={AID}&need_logo=false&service=https%3A%2F%2Fwww.douyin.com"
    );
    let resp = http_client()
        .get(url)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .header(REFERER, REFERER_VALUE)
        .send()
        .await
        .map_err(|e| format!("获取二维码失败: {e}"))?;
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析二维码响应失败: {e}"))?;
    if body.get("message").and_then(|v| v.as_str()) == Some("error") {
        let desc = body
            .pointer("/data/description")
            .and_then(|v| v.as_str())
            .unwrap_or("扫码入口被风控拦截，请改用 Cookie 登录");
        return Err(desc.to_string());
    }
    let token = body
        .pointer("/data/token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "二维码 token 缺失，请改用 Cookie 登录".to_string())?
        .to_string();
    let qr_url = body
        .pointer("/data/qrcode_index_url")
        .or_else(|| body.pointer("/data/qrcode"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("https://www.douyin.com/?qr={}", urlencoding_encode(&token)));
    Ok(DouyinQrSession { token, qr_url })
}

#[tauri::command]
pub async fn douyin_qr_poll(token: String) -> Result<DouyinQrPollResult, String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("token 为空".into());
    }
    let url = format!(
        "https://login.douyin.com/passport/web/check_qrconnect/?token={}&aid={AID}&next=https%3A%2F%2Fwww.douyin.com",
        urlencoding_encode(token)
    );
    let resp = http_client()
        .get(url)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .header(REFERER, REFERER_VALUE)
        .send()
        .await
        .map_err(|e| format!("轮询扫码状态失败: {e}"))?;
    let set_cookies: Vec<String> = resp
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析扫码状态失败: {e}"))?;

    let error_code = body
        .pointer("/data/error_code")
        .and_then(|v| v.as_i64())
        .or_else(|| body.pointer("/data/error_code").and_then(|v| v.as_u64()).map(|n| n as i64))
        .unwrap_or(0);
    // Common Douyin QR statuses vary; map loosely.
    let status = match error_code {
        0 => {
            if set_cookies.iter().any(|c| c.contains("sessionid=")) {
                "confirmed"
            } else {
                "pending"
            }
        }
        2046 => "scanned",
        2047 => "confirmed",
        2048 | 2049 => "expired",
        _ => "pending",
    };

    let cookie = if status == "confirmed" {
        let joined = set_cookies
            .iter()
            .filter_map(|c| c.split(';').next().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("; ");
        if joined.contains("sessionid=") {
            Some(joined)
        } else {
            None
        }
    } else {
        None
    };

    Ok(DouyinQrPollResult {
        status: status.into(),
        cookie,
        message: body
            .pointer("/data/description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    })
}

#[tauri::command]
pub async fn douyin_list_aweme(
    cookie: String,
    sec_uid: String,
    kind: String,
    cursor: Option<u64>,
) -> Result<DouyinListResult, String> {
    let cookie = normalize_cookie(&cookie)?;
    let sec_uid = sec_uid.trim();
    if sec_uid.is_empty() {
        return Err("sec_uid 为空".into());
    }
    let kind = kind.trim().to_ascii_lowercase();
    let path = match kind.as_str() {
        "post" | "works" => "/aweme/v1/web/aweme/post/",
        "favorite" | "like" | "likes" => "/aweme/v1/web/aweme/favorite/",
        _ => return Err("kind 仅支持 post / favorite".into()),
    };

    let mut params = common_params();
    params.insert("sec_user_id".into(), json!(sec_uid));
    params.insert("count".into(), json!("20"));
    params.insert("max_cursor".into(), json!(cursor.unwrap_or(0).to_string()));
    params.insert("min_cursor".into(), json!("0"));
    params.insert("publish_video_strategy_type".into(), json!("2"));

    let body = signed_get(&cookie, path, params).await?;
    let status_code = body.get("status_code").and_then(|v| v.as_i64()).unwrap_or(0);
    if status_code != 0 {
        let msg = body
            .get("status_msg")
            .and_then(|v| v.as_str())
            .unwrap_or("拉取列表失败");
        return Err(format!("{msg}（code={status_code}）"));
    }

    let items = body
        .get("aweme_list")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(parse_aweme)
        .collect::<Vec<_>>();

    let max_cursor = body
        .get("max_cursor")
        .and_then(|v| v.as_u64())
        .or_else(|| {
            body.get("max_cursor")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
        })
        .unwrap_or(0);
    let has_more = body
        .get("has_more")
        .and_then(|v| v.as_bool())
        .or_else(|| body.get("has_more").and_then(|v| v.as_i64()).map(|n| n != 0))
        .unwrap_or(false);

    Ok(DouyinListResult {
        items,
        max_cursor,
        has_more,
    })
}

/// 取消喜欢（等价于网页端熄灭红色爱心）。`type=0` 取消，`type=1` 点赞。
#[tauri::command]
pub async fn douyin_unlike(cookie: String, aweme_id: String) -> Result<(), String> {
    let cookie = normalize_cookie(&cookie)?;
    let aweme_id = aweme_id.trim().to_string();
    if aweme_id.is_empty() {
        return Err("aweme_id 不能为空".into());
    }

    let query = common_params();
    let form = vec![
        ("aweme_id".into(), aweme_id),
        ("item_type".into(), "0".into()),
        ("type".into(), "0".into()),
    ];

    let body = signed_post(
        &cookie,
        "/aweme/v1/web/commit/item/digg/",
        query,
        &form,
    )
    .await?;

    let status_code = body.get("status_code").and_then(|v| v.as_i64()).unwrap_or(-1);
    if status_code != 0 {
        let msg = body
            .get("status_msg")
            .and_then(|v| v.as_str())
            .unwrap_or("取消喜欢失败");
        return Err(format!("{msg}（code={status_code}）"));
    }
    Ok(())
}

#[tauri::command]
pub async fn douyin_list_downloaded(app: AppHandle) -> Result<Vec<DouyinDownloadedEntry>, String> {
    let root = resolve_download_root(&app)?;
    let _guard = index_lock().lock().await;
    let mut index = load_index(&root).await?;
    let mut alive = Vec::new();
    let mut changed = false;
    let keys: Vec<String> = index.entries.keys().cloned().collect();
    for key in keys {
        let Some(entry) = index.entries.get(&key).cloned() else {
            continue;
        };
        if Path::new(&entry.path).is_file() {
            alive.push(entry);
        } else {
            index.entries.remove(&key);
            changed = true;
        }
    }
    if changed {
        save_index(&root, &index).await?;
    }
    alive.sort_by(|a, b| b.downloaded_at.cmp(&a.downloaded_at));
    Ok(alive)
}

#[tauri::command]
pub async fn douyin_cache_preview(
    app: AppHandle,
    cookie: String,
    aweme_id: String,
    play_url: String,
) -> Result<String, String> {
    let cookie = normalize_cookie(&cookie)?;
    let aweme_id = aweme_id.trim().to_string();
    let play_url = play_url.trim().to_string();
    if aweme_id.is_empty() || play_url.is_empty() {
        return Err("参数不完整".into());
    }
    let root = resolve_download_root(&app)?;
    let dir = root.join("preview");
    fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("创建预览目录失败: {e}"))?;
    let output = dir.join(format!("{aweme_id}.mp4"));
    if output.is_file() {
        return Ok(output.to_string_lossy().to_string());
    }

    let resp = download_client()
        .get(&play_url)
        .headers(header_map(&cookie)?)
        .send()
        .await
        .map_err(|e| format!("预览拉取失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("预览 HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取预览流失败: {e}"))?;
    fs::write(&output, &bytes)
        .await
        .map_err(|e| format!("写入预览失败: {e}"))?;
    Ok(output.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn douyin_download(
    app: AppHandle,
    cookie: String,
    aweme_id: String,
    play_url: String,
    title: Option<String>,
    kind: Option<String>,
) -> Result<DouyinDownloadResult, String> {
    let cookie = normalize_cookie(&cookie)?;
    let aweme_id = aweme_id.trim().to_string();
    let play_url = play_url.trim().to_string();
    if aweme_id.is_empty() || play_url.is_empty() {
        return Err("aweme_id / play_url 不能为空".into());
    }
    let kind = kind.unwrap_or_else(|| "works".into());
    let kind_folder = normalize_kind_folder(&kind);

    let root = resolve_download_root(&app)?;
    let out_dir = root.join(kind_folder);
    fs::create_dir_all(&out_dir)
        .await
        .map_err(|e| format!("创建目录失败: {e}"))?;

    let stem = sanitize_filename(
        title
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(&aweme_id),
    );
    let output = out_dir.join(format!("{aweme_id}_{stem}.mp4"));

    let resp = download_client()
        .get(&play_url)
        .headers(header_map(&cookie)?)
        .header(REFERER, HeaderValue::from_static("https://www.douyin.com/"))
        .send()
        .await
        .map_err(|e| format!("下载失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载 HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取视频流失败: {e}"))?;
    let mut file = fs::File::create(&output)
        .await
        .map_err(|e| format!("创建文件失败: {e}"))?;
    file.write_all(&bytes)
        .await
        .map_err(|e| format!("写入失败: {e}"))?;
    file.flush().await.map_err(|e| format!("刷新失败: {e}"))?;

    let downloaded_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path_str = output.to_string_lossy().to_string();
    {
        let _guard = index_lock().lock().await;
        let mut index = load_index(&root).await?;
        index.version = 1;
        index.entries.insert(
            index_entry_key(kind_folder, &aweme_id),
            DouyinDownloadedEntry {
                aweme_id: aweme_id.clone(),
                kind: kind_folder.into(),
                path: path_str.clone(),
                title: stem,
                downloaded_at,
            },
        );
        save_index(&root, &index).await?;
    }

    Ok(DouyinDownloadResult {
        path: path_str,
        aweme_id,
    })
}
