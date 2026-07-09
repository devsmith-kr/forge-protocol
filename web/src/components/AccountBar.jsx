// AccountBar.jsx - 헤더의 티어/사용량/업그레이드 (Phase C)
//
// 로그인 상태에서만 렌더. 현재 티어 배지 + 이번 달 사용량 + 업그레이드/관리 버튼.

import { useState, useCallback } from 'react'
import './AccountBar.css'

const TIER_LABEL = { free: 'Free', pro: 'Pro', team: 'Team', max: 'Max' }

export default function AccountBar({ account, onUpgrade, onManage }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const upgrade = useCallback(
    async (tier) => {
      setBusy(true)
      setError(null)
      try {
        await onUpgrade(tier)
      } catch (e) {
        setError(e?.message || '실패')
        setBusy(false)
      }
    },
    [onUpgrade],
  )

  const manage = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await onManage()
    } catch (e) {
      setError(e?.message || '실패')
      setBusy(false)
    }
  }, [onManage])

  if (!account) return null

  const { tier, usage, billingEnabled, hasSubscription } = account
  const label = TIER_LABEL[tier] || tier
  const showUsage = usage && typeof usage.used === 'number'

  return (
    <div className="acct" title={error || undefined}>
      <span className={`acct-badge acct-${tier}`}>{label}</span>
      {showUsage && (
        <span className="acct-usage">
          {usage.used} / {usage.limit}
        </span>
      )}
      {billingEnabled && !hasSubscription && (
        <button className="acct-upgrade" onClick={() => upgrade('pro')} disabled={busy} type="button">
          업그레이드
        </button>
      )}
      {billingEnabled && hasSubscription && (
        <button className="acct-manage" onClick={manage} disabled={busy} type="button">
          구독 관리
        </button>
      )}
    </div>
  )
}
