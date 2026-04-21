import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BUILTIN_CATALOG } from './catalog'
import { PHASES } from './constants'
import { loadSession, saveSession, clearSession } from './hooks/usePersistedState'
import { ProjectProvider, useProject } from './context/ProjectContext'
import { I18nProvider, useT } from './i18n'
import AnimatedNumber from './components/AnimatedNumber'
import ErrorBoundary from './components/ErrorBoundary'
import PhaseBar from './components/PhaseBar'
import OnboardingModal from './components/OnboardingModal'
import './components/OnboardingModal.css'
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
  const [phase, setPhase]             = useState(saved?.phase       ?? 'meta-smelt')
  const [maxUnlocked, setMaxUnlocked] = useState(saved?.maxUnlocked ?? 0)
  const [showGuide, setShowGuide]     = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('forge-onboarding-done')
  )
  const [activeCatalog, setActiveCatalog] = useState(saved?.activeCatalog ?? BUILTIN_CATALOG)
  const [metaResult, setMetaResult]   = useState(saved?.metaResult   ?? null)
  const [selectedIds, setSelectedIds] = useState(saved?.selectedIds  ?? new Set())

  // 상태 변경 시 localStorage에 저장
  useEffect(() => {
    saveSession({ phase, maxUnlocked, selectedIds, metaResult, activeCatalog })
  }, [phase, maxUnlocked, selectedIds, metaResult, activeCatalog])

  const phaseIdx = PHASES.findIndex(p => p.id === phase)

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

  return (
    <I18nProvider>
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
          handleReset={handleReset}
          handleMetaComplete={handleMetaComplete}
          goNext={goNext}
          goPrev={goPrev}
        />
      </ProjectProvider>
    </I18nProvider>
  )
}

function AppShell({
  phase, handlePhaseChange, maxUnlocked, showGuide, setShowGuide,
  showOnboarding, setShowOnboarding, handleReset, handleMetaComplete,
  goNext, goPrev,
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
