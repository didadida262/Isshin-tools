import { useCallback, useEffect, useRef, useState } from 'react'
import { Store } from '@tauri-apps/plugin-store'
import {
  loginWithCookie,
  pollQrLogin,
  startQrLogin,
} from '../api/douyinApi'
import type { AuthStatus, DouyinProfile, DouyinQrSession } from '../types'

const STORE_PATH = 'isshin-douyin.json'
const COOKIE_KEY = 'cookie'

async function getStore() {
  return Store.load(STORE_PATH)
}

export function useDouyinAuth() {
  const [status, setStatus] = useState<AuthStatus>('anonymous')
  const [profile, setProfile] = useState<DouyinProfile | null>(null)
  const [cookie, setCookie] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qrSession, setQrSession] = useState<DouyinQrSession | null>(null)
  const pollRef = useRef<number | null>(null)
  const bootstrapped = useRef(false)

  const clearPoll = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const persistCookie = useCallback(async (value: string) => {
    try {
      const store = await getStore()
      await store.set(COOKIE_KEY, value)
      await store.save()
    } catch {
      // ignore
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
    async (rawCookie: string) => {
      const next = await loginWithCookie(rawCookie)
      setCookie(rawCookie)
      setProfile(next)
      setStatus('authenticated')
      setError(null)
      setQrSession(null)
      await persistCookie(rawCookie)
    },
    [persistCookie],
  )

  const logout = useCallback(async () => {
    clearPoll()
    setCookie(null)
    setProfile(null)
    setQrSession(null)
    setStatus('anonymous')
    setError(null)
    await clearPersisted()
  }, [clearPoll, clearPersisted])

  const loginWithCookieInput = useCallback(
    async (raw: string) => {
      clearPoll()
      setStatus('logging-in')
      setError(null)
      try {
        await applyAuthenticated(raw)
      } catch (e) {
        setStatus('auth-error')
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [applyAuthenticated, clearPoll],
  )

  const startQr = useCallback(async () => {
    clearPoll()
    setStatus('logging-in')
    setError(null)
    setQrSession(null)
    try {
      const session = await startQrLogin()
      setQrSession(session)
      pollRef.current = window.setInterval(() => {
        void (async () => {
          try {
            const result = await pollQrLogin(session.token)
            if (result.status === 'confirmed' && result.cookie) {
              clearPoll()
              await applyAuthenticated(result.cookie)
            } else if (result.status === 'expired') {
              clearPoll()
              setStatus('auth-error')
              setError(result.message || '二维码已过期，请刷新')
              setQrSession(null)
            }
          } catch (e) {
            clearPoll()
            setStatus('auth-error')
            setError(e instanceof Error ? e.message : String(e))
            setQrSession(null)
          }
        })()
      }, 2000)
    } catch (e) {
      setStatus('auth-error')
      setError(
        (e instanceof Error ? e.message : String(e)) +
          ' · 可改用 Cookie 登录',
      )
    }
  }, [applyAuthenticated, clearPoll])

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
      } catch {
        setStatus('anonymous')
      }
    })()
    return () => clearPoll()
  }, [applyAuthenticated, clearPoll])

  return {
    status,
    profile,
    cookie,
    error,
    qrSession,
    loginWithCookie: loginWithCookieInput,
    startQrLogin: startQr,
    logout,
  }
}
