mod bilibili;
mod douyin;
mod douyin_bridge;
mod http_fetch;
mod netease;
mod video_trim;

use netease::NeteaseResponse;
use serde_json::Value;

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
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            netease_weapi,
            netease_qr_url,
            http_fetch::http_get_text,
            video_trim::scan_video_dir,
            video_trim::trim_video_end,
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
            douyin::douyin_cache_preview,
            douyin::douyin_apply_aweme_seq
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
