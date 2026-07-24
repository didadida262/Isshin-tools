# Isshin Tools

个人桌面工具客户端（Tauri + React）。v0.1 首个工具：网易云音乐歌单元数据导出。

## 技术栈

- React 19 + TypeScript + Vite
- Tailwind CSS v4 + ThemeProvider（CSS variables）
- Framer Motion + GSAP
- Font Awesome
- Tauri 2（Rust weapi 桥接网易云接口）

## 开发

```bash
npm install
npm run tauri:dev
```

仅前端预览（无网易云请求能力）：

```bash
npm run dev
```

## 说明

- 仅导出元数据（歌名 / 歌手 / 专辑等），不提供音频下载。
- 登录凭证保存在本机 Tauri Store，不上传第三方。
- 工具模块目录：`src/tools/netease-playlist-export/`
