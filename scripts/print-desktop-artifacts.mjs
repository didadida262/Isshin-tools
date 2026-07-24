#!/usr/bin/env node
/**
 * Print likely Tauri bundle artifact paths after build.
 * Usage: node scripts/print-desktop-artifacts.mjs <mac|mac-intel|win>
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const label = process.argv[2] ?? 'desktop'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const candidates = [
  join(root, 'src-tauri/target/release/bundle'),
  join(root, 'src-tauri/target/x86_64-apple-darwin/release/bundle'),
  join(root, 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle'),
]

function walk(dir, depth = 0, out = []) {
  if (depth > 3 || !existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, depth + 1, out)
    else if (/\.(dmg|app|exe|msi|nsis)$/i.test(name) || name.endsWith('.app')) {
      out.push(full)
    }
  }
  return out
}

console.log(`[print-desktop-artifacts] ${label}`)
let found = false
for (const base of candidates) {
  if (!existsSync(base)) continue
  const files = walk(base)
  if (files.length === 0) {
    console.log(`  (bundle dir) ${base}`)
    found = true
    continue
  }
  for (const f of files) {
    console.log(`  ${f}`)
    found = true
  }
}

if (!found) {
  console.log('  未找到产物目录，请检查 tauri build 是否成功。')
  console.log('  常见路径: src-tauri/target/release/bundle/')
}
