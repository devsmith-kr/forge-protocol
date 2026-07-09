// server.js - Forge SaaS API 서비스 (Phase C)
//
// 기존 web/server/bridge.js 를 대체한다.
//   - 클라이언트 apiKey 수신 없음. 서버 보유 키로만 프록시 (Phase A)
//   - CLI 모드 없음 (Phase A)
//   - Supabase JWT 인증 (Phase B)
//   - 구독 티어 -> 모델 서버 강제 + 사용자별 월 쿼터 + DB 미터링 + Stripe 결제 (Phase C)
//
// SSE 이벤트 프로토콜(status/chunk/usage/done/error)은 프론트엔드와 호환 유지.

import http from 'node:http'
import { PORT, DEFAULT_TIER, ALLOWED_ORIGINS } from './config.js'
import { modelForTier, limitForTier } from './tiers.js'
import { checkAndReserve } from './quota.js'
import { recordUsage } from './meter.js'
import { startStream } from './anthropic.js'
import { authenticate, authEnabled } from './auth.js'
import { dbEnabled, getSubscription, getSubscriptionByCustomer, countMonthlyRuns, upsertSubscription } from './db.js'
import {
  billingEnabled,
  createCheckout,
  createPortal,
  constructEvent,
  tierForPrice,
} from './billing.js'

// ── CORS ──────────────────────────────────────────────
function setCors(req, res) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

// ── 유틸 ──────────────────────────────────────────────
function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJsonBody(req) {
  const raw = await readRawBody(req)
  return JSON.parse(raw.toString() || '{}')
}

function sseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function jsonReply(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

// 유저의 구독 상태에서 티어를 결정한다. 구독 없음/비활성 -> free.
// DB 미설정이면 DEFAULT_TIER (Phase A/B 동작).
async function resolveTier(user) {
  if (!user) return DEFAULT_TIER
  if (!dbEnabled) return DEFAULT_TIER
  const sub = await getSubscription(user.id)
  if (sub && (sub.status === 'active' || sub.status === 'trialing')) {
    return sub.tier || 'free'
  }
  return 'free'
}

// 인증 게이트: authEnabled 면 유효 토큰 필수. 반환 { user } 또는 null(응답 이미 보냄).
async function requireAuth(req, res) {
  const { user, error } = await authenticate(req)
  if (authEnabled && !user) {
    jsonReply(res, 401, { error: '로그인이 필요합니다.', reason: error || 'unauthorized' })
    return null
  }
  return { user }
}

// ── /api/generate ─────────────────────────────────────
async function handleGenerate(req, res) {
  let body
  try {
    body = await readJsonBody(req)
  } catch {
    return jsonReply(res, 400, { error: '잘못된 JSON 본문입니다.' })
  }

  const prompt = body?.prompt
  if (!prompt || typeof prompt !== 'string') {
    return jsonReply(res, 400, { error: 'prompt 필드(문자열)가 필요합니다.' })
  }

  const authed = await requireAuth(req, res)
  if (!authed) return
  const { user } = authed

  // 쿼터 게이트 (호출 전)
  if (user && dbEnabled) {
    // 사용자별 월 쿼터
    const tier = await resolveTier(user)
    const limit = limitForTier(tier).monthlyRuns
    const used = await countMonthlyRuns(user.id)
    if (used >= limit) {
      return jsonReply(res, 402, {
        error: `이번 달 ${tier} 티어 사용 한도(${limit}회)를 모두 사용했습니다. 업그레이드하면 더 사용할 수 있습니다.`,
        reason: 'quota_exceeded',
        tier,
        limit,
        used,
      })
    }
  } else {
    // 익명/DB미설정: IP 기반 임시 쿼터 (Phase A 안전망)
    const gate = checkAndReserve(getClientIp(req))
    if (!gate.ok) {
      return jsonReply(res, 429, {
        error: '일일 사용 한도를 초과했습니다. 잠시 후 다시 시도하세요.',
        reason: gate.reason,
      })
    }
  }

  const tier = await resolveTier(user)
  const model = modelForTier(tier)
  const ip = getClientIp(req)

  sseHeaders(res)
  sseSend(res, 'status', { message: `${model} 생성 중...`, model, tier })

  let stream
  try {
    stream = startStream({ prompt, model })
  } catch (e) {
    sseSend(res, 'error', { message: e?.message || '스트림 시작 실패' })
    return res.end()
  }

  req.on('close', () => {
    try {
      stream.abort()
    } catch {
      /* 무시 */
    }
  })

  let output = ''
  stream.on('text', (t) => {
    output += t
    sseSend(res, 'chunk', { text: t, totalLength: output.length })
  })

  try {
    const final = await stream.finalMessage()
    if (final?.usage) {
      const usage = {
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      }
      sseSend(res, 'usage', usage)
      await recordUsage({ ip, userId: user?.id || null, tier, model, usage })
    }
    if (!res.writableEnded) sseSend(res, 'done', { output, length: output.length })
  } catch (e) {
    if (!res.writableEnded) sseSend(res, 'error', { message: e?.message || '생성 실패' })
  } finally {
    if (!res.writableEnded) res.end()
  }
}

// ── /api/me : 현재 티어/사용량/모델 ────────────────────
async function handleMe(req, res) {
  const authed = await requireAuth(req, res)
  if (!authed) return
  const { user } = authed

  const tier = await resolveTier(user)
  const limit = limitForTier(tier).monthlyRuns
  const used = user && dbEnabled ? await countMonthlyRuns(user.id) : null
  const sub = user && dbEnabled ? await getSubscription(user.id) : null

  return jsonReply(res, 200, {
    tier,
    model: modelForTier(tier),
    usage: { used, limit },
    billingEnabled,
    hasSubscription: Boolean(sub?.stripe_customer_id),
  })
}

// ── /api/billing/checkout ─────────────────────────────
async function handleCheckout(req, res) {
  if (!billingEnabled) return jsonReply(res, 501, { error: '결제가 설정되지 않았습니다.' })
  const authed = await requireAuth(req, res)
  if (!authed || !authed.user) {
    if (!res.writableEnded) jsonReply(res, 401, { error: '로그인이 필요합니다.' })
    return
  }
  let body
  try {
    body = await readJsonBody(req)
  } catch {
    return jsonReply(res, 400, { error: '잘못된 JSON 본문입니다.' })
  }
  const tier = body?.tier
  try {
    const urlStr = await createCheckout(authed.user, tier)
    return jsonReply(res, 200, { url: urlStr })
  } catch (e) {
    return jsonReply(res, 400, { error: e?.message || '결제 세션 생성 실패' })
  }
}

// ── /api/billing/portal ───────────────────────────────
async function handlePortal(req, res) {
  if (!billingEnabled) return jsonReply(res, 501, { error: '결제가 설정되지 않았습니다.' })
  const authed = await requireAuth(req, res)
  if (!authed || !authed.user) {
    if (!res.writableEnded) jsonReply(res, 401, { error: '로그인이 필요합니다.' })
    return
  }
  const sub = await getSubscription(authed.user.id)
  if (!sub?.stripe_customer_id) {
    return jsonReply(res, 400, { error: '활성 구독이 없습니다.' })
  }
  try {
    const urlStr = await createPortal(sub.stripe_customer_id)
    return jsonReply(res, 200, { url: urlStr })
  } catch (e) {
    return jsonReply(res, 400, { error: e?.message || '포털 세션 생성 실패' })
  }
}

// ── /api/webhooks/stripe ──────────────────────────────
async function handleStripeWebhook(req, res) {
  if (!billingEnabled) return jsonReply(res, 501, { error: 'billing 미설정' })
  const raw = await readRawBody(req)
  const sig = req.headers['stripe-signature']
  let event
  try {
    event = constructEvent(raw, sig)
  } catch (e) {
    return jsonReply(res, 400, { error: `서명 검증 실패: ${e?.message}` })
  }

  try {
    const obj = event.data.object
    switch (event.type) {
      case 'checkout.session.completed': {
        const userId = obj.client_reference_id || obj.metadata?.user_id
        const tier = obj.metadata?.tier || 'pro'
        if (userId) {
          await upsertSubscription({
            user_id: userId,
            tier,
            status: 'active',
            stripe_customer_id: obj.customer,
            stripe_subscription_id: obj.subscription,
          })
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const userId = obj.metadata?.user_id || (await getSubscriptionByCustomer(obj.customer))?.user_id
        if (userId) {
          const priceId = obj.items?.data?.[0]?.price?.id
          await upsertSubscription({
            user_id: userId,
            tier: tierForPrice(priceId),
            status: obj.status,
            stripe_customer_id: obj.customer,
            stripe_subscription_id: obj.id,
            current_period_end: obj.current_period_end
              ? new Date(obj.current_period_end * 1000).toISOString()
              : null,
          })
        }
        break
      }
      case 'customer.subscription.deleted': {
        const userId = obj.metadata?.user_id || (await getSubscriptionByCustomer(obj.customer))?.user_id
        if (userId) {
          await upsertSubscription({
            user_id: userId,
            tier: 'free',
            status: 'canceled',
            stripe_customer_id: obj.customer,
            stripe_subscription_id: obj.id,
          })
        }
        break
      }
      default:
        break
    }
  } catch (e) {
    // 처리 실패해도 200 을 주면 Stripe 가 재시도하지 않으므로, 실패 시 500 으로 재시도 유도
    return jsonReply(res, 500, { error: e?.message || 'webhook 처리 실패' })
  }

  return jsonReply(res, 200, { received: true })
}

// ── 서버 ──────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  setCors(req, res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  if (path === '/api/status' && req.method === 'GET') {
    return jsonReply(res, 200, {
      ok: true,
      tier: DEFAULT_TIER,
      model: modelForTier(DEFAULT_TIER),
      authRequired: authEnabled,
      billingEnabled,
    })
  }

  if (path === '/api/me' && req.method === 'GET') return handleMe(req, res)
  if (path === '/api/generate' && req.method === 'POST') return handleGenerate(req, res)
  if (path === '/api/billing/checkout' && req.method === 'POST') return handleCheckout(req, res)
  if (path === '/api/billing/portal' && req.method === 'POST') return handlePortal(req, res)
  if (path === '/api/webhooks/stripe' && req.method === 'POST') return handleStripeWebhook(req, res)

  return jsonReply(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  const keyOk = Boolean(process.env.ANTHROPIC_API_KEY)
  console.log('')
  console.log('  Forge API Service (Phase C)')
  console.log('  --------------------------------')
  console.log(`  URL:            http://localhost:${PORT}`)
  console.log(`  ANTHROPIC key:  ${keyOk ? 'OK' : '없음 (.env 설정 필요)'}`)
  console.log(`  기본 티어:      ${DEFAULT_TIER} -> ${modelForTier(DEFAULT_TIER)}`)
  console.log(`  인증:           ${authEnabled ? 'Supabase 활성' : '비활성 (익명 허용)'}`)
  console.log(`  DB(구독/사용량): ${dbEnabled ? '활성 (service_role)' : '비활성 (IP 쿼터/로그)'}`)
  console.log(`  결제(Stripe):    ${billingEnabled ? '활성' : '비활성'}`)
  console.log(`  CORS 허용:      ${ALLOWED_ORIGINS.join(', ')}`)
  console.log('  --------------------------------')
  console.log('  GET  /api/status            - 상태')
  console.log('  GET  /api/me                - 티어/사용량/모델 (인증)')
  console.log('  POST /api/generate          - 코드 생성 (SSE)')
  console.log('  POST /api/billing/checkout  - 구독 결제 세션 (인증)')
  console.log('  POST /api/billing/portal    - 구독 관리 포털 (인증)')
  console.log('  POST /api/webhooks/stripe   - Stripe webhook')
  console.log('')
})
