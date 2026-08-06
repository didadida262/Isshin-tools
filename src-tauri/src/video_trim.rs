use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tokio::fs;
use tokio::task::spawn_blocking;

const VIDEO_EXTS: &[&str] = &["mp4", "mov", "m4v", "webm", "mkv"];
const OUTPUT_SUBDIR: &str = "trimmed";
const DEFAULT_TRIM_SECONDS: f64 = 3.0;

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const TARGET_TRIPLE: &str = "aarch64-apple-darwin";
#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
const TARGET_TRIPLE: &str = "x86_64-apple-darwin";
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const TARGET_TRIPLE: &str = "x86_64-pc-windows-msvc";
#[cfg(not(any(
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "macos", target_arch = "x86_64"),
    all(target_os = "windows", target_arch = "x86_64")
)))]
const TARGET_TRIPLE: &str = "unknown";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoEntry {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrimResult {
    pub path: String,
    pub name: String,
    pub output_path: Option<String>,
    pub ok: bool,
    pub error: Option<String>,
    pub duration_before: Option<f64>,
    pub duration_after: Option<f64>,
}

#[tauri::command]
pub async fn scan_video_dir(dir: String) -> Result<Vec<VideoEntry>, String> {
    let root = PathBuf::from(&dir);
    if !root.is_dir() {
        return Err(format!("目录不存在: {dir}"));
    }

    let mut entries = Vec::new();
    let mut rd = fs::read_dir(&root)
        .await
        .map_err(|e| format!("无法读取目录: {e}"))?;

    while let Some(entry) = rd
        .next_entry()
        .await
        .map_err(|e| format!("读取目录项失败: {e}"))?
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase());
        let Some(ext) = ext else { continue };
        if !VIDEO_EXTS.contains(&ext.as_str()) {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        entries.push(VideoEntry {
            path: path.to_string_lossy().to_string(),
            name,
        });
    }

    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

#[tauri::command]
pub async fn trim_video_end(path: String, trim_seconds: Option<f64>) -> Result<TrimResult, String> {
    let trim_seconds = trim_seconds.unwrap_or(DEFAULT_TRIM_SECONDS);
    if !(trim_seconds.is_finite() && trim_seconds > 0.0) {
        return Err("切除秒数必须为正数".into());
    }

    spawn_blocking(move || trim_video_end_sync(path, trim_seconds))
        .await
        .map_err(|e| format!("任务失败: {e}"))?
}

fn trim_video_end_sync(path: String, trim_seconds: f64) -> Result<TrimResult, String> {
    let input = PathBuf::from(&path);
    let name = input
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    if !input.is_file() {
        return Ok(fail_result(path, name, None, "文件不存在"));
    }

    let ffmpeg = match resolve_ffmpeg() {
        Ok(p) => p,
        Err(e) => return Ok(fail_result(path, name, None, &e)),
    };

    let duration = match probe_duration(&ffmpeg, &input) {
        Ok(d) => d,
        Err(e) => return Ok(fail_result(path, name, None, &e)),
    };

    if duration <= trim_seconds {
        return Ok(TrimResult {
            path,
            name,
            output_path: None,
            ok: false,
            error: Some(format!(
                "视频时长 {duration:.2}s 不足以切除末尾 {trim_seconds:.2}s"
            )),
            duration_before: Some(duration),
            duration_after: None,
        });
    }

    let keep = duration - trim_seconds;
    let output = match build_output_path(&input) {
        Ok(p) => p,
        Err(e) => return Ok(fail_result(path, name, Some(duration), &e)),
    };

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("无法创建输出目录: {e}"))?;
    }

    if let Err(e) = run_trim_copy(&ffmpeg, &input, &output, keep) {
        if let Err(e2) = run_trim_reencode(&ffmpeg, &input, &output, keep) {
            let _ = std::fs::remove_file(&output);
            return Ok(TrimResult {
                path,
                name,
                output_path: None,
                ok: false,
                error: Some(format!("切除失败: {e}; 重编码兜底也失败: {e2}")),
                duration_before: Some(duration),
                duration_after: None,
            });
        }
    }

    Ok(TrimResult {
        path,
        name,
        output_path: Some(output.to_string_lossy().to_string()),
        ok: true,
        error: None,
        duration_before: Some(duration),
        duration_after: Some(keep),
    })
}

