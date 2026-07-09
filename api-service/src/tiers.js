// tiers.js - 구독 티어 -> Claude 모델 매핑
//
// 중요: 모델 선택은 반드시 서버에서만 결정한다. 클라이언트가 보낸 model 값은 무시.
// 무료 유저가 고성능(비싼) 모델을 요청해 원가가 폭발하는 것을 막기 위함.
//
// 가격 참고 (2026-06-24 기준, 입력/출력 $ per 1M tokens):
//   Haiku 4.5  : $1  / $5
//   Sonnet 5   : $3  / $15 (인트로 $2/$10, 2026-08-31 까지)
//   Opus 4.8   : $5  / $25

export const MODEL_BY_TIER = {
  free: 'claude-haiku-4-5',
  pro: 'claude-sonnet-5',
  team: 'claude-opus-4-8',
  max: 'claude-opus-4-8',
}

export function modelForTier(tier) {
  return MODEL_BY_TIER[tier] || MODEL_BY_TIER.free
}

// 티어별 월간 사용 한도 (run = /api/generate 호출 1회).
// 유닛 이코노믹스(로드맵 섹션 0)에 맞춰 조정. free 는 남용 방어용 하한.
export const TIER_LIMITS = {
  free: { monthlyRuns: 20 },
  pro:  { monthlyRuns: 500 },
  team: { monthlyRuns: 2000 },
  max:  { monthlyRuns: 1000000 },
}

export function limitForTier(tier) {
  return TIER_LIMITS[tier] || TIER_LIMITS.free
}
