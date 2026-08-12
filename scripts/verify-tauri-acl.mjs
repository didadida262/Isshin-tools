#!/usr/bin/env node
/**
 * Basic Tauri ACL sanity check before packaging.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const capabilitiesPath = join(root, 'src-tauri/capabilities/default.json')
const httpPermissionsPath = join(root, 'src-tauri/permissions/http-get-text.toml')
const neteasePermissionsPath = join(root, 'src-tauri/permissions/netease.toml')
const videoTrimPermissionsPath = join(root, 'src-tauri/permissions/video-trim.toml')
const bilibiliPermissionsPath = join(root, 'src-tauri/permissions/bilibili.toml')

if (!existsSync(capabilitiesPath)) {
  console.error('[verify-tauri-acl] 缺少 src-tauri/capabilities/default.json')
  process.exit(1)
}

const capabilities = JSON.parse(readFileSync(capabilitiesPath, 'utf8'))
if (!Array.isArray(capabilities.permissions) || capabilities.permissions.length === 0) {
  console.error('[verify-tauri-acl] capabilities.permissions 为空')
  process.exit(1)
}

const required = [
  'core:default',
  'allow-http-get-text',
  'allow-netease',
  'allow-video-trim',
  'allow-bilibili',
]
for (const id of required) {
  const found = capabilities.permissions.some(
    (p) => p === id || (typeof p === 'object' && p?.identifier === id),
  )
  if (!found) {
    console.error(`[verify-tauri-acl] 缺少权限: ${id}`)
    process.exit(1)
  }
}

if (!existsSync(httpPermissionsPath)) {
  console.error('[verify-tauri-acl] 缺少 src-tauri/permissions/http-get-text.toml')
  process.exit(1)
}

if (!existsSync(neteasePermissionsPath)) {
  console.error('[verify-tauri-acl] 缺少 src-tauri/permissions/netease.toml')
  process.exit(1)
}

if (!existsSync(videoTrimPermissionsPath)) {
  console.error('[verify-tauri-acl] 缺少 src-tauri/permissions/video-trim.toml')
  process.exit(1)
}

if (!existsSync(bilibiliPermissionsPath)) {
  console.error('[verify-tauri-acl] 缺少 src-tauri/permissions/bilibili.toml')
  process.exit(1)
}

console.log(
  `[verify-tauri-acl] OK · ${capabilities.permissions.length} permissions in default capability`,
)
