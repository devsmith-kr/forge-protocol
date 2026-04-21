import { PHASES } from '../constants'

export default function PhaseBar({ current, onChange, maxUnlocked }) {
  return (
    <nav className="phase-bar" aria-label="Phase 탐색">
      {PHASES.map((p, i) => {
        const isActive = p.id === current
        const isDone   = i < PHASES.findIndex(x => x.id === current)
        const locked   = i > maxUnlocked
        return (
          <button
            key={p.id}
            className={`phase-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${locked ? 'locked' : ''}`}
            onClick={() => !locked && onChange(p.id)}
            disabled={locked}
            aria-label={`${p.label} — ${p.desc}`}
            aria-current={isActive ? 'step' : undefined}
          >
            <span className="phase-dot">
              {isDone ? '✓' : p.icon}
            </span>
            <span className="phase-info">
              <span className="phase-label">{p.label}</span>
              <span className="phase-ko">{p.desc}</span>
            </span>
            {i < PHASES.length - 1 && <span className="phase-arrow">›</span>}
          </button>
        )
      })}
    </nav>
  )
}
