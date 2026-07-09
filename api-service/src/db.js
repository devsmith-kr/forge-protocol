// db.js - Supabase(Postgres) 접근 (Phase C)
//
// service_role 키로 PostgREST REST API 를 직접 호출한다 (@supabase 의존성 없이 fetch 만 사용).
// service_role 은 RLS 를 우회하므로 구독/사용량 테이블을 서버 권한으로 읽고 쓴다.
//
// SUPABASE_SERVICE_ROLE_KEY 미설정 시 dbEnabled=false, 모든 함수는 안전한 기본값 반환.

import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from './config.js'

export const dbEnabled = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

function monthStartISO() {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}

const REST = () => `${SUPABASE_URL}/rest/v1`

/** 유저의 구독 행을 반환 (없으면 null). */
export async function getSubscription(userId) {
  if (!dbEnabled || !userId) return null
  try {
    const res = await fetch(
      `${REST()}/subscriptions?user_id=eq.${userId}&select=tier,status,stripe_customer_id,stripe_subscription_id&limit=1`,
      { headers: headers() },
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows[0] || null
  } catch {
    return null
  }
}

/** stripe_customer_id 로 구독 행을 반환 (webhook 처리용). */
export async function getSubscriptionByCustomer(customerId) {
  if (!dbEnabled || !customerId) return null
  try {
    const res = await fetch(
      `${REST()}/subscriptions?stripe_customer_id=eq.${customerId}&select=user_id,tier,status&limit=1`,
      { headers: headers() },
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows[0] || null
  } catch {
    return null
  }
}

/** 이번 달(UTC) 유저의 run 수. */
export async function countMonthlyRuns(userId) {
  if (!dbEnabled || !userId) return 0
  try {
    const res = await fetch(
      `${REST()}/usage_events?user_id=eq.${userId}&created_at=gte.${monthStartISO()}&select=id`,
      { headers: headers({ Prefer: 'count=exact', Range: '0-0' }) },
    )
    const cr = res.headers.get('content-range') || ''
    const total = parseInt(cr.split('/')[1], 10)
    return Number.isFinite(total) ? total : 0
  } catch {
    return 0
  }
}

/** 사용량 이벤트 1건 기록. */
export async function insertUsageEvent({ userId, model, tier, inputTokens, outputTokens }) {
  if (!dbEnabled) return
  try {
    await fetch(`${REST()}/usage_events`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        user_id: userId,
        model,
        tier,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      }),
    })
  } catch {
    /* 미터링 실패는 생성 흐름을 막지 않는다 */
  }
}

/** 구독 upsert (user_id PK 기준 merge). webhook 에서 호출. */
export async function upsertSubscription(sub) {
  if (!dbEnabled) return
  try {
    await fetch(`${REST()}/subscriptions`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ ...sub, updated_at: new Date().toISOString() }),
    })
  } catch {
    /* 무시 - Stripe 재시도가 있음 */
  }
}
