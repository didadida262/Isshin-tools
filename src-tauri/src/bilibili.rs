//! Bilibili search + video/audio download for playlist resource sniffing.
use md5::{Digest, Md5};
use reqwest::header::{HeaderMap, HeaderValue, COOKIE, REFERER, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::video_trim::resolve_ffmpeg;

const USER_AGENT_VALUE: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const REFERER_VALUE: &str = "https://www.bilibili.com";
const MIXIN_KEY_ENC_TAB: [u8; 64] = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29,
    28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25,
    54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BiliSearchItem {
    pub bvid: String,
    pub title: String,
    pub author: String,
    pub duration_text: String,
    pub duration_sec: u64,
    pub play: u64,
    pub cover: String,
    pub duration_delta_ms: Option<i64>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BiliDownloadResult {
    pub path: String,
    pub bvid: String,
    pub title: String,
    pub song_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BiliDownloadedEntry {
    pub song_id: u64,
    pub playlist_id: Option<u64>,
    pub playlist_name: Option<String>,
    pub path: String,
    pub bvid: String,
    pub title: String,
    pub artists: Option<String>,
    pub downloaded_at: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct DownloadIndex {
    version: u32,
    #[serde(default)]
    entries: std::collections::HashMap<String, BiliDownloadedEntry>,
}

fn index_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

struct WbiCache {
    mixin_key: String,
    fetched_at: Instant,
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT_VALUE)
            .http1_only()
            .timeout(Duration::from_secs(60))
            .connect_timeout(Duration::from_secs(15))
            .pool_max_idle_per_host(0)
            .build()
            .expect("bilibili http client")
    })
}

fn wbi_cache() -> &'static Mutex<Option<WbiCache>> {
    static CACHE: OnceLock<Mutex<Option<WbiCache>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn buvid3() -> String {
    Uuid::new_v4().to_string()
}

fn default_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_VALUE));
    headers.insert(REFERER, HeaderValue::from_static(REFERER_VALUE));
    if let Ok(v) = HeaderValue::from_str(&format!("buvid3={}", buvid3())) {
        headers.insert(COOKIE, v);
    }
    headers
}

fn encode_uri_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~' | b'*'
            | b'\'' | b'(' | b')' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn mixin_key_from(img_key: &str, sub_key: &str) -> String {
    let raw = format!("{img_key}{sub_key}");
    let bytes = raw.as_bytes();
    let mut out = String::with_capacity(32);
    for &idx in &MIXIN_KEY_ENC_TAB {
        if let Some(&b) = bytes.get(idx as usize) {
            out.push(b as char);
        }
    }
    out.truncate(32);
    out
}

fn filter_value(v: &str) -> String {
    v.chars().filter(|c| !"!'()*".contains(*c)).collect()
}

fn sign_wbi(params: &[(String, String)], mixin_key: &str) -> Vec<(String, String)> {
    let wts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        .to_string();

    let mut pairs: Vec<(String, String)> = params
        .iter()
        .map(|(k, v)| (k.clone(), filter_value(v)))
        .collect();
    pairs.push(("wts".into(), wts));
    pairs.sort_by(|a, b| a.0.cmp(&b.0));

    let query = pairs
        .iter()
        .map(|(k, v)| format!("{}={}", encode_uri_component(k), encode_uri_component(v)))
        .collect::<Vec<_>>()
        .join("&");
    let mut hasher = Md5::new();
    hasher.update(format!("{query}{mixin_key}").as_bytes());
    let w_rid = format!("{:x}", hasher.finalize());
    pairs.push(("w_rid".into(), w_rid));
    pairs
}

