import { invoke } from '@tauri-apps/api/core'

export interface NeteaseApiResponse {
  status: number
  body: unknown
  cookies: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Packaged Tauri loads the UI from a secure origin (`https://tauri.localhost`).
 * NetEase often returns `http://` CDN URLs for covers, which WKWebView blocks as
 * mixed content. Upgrade to https so images work in DMG builds as well as dev.
 */
function secureCdnUrl(url: string): string {
  if (!url) return url
  return url.replace(/^http:\/\//i, 'https://')
}

/** Normalize pasted browser cookies so headers stay valid. */
export function normalizeCookie(raw: string): string {
  let s = raw
    .replace(/^\uFEFF/, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s*;\s*/g, '; ')
    .replace(/;\s*$/, '')
    .trim()

  // DevTools "Cookie Value" pane copies the bare MUSIC_U value.
  if (s && !s.includes('=') && /^[0-9a-fA-F]+$/i.test(s) && s.length >= 32) {
    s = `MUSIC_U=${s}`
  }

  return s
}

export class NeteaseApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message)
    this.name = 'NeteaseApiError'
  }
}

/**
 * Abstract NetEase data access layer.
 * All traffic goes through the Tauri Rust weapi bridge (local only).
 * Intentionally exposes playlist/track metadata only — no audio URLs.
 */
export class NeteaseApiClient {
  private cookie = ''

  setCookie(cookie: string) {
    this.cookie = cookie
  }

  getCookie() {
    return this.cookie
  }

  clearSession() {
    this.cookie = ''
  }

  private async weapi<T>(
    path: string,
    data: Record<string, unknown> = {},
  ): Promise<{ body: T; cookies: string[] }> {
    const response = await invoke<NeteaseApiResponse>('netease_weapi', {
      path,
      data,
      cookie: this.cookie || null,
    })

    if (response.cookies[0]) {
      this.cookie = response.cookies[0]
    }

    const body = response.body as T
    if (isRecord(body) && typeof body.code === 'number' && body.code !== 200) {
      // QR poll uses non-200 codes as status — callers handle those.
      if (!path.includes('qrcode/client/login')) {
        throw new NeteaseApiError(
          typeof body.msg === 'string' ? body.msg : `接口错误 code=${body.code}`,
          body.code,
        )
      }
    }

    return { body, cookies: response.cookies }
  }

  async createQrKey(): Promise<string> {
    const { body } = await this.weapi<{ code: number; unikey?: string }>(
      '/weapi/login/qrcode/unikey',
      { type: 1 },
    )
    if (!body.unikey) {
      throw new NeteaseApiError('无法获取二维码 key', body.code)
    }
    return body.unikey
  }

  async getQrLoginUrl(uniKey: string): Promise<string> {
    return invoke<string>('netease_qr_url', { uniKey })
  }

  async checkQrLogin(uniKey: string): Promise<{
    code: number
    message?: string
    cookie?: string
  }> {
    const { body, cookies } = await this.weapi<{
      code: number
      message?: string
    }>('/weapi/login/qrcode/client/login', {
      key: uniKey,
      type: 1,
    })

    return {
      code: body.code,
      message: body.message,
      cookie: cookies[0],
    }
  }

  async loginWithCookie(cookie: string): Promise<string> {
    const normalized = normalizeCookie(cookie)
    if (!/(?:^|;\s*)MUSIC_U=/i.test(normalized)) {
      throw new NeteaseApiError(
        'Cookie 中缺少 MUSIC_U。请在 DevTools → Application → Cookies 中复制 MUSIC_U（建议同时带上 __csrf）',
      )
    }
    this.setCookie(normalized)
    return normalized
  }

  async getAccount(): Promise<{
    profile: {
      userId: number
      nickname: string
      avatarUrl: string
    } | null
  }> {
    const { body } = await this.weapi<{
      code: number
      profile?: {
        userId: number
        nickname: string
        avatarUrl: string
      } | null
    }>('/weapi/w/nuser/account/get', {})

    if (body.code === 301 || !body.profile) {
      throw new NeteaseApiError('登录态无效，请重新登录', body.code)
    }

    return {
      profile: {
        ...body.profile,
        avatarUrl: secureCdnUrl(body.profile.avatarUrl),
      },
    }
  }

  async getUserPlaylists(uid: number) {
    const limit = 1000
    const { body } = await this.weapi<{
      code: number
      playlist?: Array<{
        id: number
        name: string
        coverImgUrl: string
        trackCount: number
        playCount: number
        specialType: number
        creator?: { nickname?: string }
      }>
    }>('/weapi/user/playlist', {
      uid,
      limit,
      offset: 0,
      includeVideo: true,
    })

    return (body.playlist ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      coverImgUrl: secureCdnUrl(p.coverImgUrl),
      trackCount: p.trackCount,
      playCount: p.playCount,
      specialType: p.specialType,
      creatorNickname: p.creator?.nickname ?? '',
    }))
  }

  async getPlaylistTracks(playlistId: number) {
    const { body } = await this.weapi<{
      code: number
      playlist?: {
        trackIds?: Array<{ id: number }>
        tracks?: Array<{
          id: number
          name: string
          ar?: Array<{ name: string }>
          al?: { id?: number; name?: string }
          dt?: number
        }>
      }
    }>('/weapi/v6/playlist/detail', {
      id: playlistId,
      n: 100000,
      s: 8,
    })

    const playlist = body.playlist
    if (!playlist) {
      throw new NeteaseApiError('歌单不存在或无权访问', body.code)
    }

    // detail may only return first ~1000 tracks fully; fetch remaining by id.
    const trackIds = playlist.trackIds?.map((t) => t.id) ?? []
    const embedded = playlist.tracks ?? []

    if (trackIds.length === 0) {
      return embedded.map((t) => this.mapTrack(t))
    }

    if (embedded.length >= trackIds.length) {
      return embedded.map((t) => this.mapTrack(t))
    }

    const chunks: number[][] = []
    for (let i = 0; i < trackIds.length; i += 200) {
      chunks.push(trackIds.slice(i, i + 200))
    }

    const all = []
    for (const ids of chunks) {
      const detail = await this.getSongDetail(ids)
      all.push(...detail)
    }
    return all
  }

  private async getSongDetail(ids: number[]) {
    const { body } = await this.weapi<{
      code: number
      songs?: Array<{
        id: number
        name: string
        ar?: Array<{ name: string }>
        al?: { id?: number; name?: string }
        dt?: number
      }>
    }>('/weapi/v3/song/detail', {
      c: JSON.stringify(ids.map((id) => ({ id }))),
    })

    return (body.songs ?? []).map((t) => this.mapTrack(t))
  }

  private mapTrack(t: {
    id: number
    name: string
    ar?: Array<{ name: string }>
    al?: { id?: number; name?: string }
    dt?: number
  }) {
    return {
      songId: t.id,
      name: t.name,
      artists: (t.ar ?? []).map((a) => a.name).join('/'),
      album: t.al?.name ?? '',
      albumId: t.al?.id ?? 0,
      durationMs: t.dt ?? 0,
    }
  }
}

export const neteaseApi = new NeteaseApiClient()
