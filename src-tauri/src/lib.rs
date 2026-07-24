mod http_fetch;
mod netease;

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
            http_fetch::http_get_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
