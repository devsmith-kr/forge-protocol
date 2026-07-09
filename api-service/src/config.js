// config.js - 환경변수 기반 설정 (Phase A)

export const PORT = parseInt(process.env.PORT || '3001', 10)

// 스트리밍이므로 큰 값도 타임아웃 안전. Haiku 4.5 는 최대 64K, Sonnet/Opus 는 128K.
export const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '32000', 10)

// Phase A: 인증 없음 -> 모든 요청에 이 티어 적용. Phase B~C 에서 사용자별로 대체.
export const DEFAULT_TIER = process.env.DEFAULT_TIER || 'free'

// CORS 허용 오리진 화이트리스트
export const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// 임시 쿼터 (Phase A 안전망). Phase C 에서 사용자별 쿼터 + 미터링으로 대체.
export const DAILY_LIMIT_PER_IP = parseInt(process.env.DAILY_LIMIT_PER_IP || '20', 10)
export const DAILY_LIMIT_GLOBAL = parseInt(process.env.DAILY_LIMIT_GLOBAL || '500', 10)

// Supabase 인증 (Phase B). 둘 다 설정되면 /api/generate 는 로그인을 요구한다.
// 미설정이면 익명 허용(Phase A 동작 유지) - 로컬 개발 편의.
export const SUPABASE_URL = process.env.SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''

// Phase C: 서버가 구독/사용량 테이블을 읽고 쓰기 위한 service_role 키.
// 설정되면 사용자별 티어(구독)와 월별 쿼터/미터링이 DB 기반으로 동작한다.
// 미설정이면 티어는 DEFAULT_TIER, 쿼터는 IP 기반, 미터링은 로그로만 (Phase A/B 동작).
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Phase C: Stripe 구독 결제. STRIPE_SECRET_KEY 설정 시 billing 엔드포인트 활성.
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || ''
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''
export const STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO || ''
export const STRIPE_PRICE_TEAM = process.env.STRIPE_PRICE_TEAM || ''

// 결제 성공/취소 후 돌아올 프론트엔드 주소
export const APP_URL = process.env.APP_URL || 'http://localhost:5173'
