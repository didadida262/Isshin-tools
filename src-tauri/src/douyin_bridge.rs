//! Issues Douyin web API calls from inside a real WebView so that ByteDance's
//! security SDK signs them for us.
//!
//! `/aweme/v1/web/*` now rejects any request that lacks `x-secsdk-web-signature`
//! (`403 Blocked by ArgusSecurityPlugin Signature Not Found`), and that
//! signature covers the whole query string — so a signature captured from the
//! browser cannot be replayed with a different `max_cursor`
//! (`403 ... Sign Invalid`). The signing key material is provisioned to the
//! browser, so rather than reimplementing a moving target we run the request in
//! a douyin.com page, where the SDK has replaced `window.fetch` and appends
//! `a_bogus` / `verifyFp` / `timestamp` / `x-secsdk-web-signature` on its own.

use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex as StdMutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::{oneshot, Mutex};
use tokio::time::sleep;

pub const BRIDGE_LABEL: &str = "douyin-bridge";
const BRIDGE_URL: &str = "https://www.douyin.com/";
const COOKIE_URL: &str = "https://www.douyin.com";

const EVAL_TIMEOUT: Duration = Duration::from_secs(20);
const POLL_INTERVAL: Duration = Duration::from_millis(150);
/// A cold profile has to clear the `__ac_signature` JS challenge before the real
/// page (and its signing SDK) loads, which has been measured at ~60s.
const READY_TIMEOUT: Duration = Duration::from_secs(150);
/// A background probe must not hold the UI in a spinner for the full cold-boot
/// budget; give up early and let the user press the login button instead.
const BACKGROUND_READY_TIMEOUT: Duration = Duration::from_secs(20);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(75);
/// If the page has not booted within this long, show the window so the user can
/// see what is blocking it (captcha, login wall, dead network).
const HIDDEN_BOOT_GRACE: Duration = Duration::from_secs(15);
/// How long the document must stay put before we trust it with a request.
const NAVIGATION_QUIET: Duration = Duration::from_millis(1200);

const BRIDGE_SCRIPT: &str = r#"
;(function () {
  if (window.__ISSHIN_DY__) return

  var slots = Object.create(null)
  // Regenerated on every document load, so Rust can tell whether the page
  // navigated between two observations.
  var nonce = String(Date.now()) + '-' + Math.random().toString(36).slice(2)

  function osVersion(ua) {
    var mac = /Mac OS X ([\d_]+)/.exec(ua)
    if (mac) return mac[1].replace(/_/g, '.')
    var win = /Windows NT ([\d.]+)/.exec(ua)
    if (win) return win[1]
    return '10.15.7'
  }

  // These params describe the browser, and the security SDK fingerprints the
  // same environment when it signs. Reading them here keeps the two consistent.
  function commonParams() {
    var ua = navigator.userAgent
    var isMac = /Mac/.test(navigator.platform || ua)
    var chrome = /(?:Chrome|CriOS)\/([\d.]+)/.exec(ua)
    var safari = /Version\/([\d.]+)/.exec(ua)
    var version = chrome ? chrome[1] : safari ? safari[1] : '17.4'
    var conn = navigator.connection || {}
    return {
      device_platform: 'webapp',
      aid: '6383',
      channel: 'channel_pc_web',
      pc_client_type: '1',
      pc_libra_divert: isMac ? 'Mac' : 'Windows',
      update_version_code: '170400',
      version_code: '170400',
      version_name: '17.4.0',
      support_h265: '1',
      support_dash: '1',
      cookie_enabled: String(navigator.cookieEnabled),
      screen_width: String(screen.width),
      screen_height: String(screen.height),
      browser_language: navigator.language || 'zh-CN',
      browser_platform: navigator.platform || (isMac ? 'MacIntel' : 'Win32'),
      browser_name: chrome ? 'Chrome' : 'Safari',
      browser_version: version,
      browser_online: String(navigator.onLine),
      engine_name: chrome ? 'Blink' : 'WebKit',
      engine_version: version,
      os_name: isMac ? 'Mac OS' : 'Windows',
      os_version: osVersion(ua),
      cpu_core_num: String(navigator.hardwareConcurrency || 8),
      device_memory: String(navigator.deviceMemory || 8),
      platform: 'PC',
      downlink: String(conn.downlink || 10),
      effective_type: String(conn.effectiveType || '4g'),
      round_trip_time: String(conn.rtt || 0),
    }
  }

  function buildUrl(path, extra) {
    var params = commonParams()
    for (var k in extra) {
      if (extra[k] !== null && extra[k] !== undefined) params[k] = String(extra[k])
    }
    var qs = []
    for (var key in params) {
      qs.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
    }
    return path + '?' + qs.join('&')
  }

  Object.defineProperty(window, '__ISSHIN_DY__', {
    value: {
      // The security SDK replaces the native fetch, and that replacement is what
      // appends a_bogus / x-secsdk-web-signature. So a non-native fetch is our
      // signal that requests issued from here will come out signed.
      info: function () {
        var signed = false
        try {
          signed = !/native code/.test(window.fetch.toString())
        } catch (e) {
          signed = false
        }
        return {
          signed: signed,
          nonce: nonce,
          readyState: document.readyState,
          url: location.href,
        }
      },
      start: function (id, method, path, extra, body) {
        var url
        try {
          url = buildUrl(path, extra)
        } catch (e) {
          slots[id] = { state: 'done', status: 0, text: '', error: 'buildUrl: ' + e }
          return 'build-failed'
        }
        slots[id] = { state: 'pending', url: url }
        var init = { method: method, credentials: 'include' }
        if (body !== null && body !== undefined) {
          init.headers = {
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          }
          init.body = body
        }
        try {
          window
            .fetch(url, init)
            .then(function (resp) {
              return resp.text().then(function (text) {
                slots[id] = { state: 'done', status: resp.status, text: text }
              })
            })
            .catch(function (err) {
              slots[id] = { state: 'done', status: 0, text: '', error: String(err) }
            })
        } catch (e) {
          slots[id] = { state: 'done', status: 0, text: '', error: 'fetch threw: ' + e }
          return 'fetch-threw'
        }
        return 'started'
      },
      take: function (id) {
        var slot = slots[id]
        // A page navigation re-runs this script with an empty slot table, which
        // is indistinguishable from "pending" unless we report it separately.
        if (!slot) return { state: 'missing' }
        if (slot.state !== 'done') return { state: 'pending' }
        delete slots[id]
        return slot
      },
    },
  })
})()
"#;

