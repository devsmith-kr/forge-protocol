// api.js - API 서비스 공통 (Phase C)

import { supabase, isSupabaseEnabled } from './supabase'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// 로그인된 경우 Supabase 액세스 토큰을 Authorization 헤더로 붙인다.
export async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  if (isSupabaseEnabled && supabase) {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return headers
}

// 인증 헤더를 붙여 API 서비스에 요청한다.
export async function apiFetch(path, options = {}) {
  const headers = { ...(await authHeaders()), ...(options.headers || {}) }
  return fetch(`${API_URL}${path}`, { ...options, headers })
}
