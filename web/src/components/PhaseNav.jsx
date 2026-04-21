import { motion } from 'framer-motion'
import { PHASES } from '../constants'

export default function PhaseNav({ currentPhase, onPrev, onNext, canNext }) {
  const idx = PHASES.findIndex(p => p.id === currentPhase)
  return (
    <nav className="phase-nav" aria-label="Phase 이동">
      {idx > 0 && (
        <button className="nav-btn nav-prev" onClick={onPrev} aria-label={`이전 단계: ${PHASES[idx - 1].label}`}>
          ← 이전: {PHASES[idx - 1].label}
        </button>
      )}
      <div className="nav-spacer" />
      {idx < PHASES.length - 1 && (
        <motion.button
          className={`nav-btn nav-next ${canNext ? '' : 'disabled'}`}
          onClick={canNext ? onNext : undefined}
          disabled={!canNext}
          aria-label={`다음 단계: ${PHASES[idx + 1].label}`}
          whileHover={canNext ? { scale: 1.03 } : {}}
          whileTap={canNext ? { scale: 0.97 } : {}}
        >
          다음: {PHASES[idx + 1].label} →
        </motion.button>
      )}
    </nav>
  )
}
