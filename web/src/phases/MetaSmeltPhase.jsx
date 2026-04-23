import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BUILTIN_CATALOG, BUILTIN_TEMPLATES, getBuiltinCatalog } from '../catalog'
import {
  buildMetaSmeltPrompt,
  parseClaudeResponse,
  buildQuickCatalogPrompt,
  buildDeepCatalogPrompt,
  extractYamlFromResponse,
} from '../metaSmeltUtils'
import { parseCatalogYml, validateCatalog } from '../parseCatalog'
import {
  DOMAIN_OPTIONS,
  SCALE_OPTIONS,
  ROLE_OPTIONS,
  getSurveyForDomain,
  getWorkflowQuestions,
} from '../../../shared/domain-surveys.js'

const CATALOG_SOURCES = [
  // 빌트인 템플릿들 — BUILTIN_TEMPLATES 에서 자동 매핑
  ...BUILTIN_TEMPLATES.map(t => ({
    id: `builtin:${t.id}`,
    icon: t.icon,
    label: `${t.label} (기본 제공)`,
    desc: t.desc,
    builtinId: t.id,
  })),
  { id: 'ai-generate', icon: '✨', label: 'AI로 신규 생성', desc: '도메인 설명 → Claude Code → catalog.yml 자동 생성' },
  { id: 'upload',      icon: '📂', label: '파일 업로드',    desc: 'forge init 또는 직접 작성한 catalog.yml' },
]

const EXAMPLE_INPUTS = [
  '소규모 쇼핑몰 MVP. 상품 등록·결제·배송 추적이 핵심. 관리자 기능은 나중에.',
  '마켓플레이스. 판매자가 상품 올리고, 구매자가 검색·구매. 카카오 로그인 필수.',
  '스타트업 커머스. 빠른 런칭 우선. 리뷰·쿠폰은 2차. 결제는 토스.',
]

const DEEP_INITIAL = {
  idea: '',
  domain: 'commerce',
  domainDetail: '',
  deepDive: {},
  roles: [],
  workflows: {},
  coreFeatures: '',
  scale: 'mvp',
  constraints: [],
}

const CONF_COLOR = { high: '#10b981', medium: '#f59e0b', low: '#6366f1' }