/// When the Douyin window is allowed to appear on screen.
#[derive(Clone, Copy, PartialEq)]
pub enum Surface {
    /// Right away — the user asked to sign in.
    Now,
    /// Only if the page stalls, so a captcha or login wall can be dealt with.
    OnStall,
    /// Never; for background probes that the user did not ask for.
    Never,
}

#[derive(Default)]
pub struct DouyinBridge {
    /// Douyin's SDK keeps per-request state, and interleaving requests through
    /// one page makes failures impossible to attribute. Serialize them.
    gate: Mutex<()>,
    seq: AtomicU64,
}

fn existing_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(BRIDGE_LABEL)
}

fn create_window(app: &AppHandle, visible: bool) -> Result<WebviewWindow, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let built = BRIDGE_URL
            .parse::<Url>()
            .map_err(|e| format!("签名 WebView 地址非法: {e}"))
            .and_then(|url| {
                WebviewWindowBuilder::new(&handle, BRIDGE_LABEL, WebviewUrl::External(url))
                    .title("抖音登录 · Isshin Tools")
                    .inner_size(1120.0, 800.0)
                    .min_inner_size(720.0, 560.0)
                    .visible(visible)
                    .initialization_script(BRIDGE_SCRIPT)
                    .build()
                    .map_err(|e| format!("创建签名 WebView 失败: {e}"))
            });
        let _ = tx.send(built);
    })
    .map_err(|e| format!("调度到主线程失败: {e}"))?;
    rx.recv()
        .map_err(|e| format!("等待签名 WebView 创建失败: {e}"))?
}

