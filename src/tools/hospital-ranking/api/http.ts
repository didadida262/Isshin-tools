/**
 * Desktop: Rust HTTP/1.1 bridge.
 * Vite-only: window.fetch fallback.
 */
export async function httpGetText(url: string): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<string>('http_get_text', { url })
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} · ${url}`)
  }
  return response.text()
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return '未知错误'
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