function WizardStep({ num, label, active, done }) {
  return (
    <div className={`wizard-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
      <span className="wizard-num">{done ? '✓' : num}</span>
      <span className="wizard-label">{label}</span>
    </div>
  )
}

export default function MetaSmeltPhase({ onComplete }) {
  const [step, setStep]               = useState(1)
  const [catalogSource, setCatalogSource] = useState('builtin:commerce')

  // upload 방식
  const [customYml, setCustomYml]         = useState('')
  const [customCatalog, setCustomCatalog] = useState(null)
  const [catalogError, setCatalogError]   = useState(null)
  const fileInputRef = useRef(null)

  // ── AI 생성: 모드 선택 + 공유 출력 단계 ────────────────
  // aiMode:        null | 'quick' | 'deep'  (null = 모드 선택 카드)
  // aiOutputStep:  null | 'prompt' | 'done' (모드와 무관한 출력 단계)
  const [aiMode, setAiMode]                 = useState(null)
  const [aiOutputStep, setAiOutputStep]     = useState(null)

  // Quick 입력
  const [quickInput, setQuickInput] = useState('')

  // Deep 입력
  const [deepData, setDeepData] = useState(DEEP_INITIAL)
  const [deepStep, setDeepStep] = useState(1)

  // 공유 출력 상태 (Quick/Deep 모두)
  const [aiPrompt, setAiPrompt]     = useState('')
  const [aiCopied, setAiCopied]     = useState(false)
  const [aiPasted, setAiPasted]     = useState('')
  const [aiCatalog, setAiCatalog]   = useState(null)
  const [aiError, setAiError]       = useState(null)

  // 블럭 추천 (Step 2/3)
  const [userInput, setUserInput]           = useState('')
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [copied, setCopied]                 = useState(false)
  const [pastedResult, setPastedResult]     = useState('')
  const [parseError, setParseError]         = useState(null)
  const [parsedData, setParsedData]         = useState(null)

  const activeCatalog =
    catalogSource?.startsWith('builtin:') ? getBuiltinCatalog(catalogSource.slice(8)) :
    catalogSource === 'ai-generate'       ? aiCatalog :
    customCatalog

  // ── AI 생성 핸들러 ────────────────────────────────────────
  const updateDeep = useCallback((patch) => {
    setDeepData(prev => ({ ...prev, ...patch }))
  }, [])

  const handleQuickGeneratePrompt = useCallback(() => {
    if (!quickInput.trim()) return
    setAiPrompt(buildQuickCatalogPrompt(quickInput))
    setAiOutputStep('prompt')
    setAiError(null)
  }, [quickInput])

  const handleDeepGeneratePrompt = useCallback(() => {
    const domainLabel = deepData.domain === 'other'
      ? deepData.domainDetail
      : DOMAIN_OPTIONS.find(o => o.value === deepData.domain)?.name || deepData.domain
    const promptInput = { ...deepData, domainLabel }
    setAiPrompt(buildDeepCatalogPrompt(promptInput))
    setAiOutputStep('prompt')
    setAiError(null)
  }, [deepData])

  const handleAiCopy = useCallback(() => {
    navigator.clipboard.writeText(aiPrompt)
    setAiCopied(true)
    setTimeout(() => setAiCopied(false), 2000)
  }, [aiPrompt])

  const resetAiFlow = useCallback(() => {
    setAiMode(null)
    setAiOutputStep(null)
    setAiPrompt('')
    setAiPasted('')
    setAiCatalog(null)
    setAiError(null)
    setQuickInput('')
    setDeepData(DEEP_INITIAL)
    setDeepStep(1)
  }, [])

  // 응답 자동 파싱 (Quick/Deep 공유, 400ms 디바운스)
  useEffect(() => {
    if (catalogSource !== 'ai-generate' || aiOutputStep !== 'prompt' || !aiPasted.trim()) return
    const t = setTimeout(() => {
      try {
        const yml = extractYamlFromResponse(aiPasted)
        const parsed = parseCatalogYml(yml)
        const errors = validateCatalog(parsed)
        if (errors.length) {
          setAiError(errors.join('\n'))
          setAiCatalog(null)
        } else {
          setAiCatalog(parsed)
          setAiError(null)
          setAiOutputStep('done')
        }
      } catch (e) {
        setAiError(`파싱 오류: ${e.message}`)
        setAiCatalog(null)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [aiPasted, catalogSource, aiOutputStep])

  // 카탈로그 소스를 다른 것으로 바꾸면 AI 흐름 리셋
  useEffect(() => {
    if (catalogSource !== 'ai-generate') {
      // 흐름은 보존, 카탈로그만 무효화
    }
  }, [catalogSource])

  // ── Step 1: 업로드 카탈로그 파싱 ─────────────────────────
  const handleYmlChange = useCallback((text) => {
    setCustomYml(text)
    setCatalogError(null)
    if (!text.trim()) { setCustomCatalog(null); return }
    try {
      const parsed = parseCatalogYml(text)
      const errors = validateCatalog(parsed)
      if (errors.length) { setCatalogError(errors.join('\n')); setCustomCatalog(null) }
      else { setCustomCatalog(parsed); setCatalogError(null) }
    } catch (e) {
      setCatalogError(`파싱 오류: ${e.message}`)
      setCustomCatalog(null)
    }
  }, [])

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => handleYmlChange(ev.target.result)
    reader.readAsText(file)
  }, [handleYmlChange])

  const canProceedStep1 =
    catalogSource?.startsWith('builtin:') ||
    (catalogSource === 'upload' && customCatalog && !catalogError) ||
    (catalogSource === 'ai-generate' && aiCatalog && !aiError)

  // ── Step 2: 프롬프트 생성 ────────────────────────────────
  const handleGeneratePrompt = useCallback(() => {
    if (!activeCatalog || !userInput.trim()) return
    const prompt = buildMetaSmeltPrompt(activeCatalog, userInput)
    setGeneratedPrompt(prompt)
    setStep(3)
  }, [activeCatalog, userInput])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generatedPrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [generatedPrompt])

  // ── Step 3: 결과 파싱 ────────────────────────────────────
  const handleParseResult = useCallback(() => {
    if (!pastedResult.trim()) return
    try {
      const data = parseClaudeResponse(pastedResult)
      const validIds = new Set(activeCatalog.blocks.map(b => b.id))
      data.recommended = data.recommended.filter(r => validIds.has(r.id))
      setParsedData(data)
      setParseError(null)
    } catch (e) {
      setParseError(`파싱 실패: ${e.message}`)
      setParsedData(null)
    }
  }, [pastedResult, activeCatalog])

  useEffect(() => {
    if (pastedResult.trim().length > 20) {
      const timer = setTimeout(() => handleParseResult(), 400)
      return () => clearTimeout(timer)
    }
  }, [pastedResult, handleParseResult])

  const handleComplete = useCallback(() => {
    if (!parsedData) return
    const selectedIds = new Set(parsedData.recommended.map(r => r.id))
    const aiReasons   = Object.fromEntries(parsedData.recommended.map(r => [r.id, r.reason]))
    const confidence  = Object.fromEntries(parsedData.recommended.map(r => [r.id, r.confidence]))
    onComplete({ catalog: activeCatalog, selectedIds, aiReasons, confidence, summary: parsedData.summary })
  }, [parsedData, activeCatalog, onComplete])

  // ── Deep 단계 진행 가능 여부 ────────────────────────────
  const survey = getSurveyForDomain(deepData.domain)
  const workflowQuestions = getWorkflowQuestions(deepData.roles)

  const canAdvanceDeep = (() => {
    switch (deepStep) {
      case 1: return deepData.idea.trim().length > 5
      case 2: return deepData.domain && (deepData.domain !== 'other' || deepData.domainDetail.trim().length > 0)
      case 3: return survey.deepDive.every(q => deepData.deepDive[q.name])
      case 4: return deepData.roles.length > 0
      case 5: return deepData.coreFeatures.trim().length > 0 && deepData.scale
      case 6: return true
      default: return false
    }
  })()

  return (
    <div className="meta-smelt-phase">
      {/* Wizard stepper */}
      <div className="wizard-header">
        <WizardStep num={1} label="카탈로그 선택" active={step === 1} done={step > 1} />
        <div className="wizard-connector" />
        <WizardStep num={2} label="요구사항 입력" active={step === 2} done={step > 2} />
        <div className="wizard-connector" />
        <WizardStep num={3} label="AI 응답 붙여넣기" active={step === 3} done={!!parsedData} />
      </div>

      <div className="meta-body">
        <AnimatePresence mode="wait">

          {/* ─── Step 1 ─── */}
          {step === 1 && (
            <motion.div key="step1" className="meta-step"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            >
              <div className="meta-step-title">어떤 카탈로그를 사용할까요?</div>
              <div className="catalog-source-grid">
                {CATALOG_SOURCES.map(src => (
                  <motion.button
                    key={src.id}
                    className={`catalog-source-card ${catalogSource === src.id ? 'selected' : ''}`}
                    onClick={() => setCatalogSource(src.id)}
                    whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}
                  >
                    <span className="src-icon">{src.icon}</span>
                    <span className="src-label">{src.label}</span>
                    <span className="src-desc">{src.desc}</span>
                    {catalogSource === src.id && <span className="src-check">✓</span>}
                  </motion.button>
                ))}
              </div>

              {/* AI 신규 생성 영역 */}
              <AnimatePresence>
                {catalogSource === 'ai-generate' && (
                  <motion.div className="custom-catalog-area"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  >
                    {/* (1) 모드 선택 ── Quick / Deep ───────────────────── */}
                    {!aiMode && !aiOutputStep && (
                      <div className="ai-gen-section">
                        <div className="ai-gen-label" style={{ marginBottom: 4 }}>AI 카탈로그 생성 모드를 선택하세요</div>
                        <div className="catalog-source-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                          <motion.button
                            className="catalog-source-card"
                            onClick={() => setAiMode('quick')}
                            whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}
                          >
                            <span className="src-icon">⚡</span>
                            <span className="src-label">Quick</span>
                            <span className="src-desc">자유 입력 한 번 (30초)<br/>AI가 도메인 지식으로 보완</span>
                          </motion.button>
                          <motion.button
                            className="catalog-source-card"
                            onClick={() => setAiMode('deep')}
                            whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}
                          >
                            <span className="src-icon">🔬</span>
                            <span className="src-label">Deep</span>
                            <span className="src-desc">6단계 정밀 설문 (5분)<br/>결정 정보가 명확할수록 정확</span>
                          </motion.button>
                        </div>
                      </div>
                    )}

                    {/* (2) Quick — 자유 입력 ─────────────────────────── */}
                    {aiMode === 'quick' && !aiOutputStep && (
                      <div className="ai-gen-section">
                        <div className="ai-gen-label">
                          <button className="step-back-btn" onClick={resetAiFlow} style={{ fontSize: 11, marginRight: 8 }}>
                            ← 모드 변경
                          </button>
                          ⚡ Quick — 어떤 도메인의 서비스를 만드나요?
                        </div>
                        <textarea
                          className="yml-textarea"
                          style={{ minHeight: 120 }}
                          placeholder={'예) 헬스케어 예약 플랫폼. 의사·환자·병원이 사용자.\n진료 예약, 처방전 관리, 원격 진료가 핵심.\n규모는 MVP, 결제는 토스페이.'}
                          value={quickInput}
                          onChange={e => setQuickInput(e.target.value)}
                          autoFocus
                        />
                        <div className="step-footer" style={{ marginTop: 0 }}>
                          <button
                            className={`step-next-btn ${quickInput.trim().length > 10 ? '' : 'disabled'}`}
                            onClick={handleQuickGeneratePrompt}
                            style={{ fontSize: 12 }}
                          >
                            카탈로그 생성 프롬프트 →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* (3) Deep — 6단계 wizard ───────────────────────── */}
                    {aiMode === 'deep' && !aiOutputStep && (
                      <div className="ai-gen-section">
                        <div className="ai-gen-label">
                          <button className="step-back-btn" onClick={resetAiFlow} style={{ fontSize: 11, marginRight: 8 }}>
                            ← 모드 변경
                          </button>
                          🔬 Deep — Step {deepStep}/6
                        </div>

                        {/* Deep Step 1: 아이디어 */}
                        {deepStep === 1 && (
                          <>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                              어떤 서비스를 만들고 싶으세요? 자유롭게 설명해주세요.
                            </div>
                            <textarea
                              className="yml-textarea"
                              style={{ minHeight: 80 }}
                              placeholder={'예) 헬스케어 예약 플랫폼. 환자가 의사를 검색하고 예약하는 서비스.'}
                              value={deepData.idea}
                              onChange={e => updateDeep({ idea: e.target.value })}
                              autoFocus
                            />
                          </>
                        )}

                        {/* Deep Step 2: 업종 */}
                        {deepStep === 2 && (
                          <>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                              가장 가까운 업종을 선택하세요.
                            </div>
                            <select
                              className="yml-textarea"
                              style={{ minHeight: 38, padding: 8 }}
                              value={deepData.domain}
                              onChange={e => updateDeep({ domain: e.target.value, deepDive: {} })}
                            >
                              {DOMAIN_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.name}</option>
                              ))}
                            </select>
                            {deepData.domain === 'other' && (
                              <input
                                type="text"
                                className="yml-textarea"
                                style={{ minHeight: 38, padding: 8, marginTop: 8 }}
                                placeholder="어떤 업종인지 설명해주세요"
                                value={deepData.domainDetail}
                                onChange={e => updateDeep({ domainDetail: e.target.value })}
                              />
                            )}
                          </>
                        )}

                        {/* Deep Step 3: 사업 구조 */}
                        {deepStep === 3 && (
                          <>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                              업종에 맞는 핵심 질문입니다. 정확한 카탈로그 설계에 도움이 됩니다.
                            </div>
                            {survey.deepDive.map(q => (
                              <div key={q.name} style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{q.message}</div>
                                {q.type === 'list' ? (
                                  <select
                                    className="yml-textarea"
                                    style={{ minHeight: 38, padding: 8 }}
                                    value={deepData.deepDive[q.name] || ''}
                                    onChange={e => updateDeep({ deepDive: { ...deepData.deepDive, [q.name]: e.target.value } })}
                                  >
                                    <option value="">선택하세요...</option>
                                    {q.choices.map(c => (
                                      <option key={c.value} value={c.value}>{c.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    className="yml-textarea"
                                    style={{ minHeight: 38, padding: 8 }}
                                    value={deepData.deepDive[q.name] || ''}
                                    onChange={e => updateDeep({ deepDive: { ...deepData.deepDive, [q.name]: e.target.value } })}
                                  />
                                )}
                              </div>
                            ))}
                          </>
                        )}

                        {/* Deep Step 4: 역할 + 워크플로우 */}
                        {deepStep === 4 && (
                          <>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                              서비스에 어떤 역할의 사용자가 있나요? (복수 선택)
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {ROLE_OPTIONS.map(opt => {
                                const checked = deepData.roles.includes(opt.value)
                                return (
                                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        const next = checked
                                          ? deepData.roles.filter(r => r !== opt.value)
                                          : [...deepData.roles, opt.value]
                                        updateDeep({ roles: next })
                                      }}
                                    />
                                    <span>{opt.name}</span>
                                  </label>
                                )
                              })}
                            </div>
                            {workflowQuestions.length > 0 && (
                              <div style={{ marginTop: 14 }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                                  각 역할의 핵심 행동을 알려주세요 (선택, 미입력 시 AI가 추론)
                                </div>
                                {workflowQuestions.map(wq => (
                                  <div key={wq.role} style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                                      [{wq.roleName}] {wq.question}
                                    </div>
                                    <input
                                      type="text"
                                      className="yml-textarea"
                                      style={{ minHeight: 32, padding: 6, fontSize: 12 }}
                                      value={deepData.workflows[wq.role] || ''}
                                      onChange={e => updateDeep({ workflows: { ...deepData.workflows, [wq.role]: e.target.value } })}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}

                        {/* Deep Step 5: 핵심 기능 + 규모 */}
                        {deepStep === 5 && (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                              반드시 있어야 하는 핵심 기능 (3~5개, 쉼표로 구분)
                            </div>
                            <textarea
                              className="yml-textarea"
                              style={{ minHeight: 60 }}
                              placeholder="예: 회원가입, 상품 검색, 결제, 주문 관리, 배송 추적"
                              value={deepData.coreFeatures}
                              onChange={e => updateDeep({ coreFeatures: e.target.value })}
                            />
                            <div style={{ fontSize: 12, fontWeight: 600, margin: '12px 0 4px' }}>
                              예상 서비스 규모
                            </div>
                            <select
                              className="yml-textarea"
                              style={{ minHeight: 38, padding: 8 }}
                              value={deepData.scale}
                              onChange={e => updateDeep({ scale: e.target.value })}
                            >
                              {SCALE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.name}</option>
                              ))}
                            </select>
                          </>
                        )}

                        {/* Deep Step 6: 제약사항 + 요약 */}
                        {deepStep === 6 && (
                          <>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                              해당하는 제약사항을 체크하세요 (없으면 비워두세요).
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                              {survey.constraints.map(c => {
                                const checked = deepData.constraints.includes(c.value)
                                return (
                                  <label key={c.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        const next = checked
                                          ? deepData.constraints.filter(v => v !== c.value)
                                          : [...deepData.constraints, c.value]
                                        updateDeep({ constraints: next })
                                      }}
                                    />
                                    <span>{c.name}</span>
                                  </label>
                                )
                              })}
                            </div>
                            <div style={{ fontSize: 11, padding: 10, borderRadius: 6, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)' }}>
                              <strong>입력 요약</strong><br/>
                              아이디어: {deepData.idea.slice(0, 60)}{deepData.idea.length > 60 ? '...' : ''}<br/>
                              업종: {deepData.domain === 'other' ? deepData.domainDetail : DOMAIN_OPTIONS.find(o => o.value === deepData.domain)?.name}<br/>
                              역할: {deepData.roles.length}개 · 핵심기능: {deepData.coreFeatures.split(',').filter(Boolean).length}개 · 제약사항: {deepData.constraints.length}개
                            </div>
                          </>
                        )}

                        {/* Deep wizard 네비게이션 */}
                        <div className="step-footer" style={{ marginTop: 12, gap: 8 }}>
                          {deepStep > 1 && (
                            <button
                              className="step-back-btn"
                              onClick={() => setDeepStep(s => s - 1)}
                              style={{ fontSize: 11 }}
                            >
                              ← 이전
                            </button>
                          )}
                          {deepStep < 6 && (
                            <button
                              className={`step-next-btn ${canAdvanceDeep ? '' : 'disabled'}`}
                              onClick={() => canAdvanceDeep && setDeepStep(s => s + 1)}
                              style={{ fontSize: 12 }}
                            >
                              다음 →
                            </button>
                          )}
                          {deepStep === 6 && (
                            <button
                              className="step-next-btn"
                              onClick={handleDeepGeneratePrompt}
                              style={{ fontSize: 12 }}
                            >
                              카탈로그 생성 프롬프트 →
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* (4) 프롬프트 + 응답 붙여넣기 (Quick/Deep 공유) ── */}
                    {aiOutputStep === 'prompt' && (
                      <div className="ai-gen-section">
                        <div className="ai-gen-prompt-row">
                          <div className="ai-gen-col">
                            <div className="ai-gen-col-label">
                              <span className="col-num">①</span> Claude Code에 붙여넣기
                            </div>
                            <div className="prompt-box" style={{ minHeight: 200 }}>
                              <div className="prompt-box-header">
                                <span className="prompt-box-title">catalog 생성 프롬프트 ({aiMode === 'quick' ? 'Quick' : 'Deep'})</span>
                                <button
                                  className={`copy-prompt-btn ${aiCopied ? 'copied' : ''}`}
                                  onClick={handleAiCopy}
                                >
                                  {aiCopied ? '✓ 복사됨' : '복사'}
                                </button>
                              </div>
                              <pre className="prompt-content">{aiPrompt}</pre>
                            </div>
                            <div className="claude-code-hint">
                              <span className="hint-icon">💡</span>
                              <span>터미널에서 <code>claude</code> 실행 후 붙여넣기</span>
                            </div>
                          </div>
                          <div className="ai-gen-col">
                            <div className="ai-gen-col-label">
                              <span className="col-num">②</span> catalog.yml 응답 붙여넣기
                            </div>
                            <textarea
                              className="result-paste-area"
                              style={{ minHeight: 200 }}
                              placeholder={'Claude가 생성한 catalog.yml을\n여기에 붙여넣으세요.\n\n자동으로 파싱됩니다.'}
                              value={aiPasted}
                              onChange={e => setAiPasted(e.target.value)}
                            />
                            {aiError && (
                              <div className="parse-error">⚠ {aiError}</div>
                            )}
                          </div>
                        </div>
                        <button
                          className="step-back-btn"
                          onClick={() => {
                            setAiOutputStep(null)
                            setAiPasted('')
                            setAiError(null)
                          }}
                          style={{ alignSelf: 'flex-start', fontSize: 11 }}
                        >
                          ← {aiMode === 'quick' ? '입력 수정' : 'Deep 설문으로 돌아가기'}
                        </button>
                      </div>
                    )}

                    {/* (5) 완료 ── */}
                    {aiOutputStep === 'done' && aiCatalog && (
                      <motion.div
                        className="catalog-ok ai-gen-done"
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      >
                        <div className="ai-gen-done-header">
                          ✓ 카탈로그 생성 완료 ({aiMode === 'quick' ? 'Quick' : 'Deep'} 모드)
                        </div>
                        <div className="ai-gen-done-stats">
                          <span><strong>{aiCatalog.name}</strong></span>
                          <span className="ai-gen-stat">{aiCatalog.blocks.length}개 블럭</span>
                          <span className="ai-gen-stat">{aiCatalog.bundles.length}개 번들</span>
                          <span className="ai-gen-stat">{aiCatalog.worlds.length - 1}개 월드</span>
                        </div>
                        <button
                          className="step-back-btn"
                          onClick={resetAiFlow}
                          style={{ fontSize: 11, marginTop: 6, alignSelf: 'flex-start' }}
                        >
                          다시 생성
                        </button>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 커스텀 카탈로그 업로드 영역 */}
              <AnimatePresence>
                {catalogSource === 'upload' && (
                  <motion.div className="custom-catalog-area"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  >
                    <div className="upload-actions">
                      <button className="upload-file-btn" onClick={() => fileInputRef.current?.click()}>
                        📁 catalog.yml 파일 선택
                      </button>
                      <input ref={fileInputRef} type="file" accept=".yml,.yaml" style={{ display: 'none' }} onChange={handleFileUpload} />
                      <span className="upload-or">또는 직접 붙여넣기</span>
                    </div>
                    <textarea
                      className="yml-textarea"
                      placeholder="catalog.yml 내용을 붙여넣으세요..."
                      value={customYml}
                      onChange={e => handleYmlChange(e.target.value)}
                    />
                    {catalogError && (
                      <div className="catalog-error">⚠ {catalogError}</div>
                    )}
                    {customCatalog && !catalogError && (
                      <div className="catalog-ok">
                        ✓ <strong>{customCatalog.name}</strong> — {customCatalog.blocks.length}개 블럭, {customCatalog.bundles.length}개 번들
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {catalogSource?.startsWith('builtin:') && activeCatalog && (
                <div className="catalog-summary">
                  ✓ {activeCatalog.name} 카탈로그 — {activeCatalog.blocks.length}개 블럭, {activeCatalog.bundles.length}개 번들
                </div>
              )}

              <div className="step-footer">
                <button
                  className={`step-next-btn ${canProceedStep1 ? '' : 'disabled'}`}
                  onClick={() => canProceedStep1 && setStep(2)}
                >
                  다음: 요구사항 입력 →
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 2 ─── */}
          {step === 2 && (
            <motion.div key="step2" className="meta-step"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            >
              <div className="meta-step-title">어떤 서비스를 만드나요?</div>
              <p className="meta-step-hint">자유롭게 설명하세요. 규모, 핵심 기능, 우선순위, 제약사항 모두 포함할수록 좋습니다.</p>

              <div className="example-chips">
                {EXAMPLE_INPUTS.map((ex, i) => (
                  <button key={i} className="example-chip" onClick={() => setUserInput(ex)}>
                    {ex.slice(0, 28)}…
                  </button>
                ))}
              </div>

              <textarea
                className="nl-input"
                placeholder="예) 소규모 쇼핑몰 MVP. 상품 등록·결제·배송 추적이 핵심. 관리자 기능은 나중에..."
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                rows={6}
                autoFocus
              />

              <div className="char-count">{userInput.length}자</div>

              <div className="step-footer">
                <button className="step-back-btn" onClick={() => setStep(1)}>← 카탈로그 변경</button>
                <button
                  className={`step-next-btn ${userInput.trim().length > 10 ? '' : 'disabled'}`}
                  onClick={handleGeneratePrompt}
                >
                  프롬프트 생성 →
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 3 ─── */}
          {step === 3 && (
            <motion.div key="step3" className="meta-step step3-layout"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            >
              {/* Left: 생성된 프롬프트 */}
              <div className="step3-col">
                <div className="step3-col-label">
                  <span className="col-num">①</span>
                  Claude Code에 이 프롬프트를 붙여넣으세요
                </div>
                <div className="prompt-box">
                  <div className="prompt-box-header">
                    <span className="prompt-box-title">생성된 프롬프트</span>
                    <motion.button
                      className={`copy-prompt-btn ${copied ? 'copied' : ''}`}
                      onClick={handleCopy}
                      whileTap={{ scale: 0.95 }}
                    >
                      {copied ? '✓ 복사됨' : '복사'}
                    </motion.button>
                  </div>
                  <pre className="prompt-content">{generatedPrompt}</pre>
                </div>
                <div className="claude-code-hint">
                  <span className="hint-icon">💡</span>
                  <span>터미널에서 <code>claude</code> 명령 실행 후 붙여넣기</span>
                </div>
              </div>

              {/* Right: 응답 붙여넣기 */}
              <div className="step3-col">
                <div className="step3-col-label">
                  <span className="col-num">②</span>
                  Claude의 응답을 붙여넣으세요
                </div>
                <textarea
                  className="result-paste-area"
                  placeholder={`Claude의 응답을 여기에 붙여넣으세요.\n\n예:\n\`\`\`json\n{\n  "recommended": [...]\n}\n\`\`\``}
                  value={pastedResult}
                  onChange={e => setPastedResult(e.target.value)}
                />

                {parseError && (
                  <motion.div className="parse-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    ⚠ {parseError}
                  </motion.div>
                )}

                <AnimatePresence>
                  {parsedData && (
                    <motion.div className="parse-preview"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="preview-header">
                        <span className="preview-ok">✓ 파싱 완료</span>
                        <span className="preview-count">{parsedData.recommended.length}개 블럭 추천</span>
                      </div>
                      {parsedData.summary && (
                        <p className="preview-summary">"{parsedData.summary}"</p>
                      )}
                      <div className="preview-blocks">
                        {parsedData.recommended.map(r => (
                          <div key={r.id} className="preview-block">
                            <span className="preview-block-id">{r.id}</span>
                            <span className="preview-conf" style={{ color: CONF_COLOR[r.confidence] || '#f97316' }}>
                              {r.confidence}
                            </span>
                            <span className="preview-reason">{r.reason}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="step-footer">
                  <button className="step-back-btn" onClick={() => setStep(2)}>← 요구사항 수정</button>
                  <motion.button
                    className={`step-next-btn primary ${parsedData ? '' : 'disabled'}`}
                    onClick={parsedData ? handleComplete : undefined}
                    whileHover={parsedData ? { scale: 1.03 } : {}}
                    whileTap={parsedData ? { scale: 0.97 } : {}}
                  >
                    🔥 Smelt 시작 →
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
