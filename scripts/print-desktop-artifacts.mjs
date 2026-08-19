#!/usr/bin/env node
/**
 * Print likely Tauri bundle artifact paths after build.
 * Usage: node scripts/print-desktop-artifacts.mjs <mac|mac-intel|win>
 */
import { existsSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const label = process.argv[2] ?? 'desktop'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

function dmgNameWithVersion(name, ver) {
  if (!name.toLowerCase().endsWith('.dmg') || name.includes(ver)) return name
  const stem = name.slice(0, -4)
  const arch = stem.match(/_(aarch64|x86_64|x64|universal)$/i)
  if (arch) {
    const prefix = stem.slice(0, -arch[0].length)
    return `${prefix}_${ver}${arch[0]}.dmg`
  }
  return `${stem}_${ver}.dmg`
}

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
    let printed = f
    if (f.toLowerCase().endsWith('.dmg')) {
      const nextName = dmgNameWithVersion(basename(f), version)
      if (nextName !== basename(f)) {
        const dest = join(dirname(f), nextName)
        if (existsSync(dest)) {
          console.log(`  ${f}`)
          console.log(`    (未重命名：已存在 ${nextName})`)
          printed = f
        } else {
          renameSync(f, dest)
          printed = dest
          console.log(`  ${printed}`)
          console.log(`    (已加上版本号 ${version})`)
        }
        found = true
        continue
      }
    }
    console.log(`  ${printed}`)
    found = true
  }
}

if (!found) {
  console.log('  未找到产物目录，请检查 tauri build 是否成功。')
  console.log('  常见路径: src-tauri/target/release/bundle/')
}
