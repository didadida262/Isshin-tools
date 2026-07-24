import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

/** Set by `tauri dev` when spawning beforeDevCommand */
const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // Never auto-open a browser tab.
    open: false,
    // Under tauri:dev, Vite is only a loopback sidecar for the desktop webview.
    // Plain `npm run dev` keeps default host for intentional web debugging.
    ...(isTauri ? { host: '127.0.0.1' } : {}),
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2022', 'chrome105', 'safari14'],
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
