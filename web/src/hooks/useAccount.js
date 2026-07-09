// useAccount.js - 현재 티어/사용량/모델 조회 + 결제 액션 (Phase C)
//
// GET /api/me 로 서버가 결정한 티어와 이번 달 사용량을 가져온다.
// 로그인 상태(userId)가 바뀌면 자동 갱신.

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

export function useAccount(userId) {
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/me')
      if (res.ok) setAccount(await res.json())
      else setAccount(null)
    } catch {
      setAccount(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, userId])

  // 구독 결제 시작 -> Stripe Checkout 으로 이동
  const startCheckout = useCallback(async (tier) => {
    const res = await apiFetch('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ tier }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.url) window.location.href = data.url
    else throw new Error(data.error || '결제 세션 생성 실패')
  }, [])

  // 구독 관리 포털로 이동
  const openPortal = useCallback(async () => {
    const res = await apiFetch('/api/billing/portal', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.url) window.location.href = data.url
    else throw new Error(data.error || '포털 세션 생성 실패')
  }, [])

  return { account, loading, refresh, startCheckout, openPortal }
}
