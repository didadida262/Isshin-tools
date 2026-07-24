#!/usr/bin/env node
/**
 * Ensure the host OS matches the desktop build target.
 * Usage: node scripts/ensure-desktop-platform.mjs <mac|win>
 */
import { platform } from 'node:os'

const target = process.argv[2]
const host = platform()

const allowed = {
  mac: new Set(['darwin']),
  win: new Set(['win32']),
}

if (!target || !allowed[target]) {
  console.error('[ensure-desktop-platform] 用法: node scripts/ensure-desktop-platform.mjs <mac|win>')
  process.exit(1)
}

if (!allowed[target].has(host)) {
  console.error(
    `[ensure-desktop-platform] 当前系统 ${host} 无法构建 ${target} 包。请在对应平台执行。`,
  )
  process.exit(1)
}

console.log(`[ensure-desktop-platform] OK · host=${host} target=${target}`)
