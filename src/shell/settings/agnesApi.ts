import {
  AGNES_IMAGES_ENDPOINT,
  type AgnesImageModelId,
} from './types'

export interface AgnesGenerateResult {
  url: string | null
  b64Json: string | null
  revisedPrompt: string | null
}

interface AgnesGenerateResponse {
  created?: number
  data?: Array<{
    url?: string | null
    b64_json?: string | null
    revised_prompt?: string | null
  }>
  error?: { message?: string } | string
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return '未知错误'
  }
}

function sizeForModel(model: AgnesImageModelId): {
  size: string
  ratio?: string
} {
  // 2.0 uses exact sizes; 2.1 / 2.5 prefer tier + ratio (also accept exact sizes).
  if (model === 'agnes-image-2.0-flash') {
    return { size: '1024x1024' }
  }
  return { size: '1K', ratio: '1:1' }
}

export async function generateAgnesImage(params: {
  apiKey: string
  model: AgnesImageModelId
  prompt: string
}): Promise<AgnesGenerateResult> {
  const apiKey = params.apiKey.trim()
  if (!apiKey) throw new Error('请先填写 Agnes API Key')
  const prompt = params.prompt.trim()
  if (!prompt) throw new Error('请输入提示词')

  const { size, ratio } = sizeForModel(params.model)
  const payload: Record<string, unknown> = {
    model: params.model,
    prompt,
    size,
    extra_body: {
      response_format: 'url',
    },
  }
  if (ratio) payload.ratio = ratio

  const body = JSON.stringify(payload)
  const authorization = `Bearer ${apiKey}`

  let text: string
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    text = await invoke<string>('http_post_json', {
      url: AGNES_IMAGES_ENDPOINT,
      body,
      authorization,
    })
  } else {
    const response = await fetch(AGNES_IMAGES_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body,
    })
    text = await response.text()
    if (!response.ok) {
      const snippet = text.slice(0, 200)
      throw new Error(`HTTP ${response.status} · ${snippet}`)
    }
  }

  let json: AgnesGenerateResponse
  try {
    json = JSON.parse(text) as AgnesGenerateResponse
  } catch {
    throw new Error('响应不是有效 JSON')
  }

  if (json.error) {
    const msg =
      typeof json.error === 'string'
        ? json.error
        : json.error.message || '生成失败'
    throw new Error(msg)
  }

  const item = json.data?.[0]
  if (!item) throw new Error('响应中没有图像数据')

  const url = item.url?.trim() || null
  const b64Json = item.b64_json?.trim() || null
  if (!url && !b64Json) throw new Error('响应中缺少 url / b64_json')

  return {
    url,
    b64Json,
    revisedPrompt: item.revised_prompt ?? null,
  }
}

export function agnesErrorMessage(err: unknown): string {
  return errorMessage(err)
}

export function imageSrcFromResult(result: AgnesGenerateResult): string {
  if (result.url) return result.url
  if (result.b64Json) {
    const raw = result.b64Json
    if (raw.startsWith('data:')) return raw
    return `data:image/png;base64,${raw}`
  }
  return ''
}
