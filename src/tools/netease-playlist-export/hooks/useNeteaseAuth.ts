import { useCallback, useEffect, useRef, useState } from 'react'
import { Store } from '@tauri-apps/plugin-store'
import { neteaseApi } from '../api/NeteaseApiClient'
import type { AuthStatus, NeteaseUserProfile, QrLoginSession } from '../types'

const STORE_PATH = 'isshin-netease.json'
const COOKIE_KEY = 'cookie'

async function getStore() {
  return Store.load(STORE_PATH)
}

export function useNeteaseAuth() {
  const [status, setStatus] = useState<AuthStatus>('anonymous')
  const [profile, setProfile] = useState<NeteaseUserProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qrSession, setQrSession] = useState<QrLoginSession | null>(null)
  const pollRef = useRef<number | null>(null)
  const bootstrapped = useRef(false)

  const clearPoll = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const persistCookie = useCallback(async (cookie: string) => {
    try {
      const store = await getStore()
      await store.set(COOKIE_KEY, cookie)
      await store.save()
    } catch {
      // Browser / store unavailable — session still works in-memory.
    }
  }, [])

  const clearPersisted = useCallback(async () => {
    try {
      const store = await getStore()
      await store.delete(COOKIE_KEY)
      await store.save()
    } catch {
      // ignore
    }
  }, [])

  const applyAuthenticated = useCallback(
    async (cookie?: string) => {
      if (cookie) {
        neteaseApi.setCookie(cookie)
        await persistCookie(cookie)
      }
      const account = await neteaseApi.getAccount()
      if (!account.profile) {
        throw new Error('未获取到账户信息')
      }
      setProfile({
        userId: account.profile.userId,
        nickname: account.profile.nickname,
        avatarUrl: account.profile.avatarUrl,
      })
      setStatus('authenticated')
      setError(null)
      setQrSession(null)
    },
    [persistCookie],
  )

  const logout = useCallback(async () => {
    clearPoll()
    neteaseApi.clearSession()
    await clearPersisted()
    setProfile(null)
    setQrSession(null)
    setStatus('anonymous')
    setError(null)
  }, [clearPersisted, clearPoll])

  const startQrLogin = useCallback(async () => {
    clearPoll()
    setStatus('logging-in')
    setError(null)
    setQrSession(null)
    try {
      const uniKey = await neteaseApi.createQrKey()
      const qrUrl = await neteaseApi.getQrLoginUrl(uniKey)
      setQrSession({ uniKey, qrUrl })
      // Keep logging-in while waiting for scan; QR is already visible.

      pollRef.current = window.setInterval(async () => {
        try {
          const result = await neteaseApi.checkQrLogin(uniKey)
          // 800 expired, 801 wait, 802 confirm, 803 success
          if (result.code === 803) {
            clearPoll()
            const cookie = result.cookie ?? neteaseApi.getCookie()
            await applyAuthenticated(cookie)
          } else if (result.code === 800) {
            clearPoll()
            setError('二维码已过期，请刷新')
            setStatus('auth-error')
            setQrSession(null)
          }
        } catch (e) {
          clearPoll()
          setError(e instanceof Error ? e.message : '扫码登录失败')
          setStatus('auth-error')
        }
      }, 1500)
    } catch (e) {
      clearPoll()
      setQrSession(null)
      setError(e instanceof Error ? e.message : '无法发起扫码登录')
      setStatus('auth-error')
    }
  }, [applyAuthenticated, clearPoll])

  const loginWithCookie = useCallback(
    async (cookie: string) => {
      clearPoll()
      setStatus('logging-in')
      setError(null)
      try {
        await applyAuthenticated(cookie)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Cookie 登录失败')
        setStatus('auth-error')
        neteaseApi.clearSession()
      }
    },
    [applyAuthenticated, clearPoll],
  )

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    void (async () => {
      try {
        const store = await getStore()
        const saved = await store.get<string>(COOKIE_KEY)
        if (!saved) return
        setStatus('logging-in')
        await applyAuthenticated(saved)
      } catch (e) {
        neteaseApi.clearSession()
        await clearPersisted()
        setProfile(null)
        setQrSession(null)
        setStatus('anonymous')
        setError(e instanceof Error ? e.message : '本地登录态已失效，请重新登录')
      }
    })()

    return () => clearPoll()
  }, [applyAuthenticated, clearPersisted, clearPoll])

  return {
    status,
    profile,
    error,
    qrSession,
    startQrLogin,
    loginWithCookie,
    logout,
  }
}
