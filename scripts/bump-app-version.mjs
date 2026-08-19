#!/usr/bin/env node
/**
 * Desktop build 前准备版本号：
 * - 若 package.json 相对 HEAD 未改版本：patch 自增，并单独提交「版本更新」
 * - 若已手动改过版本：跳过自增与版本提交，仅同步到 Tauri / Cargo
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const VERSION_FILES = [
  'package.json',
  'package-lock.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
]

function git(args, inherit = false) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  })
}

function run(command, args, extra = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...extra,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function readPkgVersion(source) {
  const pkg = JSON.parse(source)
  if (!pkg.version || typeof pkg.version !== 'string') {
    throw new Error('package.json 缺少 version')
  }
  return pkg.version
}

function bumpPatch(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    throw new Error(`无法自增版本号（需要 x.y.z）：${version}`)
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

const pkgPath = join(root, 'package.json')
const currentVersion = readPkgVersion(readFileSync(pkgPath, 'utf8'))

const insideGit = git(['rev-parse', '--is-inside-work-tree'])
const isGitRepo = insideGit.status === 0 && insideGit.stdout.trim() === 'true'
if (!isGitRepo) {
  console.error('[bump-app-version] 当前目录不是 git 仓库，无法提交版本更新')
  process.exit(1)
}

const headShow = git(['show', 'HEAD:package.json'])
const headVersion =
  headShow.status === 0 ? readPkgVersion(headShow.stdout) : null
const manual = headVersion != null && headVersion !== currentVersion

if (manual) {
  console.log(
    `[bump-app-version] 检测到手动改版本 ${headVersion} → ${currentVersion}，跳过自增与版本提交`,
  )
} else {
  const nextVersion = bumpPatch(currentVersion)
  console.log(`[bump-app-version] ${currentVersion} → ${nextVersion}`)
  run('npm', ['version', nextVersion, '--no-git-tag-version'])
}

run(process.execPath, [join(root, 'scripts/sync-app-version.mjs')])

if (manual) {
  process.exit(0)
}

const add = git(['add', '--', ...VERSION_FILES], true)
if (add.status !== 0) {
  console.error('[bump-app-version] git add 失败')
  process.exit(add.status ?? 1)
}

const commit = git(['commit', '-m', '版本更新', '--', ...VERSION_FILES], true)
if (commit.status !== 0) {
  console.error('[bump-app-version] git commit 失败')
  process.exit(commit.status ?? 1)
}

const finalVersion = readPkgVersion(readFileSync(pkgPath, 'utf8'))
console.log(`[bump-app-version] 已提交版本更新 ${finalVersion}`)