async fn fetch_mixin_key() -> Result<String, String> {
    {
        let guard = wbi_cache().lock().await;
        if let Some(cache) = guard.as_ref() {
            if cache.fetched_at.elapsed() < Duration::from_secs(2 * 60 * 60) {
                return Ok(cache.mixin_key.clone());
            }
        }
    }

    let resp = http_client()
        .get("https://api.bilibili.com/x/web-interface/nav")
        .headers(default_headers())
        .send()
        .await
        .map_err(|e| format!("获取 WBI 密钥失败: {e}"))?;
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 WBI 响应失败: {e}"))?;
    let img_url = body
        .pointer("/data/wbi_img/img_url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "WBI img_url 缺失".to_string())?;
    let sub_url = body
        .pointer("/data/wbi_img/sub_url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "WBI sub_url 缺失".to_string())?;
    let img_key = img_url
        .rsplit('/')
        .next()
        .unwrap_or("")
        .split('.')
        .next()
        .unwrap_or("");
    let sub_key = sub_url
        .rsplit('/')
        .next()
        .unwrap_or("")
        .split('.')
        .next()
        .unwrap_or("");
    if img_key.is_empty() || sub_key.is_empty() {
        return Err("WBI key 解析失败".into());
    }
    let mixin = mixin_key_from(img_key, sub_key);
    let mut guard = wbi_cache().lock().await;
    *guard = Some(WbiCache {
        mixin_key: mixin.clone(),
        fetched_at: Instant::now(),
    });
    Ok(mixin)
}

fn strip_em(title: &str) -> String {
    title
        .replace("<em class=\"keyword\">", "")
        .replace("</em>", "")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
}

fn parse_duration_text(text: &str) -> u64 {
    let parts: Vec<&str> = text.split(':').collect();
    match parts.len() {
        2 => {
            let m: u64 = parts[0].parse().unwrap_or(0);
            let s: u64 = parts[1].parse().unwrap_or(0);
            m * 60 + s
        }
        3 => {
            let h: u64 = parts[0].parse().unwrap_or(0);
            let m: u64 = parts[1].parse().unwrap_or(0);
            let s: u64 = parts[2].parse().unwrap_or(0);
            h * 3600 + m * 60 + s
        }
        _ => 0,
    }
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
        "bilibili".into()
    } else {
        trimmed.chars().take(120).collect()
    }
}

fn resolve_download_root(app: &AppHandle) -> Result<PathBuf, String> {
    let from_manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|root| root.join("downloads").join("网易云音乐"));
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
    Ok(base.join("downloads").join("网易云音乐"))
}

fn index_path(root: &Path) -> PathBuf {
    root.join("index.json")
}

async fn load_index(root: &Path) -> Result<DownloadIndex, String> {
    let path = index_path(root);
    if !path.is_file() {
        return Ok(DownloadIndex {
            version: 1,
            entries: Default::default(),
        });
    }
    let text = fs::read_to_string(&path)
        .await
        .map_err(|e| format!("读取下载索引失败: {e}"))?;
    let mut index: DownloadIndex =
        serde_json::from_str(&text).map_err(|e| format!("解析下载索引失败: {e}"))?;
    if index.version == 0 {
        index.version = 1;
    }
    Ok(index)
}

async fn save_index(root: &Path, index: &DownloadIndex) -> Result<(), String> {
    fs::create_dir_all(root)
        .await
        .map_err(|e| format!("创建下载目录失败: {e}"))?;
    let path = index_path(root);
    let text = serde_json::to_string_pretty(index).map_err(|e| format!("序列化索引失败: {e}"))?;
    fs::write(&path, text)
        .await
        .map_err(|e| format!("写入下载索引失败: {e}"))?;
    Ok(())
}

async fn upsert_index_entry(root: &Path, entry: BiliDownloadedEntry) -> Result<(), String> {
    let _guard = index_lock().lock().await;
    let mut index = load_index(root).await?;
    index.version = 1;
    index.entries.insert(entry.song_id.to_string(), entry);
    save_index(root, &index).await
}

async fn get_json(url: &str) -> Result<Value, String> {
    let resp = http_client()
        .get(url)
        .headers(default_headers())
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;
    let status = resp.status();
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 JSON 失败: {e}"))?;
    if !status.is_success() {
        return Err(format!("HTTP {status} · {body}"));
    }
    Ok(body)
}

