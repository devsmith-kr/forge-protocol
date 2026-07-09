// ProjectMenu.jsx - 헤더의 계정/프로젝트 메뉴 (Phase B)
//
// 비로그인: "로그인" 버튼.
// 로그인: 현재 프로젝트 이름 드롭다운(목록/새로 만들기/삭제) + 이메일 + 로그아웃.
//
// Supabase 미설정(enabled=false) 시엔 아무것도 렌더링하지 않는다 (익명 로컬 모드).

import { useState, useRef, useEffect, useCallback } from 'react'

export default function ProjectMenu({
  enabled,
  user,
  projects,
  currentProjectId,
  onSelect,
  onNew,
  onDelete,
  onSignIn,
  onSignOut,
  syncing,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const handleNew = useCallback(() => {
    const name = window.prompt('새 프로젝트 이름', '내 프로젝트')
    if (name && name.trim()) onNew(name.trim())
    setOpen(false)
  }, [onNew])

  const handleDelete = useCallback(
    (id, name) => {
      if (window.confirm(`"${name}" 프로젝트를 삭제할까요? 되돌릴 수 없습니다.`)) {
        onDelete(id)
      }
    },
    [onDelete],
  )

  if (!enabled) return null

  if (!user) {
    return (
      <button className="pm-signin" onClick={onSignIn} type="button">
        로그인
      </button>
    )
  }

  const current = projects.find((p) => p.id === currentProjectId)

  return (
    <div className="pm" ref={ref}>
      <button className="pm-trigger" onClick={() => setOpen((v) => !v)} type="button">
        <span className="pm-name">{current ? current.name : '프로젝트 선택'}</span>
        {syncing && <span className="pm-sync" title="동기화 중">●</span>}
        <span className="pm-caret">▾</span>
      </button>

      {open && (
        <div className="pm-dropdown">
          <div className="pm-list">
            {projects.length === 0 && (
              <div className="pm-empty">아직 프로젝트가 없습니다</div>
            )}
            {projects.map((p) => (
              <div
                key={p.id}
                className={`pm-item ${p.id === currentProjectId ? 'active' : ''}`}
              >
                <button
                  className="pm-item-name"
                  onClick={() => { onSelect(p.id); setOpen(false) }}
                  type="button"
                >
                  {p.name}
                </button>
                <button
                  className="pm-item-del"
                  onClick={() => handleDelete(p.id, p.name)}
                  type="button"
                  aria-label="삭제"
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button className="pm-new" onClick={handleNew} type="button">
            + 새 프로젝트
          </button>

          <div className="pm-footer">
            <span className="pm-email" title={user.email}>{user.email}</span>
            <button className="pm-signout" onClick={onSignOut} type="button">
              로그아웃
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
