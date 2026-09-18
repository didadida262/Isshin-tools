import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

export function defaultAgnesFilename(ext = 'png'): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  return `agnes-${stamp}.${ext}`
}

function extFromMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'png'
}

function decodeDataUrl(src: string): { bytes: Uint8Array; ext: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(src)
  if (!match) throw new Error('无效的图像数据')
  const mime = match[1] || 'image/png'
  const isBase64 = Boolean(match[2])
  const data = match[3] || ''
  const ext = extFromMime(mime)
  if (isBase64) {
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { bytes, ext }
  }
  const decoded = decodeURIComponent(data)
  const bytes = new TextEncoder().encode(decoded)
  return { bytes, ext }
}

async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; ext: string }> {
  if (isTauri()) {
    const { fetch } = await import('@tauri-apps/plugin-http')
    const response = await fetch(url, { method: 'GET' })
    if (!response.ok) {
      throw new Error(`下载失败 HTTP ${response.status}`)
    }
    const buf = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || ''
    let ext = extFromMime(contentType)
    const pathExt = url.split('?')[0]?.split('.').pop()?.toLowerCase()
    if (pathExt && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(pathExt)) {
      ext = pathExt === 'jpeg' ? 'jpg' : pathExt
    }
    return { bytes: new Uint8Array(buf), ext }
  }

  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}`)
  const buf = await response.arrayBuffer()
  const contentType = response.headers.get('content-type') || ''
  return { bytes: new Uint8Array(buf), ext: extFromMime(contentType) }
}

async function resolveImageBytes(src: string): Promise<{ bytes: Uint8Array; ext: string }> {
  if (src.startsWith('data:')) return decodeDataUrl(src)
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return fetchImageBytes(src)
  }
  throw new Error('无法识别的图像地址')
}

function browserDownload(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Save generated Agnes image via system save dialog (desktop) or browser download. */
export async function downloadAgnesImage(src: string): Promise<string | null> {
  const { bytes, ext } = await resolveImageBytes(src)
  const filename = defaultAgnesFilename(ext)

  if (!isTauri()) {
    browserDownload(bytes, filename)
    return filename
  }

  const path = await save({
    defaultPath: filename,
    filters: [
      { name: 'Image', extensions: [ext, 'png', 'jpg', 'webp'] },
    ],
  })
  if (!path) return null

  await writeFile(path, bytes)
  return path
}
