import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { generateInspectReport, generateContracts, generateTestScenarios } from '../generators'
import { generateInspectPrompt } from '../promptGenerator'
import { downloadFullPackage, downloadOpenApi } from '../codeGenerators'
import PhaseShell, { DownloadBar } from '../components/PhaseShell'
import { useProject } from '../context/ProjectContext'

const SEVERITY_MAP = {
  critical: { label: 'Critical', color: '#ef4444', dot: '🔴' },
  high:     { label: 'High',     color: '#f97316', dot: '🟠' },
  medium:   { label: 'Medium',   color: '#f59e0b', dot: '🟡' },
  info:     { label: 'Info',     color: '#6366f1', dot: '🔵' },
}
const PERSP_COLORS = { red: '#ef4444', yellow: '#f59e0b', blue: '#6366f1', emerald: '#10b981' }

function ScoreRing({ score, color }) {
  const r    = 28
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  return (
    <svg className="score-ring" width="72" height="72" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} stroke="rgba(255,255,255,0.07)" strokeWidth="5" fill="none" />
      <motion.circle
        cx="36" cy="36" r={r}
        stroke={color} strokeWidth="5" fill="none"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
        strokeLinecap="round"
        style={{ transformOrigin: '36px 36px', transform: 'rotate(-90deg)' }}
      />
      <text x="36" y="41" textAnchor="middle" fill="white" fontSize="14" fontWeight="600">{score}</text>
    </svg>
  )
}

function FindingItem({ finding, index }) {
  const sv = SEVERITY_MAP[finding.severity] || SEVERITY_MAP.info
  return (
    <motion.div
      className="finding-item"
      style={{ '--finding-color': sv.color }}
      initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      <span className="finding-dot">{sv.dot}</span>
      <div className="finding-body">
        <div className="finding-title-row">
          <span className="finding-name">{finding.title}</span>
          <span className="finding-severity" style={{ color: sv.color, background: `${sv.color}18` }}>
            {sv.label}
          </span>
        </div>
        <p className="finding-desc">{finding.desc}</p>
      </div>
    </motion.div>
  )
}

export default function InspectPhase({ onPrev }) {
  const { allSelected, activeCatalog: catalogData } = useProject()
  const report    = useMemo(() => generateInspectReport(allSelected, catalogData),  [allSelected, catalogData])
  const groups    = useMemo(() => generateContracts(allSelected, catalogData),       [allSelected, catalogData])
  const scenarios = useMemo(() => generateTestScenarios(allSelected, catalogData),  [allSelected, catalogData])
  const [activePerspective, setActivePerspective] = useState('security')
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)
  const catalogName = catalogData?.name || 'Forge'
  const active = report.perspectives.find(p => p.id === activePerspective)

  const handleCopyPrompt = useCallback(async () => {
    const prompt = generateInspectPrompt(allSelected, catalogData)
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = prompt
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }, [allSelected, catalogData])

  const handleFullPackage = async () => {
    setDownloading(true)
    try { await downloadFullPackage(groups, scenarios, catalogName) } finally { setDownloading(false) }
  }

  const downloadBar = (
    <>
      <DownloadBar label="Claude 프롬프트">
        <button
          className="download-btn primary"
          onClick={handleCopyPrompt}
          style={{
            background: copied
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
          }}
        >
          {copied ? '✓ 복사 완료! Claude에 붙여넣으세요' : '📋 검수 리뷰 프롬프트 복사'}
        </button>
      </DownloadBar>
      <DownloadBar label="전체 패키지">
        <button className="download-btn primary" onClick={handleFullPackage} disabled={downloading}>
          {downloading ? '⏳ 생성 중…' : '🚀 전체 코드 ZIP'}
        </button>
        <button className="download-btn" onClick={() => downloadOpenApi(groups, catalogName)}>
          📄 openapi.yml
        </button>
      </DownloadBar>
    </>
  )

  return (
    <PhaseShell currentPhase="inspect" onPrev={onPrev} onNext={null} canNext={false} downloadBar={downloadBar}>
      <div className="phase-intro">
        <div className="phase-intro-icon">🔍</div>
        <div>
          <h2 className="phase-intro-title">Inspect — 검수</h2>
          <p className="phase-intro-desc">
            보안 · 성능 · 운영 · 확장성 멀티 관점 리뷰.
            종합 점수:&nbsp;
            <strong style={{ color: report.totalScore >= 75 ? '#10b981' : '#f59e0b' }}>
              {report.totalScore}점
            </strong>
          </p>
        </div>
      </div>

      <div className="score-overview">
        {report.perspectives.map((p, i) => {
          const col = PERSP_COLORS[p.color] || '#f97316'
          return (
            <motion.button
              key={p.id} className={`score-card ${activePerspective === p.id ? 'active' : ''}`}
              style={{ '--score-color': col }}
              onClick={() => setActivePerspective(p.id)}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.97 }}
            >
              <ScoreRing score={p.score} color={col} />
              <div className="score-label">
                <span className="score-icon">{p.icon}</span>
                <span className="score-name">{p.label}</span>
              </div>
            </motion.button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        {active && (
          <motion.div
            key={activePerspective} className="findings-panel"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          >
            <div className="findings-header">
              <span className="findings-perspective">{active.icon} {active.label}</span>
              <span className="findings-count">{active.findings.length}개 항목</span>
            </div>
            {active.findings.map((f, i) => <FindingItem key={i} finding={f} index={i} />)}
          </motion.div>
        )}
      </AnimatePresence>
    </PhaseShell>
  )
}
