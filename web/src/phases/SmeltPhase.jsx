import { useState, useMemo, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { worlds, bundles, blocks, blockMap, bundleMap } from '../catalog'
import { BUILTIN_CATALOG } from '../catalog'
import AnimatedNumber from '../components/AnimatedNumber'
import { useProject } from '../context/ProjectContext'
import yaml from 'js-yaml'

// ── World Tabs ──────────────────────────────────────────────
function WorldTabs({ active, onChange, worlds: worldList }) {
  const list = worldList || worlds
  return (
    <div className="world-tabs" role="tablist" aria-label="World 선택">
      {list.map(w => (
        <button
          key={w.id}
          role="tab"
          className={`world-tab ${active === w.id ? 'active' : ''}`}
          onClick={() => onChange(w.id)}
          aria-selected={active === w.id}
          aria-label={`${w.title} 월드`}
        >
          <span>{w.icon}</span>
          <span>{w.title}</span>
        </button>
      ))}
    </div>
  )
}

// ── Block Card ──────────────────────────────────────────────
function BlockCard({ block, selected, autoAdded, userSelected, onClick, reasons, index, aiReason, aiConf }) {
  const CONF_COLOR = { high: '#10b981', medium: '#f59e0b', low: '#6366f1' }
  return (
    <motion.div
      className={`block-card ${selected ? 'selected' : ''} ${autoAdded ? 'auto-added' : ''} ${userSelected ? 'user-selected' : ''}`}
      onClick={onClick}
      role="checkbox"
      aria-checked={selected}
      aria-label={`${block.name} — ${block.user_desc}`}
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      whileHover={{ y: -3 }}
      layout
    >
      <div className="block-header">
        <span className="block-icon">{block.icon}</span>
        <span className="block-name">{block.name}</span>
        {selected && (
          <motion.span
            className={`block-check ${autoAdded ? 'auto' : 'user'}`}
            initial={{ scale: 0 }} animate={{ scale: 1 }}
          >
            {autoAdded ? '↩' : '✓'}
          </motion.span>
        )}
      </div>
      <p className="block-user-desc">{block.user_desc}</p>
      <div className="block-meta">
        <span className="block-analogy">"{block.analogy}"</span>
        <span className="block-effort">{block.effort_days}일</span>
      </div>
      {autoAdded && reasons[block.id] && (
        <div className="auto-reason">↩ {reasons[block.id]}</div>
      )}
      {aiReason && (
        <div className="ai-reason">
          <span className="ai-conf" style={{ color: CONF_COLOR[aiConf] || '#f97316' }}>
            AI {aiConf}
          </span>
          {aiReason}
        </div>
      )}
    </motion.div>
  )
}

// ── Bundle Section ──────────────────────────────────────────
function BundleSection({ bundle, children, count }) {
  return (
    <div className="bundle-section">
      <div className="bundle-header">
        <span className="bundle-title">{bundle.title}</span>
        {count > 0 && <span className="bundle-count">{count}개 선택</span>}
      </div>
      <div className="bundle-blocks">{children}</div>
    </div>
  )
}

// ── Selection Panel ─────────────────────────────────────────
function SelectionPanel({ open, allSelected, autoAdded, totalDays, reasons, onGenerate, activeBlockMap }) {
  return (
    <motion.aside
      className="selection-panel"
      animate={{ width: open ? 280 : 0, opacity: open ? 1 : 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {open && (
        <div className="panel-inner">
          <div className="panel-header">
            <span className="panel-title">선택한 블럭</span>
            <span className="panel-count">{allSelected.size}개</span>
          </div>
          <div className="panel-stats">
            <span>총 공수 <strong>{totalDays}일</strong></span>
            {autoAdded.size > 0 && (
              <span className="auto-stat">자동 추가 {autoAdded.size}개</span>
            )}
          </div>
          <div className="panel-blocks">
            {[...allSelected].map(id => {
              const b = activeBlockMap[id]
              if (!b) return null
              return (
                <div key={id} className={`panel-block ${autoAdded.has(id) ? 'auto' : 'user'}`}>
                  <span>{b.icon}</span>
                  <span className="panel-block-name">{b.name}</span>
                  {autoAdded.has(id) && <span className="panel-auto-tag">자동</span>}
                </div>
              )
            })}
          </div>
          <button className="panel-generate-btn" onClick={onGenerate}>
            intent.yml 보기
          </button>
        </div>
      )}
    </motion.aside>
  )
}

// ── Generate Modal ──────────────────────────────────────────
function GenerateModal({ open, allSelected, autoAdded, totalDays, onClose, activeBlockMap, catalogName }) {
  const intentYml = useMemo(() => {
    if (!open) return ''
    const selectedList = [...allSelected].map(id => {
      const b = activeBlockMap[id]
      return {
        id,
        name: b?.name || id,
        auto_added: autoAdded.has(id),
        effort_days: b?.effort_days || 0,
      }
    })
    return yaml.dump({
      catalog: catalogName || 'Commerce',
      generated_at: new Date().toISOString().split('T')[0],
      summary: {
        total_blocks: allSelected.size,
        total_days: totalDays,
        auto_added: autoAdded.size,
      },
      selected_blocks: selectedList,
    }, { lineWidth: 120 })
  }, [open, allSelected, autoAdded, totalDays, activeBlockMap, catalogName])

  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(intentYml)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return null
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-box"
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">intent.yml</span>
          <div className="modal-actions">
            <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
              {copied ? '✓ 복사됨' : '복사'}
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <pre className="modal-code">{intentYml}</pre>
      </motion.div>
    </motion.div>
  )
}

// ── Smelt Phase ─────────────────────────────────────────────
export default function SmeltPhase({ onNext, onPrev }) {
  const {
    selectedIds, setSelectedIds, allSelected, autoAdded, totalDays, reasons,
    activeCatalog: catalogData, metaResult,
  } = useProject()
  const aiReasons  = metaResult?.aiReasons
  const confidence = metaResult?.confidence
  const metaSummary = metaResult?.summary
  const [activeWorld, setActiveWorld] = useState('all')
  const [panelOpen, setPanelOpen]     = useState(false)
  const [modalOpen, setModalOpen]     = useState(false)

  const activeBlocks    = catalogData?.blocks    || blocks
  const activeWorlds    = catalogData?.worlds    || worlds
  const activeBundles   = catalogData?.bundles   || bundles
  const activeBundleMap = catalogData?.bundleMap || bundleMap
  const activeBlockMap  = catalogData?.blockMap  || blockMap

  useEffect(() => {
    if (selectedIds.size > 0) setPanelOpen(true)
  }, []) // mount only

  const toggleBlock = useCallback((blockId) => {
    if (autoAdded.has(blockId)) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(blockId)) next.delete(blockId)
      else next.add(blockId)
      return next
    })
    setPanelOpen(true)
  }, [autoAdded, setSelectedIds])

  const visibleBundles = useMemo(() => {
    const filteredBlocks = activeWorld === 'all'
      ? activeBlocks
      : activeBlocks.filter(b => activeBundleMap[b.bundle_id]?.world_id === activeWorld)
    const byBundle = {}
    for (const block of filteredBlocks) {
      if (!byBundle[block.bundle_id]) byBundle[block.bundle_id] = []
      byBundle[block.bundle_id].push(block)
    }
    return activeBundles.filter(b => byBundle[b.id]).map(b => ({ bundle: b, blocks: byBundle[b.id] }))
  }, [activeWorld, activeBlocks, activeBundles, activeBundleMap])

  let blockIdx = 0

  return (
    <div className="smelt-phase">
      <div className={`main-content ${panelOpen ? 'panel-open' : ''}`}>
        <div className="phase-intro">
          <div className="phase-intro-icon">🔥</div>
          <div>
            <h2 className="phase-intro-title">Smelt — 제련</h2>
            <p className="phase-intro-desc">
              필요한 기능 블럭을 선택하세요. 의존성은 자동으로 해결됩니다.
              {catalogData && catalogData !== BUILTIN_CATALOG && (
                <span className="badge-inline">📂 {catalogData.name}</span>
              )}
            </p>
          </div>
        </div>

        {metaSummary && (
          <motion.div
            className="ai-summary-banner"
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          >
            <span className="ai-banner-icon">✨</span>
            <span className="ai-banner-text">{metaSummary}</span>
            <span className="ai-banner-label">AI 추천 결과</span>
          </motion.div>
        )}

        <WorldTabs active={activeWorld} onChange={setActiveWorld} worlds={activeWorlds} />

        <div className="catalog">
          {visibleBundles.map(({ bundle, blocks: bBlocks }) => {
            const selectedInBundle = bBlocks.filter(b => allSelected.has(b.id)).length
            const startIdx = blockIdx
            blockIdx += bBlocks.length
            return (
              <BundleSection key={bundle.id} bundle={bundle} count={selectedInBundle}>
                {bBlocks.map((block, i) => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    selected={allSelected.has(block.id)}
                    autoAdded={autoAdded.has(block.id)}
                    userSelected={selectedIds.has(block.id)}
                    onClick={() => toggleBlock(block.id)}
                    reasons={reasons}
                    index={startIdx + i}
                    aiReason={aiReasons?.[block.id]}
                    aiConf={confidence?.[block.id]}
                  />
                ))}
              </BundleSection>
            )
          })}
        </div>
      </div>

      <SelectionPanel
        open={panelOpen}
        allSelected={allSelected}
        autoAdded={autoAdded}
        totalDays={totalDays}
        reasons={reasons}
        onGenerate={() => setModalOpen(true)}
        activeBlockMap={activeBlockMap}
      />

      <AnimatePresence>
        {allSelected.size > 0 && (
          <motion.footer
            className="action-bar"
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
          >
            <div className="action-stats">
              <span className="stat">블럭 <strong><AnimatedNumber value={allSelected.size} /></strong>개</span>
              <span className="stat-sep">·</span>
              <span className="stat">공수 <strong><AnimatedNumber value={totalDays} /></strong>일</span>
              {autoAdded.size > 0 && (
                <>
                  <span className="stat-sep">·</span>
                  <span className="stat auto-stat">자동추가 <strong>{autoAdded.size}</strong>개</span>
                </>
              )}
            </div>
            <div className="action-buttons">
              <button className="action-btn-secondary" onClick={() => setModalOpen(true)}>
                intent.yml
              </button>
              <motion.button className="action-btn" onClick={onNext} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                다음: Shape →
              </motion.button>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalOpen && (
          <GenerateModal
            open={modalOpen}
            allSelected={allSelected}
            autoAdded={autoAdded}
            totalDays={totalDays}
            onClose={() => setModalOpen(false)}
            activeBlockMap={activeBlockMap}
            catalogName={catalogData?.name}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
