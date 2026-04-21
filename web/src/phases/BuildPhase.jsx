import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { generateContracts } from '../generators'
import { generateBuildPrompt, generateBuildExecutionPrompt } from '../promptGenerator'
import { downloadOpenApi, downloadSkeletonZip } from '../codeGenerators'
import PhaseShell, { DownloadBar } from '../components/PhaseShell'
import ClaudeBridgePanel from '../components/ClaudeBridgePanel'
import { SVC_TEXT_COLORS } from '../constants'
import { useProject } from '../context/ProjectContext'

const METHOD_COLORS = {
  GET:    { bg: 'rgba(16,185,129,0.12)',  text: '#10b981', label: 'GET' },
  POST:   { bg: 'rgba(249,115,22,0.12)',  text: '#f97316', label: 'POST' },
  PUT:    { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', label: 'PUT' },
  DELETE: { bg: 'rgba(244,63,94,0.12)',   text: '#fb7185', label: 'DEL' },
  PATCH:  { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', label: 'PATCH' },
}

const DTO_KIND = {
  request:  { label: 'Request',  color: '#f97316' },
  response: { label: 'Response', color: '#10b981' },
}

function EndpointRow({ ep, index }) {
  const [expanded, setExpanded] = useState(false)
  const mc = METHOD_COLORS[ep.method] || METHOD_COLORS.GET

  return (
    <motion.div
      className={`endpoint-row ${expanded ? 'expanded' : ''}`}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <div className="endpoint-main" onClick={() => setExpanded(e => !e)}>
        <span className="method-badge" style={{ background: mc.bg, color: mc.text }}>{mc.label}</span>
        <span className="endpoint-path">{ep.path}</span>
        <span className="endpoint-summary">{ep.summary}</span>
        <span className="expand-arrow">{expanded ? '▴' : '▾'}</span>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="endpoint-detail"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="detail-row">
              <span className="detail-label">Request Body</span>
              <code className="detail-code">{ep.body}</code>
            </div>
            <div className="detail-row">
              <span className="detail-label">Response</span>
              <code className="detail-code">{ep.response}</code>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function DtoCard({ dto, index }) {
  const dk = DTO_KIND[dto.kind] || DTO_KIND.request
  return (
    <motion.div
      className="dto-card"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <div className="dto-header">
        <span className="dto-name">{dto.name}</span>
        <span className="dto-kind-badge" style={{ color: dk.color, background: `${dk.color}18` }}>
          {dk.label}
        </span>
      </div>
      <div className="dto-fields">
        {dto.typedFields.map((f, i) => (
          <div key={i} className="dto-field-row">
            <span className="dto-field-type">{f.type}</span>
            <span className="dto-field-name">{f.name}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function ContractGroup({ group, index, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const dtos = group.dtos || []
  const [activeTab, setActiveTab] = useState('endpoints')

  const toggle = useCallback(() => setOpen(v => !v), [])

  return (
    <motion.div
      className="contract-group"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <div className="contract-group-header" onClick={toggle} role="button" tabIndex={0}>
        <span className="cg-icon">{group.icon}</span>
        <span className="cg-name" style={{ color: SVC_TEXT_COLORS[group.color] || '#f97316' }}>
          {group.service}
        </span>
        <span className="cg-count">{group.endpoints.length} endpoints</span>
        {dtos.length > 0 && <span className="cg-count">{dtos.length} DTOs</span>}
        <span className="cg-toggle">{open ? '▴' : '▾'}</span>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="contract-group-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            {/* 탭: Endpoints / DTOs */}
            {dtos.length > 0 && (
              <div className="cg-tab-bar">
                <button
                  className={`cg-tab-btn ${activeTab === 'endpoints' ? 'active' : ''}`}
                  onClick={() => setActiveTab('endpoints')}
                >
                  Endpoints ({group.endpoints.length})
                </button>
                <button
                  className={`cg-tab-btn ${activeTab === 'dtos' ? 'active' : ''}`}
                  onClick={() => setActiveTab('dtos')}
                >
                  DTOs ({dtos.length})
                </button>
              </div>
            )}

            {activeTab === 'endpoints' && (
              <div className="endpoints">
                {group.endpoints.map((ep, ei) => (
                  <EndpointRow key={`${group.service}-${ei}`} ep={ep} index={ei} />
                ))}
              </div>
            )}

            {activeTab === 'dtos' && dtos.length > 0 && (
              <div className="dtos-grid">
                {dtos.map((dto, di) => (
                  <DtoCard key={dto.name} dto={dto} index={di} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function BuildPhase({ onNext, onPrev }) {
  const { allSelected, activeCatalog: catalogData } = useProject()
  const groups         = useMemo(() => generateContracts(allSelected, catalogData), [allSelected, catalogData])
  const totalEndpoints = groups.reduce((s, g) => s + g.endpoints.length, 0)
  const totalDtos      = groups.reduce((s, g) => s + (g.dtos?.length || 0), 0)
  const [downloading, setDownloading] = useState(null)
  const catalogName    = catalogData?.name || 'Forge'
  const catalogDomain  = (catalogData?.domain || catalogName).toLowerCase().replace(/[^a-z0-9-]/g, '')
  const outputDir      = `.forge/${catalogDomain}`
  const prompt         = useMemo(() => generateBuildPrompt(allSelected, catalogData), [allSelected, catalogData])
  const executionPrompt = useMemo(() => generateBuildExecutionPrompt(allSelected, catalogData, outputDir), [allSelected, catalogData, outputDir])

  const handleSkeleton = async () => {
    setDownloading('skeleton')
    try { await downloadSkeletonZip(groups, catalogName) } finally { setDownloading(null) }
  }

  const downloadBar = groups.length > 0 && (
    <>
      <ClaudeBridgePanel
        prompt={prompt}
        executionPrompt={executionPrompt}
        copyLabel="코드 생성 프롬프트 복사"
        outputDir={outputDir}
      />
      <DownloadBar label="코드 내보내기">
        <button className="download-btn" onClick={() => downloadOpenApi(groups, catalogName)}>
          📄 openapi.yml
        </button>
        <button className="download-btn" onClick={handleSkeleton} disabled={downloading === 'skeleton'}>
          {downloading === 'skeleton' ? '⏳ 생성 중…' : '📦 스켈레톤 코드 ZIP'}
        </button>
      </DownloadBar>
    </>
  )

  return (
    <PhaseShell currentPhase="build" onPrev={onPrev} onNext={onNext} downloadBar={downloadBar}>
      <div className="phase-intro">
        <div className="phase-intro-icon">⚒️</div>
        <div>
          <h2 className="phase-intro-title">Build — 단조</h2>
          <p className="phase-intro-desc">
            블럭 분석 완료.
            <span className="badge-inline">{groups.length}개 서비스</span>
            <span className="badge-inline">{totalEndpoints}개 엔드포인트</span>
            {totalDtos > 0 && <span className="badge-inline">{totalDtos}개 DTO</span>}
            자동 생성
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">블럭을 선택하면 API 계약이 자동 생성됩니다.</div>
      ) : (
        <div className="contracts-list">
          {groups.map((group, gi) => (
            <ContractGroup
              key={group.service}
              group={group}
              index={gi}
              defaultOpen={gi === 0}
            />
          ))}
        </div>
      )}
    </PhaseShell>
  )
}