#[tauri::command]
pub async fn bilibili_search(
    keyword: String,
    duration_ms: Option<u64>,
) -> Result<Vec<BiliSearchItem>, String> {
    let keyword = keyword.trim().to_string();
    if keyword.is_empty() {
        return Err("搜索关键词为空".into());
    }

    let mixin = fetch_mixin_key().await?;
    let params = vec![
        ("search_type".into(), "video".into()),
        ("keyword".into(), keyword),
        ("page".into(), "1".into()),
        ("page_size".into(), "12".into()),
    ];
    let signed = sign_wbi(&params, &mixin);
    let query = signed
        .iter()
        .map(|(k, v)| format!("{}={}", encode_uri_component(k), encode_uri_component(v)))
        .collect::<Vec<_>>()
        .join("&");
    let url = format!("https://api.bilibili.com/x/web-interface/wbi/search/type?{query}");
    let body = get_json(&url).await?;
    let code = body.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
    if code != 0 {
        let msg = body
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("搜索失败");
        return Err(format!("B站搜索失败 ({code}): {msg}"));
    }

    let result = body
        .pointer("/data/result")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut items: Vec<BiliSearchItem> = result
        .into_iter()
        .filter_map(|raw| {
            let bvid = raw.get("bvid")?.as_str()?.to_string();
            if bvid.is_empty() {
                return None;
            }
            let title = strip_em(raw.get("title")?.as_str().unwrap_or(""));
            let author = raw
                .get("author")
                .and_then(|v| v.as_str())
                .unwrap_or("未知 UP")
                .to_string();
            let duration_text = raw
                .get("duration")
                .and_then(|v| v.as_str())
                .unwrap_or("0:0")
                .to_string();
            let duration_sec = parse_duration_text(&duration_text);
            let play = raw.get("play").and_then(|v| v.as_u64()).unwrap_or(0);
            let cover = raw
                .get("pic")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let cover = if cover.starts_with("//") {
                format!("https:{cover}")
            } else {
                cover
            };
            let duration_delta_ms = duration_ms.map(|want| {
                let got = duration_sec.saturating_mul(1000) as i64;
                got - want as i64
            });
            Some(BiliSearchItem {
                bvid: bvid.clone(),
                title,
                author,
                duration_text,
                duration_sec,
                play,
                cover,
                duration_delta_ms,
                url: format!("https://www.bilibili.com/video/{bvid}"),
            })
        })
        .collect();

    if let Some(want) = duration_ms {
        items.sort_by_key(|it| {
            let delta = (it.duration_sec.saturating_mul(1000) as i64 - want as i64).abs();
            (delta, u64::MAX - it.play)
        });
    } else {
        items.sort_by(|a, b| b.play.cmp(&a.play));
    }

    Ok(items)
}

#[derive(Deserialize)]
struct StreamCandidate {
    id: u32,
    bandwidth: u64,
    base_url: String,
    backup_url: Option<Vec<String>>,
}

fn pick_best_stream(list: &[Value]) -> Option<StreamCandidate> {
    let mut best: Option<StreamCandidate> = None;
    for item in list {
        let id = item.get("id").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let bandwidth = item.get("bandwidth").and_then(|v| v.as_u64()).unwrap_or(0);
        let base_url = item
            .get("baseUrl")
            .or_else(|| item.get("base_url"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if base_url.is_empty() {
            continue;
        }
        let backup_url = item
            .get("backupUrl")
            .or_else(|| item.get("backup_url"))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            });
        let candidate = StreamCandidate {
            id,
            bandwidth,
            base_url,
            backup_url,
        };
        let replace = match &best {
            None => true,
            Some(cur) => candidate.id > cur.id
                || (candidate.id == cur.id && candidate.bandwidth > cur.bandwidth),
        };
        if replace {
            best = Some(candidate);
        }
    }
    best
}

async fn download_url_to_file(url: &str, dest: &Path) -> Result<(), String> {
    let mut last_err = String::new();
    let urls = std::iter::once(url.to_string());
    for u in urls {
        match download_once(&u, dest).await {
            Ok(()) => return Ok(()),
            Err(e) => last_err = e,
        }
    }
    Err(last_err)
}

async fn download_stream(candidate: &StreamCandidate, dest: &Path) -> Result<(), String> {
    let mut urls = vec![candidate.base_url.clone()];
    if let Some(backups) = &candidate.backup_url {
        urls.extend(backups.iter().cloned());
    }
    let mut last_err = String::new();
    for u in urls {
        match download_once(&u, dest).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = e;
                let _ = fs::remove_file(dest).await;
            }
        }
    }
    Err(last_err)
}

async fn download_once(url: &str, dest: &Path) -> Result<(), String> {
    let resp = http_client()
        .get(url)
        .headers(default_headers())
        .send()
        .await
        .map_err(|e| format!("下载失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载 HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取下载内容失败: {e}"))?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建目录失败: {e}"))?;
    }
    let mut file = fs::File::create(dest)
        .await
        .map_err(|e| format!("创建文件失败: {e}"))?;
    file.write_all(&bytes)
        .await
        .map_err(|e| format!("写入文件失败: {e}"))?;
    file.flush()
        .await
        .map_err(|e| format!("刷新文件失败: {e}"))?;
    Ok(())
}

