#!/usr/bin/env node
/**
 * Download static ffmpeg binary for Tauri externalBin sidecar.
 *
 * Usage:
 *   node scripts/download-ffmpeg.mjs              # current host triple
 *   node scripts/download-ffmpeg.mjs --all         # mac arm/intel + win x64
 *   node scripts/download-ffmpeg.mjs --target aarch64-apple-darwin
 */
import { execSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'src-tauri/binaries')
const FFMPEG_VER = 'b6.1.1'

/** @type {Record<string, { asset: string, ext: string }>} */
const PLATFORMS = {
  'aarch64-apple-darwin': { asset: 'darwin-arm64', ext: '' },
  'x86_64-apple-darwin': { asset: 'darwin-x64', ext: '' },
  'x86_64-pc-windows-msvc': { asset: 'win32-x64', ext: '.exe' },
}

function urlsFor(asset) {
  const file = `ffmpeg-${asset}`
  return [
    `https://cdn.npmmirror.com/binaries/ffmpeg-static/${FFMPEG_VER}/${file}`,
    `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_VER}/${file}`,
  ]
}

function hostTriple() {
  return execSync('rustc --print host-tuple', { encoding: 'utf8' }).trim()
}

function parseTargets() {
  const args = process.argv.slice(2)
  if (args.includes('--all')) return Object.keys(PLATFORMS)
  const idx = args.indexOf('--target')
  if (idx >= 0) {
    const t = args[idx + 1]
    if (!t || !PLATFORMS[t]) {
      console.error(`[download-ffmpeg] 未知 target: ${t}`)
      console.error(`支持: ${Object.keys(PLATFORMS).join(', ')}`)
      process.exit(1)
    }
    return [t]
  }
  const host = hostTriple()
  if (!PLATFORMS[host]) {
    console.error(`[download-ffmpeg] 当前 host triple 无预置源: ${host}`)
    process.exit(1)
  }
  return [host]
}

async function downloadFirst(urls, dest) {
  if (existsSync(dest)) {
    console.log(`[download-ffmpeg] skip (exists) ${dest}`)
    return
  }
  let lastErr = null
  for (const url of urls) {
    try {
      console.log(`[download-ffmpeg] GET ${url}`)
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }
      await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
      if (!dest.endsWith('.exe')) {
        chmodSync(dest, 0o755)
      }
      console.log(`[download-ffmpeg] wrote ${dest}`)
      return
    } catch (err) {
      lastErr = err
      console.warn(`[download-ffmpeg] failed: ${err instanceof Error ? err.message : err}`)
    }
  }
  throw lastErr ?? new Error('所有镜像均失败')
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const targets = parseTargets()
  for (const triple of targets) {
    const { asset, ext } = PLATFORMS[triple]
    await downloadFirst(urlsFor(asset), join(outDir, `ffmpeg-${triple}${ext}`))
  }
  console.log(`[download-ffmpeg] OK · ${targets.join(', ')}`)
}

main().catch((err) => {
  console.error('[download-ffmpeg]', err)
  process.exit(1)
})
