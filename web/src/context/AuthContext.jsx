// AuthContext.jsx - Supabase 인증 컨텍스트 (Phase B)
//
// Supabase 미설정 시 enabled=false, user=null 로 안전하게 degrade 한다.

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseEnabled } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  // Supabase 사용 시 첫 세션 조회 전까지 loading, 미사용 시 즉시 false
  const [loading, setLoading] = useState(isSupabaseEnabled)

  useEffect(() => {
    if (!isSupabaseEnabled) {
      setLoading(false)
      return
    }
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = {
    enabled: isSupabaseEnabled,
    user,
    session,
    loading,
    signInWithPassword: (email, password) =>
      supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password) => supabase.auth.signUp({ email, password }),
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
