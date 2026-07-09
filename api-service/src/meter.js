// meter.js - 토큰 사용량 기록 (Phase C: DB 영속화 + 로그)
//
// DB(usage_events) 설정 시 이벤트를 기록하고, 항상 구조화 로그도 남긴다.
// 미설정이면 로그만 (Phase A/B 동작).

import { dbEnabled, insertUsageEvent } from './db.js'

/**
 * @param {{ ip: string, userId: string|null, tier: string, model: string, usage: { inputTokens: number, outputTokens: number } }} entry
 */
export async function recordUsage({ ip, userId = null, tier, model, usage }) {
  console.log(
    JSON.stringify({
      t: 'usage',
      ts: new Date().toISOString(),
      ip,
      userId,
      tier,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    }),
  )
  if (dbEnabled && userId) {
    await insertUsageEvent({
      userId,
      model,
      tier,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    })
  }
}