fn fail_result(path: String, name: String, duration: Option<f64>, error: &str) -> TrimResult {
    TrimResult {
        path,
        name,
        output_path: None,
        ok: false,
        error: Some(error.to_string()),
        duration_before: duration,
        duration_after: None,
    }
}

fn build_output_path(input: &Path) -> Result<PathBuf, String> {
    let parent = input
        .parent()
        .ok_or_else(|| "无法解析输入文件目录".to_string())?;
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "无法解析文件名".to_string())?;
    let ext = input
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");
    Ok(parent
        .join(OUTPUT_SUBDIR)
        .join(format!("{stem}_trimmed.{ext}")))
}

fn resolve_ffmpeg() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法定位当前程序: {e}"))?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| "无法解析程序目录".to_string())?
        .to_path_buf();

    let mut candidates = vec![
        exe_dir.join("ffmpeg"),
        exe_dir.join(format!("ffmpeg-{TARGET_TRIPLE}")),
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("ffmpeg-{TARGET_TRIPLE}")),
    ];

    #[cfg(windows)]
    {
        candidates.insert(0, exe_dir.join("ffmpeg.exe"));
        candidates.push(exe_dir.join(format!("ffmpeg-{TARGET_TRIPLE}.exe")));
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("binaries")
                .join(format!("ffmpeg-{TARGET_TRIPLE}.exe")),
        );
    }

    for path in candidates {
        if path.is_file() {
            return Ok(path);
        }
    }

    Err(
        "找不到内置 ffmpeg。请先运行 npm run ffmpeg:download，再重新启动应用。".into(),
    )
}

fn probe_duration(ffmpeg: &Path, input: &Path) -> Result<f64, String> {
    // `ffmpeg -i` exits non-zero without an output, but stderr still contains Duration.
    let output = Command::new(ffmpeg)
        .args(["-hide_banner", "-i"])
        .arg(input)
        .output()
        .map_err(|e| format!("ffmpeg 探测失败: {e}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    parse_ffmpeg_duration(&stderr)
        .ok_or_else(|| format!("无法解析视频时长\n{}", stderr.lines().take(8).collect::<Vec<_>>().join("\n")))
}

fn parse_ffmpeg_duration(stderr: &str) -> Option<f64> {
    let key = "Duration: ";
    let idx = stderr.find(key)?;
    let rest = &stderr[idx + key.len()..];
    let token = rest.split([',', ' ']).next()?.trim();
    let parts: Vec<&str> = token.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let hours: f64 = parts[0].parse().ok()?;
    let minutes: f64 = parts[1].parse().ok()?;
    let seconds: f64 = parts[2].parse().ok()?;
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

fn run_trim_copy(ffmpeg: &Path, input: &Path, output: &Path, keep_seconds: f64) -> Result<(), String> {
    let keep = format!("{keep_seconds:.3}");
    let result = Command::new(ffmpeg)
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
        ])
        .arg(input)
        .args(["-t", &keep, "-c", "copy", "-avoid_negative_ts", "make_zero"])
        .arg(output)
        .output()
        .map_err(|e| format!("ffmpeg 执行失败: {e}"))?;

    if !result.status.success() {
        return Err(String::from_utf8_lossy(&result.stderr).trim().to_string());
    }
    if !output.is_file() {
        return Err("输出文件未生成".into());
    }
    Ok(())
}

fn run_trim_reencode(
    ffmpeg: &Path,
    input: &Path,
    output: &Path,
    keep_seconds: f64,
) -> Result<(), String> {
    let keep = format!("{keep_seconds:.3}");
    let result = Command::new(ffmpeg)
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(input)
        .args([
            "-t",
            &keep,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
        ])
        .arg(output)
        .output()
        .map_err(|e| format!("ffmpeg 重编码执行失败: {e}"))?;

    if !result.status.success() {
        return Err(String::from_utf8_lossy(&result.stderr).trim().to_string());
    }
    if !output.is_file() {
        return Err("输出文件未生成".into());
    }
    Ok(())
}
