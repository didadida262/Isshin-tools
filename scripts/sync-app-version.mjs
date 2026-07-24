#!/usr/bin/env node
/**
 * Sync package.json version → tauri.conf.json + Cargo.toml
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = pkg.version
if (!version || typeof version !== 'string') {
  console.error('[sync-app-version] package.json 缺少 version')
  process.exit(1)
}

const tauriPath = join(root, 'src-tauri/tauri.conf.json')
const tauri = JSON.parse(readFileSync(tauriPath, 'utf8'))
if (tauri.version !== version) {
  tauri.version = version
  writeFileSync(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`)
  console.log(`[sync-app-version] tauri.conf.json → ${version}`)
} else {
  console.log(`[sync-app-version] tauri.conf.json 已是 ${version}`)
}

const cargoPath = join(root, 'src-tauri/Cargo.toml')
const cargo = readFileSync(cargoPath, 'utf8')
const nextCargo = cargo.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`)
if (nextCargo !== cargo) {
  writeFileSync(cargoPath, nextCargo)
  console.log(`[sync-app-version] Cargo.toml → ${version}`)
} else {
  console.log(`[sync-app-version] Cargo.toml 已是 ${version}`)
}