fn mux_av(ffmpeg: &Path, video: &Path, audio: &Path, output: &Path) -> Result<(), String> {
    let result = Command::new(ffmpeg)
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(video)
        .args(["-i"])
        .arg(audio)
        .args([
            "-c",
            "copy",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-movflags",
            "+faststart",
        ])
        .arg(output)
        .output()
        .map_err(|e| format!("ffmpeg 合并失败: {e}"))?;
    if !result.status.success() {
        // fallback: re-encode audio if copy fails
        let result2 = Command::new(ffmpeg)
            .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
            .arg(video)
            .args(["-i"])
            .arg(audio)
            .args([
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-movflags",
                "+faststart",
            ])
            .arg(output)
            .output()
            .map_err(|e| format!("ffmpeg 重编码合并失败: {e}"))?;
        if !result2.status.success() {
            let err = String::from_utf8_lossy(&result2.stderr);
            return Err(format!(
                "合并音视频失败: {}",
                err.trim().chars().take(200).collect::<String>()
            ));
        }
    }
    if !output.is_file() {
        return Err("合并后文件未生成".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn bilibili_list_downloaded(app: AppHandle) -> Result<Vec<BiliDownloadedEntry>, String> {
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
    alive.sort_by_key(|e| e.song_id);
    Ok(alive)
}

#[tauri::command]
pub async fn bilibili_download(
    app: AppHandle,
    bvid: String,
    song_id: u64,
    playlist_id: Option<u64>,
    playlist_name: Option<String>,
    preferred_title: Option<String>,
    artists: Option<String>,
) -> Result<BiliDownloadResult, String> {
    let bvid = bvid.trim().to_string();
    if bvid.is_empty() {
        return Err("bvid 为空".into());
    }
    if song_id == 0 {
        return Err("songId 无效".into());
    }

    let view = get_json(&format!(
        "https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
    ))
    .await?;
    let code = view.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
    if code != 0 {
        let msg = view
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("获取稿件失败");
        return Err(format!("获取稿件失败 ({code}): {msg}"));
    }
    let title = view
        .pointer("/data/title")
        .and_then(|v| v.as_str())
        .unwrap_or(preferred_title.as_deref().unwrap_or(&bvid))
        .to_string();
    let cid = view
        .pointer("/data/cid")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "稿件缺少 cid".to_string())?;

    let play = get_json(&format!(
        "https://api.bilibili.com/x/player/playurl?bvid={bvid}&cid={cid}&qn=80&fnval=16&fourk=1"
    ))
    .await?;
    let play_code = play.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
    if play_code != 0 {
        let msg = play
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("取流失败");
        return Err(format!("取流失败 ({play_code}): {msg}"));
    }

    let root = resolve_download_root(&app)?;
    let playlist_folder = sanitize_filename(
        playlist_name
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("未分类"),
    );
    let out_dir = root.join(&playlist_folder);
    fs::create_dir_all(&out_dir)
        .await
        .map_err(|e| format!("创建下载目录失败: {e}"))?;

    let stem = sanitize_filename(
        preferred_title
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(&title),
    );
    let output = out_dir.join(format!("{song_id}_{stem}-{bvid}.mp4"));

    if let Some(dash) = play.pointer("/data/dash") {
        let videos = dash
            .get("video")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let audios = dash
            .get("audio")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let video = pick_best_stream(&videos).ok_or_else(|| "未找到视频流".to_string())?;
        let audio = pick_best_stream(&audios).ok_or_else(|| "未找到音频流".to_string())?;

        let tmp_dir = out_dir.join(format!(".tmp-{bvid}"));
        fs::create_dir_all(&tmp_dir)
            .await
            .map_err(|e| format!("创建临时目录失败: {e}"))?;
        let video_path = tmp_dir.join("video.m4s");
        let audio_path = tmp_dir.join("audio.m4s");

        let dl_result = async {
            download_stream(&video, &video_path).await?;
            download_stream(&audio, &audio_path).await?;
            let ffmpeg = resolve_ffmpeg()?;
            let out = output.clone();
            let vp = video_path.clone();
            let ap = audio_path.clone();
            tokio::task::spawn_blocking(move || mux_av(&ffmpeg, &vp, &ap, &out))
                .await
                .map_err(|e| format!("合并任务失败: {e}"))??;
            Ok::<(), String>(())
        }
        .await;

        let _ = fs::remove_dir_all(&tmp_dir).await;
        dl_result?;
    } else if let Some(durl) = play
        .pointer("/data/durl")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
    {
        let url = durl
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "传统流缺少 url".to_string())?;
        download_url_to_file(url, &output).await?;
    } else {
        return Err("未获取到可下载流（可能被风控或需登录）".into());
    }

    let downloaded_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path_str = output.to_string_lossy().to_string();
    upsert_index_entry(
        &root,
        BiliDownloadedEntry {
            song_id,
            playlist_id,
            playlist_name,
            path: path_str.clone(),
            bvid: bvid.clone(),
            title: preferred_title.clone().unwrap_or(title.clone()),
            artists,
            downloaded_at,
        },
    )
    .await?;

    Ok(BiliDownloadResult {
        path: path_str,
        bvid,
        title,
        song_id,
    })
}
