import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BUILTIN_CATALOG } from './catalog'
import { PHASES } from './constants'
import {
  loadSession,
  saveSession,
  clearSession,
  toStatePayload,
  fromStatePayload,
} from './hooks/usePersistedState'
import { ProjectProvider, useProject } from './context/ProjectContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useProjects } from './hooks/useProjects'
import { useAccount } from './hooks/useAccount'
import { I18nProvider, useT } from './i18n'
import AnimatedNumber from './components/AnimatedNumber'
import ErrorBoundary from './components/ErrorBoundary'
import PhaseBar from './components/PhaseBar'
import OnboardingModal from './components/OnboardingModal'
import ProjectMenu from './components/ProjectMenu'
import AccountBar from './components/AccountBar'
import AuthModal from './components/AuthModal'
import './components/OnboardingModal.css'
import './components/ProjectMenu.css'
import GuidePanel from './GuidePanel'
import MetaSmeltPhase from './phases/MetaSmeltPhase'
import SmeltPhase from './phases/SmeltPhase'
import ShapePhase from './phases/ShapePhase'
import BuildPhase from './phases/BuildPhase'
import TemperPhase from './phases/TemperPhase'
import InspectPhase from './phases/InspectPhase'

const CATALOGS = { commerce: BUILTIN_CATALOG }
const saved = loadSession(BUILTIN_CATALOG, CATALOGS)

export default function App() {
  return (
    <AuthProvider>
      <I18nProvider>
        <AppInner />
      </I18nProvider>
    </AuthProvider>
  )
}

function AppInner() {
  const auth = useAuth()
  const projectsApi = useProjects(auth.user?.id)
  const { saveProjectState, loadProject, createProject, deleteProject, projects } = projectsApi
  const { account, refresh: refreshAccount, startCheckout, openPortal } = useAccount(auth.user?.id)

  const [phase, setPhase]             = useState(saved?.phase       ?? 'meta-smelt')
  const [maxUnlocked, setMaxUnlocked] = useState(saved?.maxUnlocked ?? 0)
  const [showGuide, setShowGuide]     = useState(false)
  const [showAuth, setShowAuth]       = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('forge-onboarding-done')
  )
  const [activeCatalog, setActiveCatalog] = useState(saved?.activeCatalog ?? BUILTIN_CATALOG)
  const [metaResult, setMetaResult]   = useState(saved?.metaResult   ?? null)
  const [selectedIds, setSelectedIds] = useState(saved?.selectedIds  ?? new Set())

  // Supabase 프로젝트 동기화 상태
  const [currentProjectId, setCurrentProjectId] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const skipSaveRef = useRef(false)  // 프로젝트 로드/생성 직후의 불필요한 재저장 방지
  const saveTimerRef = useRef(null)

  // localStorage 캐시 저장 (로그인 여부 무관, 오프라인 캐시)
  useEffect(() => {
    saveSession({ phase, maxUnlocked, selectedIds, metaResult, activeCatalog })
  }, [phase, maxUnlocked, selectedIds, metaResult, activeCatalog])

  // 로그인 + 프로젝트 선택 시 상태 변경을 Supabase에 디바운스 저장
  useEffect(() => {
    if (!auth.user || !currentProjectId) return
    if (skipSaveRef.current) {
      skipSaveRef.current = false
      return
    }
    const payload = toStatePayload({ phase, maxUnlocked, selectedIds, metaResult, activeCatalog })
    setSyncing(true)
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveProjectState(currentProjectId, payload)
      } catch {
        /* 네트워크 실패 - localStorage 캐시는 유지됨 */
      } finally {
        setSyncing(false)
      }
    }, 800)
    return () => clearTimeout(saveTimerRef.current)
  }, [phase, maxUnlocked, selectedIds, metaResult, activeCatalog, currentProjectId, auth.user, saveProjectState])

  // 로그아웃 시 프로젝트 선택 해제
  useEffect(() => {
    if (!auth.user) setCurrentProjectId(null)
  }, [auth.user])

  // 결제 후 리다이렉트(?billing=success) 처리: 계정 새로고침 + URL 정리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('billing')) {
      refreshAccount()
      params.delete('billing')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
  }, [refreshAccount])

  const phaseIdx = PHASES.findIndex(p => p.id === phase)

  const applyState = useCallback((s) => {
    if (!s) return
    setPhase(s.phase)
    setMaxUnlocked(s.maxUnlocked)
    setActiveCatalog(s.activeCatalog)
    setMetaResult(s.metaResult)
    setSelectedIds(s.selectedIds)
  }, [])

  const goNext = useCallback(() => {
    const nextIdx = phaseIdx + 1
    if (nextIdx < PHASES.length) {
      setPhase(PHASES[nextIdx].id)
      setMaxUnlocked(prev => Math.max(prev, nextIdx))
    }
  }, [phaseIdx])

  const goPrev = useCallback(() => {
    const prevIdx = phaseIdx - 1
    if (prevIdx >= 0) setPhase(PHASES[prevIdx].id)
  }, [phaseIdx])

  const handlePhaseChange = useCallback((phaseId) => {
    const idx = PHASES.findIndex(p => p.id === phaseId)
    if (idx <= maxUnlocked) setPhase(phaseId)
  }, [maxUnlocked])

  const handleMetaComplete = useCallback((result) => {
    setActiveCatalog(result.catalog)
    setMetaResult(result)
    setSelectedIds(new Set(result.selectedIds))
    goNext()
  }, [goNext])

  const handleReset = useCallback(() => {
    clearSession()
    setPhase('meta-smelt')
    setMaxUnlocked(0)
    setActiveCatalog(BUILTIN_CATALOG)
    setMetaResult(null)
    setSelectedIds(new Set())
  }, [])

  // ── 프로젝트 액션 ──────────────────────────────────
  const handleSelectProject = useCallback(async (id) => {
    try {
      const proj = await loadProject(id)
      const s = fromStatePayload(proj.state, BUILTIN_CATALOG, CATALOGS)
      skipSaveRef.current = true
      applyState(s ?? {
        phase: 'meta-smelt', maxUnlocked: 0,
        activeCatalog: BUILTIN_CATALOG, metaResult: null, selectedIds: new Set(),
      })
      setCurrentProjectId(id)
    } catch {
      /* 로드 실패 무시 */
    }
  }, [loadProject, applyState])

  const handleNewProject = useCallback(async (name) => {
    try {
      const payload = toStatePayload({ phase, maxUnlocked, selectedIds, metaResult, activeCatalog })
      const proj = await createProject(name, payload)
      skipSaveRef.current = true
      setCurrentProjectId(proj.id)
    } catch {
      /* 생성 실패 무시 */
    }
  }, [phase, maxUnlocked, selectedIds, metaResult, activeCatalog, createProject])

  const handleDeleteProject = useCallback(async (id) => {
    try {
      await deleteProject(id)
      if (id === currentProjectId) setCurrentProjectId(null)
    } catch {
      /* 삭제 실패 무시 */
    }
  }, [deleteProject, currentProjectId])

  const handleSignOut = useCallback(async () => {
    await auth.signOut()
  }, [auth])

  const projectMenu = (
    <ProjectMenu
      enabled={auth.enabled}
      user={auth.user}
      projects={projects}
      currentProjectId={currentProjectId}
      onSelect={handleSelectProject}
      onNew={handleNewProject}
      onDelete={handleDeleteProject}
      onSignIn={() => setShowAuth(true)}
      onSignOut={handleSignOut}
      syncing={syncing}
    />
  )

  const accountBar =
    auth.enabled && auth.user ? (
      <AccountBar account={account} onUpgrade={startCheckout} onManage={openPortal} />
    ) : null

  return (
    <ProjectProvider
      activeCatalog={activeCatalog}
      metaResult={metaResult}
      selectedIds={selectedIds}
      setSelectedIds={setSelectedIds}
    >
      <AppShell
        phase={phase}
        handlePhaseChange={handlePhaseChange}
        maxUnlocked={maxUnlocked}
        showGuide={showGuide}
        setShowGuide={setShowGuide}
        showOnboarding={showOnboarding}
        setShowOnboarding={setShowOnboarding}
        showAuth={showAuth}
        setShowAuth={setShowAuth}
        handleReset={handleReset}
        handleMetaComplete={handleMetaComplete}
        goNext={goNext}
        goPrev={goPrev}
        projectMenu={projectMenu}
        accountBar={accountBar}
      />
    </ProjectProvider>
  )
}

