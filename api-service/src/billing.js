// billing.js - Stripe 구독 결제 (Phase C)
//
// STRIPE_SECRET_KEY 미설정 시 billingEnabled=false, 관련 엔드포인트는 비활성.

import Stripe from 'stripe'
import {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PRO,
  STRIPE_PRICE_TEAM,
  APP_URL,
} from './config.js'

export const billingEnabled = Boolean(STRIPE_SECRET_KEY)

const stripe = billingEnabled ? new Stripe(STRIPE_SECRET_KEY) : null

const PRICE_BY_TIER = { pro: STRIPE_PRICE_PRO, team: STRIPE_PRICE_TEAM }

/** Stripe price id 로부터 티어를 역매핑 (webhook 에서 사용). */
export function tierForPrice(priceId) {
  if (priceId && priceId === STRIPE_PRICE_PRO) return 'pro'
  if (priceId && priceId === STRIPE_PRICE_TEAM) return 'team'
  return 'free'
}

/** 구독 결제용 Checkout 세션을 만들고 결제 URL 을 반환. */
export async function createCheckout(user, tier) {
  const price = PRICE_BY_TIER[tier]
  if (!price) throw new Error(`구독 불가 티어이거나 price 미설정: ${tier}`)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.email,
    success_url: `${APP_URL}/?billing=success`,
    cancel_url: `${APP_URL}/?billing=cancel`,
    // subscription.* 이벤트가 user_id/tier 를 실어오도록 메타데이터 부착
    subscription_data: { metadata: { user_id: user.id, tier } },
    metadata: { user_id: user.id, tier },
  })
  return session.url
}

/** 구독 관리(Customer Portal) URL 반환. */
export async function createPortal(customerId) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: APP_URL,
  })
  return session.url
}

/** webhook 서명 검증 후 이벤트 객체 반환. rawBody 는 Buffer 여야 함. */
export function constructEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)
}
