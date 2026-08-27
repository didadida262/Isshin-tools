import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchProfile,
  hideLoginWindow,
  logout as logoutSession,
  openLoginWindow,
} from '../api/douyinApi'
import type { AuthStatus, DouyinProfile } from '../types'

const POLL_INTERVAL_MS = 3000
/** Enough time to scan a QR code, type an SMS code, and clear a captcha. */
const POLL_TIMEOUT_MS = 5 * 60 * 1000

export function useDouyinAuth() {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [profile, setProfile] = useState<DouyinProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)
  const bootstrapped = useRef(false)

  const clearPoll = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const applyProfile = useCallback((next: DouyinProfile) => {
    setProfile(next)
    setStatus('authenticated')
    setError(null)
    void hideLoginWindow()
  }, [])

  /** Watch the Douyin window until a session appears there. */
  const startPolling = useCallback(() => {
    clearPoll()
    const startedAt = Date.now()
    pollRef.current = window.setInterval(() => {
      void (async () => {
        try {
          applyProfile(await fetchProfile())
          clearPoll()
        } catch {
          if (Date.now() - startedAt < POLL_TIMEOUT_MS) return
          clearPoll()
          setStatus('anonymous')
          setError('登录等待超时，请重新点击「打开抖音登录」')
        }
      })()
    }, POLL_INTERVAL_MS)
  }, [applyProfile, clearPoll])

  const openLogin = useCallback(async () => {
    setError(null)
    setStatus('awaiting-login')
    try {
      await openLoginWindow()
      startPolling()
    } catch (e) {
      clearPoll()
      setStatus('auth-error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [clearPoll, startPolling])

  const logout = useCallback(async () => {
    clearPoll()
    setProfile(null)
    setStatus('anonymous')
    setError(null)
    try {
      await logoutSession()
    } catch {
      // best effort: the window may already be gone
    }
  }, [clearPoll])

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    void (async () => {
      try {
        applyProfile(await fetchProfile())
      } catch {
        setStatus('anonymous')
      }
    })()
  }, [applyProfile])

  useEffect(() => () => clearPoll(), [clearPoll])

  return {
    status,
    profile,
    error,
    /** Stable across msToken rotation, unlike the raw cookie. */
    sessionKey: profile?.secUid ?? null,
    openLogin,
    logout,
  }
}
