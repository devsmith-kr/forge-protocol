// supabase.js - Supabase 클라이언트 (Phase B)
//
// 환경변수가 없으면 클라이언트는 null 이고 isSupabaseEnabled 는 false.
// 이 경우 앱은 기존 localStorage 익명 모드로 동작한다 (로컬 개발/오프라인).

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseEnabled = Boolean(url && anonKey)

export const supabase = isSupabaseEnabled ? createClient(url, anonKey) : null
