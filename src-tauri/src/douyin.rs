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
    /// All known mirrors for this video, primary first. A single CDN host can
    /// refuse (403) or expire while its siblings still serve the same file.
    pub play_url_candidates: Vec<String>,
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

/// Prefix that tells the UI "no retry will help this item, move on".
///
/// A refusal from the media CDN and a refusal from the signed API mean opposite
/// things: the latter is an account-level block worth backing off from, the
/// former is usually just one dead video in a long list. Without a marker the
/// UI can only pattern-match on `403`, which conflates the two and turns a
/// single unavailable video into a stuck batch.
pub const MEDIA_GONE_TAG: &str = "MEDIA_GONE";

fn media_gone(detail: impl AsRef<str>) -> String {
    format!("{MEDIA_GONE_TAG} · {}", detail.as_ref())
}

/// Cookie state as it looked to the CDN request.
///
/// `session_cookie` degrades to `None` when the bridge window is gone, which
/// used to surface as an unexplained 403. Naming the state keeps "signed out"
/// from masquerading as "video unavailable".
fn describe_cookie(cookie: Option<&str>) -> String {
    let Some(cookie) = cookie else {
        return "缺失（抖音窗口不在或未登录）".into();
    };
    let signed_in = ["sessionid", "sessionid_ss", "sid_tt"]
        .iter()
        .any(|name| cookie.contains(&format!("{name}=")));
    let count = cookie.split(';').filter(|s| !s.trim().is_empty()).count();
    if signed_in {
        format!("正常（{count} 项，含登录态）")
    } else {
        format!("异常（{count} 项，无登录态字段）")
    }
}

enum MediaAttempt {
    Ok(Vec<u8>),
    /// The host replied, but with something other than the file.
    Refused(String),
    /// Never got a usable reply; another mirror may still work.
    Failed(String),
}

async fn fetch_media_once(url: &str, cookie: Option<&str>) -> MediaAttempt {
    let headers = match media_headers(cookie) {
        Ok(headers) => headers,
        Err(e) => return MediaAttempt::Failed(e),
    };
    let resp = match download_client().get(url).headers(headers).send().await {
        Ok(resp) => resp,
        Err(e) => return MediaAttempt::Failed(format!("{e}")),
    };
    let status = resp.status();
    if !status.is_success() {
        return MediaAttempt::Refused(format!("HTTP {status}"));
    }
    // `/aweme/v1/play/` answers 200 with an HTML or JSON error page when it
    // declines, and saving that as an .mp4 would look like a corrupt download.
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if content_type.contains("text/") || content_type.contains("json") {
        return MediaAttempt::Refused(format!("响应不是媒体流 ({content_type})"));
    }
    match resp.bytes().await {
        Ok(bytes) if bytes.len() < 1024 => {
            MediaAttempt::Refused(format!("响应过小 ({} 字节)", bytes.len()))
        }
        Ok(bytes) => MediaAttempt::Ok(bytes.to_vec()),
        Err(e) => MediaAttempt::Failed(format!("读取流失败: {e}")),
    }
}

/// Re-resolve mirrors for one video through the signing bridge.
///
/// The links handed out with the list are short-lived, so anything downloaded
/// long after the page was fetched needs a fresh set.
async fn refresh_play_urls(app: &AppHandle, aweme_id: &str) -> Result<Vec<String>, String> {
    let body = bridge_json(
        app,
        "GET",
        "/aweme/v1/web/aweme/detail/",
        json!({ "aweme_id": aweme_id }),
        None,
        douyin_bridge::Surface::Never,
    )
    .await?;
    let video = body
        .pointer("/aweme_detail/video")
        .ok_or_else(|| "详情接口未返回视频信息".to_string())?;
    Ok(collect_play_urls(video))
}

/// Reproduces "the links went stale overnight" on demand.
///
/// The repair path only runs once the CDN refuses every mirror, so in normal
/// use it is reachable only by leaving the app open for hours — which would
/// mean shipping the one piece of logic that matters untested. With
/// `ISSHIN_DOUYIN_FAULT_STALE_URLS=1` every mirror is pointed at a dead path on
/// its own host, which is what an expired signature looks like from here: the
/// host answers, and it says no.
#[cfg(debug_assertions)]
fn stale_url_fault(queue: &[String]) -> Option<Vec<String>> {
    if std::env::var_os("ISSHIN_DOUYIN_FAULT_STALE_URLS").is_none() {
        return None;
    }
    let mut faulted = Vec::new();
    for url in queue {
        if let Ok(mut parsed) = reqwest::Url::parse(url) {
            parsed.set_path("/isshin-fault-injection");
            parsed.set_query(None);
            push_url(&mut faulted, parsed.as_str());
        }
    }
    (!faulted.is_empty()).then_some(faulted)
}

