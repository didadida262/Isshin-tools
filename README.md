# Isshin Tools

个人桌面工具客户端（Tauri + React）。

## 技术栈

- React 19 + TypeScript + Vite
- Tailwind CSS v4 + ThemeProvider（CSS variables）
- Framer Motion + GSAP
- Font Awesome
- Tauri 2（Rust 桥接 + 内置 ffmpeg sidecar）

## 开发

```bash
npm install
npm run ffmpeg:download   # 首次 / 换机时下载内置 ffmpeg
npm run desktop:dev
```

仅前端预览（无桌面桥接能力）：

```bash
npm run dev
```

## 打包

```bash
# macOS Apple Silicon / 本机架构 → .app + .dmg
npm run desktop:build:mac

# macOS Intel
npm run desktop:build:mac:intel

# Windows → NSIS 安装包（需在 Windows 上执行）
npm run desktop:build:win
```

## 工具

- **黄金影响因子**：利率 / 美元 / 通胀 / 风险分层监控
- **网易云歌单导出**：仅导出元数据（歌名 / 歌手 / 专辑等），不提供音频下载
- **抖音结尾切除**：批量切除视频末尾冗余帧（默认 3 秒），输出到 `trimmed/` 子目录；ffmpeg 随应用打包

## 说明

- 登录凭证保存在本机 Tauri Store，不上传第三方。
- 工具模块目录：`src/tools/`
- 内置 ffmpeg 二进制不进 git，构建前由 `scripts/download-ffmpeg.mjs` 拉取。
