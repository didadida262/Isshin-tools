//! Instant region screenshot overlay.
//!
//! Hotkey path only shows a pre-warmed transparent dim overlay (no capture).
//! Capture + crop + clipboard happen on confirm after the overlay is hidden,
//! so the UI appears as fast as the window manager can order the window front.

use arboard::{Clipboard, ImageData};
use serde::Serialize;
use std::borrow::Cow;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use xcap::Monitor;

pub const OVERLAY_LABEL: &str = "screenshot-overlay";

pub struct ScreenshotState {
    session: AtomicU64,
}

impl Default for ScreenshotState {
    fn default() -> Self {
        Self {
            session: AtomicU64::new(0),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotArmDto {
    pub session_id: u64,
    pub logical_width: u32,
    pub logical_height: u32,
    pub scale: f32,
}

fn primary_monitor() -> Result<Monitor, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| Monitor::from_point(0, 0).ok())
        .ok_or_else(|| "未找到可用显示器".to_string())
}

fn monitor_metrics(monitor: &Monitor) -> Result<(u32, u32, f32, f64, f64), String> {
    let logical_w = monitor.width().map_err(|e| e.to_string())?;
    let logical_h = monitor.height().map_err(|e| e.to_string())?;
    let scale = monitor.scale_factor().unwrap_or(1.0).max(1.0);
    let pos_x = monitor.x().unwrap_or(0) as f64;
    let pos_y = monitor.y().unwrap_or(0) as f64;
    Ok((logical_w, logical_h, scale, pos_x, pos_y))
}

fn overlay_url(app: &AppHandle) -> Result<WebviewUrl, String> {
    if cfg!(debug_assertions) {
        let mut u = app
            .config()
            .build
            .dev_url
            .clone()
            .ok_or_else(|| "缺少 devUrl".to_string())?;
        u.set_fragment(Some("/screenshot"));
        Ok(WebviewUrl::External(u))
    } else {
        Ok(WebviewUrl::App("index.html#/screenshot".into()))
    }
}

fn hide_overlay(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.hide();
    }
}

/// Pre-create the transparent overlay once so hotkey only needs show().
pub fn ensure_overlay_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        return Ok(());
    }

    let monitor = primary_monitor()?;
    let (logical_w, logical_h, _, pos_x, pos_y) = monitor_metrics(&monitor)?;

    WebviewWindowBuilder::new(app, OVERLAY_LABEL, overlay_url(app)?)
        .title("Screenshot")
        .inner_size(logical_w as f64, logical_h as f64)
        .position(pos_x, pos_y)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| format!("无法预热截屏窗口: {e}"))?;

    Ok(())
}

pub fn open_screenshot_overlay(app: &AppHandle) -> Result<(), String> {
    ensure_overlay_window(app)?;

    let monitor = primary_monitor()?;
    let (logical_w, logical_h, scale, pos_x, pos_y) = monitor_metrics(&monitor)?;

    let session_id = app
        .state::<ScreenshotState>()
        .session
        .fetch_add(1, Ordering::Relaxed)
        + 1;

    let win = app
        .get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| "截屏窗口未就绪".to_string())?;

    let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
        logical_w as f64,
        logical_h as f64,
    )));
    let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(
        pos_x, pos_y,
    )));
    let _ = win.set_always_on_top(true);

    let dto = ScreenshotArmDto {
        session_id,
        logical_width: logical_w,
        logical_height: logical_h,
        scale,
    };
    let _ = win.emit("screenshot-arm", &dto);

    // Frontend paints the dim layer first, then calls screenshot_reveal —
    // avoids a transparent/empty frame flash.
    Ok(())
}

#[tauri::command]
pub fn screenshot_overlay_ready(_app: AppHandle) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn screenshot_reveal(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = win.set_always_on_top(true);
        win.show().map_err(|e| e.to_string())?;
        let _ = win.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn screenshot_confirm(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if width < 2.0 || height < 2.0 {
        return Err("选区过小".to_string());
    }

    // Hide first so the overlay is not in the capture.
    hide_overlay(&app);

    let monitor = primary_monitor()?;
    let (logical_w, _logical_h, reported_scale, _, _) = monitor_metrics(&monitor)?;

    let image = monitor
        .capture_image()
        .map_err(|e| format!("截屏失败（请检查「屏幕录制」权限）: {e}"))?;

    let img_w = image.width();
    let img_h = image.height();
    let rgba = image.into_raw();

    let scale = if logical_w > 0 {
        let inferred = img_w as f32 / logical_w as f32;
        if (inferred - reported_scale).abs() > 0.05 {
            inferred
        } else {
            reported_scale
        }
    } else {
        reported_scale.max(1.0)
    };

    let mut px = (x * scale as f64).round() as i64;
    let mut py = (y * scale as f64).round() as i64;
    let mut pw = (width * scale as f64).round() as i64;
    let mut ph = (height * scale as f64).round() as i64;

    px = px.clamp(0, img_w as i64);
    py = py.clamp(0, img_h as i64);
    pw = pw.clamp(1, img_w as i64 - px).max(1);
    ph = ph.clamp(1, img_h as i64 - py).max(1);

    let px = px as u32;
    let py = py as u32;
    let pw = pw as u32;
    let ph = ph as u32;

    let mut cropped = Vec::with_capacity((pw * ph * 4) as usize);
    let stride = img_w as usize * 4;
    for row in py..py + ph {
        let start = row as usize * stride + px as usize * 4;
        let end = start + pw as usize * 4;
        cropped.extend_from_slice(&rgba[start..end]);
    }

    let mut clipboard = Clipboard::new().map_err(|e| format!("无法访问剪贴板: {e}"))?;
    clipboard
        .set_image(ImageData {
            width: pw as usize,
            height: ph as usize,
            bytes: Cow::Borrowed(&cropped),
        })
        .map_err(|e| format!("写入剪贴板失败: {e}"))?;

    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("screenshot-copied", pw.max(ph));
    }

    Ok(())
}

#[tauri::command]
pub fn screenshot_cancel(app: AppHandle) -> Result<(), String> {
    hide_overlay(&app);
    Ok(())
}