/// Walk every mirror, then a freshly resolved set, before giving up.
async fn fetch_media(
    app: &AppHandle,
    aweme_id: &str,
    candidates: &[String],
    label: &str,
) -> Result<Vec<u8>, String> {
    let mut queue: Vec<String> = Vec::new();
    for url in candidates {
        push_url(&mut queue, url);
    }
    if queue.is_empty() {
        return Err(format!("{label}失败: 没有可用的播放地址"));
    }
    #[cfg(debug_assertions)]
    if let Some(faulted) = stale_url_fault(&queue) {
        queue = faulted;
    }

    let cookie = douyin_bridge::session_cookie(app);
    let mut tried = 0usize;
    let mut refused: Vec<String> = Vec::new();
    let mut failed: Vec<String> = Vec::new();
    // `None` until the cached mirrors run out; then `Ok` once the signing
    // bridge has re-described the video, or `Err` with why it could not.
    let mut refresh: Option<Result<(), String>> = None;

    while tried < queue.len() {
        let url = queue[tried].clone();
        tried += 1;
        match fetch_media_once(&url, cookie.as_deref()).await {
            MediaAttempt::Ok(bytes) => return Ok(bytes),
            MediaAttempt::Refused(reason) => refused.push(reason),
            MediaAttempt::Failed(reason) => failed.push(reason),
        }

        // Only worth re-resolving once, and only after the cached mirrors are
        // exhausted — a refusal is the signal that they have gone stale.
        if tried == queue.len() && refresh.is_none() && !refused.is_empty() {
            refresh = Some(match refresh_play_urls(app, aweme_id).await {
                Ok(fresh) => {
                    for url in &fresh {
                        push_url(&mut queue, url);
                    }
                    Ok(())
                }
                Err(e) => Err(e),
            });
        }
    }

    let mut detail = vec![format!("会话 cookie {}", describe_cookie(cookie.as_deref()))];
    if !refused.is_empty() {
        detail.push(format!(
            "{} 个地址被拒绝 ({})",
            refused.len(),
            refused.join(" / ")
        ));
    }
    if !failed.is_empty() {
        detail.push(failed.join(" / "));
    }

    // A refusal alone cannot tell "this video is gone" from "this client is no
    // longer trusted" — in both cases every mirror says 403. What separates them
    // is whether the signing bridge still works: a successful re-describe proves
    // the session is alive, so the remaining suspect is the video itself.
    // Without that proof we must stay loud rather than quietly bury the item.
    match refresh {
        Some(Ok(())) => {
            detail.push("重新签名后仍被拒绝".into());
            let text = format!("{label}失败: 视频源已不可用 · {}", detail.join(" · "));
            Err(media_gone(text))
        }
        Some(Err(e)) => Err(format!(
            "{label}失败: 无法确认视频状态（登录态或签名通道可能已失效）· {} · 刷新播放地址失败: {e}",
            detail.join(" · ")
        )),
        None => Err(format!("{label}失败: {}", detail.join(" · "))),
    }
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

fn push_url(out: &mut Vec<String>, url: &str) {
    let url = url.trim();
    if url.is_empty() || out.iter().any(|seen| seen == url) {
        return;
    }
    out.push(url.to_string());
}

/// Primary URL first, then the rest of the mirrors the caller knows about.
fn merge_candidates(play_url: &str, play_urls: Option<Vec<String>>) -> Vec<String> {
    let mut out = Vec::new();
    push_url(&mut out, play_url);
    for url in play_urls.unwrap_or_default() {
        push_url(&mut out, &url);
    }
    out
}

/// Every mirror the list response offers for one video, best first.
///
/// These links are signed and short-lived. Mirrors help when one host is having
/// a bad day, but they all age out together, so an expired set has to be
/// replaced via [`refresh_play_urls`] rather than retried.
fn collect_play_urls(video: &Value) -> Vec<String> {
    let mut out = Vec::new();
    for key in [
        "/play_addr/url_list",
        "/download_addr/url_list",
        "/play_addr_h264/url_list",
    ] {
        if let Some(Value::Array(arr)) = video.pointer(key) {
            for url in arr.iter().filter_map(|x| x.as_str()) {
                push_url(&mut out, url);
            }
        }
    }
    if let Some(Value::Array(rates)) = video.get("bit_rate") {
        for rate in rates {
            if let Some(Value::Array(arr)) = rate.pointer("/play_addr/url_list") {
                for url in arr.iter().filter_map(|x| x.as_str()) {
                    push_url(&mut out, url);
                }
            }
        }
    }
    out
}

fn parse_aweme(item: &Value) -> Option<DouyinAweme> {
    let aweme_id = item.get("aweme_id")?.as_str()?.to_string();
    let desc = item
        .get("desc")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let video = item.get("video")?;
    let play_url_candidates = collect_play_urls(video);
    let play_url = play_url_candidates.first()?.clone();
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
        play_url_candidates,
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

fn seq_width(total: usize) -> usize {
    total.max(1).to_string().len().max(4)
}

fn format_seq(index: u32, total: usize) -> String {
    format!("{:0width$}", index, width = seq_width(total))
}

/// `{awemeId}_{stem}.mp4` or `{seq}_{awemeId}_{stem}.mp4`
fn media_filename(seq: Option<u32>, total: Option<u32>, aweme_id: &str, stem: &str) -> String {
    match seq.filter(|i| *i > 0) {
        Some(i) => {
            let width_total = total.unwrap_or(i) as usize;
            format!("{}_{aweme_id}_{stem}.mp4", format_seq(i, width_total))
        }
        None => format!("{aweme_id}_{stem}.mp4"),
    }
}

/// Strip leading `{seq}_` (digits) and `{awemeId}_`, leaving `{stem}.mp4`.
fn strip_seq_and_aweme_id_prefix(name: &str, aweme_id: &str) -> String {
    let mid = format!("_{aweme_id}_");
    if let Some(pos) = name.find(&mid) {
        let head = &name[..pos];
        if !head.is_empty() && head.chars().all(|c| c.is_ascii_digit()) {
            return name[pos + mid.len()..].to_string();
        }
    }
    let prefix = format!("{aweme_id}_");
    if let Some(rest) = name.strip_prefix(&prefix) {
        return rest.to_string();
    }
    name.to_string()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DouyinApplySeqResult {
    pub renamed: u32,
    pub skipped: u32,
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
    play_urls: Option<Vec<String>>,
) -> Result<String, String> {
    let aweme_id = aweme_id.trim().to_string();
    let candidates = merge_candidates(&play_url, play_urls);
    if aweme_id.is_empty() || candidates.is_empty() {
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

    let bytes = fetch_media(&app, &aweme_id, &candidates, "预览拉取").await?;
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
    play_urls: Option<Vec<String>>,
    title: Option<String>,
    kind: Option<String>,
    seq: Option<u32>,
    total: Option<u32>,
) -> Result<DouyinDownloadResult, String> {
    let aweme_id = aweme_id.trim().to_string();
    let candidates = merge_candidates(&play_url, play_urls);
    if aweme_id.is_empty() || candidates.is_empty() {
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
    let output = out_dir.join(media_filename(seq, total, &aweme_id, &stem));

    let bytes = fetch_media(&app, &aweme_id, &candidates, "下载").await?;
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

/// Rename already-downloaded files to `{seq}_{awemeId}_{stem}.mp4`.
///
/// `aweme_ids` must be in chronological order (oldest first → seq 1), matching
/// NetEase liked-playlist numbering (display list is newest-on-top, so reverse it).
#[tauri::command]
pub async fn douyin_apply_aweme_seq(
    app: AppHandle,
    kind: String,
    aweme_ids: Vec<String>,
) -> Result<DouyinApplySeqResult, String> {
    if aweme_ids.is_empty() {
        return Ok(DouyinApplySeqResult {
            renamed: 0,
            skipped: 0,
        });
    }

    let kind_folder = normalize_kind_folder(&kind);
    let root = resolve_download_root(&app)?;
    let _guard = index_lock().lock().await;
    let mut index = load_index(&root).await?;
    let total = aweme_ids.len();
    let mut seq_of: HashMap<String, u32> = HashMap::new();
    for (i, id) in aweme_ids.iter().enumerate() {
        let id = id.trim();
        if id.is_empty() {
            continue;
        }
        seq_of.insert(id.to_string(), (i + 1) as u32);
    }

    let mut renamed = 0u32;
    let mut skipped = 0u32;
    let keys: Vec<String> = index.entries.keys().cloned().collect();
    for key in keys {
        let Some(mut entry) = index.entries.get(&key).cloned() else {
            continue;
        };
        if normalize_kind_folder(&entry.kind) != kind_folder {
            continue;
        }
        let Some(seq) = seq_of.get(&entry.aweme_id).copied() else {
            skipped += 1;
            continue;
        };
        let src = PathBuf::from(&entry.path);
        if !src.is_file() {
            skipped += 1;
            continue;
        }
        let Some(fname) = src.file_name().map(|n| n.to_string_lossy().into_owned()) else {
            skipped += 1;
            continue;
        };
        let rest = strip_seq_and_aweme_id_prefix(&fname, &entry.aweme_id);
        let new_name = format!("{}_{}_{rest}", format_seq(seq, total), entry.aweme_id);
        let dest = src.with_file_name(new_name);
        if dest == src {
            continue;
        }
        if dest.exists() && dest != src {
            skipped += 1;
            continue;
        }
        std::fs::rename(&src, &dest).map_err(|e| format!("重命名失败: {e}"))?;
        entry.path = dest.to_string_lossy().to_string();
        index.entries.insert(key, entry);
        renamed += 1;
    }
    if renamed > 0 {
        save_index(&root, &index).await?;
    }
    // Persist chronological order even when nothing renamed (for offline scripts).
    let order_path = root.join(format!("{kind_folder}-order.json"));
    let order_body = serde_json::to_string_pretty(&json!({
        "kind": kind_folder,
        "total": total,
        "awemeIds": aweme_ids,
        "note": "oldest first (seq 1 = earliest / list bottom)",
    }))
    .map_err(|e| format!("序列化序号列表失败: {e}"))?;
    fs::write(&order_path, order_body)
        .await
        .map_err(|e| format!("写入序号列表失败: {e}"))?;

    Ok(DouyinApplySeqResult { renamed, skipped })
}
