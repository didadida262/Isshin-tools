use std::path::PathBuf;

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

pub(crate) fn resolve_ffmpeg() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法定位当前程序: {e}"))?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| "无法解析程序目录".to_string())?
        .to_path_buf();

    #[allow(unused_mut)]
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