function AppShell({
  phase, handlePhaseChange, maxUnlocked, showGuide, setShowGuide,
  showOnboarding, setShowOnboarding, showAuth, setShowAuth,
  handleReset, handleMetaComplete, goNext, goPrev, projectMenu, accountBar,
}) {
  const { t } = useT()
  return (
      <div className="app">
        <header className="app-header">
          <div className="header-brand">
            <span className="brand-icon">⚒️</span>
            <span className="brand-name">{t('app.brand')}</span>
            <span className="brand-tag">{t('app.tag')}</span>
          </div>
          <PhaseBar current={phase} onChange={handlePhaseChange} maxUnlocked={maxUnlocked} />
          <div className="header-meta">
            <HeaderStats />
            {accountBar}
            {projectMenu}
            {maxUnlocked > 0 && (
              <motion.button
                className="reset-btn"
                onClick={handleReset}
                title={t('app.reset')}
                aria-label={t('app.reset')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                ↺
              </motion.button>
            )}
            <motion.button
              className={`guide-toggle-btn ${showGuide ? 'active' : ''}`}
              onClick={() => setShowGuide(v => !v)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.93 }}
              title={t('app.guide')}
              aria-label={t('app.guide')}
              aria-expanded={showGuide}
            >
              ?
            </motion.button>
          </div>
        </header>

        <main className="app-main">
          <ErrorBoundary key={phase}>
            <AnimatePresence mode="wait">
              <motion.div
                key={phase}
                className="phase-wrapper"
                initial={{ opacity: 0, x: 32 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -32 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
              >
                {phase === 'meta-smelt' && <MetaSmeltPhase onComplete={handleMetaComplete} />}
                {phase === 'smelt'   && <SmeltPhase   onNext={goNext} onPrev={goPrev} />}
                {phase === 'shape'   && <ShapePhase   onNext={goNext} onPrev={goPrev} />}
                {phase === 'build'   && <BuildPhase   onNext={goNext} onPrev={goPrev} />}
                {phase === 'temper'  && <TemperPhase  onNext={goNext} onPrev={goPrev} />}
                {phase === 'inspect' && <InspectPhase onPrev={goPrev} />}
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </main>

        <GuidePanel
          open={showGuide}
          onClose={() => setShowGuide(false)}
          currentPhase={phase}
        />

        <AnimatePresence>
          {showOnboarding && (
            <OnboardingModal onClose={() => setShowOnboarding(false)} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
        </AnimatePresence>
      </div>
  )
}

function HeaderStats() {
  const { allSelected, totalDays } = useProject()
  return (
    <AnimatePresence>
      {allSelected.size > 0 && (
        <motion.div
          className="header-stats"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
        >
          <span className="hstat"><AnimatedNumber value={allSelected.size} /> blocks</span>
          <span className="hstat-sep">·</span>
          <span className="hstat"><AnimatedNumber value={totalDays} /> days</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