/// Evaluate `js` and decode its JSON result. `None` means the expression
/// produced `null`/`undefined`.
async fn eval_json(window: &WebviewWindow, js: &str) -> Result<Option<Value>, String> {
    let (tx, rx) = oneshot::channel();
    let sender = StdMutex::new(Some(tx));
    window
        .eval_with_callback(js, move |raw| {
            if let Some(tx) = sender.lock().ok().and_then(|mut slot| slot.take()) {
                let _ = tx.send(raw);
            }
        })
        .map_err(|e| format!("WebView 求值失败: {e}"))?;

    let raw = tokio::time::timeout(EVAL_TIMEOUT, rx)
        .await
        .map_err(|_| "签名 WebView 无响应，请重新打开抖音登录窗口".to_string())?
        .map_err(|_| "签名 WebView 已关闭".to_string())?;

    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "null" {
        return Ok(None);
    }
    serde_json::from_str(trimmed)
        .map(Some)
        .map_err(|e| format!("WebView 返回值解析失败: {e}"))
}

struct PageState {
    signed: bool,
    nonce: String,
    settled: bool,
    describe: String,
}

async fn page_state(window: &WebviewWindow) -> Option<PageState> {
    let js = "(window.__ISSHIN_DY__ ? window.__ISSHIN_DY__.info() : null)";
    let info = eval_json(window, js).await.ok()??;
    let ready_state = info
        .get("readyState")
        .and_then(|v| v.as_str())
        .unwrap_or("?");
    let url = info.get("url").and_then(|v| v.as_str()).unwrap_or("?");
    let signed = info.get("signed").and_then(|v| v.as_bool()).unwrap_or(false);
    Some(PageState {
        signed,
        nonce: info
            .get("nonce")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        settled: ready_state == "complete" || ready_state == "interactive",
        describe: format!("signed={signed} readyState={ready_state} url={url}"),
    })
}

/// Wait until the SDK has replaced `fetch` *and* the page has stopped
/// navigating — an in-flight request is lost if the document is replaced.
///
/// `surface_on_stall` should be false for background probes, so that merely
/// opening the tool never pops a Douyin window in the user's face.
async fn wait_ready(window: &WebviewWindow, surface_on_stall: bool) -> Result<(), String> {
    let started = Instant::now();
    let mut surfaced = !surface_on_stall;
    let budget = if surface_on_stall {
        READY_TIMEOUT
    } else {
        BACKGROUND_READY_TIMEOUT
    };
    let mut stable_since: Option<(String, Instant)> = None;
    let mut last_logged = String::new();

    loop {
        if let Some(state) = page_state(window).await {
            if state.describe != last_logged {
                log::info!("douyin bridge page: {}", state.describe);
                last_logged = state.describe.clone();
            }
            if state.signed && state.settled {
                match &stable_since {
                    Some((nonce, since)) if *nonce == state.nonce => {
                        if since.elapsed() >= NAVIGATION_QUIET {
                            log::info!(
                                "douyin bridge ready after {}ms",
                                started.elapsed().as_millis()
                            );
                            return Ok(());
                        }
                    }
                    _ => stable_since = Some((state.nonce, Instant::now())),
                }
            } else {
                stable_since = None;
            }
        }

        if started.elapsed() >= budget {
            log::warn!("douyin bridge never settled with its signing hooks installed");
            return Err(
                "抖音页面未能完成加载，签名能力不可用。请在弹出的抖音窗口里确认网络/验证码后重试"
                    .into(),
            );
        }
        if !surfaced && started.elapsed() >= HIDDEN_BOOT_GRACE {
            surfaced = true;
            log::info!("douyin bridge slow to boot, surfacing the window");
            let _ = window.show();
            let _ = window.set_focus();
        }
        sleep(POLL_INTERVAL * 2).await;
    }
}

/// Get a booted bridge window, creating it if needed.
pub async fn ensure_ready(app: &AppHandle, surface: Surface) -> Result<WebviewWindow, String> {
    let show_now = surface == Surface::Now;
    let window = match existing_window(app) {
        Some(window) => {
            if show_now {
                let _ = window.show();
                let _ = window.set_focus();
            }
            window
        }
        None => {
            log::info!("creating douyin bridge webview (visible={show_now})");
            create_window(app, show_now)?
        }
    };
    wait_ready(&window, surface != Surface::Never).await?;
    Ok(window)
}

