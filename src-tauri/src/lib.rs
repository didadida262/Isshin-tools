mod bilibili;
mod douyin;
mod douyin_bridge;
mod ffmpeg;
mod http_fetch;
mod netease;
mod screenshot;

use netease::NeteaseResponse;
use serde_json::Value;
use tauri::{Emitter, Manager};

#[tauri::command]
async fn netease_weapi(
    path: String,
    data: Value,
    cookie: Option<String>,
) -> Result<NeteaseResponse, String> {
    netease::weapi_request(&path, data, cookie)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn netease_qr_url(uni_key: String) -> String {
    netease::qr_login_url(&uni_key)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .manage(douyin_bridge::DouyinBridge::default())
        .manage(screenshot::ScreenshotState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                #[cfg(target_os = "macos")]
                let mods = Modifiers::CONTROL | Modifiers::SUPER;
                #[cfg(not(target_os = "macos"))]
                let mods = Modifiers::CONTROL | Modifiers::ALT;

                let shot_shortcut = Shortcut::new(Some(mods), Code::KeyA);

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            if event.state() != ShortcutState::Pressed {
                                return;
                            }
                            if !shortcut.matches(mods, Code::KeyA) {
                                return;
                            }
                            if let Err(err) = screenshot::open_screenshot_overlay(app) {
                                log::error!("screenshot overlay failed: {err}");
                                if let Some(main) = app.get_webview_window("main") {
                                    let _ = main.emit("screenshot-error", err);
                                }
                            }
                        })
                        .build(),
                )?;

                if let Err(err) = app.global_shortcut().register(shot_shortcut) {
                    log::warn!("global screenshot shortcut: {err}");
                }

                if let Err(err) = screenshot::ensure_overlay_window(app.handle()) {
                    log::warn!("screenshot overlay prewarm: {err}");
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            netease_weapi,
            netease_qr_url,
            http_fetch::http_get_text,
            http_fetch::http_post_json,
            bilibili::bilibili_search,
            bilibili::bilibili_download,
            bilibili::bilibili_list_downloaded,
            bilibili::bilibili_sync_downloaded,
            bilibili::bilibili_delete_downloaded,
            bilibili::bilibili_apply_track_seq,
            douyin::douyin_open_login,
            douyin::douyin_hide_login,
            douyin::douyin_logout,
            douyin::douyin_profile,
            douyin::douyin_list_aweme,
            douyin::douyin_unlike,
            douyin::douyin_download,
            douyin::douyin_list_downloaded,
            douyin::douyin_delete_downloaded,
            douyin::douyin_cache_preview,
            douyin::douyin_apply_aweme_seq,
            screenshot::screenshot_confirm,
            screenshot::screenshot_cancel,
            screenshot::screenshot_overlay_ready,
            screenshot::screenshot_reveal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
