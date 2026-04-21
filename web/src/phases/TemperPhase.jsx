import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { generateTestScenarios } from '../generators'
import { generateTemperPrompt, generateTemperExecutionPrompt } from '../promptGenerator'
import { downloadTestZip } from '../codeGenerators'
import PhaseShell, { DownloadBar } from '../components/PhaseShell'
import ClaudeBridgePanel from '../components/ClaudeBridgePanel'
import { SVC_TEXT_COLORS } from '../constants'
import { useProject } from '../context/ProjectContext'

const TEST_TYPE_MAP = {
  'happy-path':  { label: 'Happy Path',  color: '#10b981' },
  'edge-case':   { label: 'Edge Case',   color: '#f59e0b' },
  'security':    { label: 'Security',    color: '#fb7185' },
  'concurrency': { label: 'Concurrency', color: '#a78bfa' },
  'idempotency': { label: 'Idempotency', color: '#818cf8' },
}

function TestCard({ test, index }) {
  const tt = TEST_TYPE_MAP[test.type] || TEST_TYPE_MAP['happy-path']
  return (
    <motion.div
      className="test-card"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      whileHover={{ y: -2 }}
    >
      <div className="test-header">
        <span className="test-name">{test.name}</span>
        <span className="test-type-badge" style={{ color: tt.color, background: `${tt.color}20` }}>
          {tt.label}
        </span>
      </div>
      <div className="gwt-rows">
        {[
          { key: 'given', label: 'Given', text: test.given },
          { key: 'when',  label: 'When',  text: test.when  },
          { key: 'then',  label: 'Then',  text: test.then  },
        ].map(row => (
          <div key={row.key} className="gwt-row">
            <span className={`gwt-label ${row.key}`}>{row.label}</span>
            <span className="gwt-text">{row.text}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

export default function TemperPhase({ onNext, onPrev }) {
  const { allSelected, activeCatalog: catalogData } = useProject()
  const scenarios  = useMemo(() => generateTestScenarios(allSelected, catalogData), [allSelected, catalogData])
  const totalTests = scenarios.reduce((s, sc) => s + sc.tests.length, 0)
  const [openBlock, setOpenBlock]     = useState(null)
  const [downloading, setDownloading] = useState(false)
  const catalogName    = catalogData?.name || 'Forge'
  const catalogDomain  = (catalogData?.domain || catalogName).toLowerCase().replace(/[^a-z0-9-]/g, '')
  const outputDir      = `.forge/${catalogDomain}`
  const prompt         = useMemo(() => generateTemperPrompt(allSelected, catalogData), [allSelected, catalogData])
  const executionPrompt = useMemo(() => generateTemperExecutionPrompt(allSelected, catalogData, outputDir), [allSelected, catalogData, outputDir])

  const handleTestZip = async () => {
    setDownloading(true)
    try { await downloadTestZip(scenarios, catalogName) } finally { setDownloading(false) }
  }

  useEffect(() => {
    if (scenarios.length > 0 && !openBlock) setOpenBlock(scenarios[0].block)
  }, [scenarios, openBlock])

  const downloadBar = scenarios.length > 0 && (
    <>
      <ClaudeBridgePanel
        prompt={prompt}
        executionPrompt={executionPrompt}
        copyLabel="테스트 생성 프롬프트 복사"
        outputDir={outputDir}
      />
      <DownloadBar label="코드 내보내기">
        <button className="download-btn" onClick={handleTestZip} disabled={downloading}>
          {downloading ? '⏳ 생성 중…' : '🧪 테스트 코드 ZIP'}
        </button>
      </DownloadBar>
    </>
  )

  return (
    <PhaseShell currentPhase="temper" onPrev={onPrev} onNext={onNext} downloadBar={downloadBar}>
      <div className="phase-intro">
        <div className="phase-intro-icon">💧</div>
        <div>
          <h2 className="phase-intro-title">Temper — 담금질</h2>
          <p className="phase-intro-desc">
            <span className="badge-inline">{scenarios.length}개 블럭</span>
            <span className="badge-inline">{totalTests}개 시나리오</span> Given-When-Then 자동 생성
          </p>
        </div>
      </div>

      {scenarios.length === 0 ? (
        <div className="empty-state">블럭을 선택하면 테스트 시나리오가 자동 생성됩니다.</div>
      ) : (
        <div className="temper-layout">
          <div className="temper-sidebar">
            {scenarios.map((sc) => (
              <button
                key={sc.block}
                className={`temper-svc-btn ${openBlock === sc.block ? 'active' : ''}`}
                style={{ '--btn-color': SVC_TEXT_COLORS[sc.color] || '#f97316' }}
                onClick={() => setOpenBlock(sc.block)}
              >
                <span>{sc.icon}</span>
                <span className="temper-btn-name">{sc.block}</span>
                <span className="temper-count">{sc.tests.length}</span>
              </button>
            ))}
          </div>
          <div className="temper-content">
            <AnimatePresence mode="wait">
              {scenarios.filter(sc => sc.block === openBlock).map(sc => (
                <motion.div
                  key={sc.block}
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                >
                  {sc.tests.map((test, i) => (
                    <TestCard key={i} test={test} index={i} />
                  ))}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

    </PhaseShell>
  )
}