/// Run one signed request in the page context and return `(status, body)`.
pub async fn request(
    app: &AppHandle,
    method: &str,
    path: &str,
    extra: &Value,
    body: Option<&str>,
    surface: Surface,
) -> Result<(u16, String), String> {
    let bridge = app.state::<DouyinBridge>();
    let _serialized = bridge.gate.lock().await;

    let window = ensure_ready(app, surface).await?;
    let id = format!("r{}", bridge.seq.fetch_add(1, Ordering::Relaxed));

    // Wrapped so a thrown exception comes back as a value; WKWebView reports
    // exceptions out of band and wry drops them.
    let start_js = format!(
        "(function () {{ try {{ return window.__ISSHIN_DY__.start({}, {}, {}, {}, {}) }} \
         catch (e) {{ return 'threw: ' + e }} }})()",
        serde_json::to_string(&id).map_err(|e| e.to_string())?,
        serde_json::to_string(method).map_err(|e| e.to_string())?,
        serde_json::to_string(path).map_err(|e| e.to_string())?,
        serde_json::to_string(extra).map_err(|e| e.to_string())?,
        match body {
            Some(b) => serde_json::to_string(b).map_err(|e| e.to_string())?,
            None => "null".to_string(),
        },
    );
    let take_js = format!(
        "window.__ISSHIN_DY__ ? window.__ISSHIN_DY__.take({}) : {{ state: 'no-bridge' }}",
        serde_json::to_string(&id).map_err(|e| e.to_string())?
    );

    let started = Instant::now();
    let mut restarts = 0;
    loop {
        match eval_json(&window, &start_js).await? {
            Some(Value::String(s)) if s == "started" => {}
            other => {
                return Err(format!(
                    "派发请求到抖音页面失败: {}",
                    other
                        .as_ref()
                        .and_then(|v| v.as_str())
                        .unwrap_or("WebView 未返回结果")
                ))
            }
        }

        loop {
            let slot = eval_json(&window, &take_js).await?;
            let state = slot
                .as_ref()
                .and_then(|v| v.get("state"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");

            match state {
                "done" => {
                    let slot = slot.unwrap_or(Value::Null);
                    if let Some(err) = slot.get("error").and_then(|v| v.as_str()) {
                        return Err(format!("抖音请求失败: {err}"));
                    }
                    let status = slot.get("status").and_then(|v| v.as_u64()).unwrap_or(0) as u16;
                    let text = slot
                        .get("text")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    log::info!(
                        "douyin bridge {method} {path} -> HTTP {status}, {} bytes in {}ms",
                        text.len(),
                        started.elapsed().as_millis()
                    );
                    return Ok((status, text));
                }
                "pending" => {}
                // The page navigated mid-flight and took the pending slot with
                // it; re-issue once the hooks are back.
                "missing" | "no-bridge" => {
                    if restarts >= 2 {
                        return Err("抖音页面反复跳转，签名请求无法完成，请稍后重试".into());
                    }
                    restarts += 1;
                    log::warn!(
                        "douyin bridge lost request {id} (state={state}), re-issuing ({restarts})"
                    );
                    wait_ready(&window, surface != Surface::Never).await?;
                    break;
                }
                other => {
                    return Err(format!("签名 WebView 返回未知状态: {other}"));
                }
            }

            if started.elapsed() >= REQUEST_TIMEOUT {
                log::warn!("douyin bridge {method} {path} timed out while pending");
                return Err("抖音接口超时未返回".into());
            }
            sleep(POLL_INTERVAL).await;
        }
    }
}

/// Cookie header for the logged-in session, used by the plain HTTP downloader.
pub fn session_cookie(app: &AppHandle) -> Option<String> {
    let window = existing_window(app)?;
    let url = COOKIE_URL.parse::<Url>().ok()?;
    let cookies = window.cookies_for_url(url).ok()?;
    let joined = cookies
        .iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect::<Vec<_>>()
        .join("; ");
    if joined.is_empty() {
        None
    } else {
        Some(joined)
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(window) = existing_window(app) {
        let _ = window.hide();
    }
}

pub fn clear_session(app: &AppHandle) -> Result<(), String> {
    let Some(window) = existing_window(app) else {
        return Ok(());
    };
    let url = COOKIE_URL
        .parse::<Url>()
        .map_err(|e| format!("地址非法: {e}"))?;
    if let Ok(cookies) = window.cookies_for_url(url) {
        for cookie in cookies {
            let _ = window.delete_cookie(cookie);
        }
    }
    let _ = window.eval("try { localStorage.clear(); sessionStorage.clear() } catch (e) {}");
    let _ = window.close();
    Ok(())
}
