// AuthModal.jsx - 로그인 / 회원가입 모달 (Phase B)
//
// 이메일 + 비밀번호. Supabase 프로젝트 설정에서 이메일 확인(confirm)이 켜져 있으면
// 회원가입 후 확인 메일이 필요하다 (로컬 개발 시 대시보드에서 끌 수 있음).

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import './AuthModal.css'

export default function AuthModal({ onClose }) {
  const auth = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const submit = useCallback(
    async (e) => {
      e.preventDefault()
      if (busy) return
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        if (mode === 'login') {
          const { error: err } = await auth.signInWithPassword(email.trim(), password)
          if (err) throw err
          onClose()
        } else {
          const { data, error: err } = await auth.signUp(email.trim(), password)
          if (err) throw err
          // 이메일 확인이 필요한 경우 세션이 바로 생기지 않음
          if (data?.session) onClose()
          else setNotice('확인 메일을 보냈습니다. 메일의 링크를 눌러 인증을 완료하세요.')
        }
      } catch (err) {
        setError(err?.message || '인증에 실패했습니다.')
      } finally {
        setBusy(false)
      }
    },
    [auth, mode, email, password, busy, onClose],
  )

  return (
    <div className="auth-overlay" onClick={onClose}>
      <motion.div
        className="auth-modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        <div className="auth-tabs">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError(null); setNotice(null) }}
            type="button"
          >
            로그인
          </button>
          <button
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => { setMode('signup'); setError(null); setNotice(null) }}
            type="button"
          >
            회원가입
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            이메일
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>

          {error && <div className="auth-error">{error}</div>}
          {notice && <div className="auth-notice">{notice}</div>}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>

        <button className="auth-close" onClick={onClose} type="button" aria-label="닫기">
          ✕
        </button>
      </motion.div>
    </div>
  )
}
