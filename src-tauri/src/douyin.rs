//! Douyin (抖音) session + works/likes list + download.
//!
//! The list/unlike endpoints are signed by the security SDK running in the
//! bridge WebView (see [`crate::douyin_bridge`]); only the video/CDN transfers
//! go out over plain HTTP from here.
use crate::douyin_bridge;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, COOKIE, REFERER, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

const USER_AGENT_VALUE: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";
const REFERER_VALUE: &str = "https://www.douyin.com/";

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

/// 视频拉取不设总超时，避免长视频被掐断；仅保留连接超时。
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

fn media_headers(cookie: Option<&str>) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_VALUE));
    headers.insert(REFERER, HeaderValue::from_static(REFERER_VALUE));
    headers.insert(ACCEPT, HeaderValue::from_static("*/*"));
    if let Some(cookie) = cookie {
        headers.insert(
            COOKIE,
            HeaderValue::from_str(cookie).map_err(|e| format!("Cookie 非法: {e}"))?,
        );
    }
    Ok(headers)
}

/// Run a signed request through the bridge WebView and decode the JSON body.
async fn bridge_json(
    app: &AppHandle,
    method: &str,
    path: &str,
    extra: Value,
    body: Option<&str>,
    surface: douyin_bridge::Surface,
) -> Result<Value, String> {
    let (status, text) = douyin_bridge::request(app, method, path, &extra, body, surface).await?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(format!(
            "接口返回空响应 (HTTP {status})，通常是抖音在软拦截。稍等片刻重试，或在抖音窗口里刷新一次"
        ));
    }
    if !(200..300).contains(&status) {
        let snippet: String = trimmed.chars().take(160).collect();
        return Err(format!("HTTP {status} · {snippet}"));
    }
    serde_json::from_str(trimmed).map_err(|e| {
        format!(
            "JSON 解析失败: {e} · {}",
            trimmed.chars().take(120).collect::<String>()
        )
    })
}

fn expect_ok_status(body: &Value, fallback: &str) -> Result<(), String> {
    let code = body.get("status_code").and_then(|v| v.as_i64()).unwrap_or(0);
    if code == 0 {
        return Ok(());
    }
    let msg = body
        .get("status_msg")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback);
    Err(format!("{msg}（code={code}）"))
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
            .or_else(|| {
                video
                    .pointer("/origin_cover/url_list")
                    .and_then(|v| v.as_array())
            }),
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

/// Bring up the Douyin window so the user can sign in there.
#[tauri::command]
pub async fn douyin_open_login(app: AppHandle) -> Result<(), String> {
    douyin_bridge::ensure_ready(&app, douyin_bridge::Surface::Now)
        .await
        .map(|_| ())
}

#[tauri::command]
pub fn douyin_hide_login(app: AppHandle) {
    douyin_bridge::hide(&app);
}

#[tauri::command]
pub async fn douyin_logout(app: AppHandle) -> Result<(), String> {
    douyin_bridge::clear_session(&app)
}

/// Read the signed-in account from the bridge WebView session.
#[tauri::command]
pub async fn douyin_profile(app: AppHandle) -> Result<DouyinProfile, String> {
    let body = bridge_json(
        &app,
        "GET",
        "/aweme/v1/web/user/profile/self/",
        json!({ "publish_video_strategy_type": "2" }),
        None,
        // Polled in the background while the tool is open; must stay silent.
        douyin_bridge::Surface::Never,
    )
    .await?;
    expect_ok_status(&body, "读取账号信息失败")?;

    let user = body
        .get("user")
        .ok_or_else(|| "尚未登录抖音，请点击「打开抖音登录」".to_string())?;
    let sec_uid = user
        .get("sec_uid")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if sec_uid.is_empty() {
        return Err("尚未登录抖音，请点击「打开抖音登录」".into());
    }
    let uid = user
        .get("uid")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .or_else(|| {
            user.get("uid")
                .and_then(|v| v.as_u64())
                .map(|n| n.to_string())
        })
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
pub async fn douyin_list_aweme(
    app: AppHandle,
    sec_uid: String,
    kind: String,
    cursor: Option<u64>,
) -> Result<DouyinListResult, String> {
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

    let extra = json!({
        "sec_user_id": sec_uid,
        "count": "18",
        "max_cursor": cursor.unwrap_or(0).to_string(),
        "min_cursor": "0",
        "whale_cut_token": "",
        "cut_version": "1",
        "publish_video_strategy_type": "2",
    });

    let body = bridge_json(&app, "GET", path, extra, None, douyin_bridge::Surface::OnStall).await?;
    expect_ok_status(&body, "拉取列表失败")?;

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
pub async fn douyin_unlike(app: AppHandle, aweme_id: String) -> Result<(), String> {
    let aweme_id = aweme_id.trim().to_string();
    if aweme_id.is_empty() {
        return Err("aweme_id 不能为空".into());
    }

    let form = format!("aweme_id={aweme_id}&item_type=0&type=0");
    let body = bridge_json(
        &app,
        "POST",
        "/aweme/v1/web/commit/item/digg/",
        json!({}),
        Some(&form),
        douyin_bridge::Surface::OnStall,
    )
    .await?;
    expect_ok_status(&body, "取消喜欢失败")
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
    aweme_id: String,
    play_url: String,
) -> Result<String, String> {
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

    let cookie = douyin_bridge::session_cookie(&app);
    let resp = download_client()
        .get(&play_url)
        .headers(media_headers(cookie.as_deref())?)
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
    aweme_id: String,
    play_url: String,
    title: Option<String>,
    kind: Option<String>,
) -> Result<DouyinDownloadResult, String> {
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

    let cookie = douyin_bridge::session_cookie(&app);
    let resp = download_client()
        .get(&play_url)
        .headers(media_headers(cookie.as_deref())?)
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
