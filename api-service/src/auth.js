// auth.js - Supabase JWT 검증 (Phase B)
//
// SUPABASE_URL + SUPABASE_ANON_KEY 가 설정되면 인증 활성화.
// 토큰 검증은 Supabase 의 /auth/v1/user 엔드포인트에 위임한다:
//   - 서명 알고리즘(HS256/ES256 등)에 상관없이 동작
//   - 로컬에서 JWT 시크릿/JWKS 를 관리할 필요 없음
//   - 비용: 요청당 가벼운 왕복 1회 (생성은 어차피 긴 스트리밍이라 무시 가능)
//
// 미설정 시 인증 비활성화 -> 익명 허용(Phase A 동작).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

export const authEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

function bearerToken(req) {
  const h = req.headers['authorization'] || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

/**
 * 요청을 인증한다.
 * @returns {Promise<{ user: object|null, error?: string }>}
 *   - authEnabled=false: 항상 { user: null } (익명 허용)
 *   - 토큰 없음/무효: { user: null, error }
 *   - 성공: { user }
 */
export async function authenticate(req) {
  if (!authEnabled) return { user: null }

  const token = bearerToken(req)
  if (!token) return { user: null, error: 'missing_token' }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    })
    if (!res.ok) return { user: null, error: 'invalid_token' }
    const user = await res.json()
    return { user }
  } catch {
    return { user: null, error: 'auth_unreachable' }
  }
}
