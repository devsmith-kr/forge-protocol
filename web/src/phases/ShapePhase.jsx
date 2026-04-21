import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { generateArchitecture } from '../generators'
import { generateShapePrompt } from '../promptGenerator'
import PhaseShell, { DownloadBar } from '../components/PhaseShell'
import { useProject } from '../context/ProjectContext'

const SVC_COLORS = {
  orange: { bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.25)', text: '#f97316' },
  blue:   { bg: 'rgba(99,102,241,0.1)',  border: 'rgba(99,102,241,0.25)', text: '#818cf8' },
  emerald:{ bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)', text: '#10b981' },
  violet: { bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)',text: '#a78bfa' },
  amber:  { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)', text: '#f59e0b' },
  rose:   { bg: 'rgba(244,63,94,0.1)',   border: 'rgba(244,63,94,0.25)',  text: '#fb7185' },
}

export default function ShapePhase({ onNext, onPrev }) {
  const { allSelected, activeCatalog: catalogData } = useProject()
  const arch = useMemo(() => generateArchitecture(allSelected, catalogData), [allSelected, catalogData])
  const [activeTab, setActiveTab] = useState('layers')
  const [copied, setCopied] = useState(false)

  const handleCopyPrompt = useCallback(async () => {
    const prompt = generateShapePrompt(allSelected, catalogData)
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

  const downloadBar = arch.serviceCount > 0 && (
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
        {copied ? '✓ 복사 완료! Claude에 붙여넣으세요' : '📋 아키텍처 설계 프롬프트 복사'}
      </button>
    </DownloadBar>
  )

  return (
    <PhaseShell currentPhase="shape" onPrev={onPrev} onNext={onNext} downloadBar={downloadBar}>
      <div className="phase-intro">
        <div className="phase-intro-icon">🏛️</div>
        <div>
          <h2 className="phase-intro-title">Shape — 성형</h2>
          <p className="phase-intro-desc">
            {allSelected.size}개 블럭 분석 완료.
            <span className="badge-inline">{arch.serviceCount}개 서비스</span> 자동 감지
          </p>
        </div>
      </div>

      <div className="tab-bar">
        {[
          { id: 'layers',    label: '레이어 다이어그램' },
          { id: 'services',  label: '서비스 명세' },
          { id: 'decisions', label: 'ADR 결정 로그' },
        ].map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'layers' && (
          <motion.div
            key="layers" className="layers-diagram"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          >
            {arch.layers.map((layer, i) => (
              <motion.div
                key={layer.id} className="arch-layer"
                style={{ '--layer-color': layer.color }}
                initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="layer-label">
                  <span className="layer-icon">{layer.icon}</span>
                  <span>{layer.name}</span>
                </div>
                <div className="layer-items">
                  {layer.items.map((item, j) => (
                    <motion.span
                      key={j} className="layer-item"
                      initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.1 + j * 0.05 }}
                    >
                      {item}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {activeTab === 'services' && (
          <motion.div
            key="services" className="services-grid"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          >
            {arch.services.length === 0 ? (
              <div className="empty-state">블럭을 먼저 선택하면 서비스가 자동으로 감지됩니다.</div>
            ) : arch.services.map((svc, i) => {
              const c = SVC_COLORS[svc.color] || SVC_COLORS.orange
              return (
                <motion.div
                  key={svc.id} className="service-card"
                  style={{ '--svc-bg': c.bg, '--svc-border': c.border, '--svc-text': c.text }}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  whileHover={{ y: -4 }}
                >
                  <div className="svc-header">
                    <span className="svc-icon">{svc.icon}</span>
                    <span className="svc-name">{svc.name}</span>
                  </div>
                  <div className="svc-section-label">책임</div>
                  <ul className="svc-list">
                    {svc.responsibilities.map((r, j) => <li key={j}>{r}</li>)}
                  </ul>
                  <div className="svc-section-label">기술 스택</div>
                  <div className="svc-tech-badges">
                    {svc.tech.map((t, j) => <span key={j} className="tech-badge">{t}</span>)}
                  </div>
                  <div className="svc-section-label">패턴</div>
                  <div className="svc-patterns">
                    {svc.patterns.map((p, j) => <span key={j} className="pattern-badge">{p}</span>)}
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}

        {activeTab === 'decisions' && (
          <motion.div
            key="decisions" className="decisions-list"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          >
            {arch.decisions.map((d, i) => (
              <motion.div
                key={d.adr} className="adr-card"
                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
              >
                <div className="adr-badge">{d.adr}</div>
                <div className="adr-body">
                  <div className="adr-title">{d.title}</div>
                  <div className="adr-choice">결정: <strong>{d.choice}</strong></div>
                  <div className="adr-reason">이유: {d.reason}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </PhaseShell>
  )
}
