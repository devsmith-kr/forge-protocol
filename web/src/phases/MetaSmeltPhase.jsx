import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BUILTIN_CATALOG } from '../catalog'
import { buildMetaSmeltPrompt, parseClaudeResponse,
         buildCatalogGenerationPrompt, extractYamlFromResponse } from '../metaSmeltUtils'
import { parseCatalogYml, validateCatalog } from '../parseCatalog'

const CATALOG_SOURCES = [
  { id: 'builtin',    icon: '🏪', label: 'Commerce (기본 제공)', desc: '커머스 도메인 21개 블럭 — 쇼핑몰, 마켓플레이스' },
  { id: 'ai-generate',icon: '✨', label: 'AI로 신규 생성',       desc: '도메인 설명 → Claude Code → catalog.yml 자동 생성' },
  { id: 'upload',     icon: '📂', label: '파일 업로드',          desc: 'forge init 또는 직접 작성한 catalog.yml' },
]

const EXAMPLE_INPUTS = [
  '소규모 쇼핑몰 MVP. 상품 등록·결제·배송 추적이 핵심. 관리자 기능은 나중에.',
  '마켓플레이스. 판매자가 상품 올리고, 구매자가 검색·구매. 카카오 로그인 필수.',
  '스타트업 커머스. 빠른 런칭 우선. 리뷰·쿠폰은 2차. 결제는 토스.',
]

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
  const [catalogSource, setCatalogSource] = useState('builtin')

  // upload 방식
  const [customYml, setCustomYml]         = useState('')
  const [customCatalog, setCustomCatalog] = useState(null)
  const [catalogError, setCatalogError]   = useState(null)
  const fileInputRef = useRef(null)

  // ai-generate 방식
  const [aiGenDomain, setAiGenDomain]   = useState('')
  const [aiGenPrompt, setAiGenPrompt]   = useState('')
  const [aiGenPasted, setAiGenPasted]   = useState('')
  const [aiGenCopied, setAiGenCopied]   = useState(false)
  const [aiGenCatalog, setAiGenCatalog] = useState(null)
  const [aiGenError, setAiGenError]     = useState(null)
  const [aiGenStep, setAiGenStep]       = useState('input') // 'input'|'prompt'|'done'

  // 블럭 추천 (Step 2/3)
  const [userInput, setUserInput]           = useState('')
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [copied, setCopied]                 = useState(false)
  const [pastedResult, setPastedResult]     = useState('')
  const [parseError, setParseError]         = useState(null)
  const [parsedData, setParsedData]         = useState(null)

  const activeCatalog =
    catalogSource === 'builtin'     ? BUILTIN_CATALOG :
    catalogSource === 'ai-generate' ? aiGenCatalog :
    customCatalog

  // ── ai-generate 핸들러 ────────────────────────────────────
  const handleAiGenPrompt = useCallback(() => {
    if (!aiGenDomain.trim()) return
    setAiGenPrompt(buildCatalogGenerationPrompt(aiGenDomain))
    setAiGenStep('prompt')
    setAiGenError(null)
  }, [aiGenDomain])

  const handleAiGenCopy = useCallback(() => {
    navigator.clipboard.writeText(aiGenPrompt)
    setAiGenCopied(true)
    setTimeout(() => setAiGenCopied(false), 2000)
  }, [aiGenPrompt])

  // 붙여넣기 자동 파싱 (400ms 디바운스)
  useEffect(() => {
    if (catalogSource !== 'ai-generate' || !aiGenPasted.trim()) return
    const t = setTimeout(() => {
      try {
        const yml = extractYamlFromResponse(aiGenPasted)
        const parsed = parseCatalogYml(yml)
        const errors = validateCatalog(parsed)
        if (errors.length) { setAiGenError(errors.join('\n')); setAiGenCatalog(null) }
        else { setAiGenCatalog(parsed); setAiGenError(null); setAiGenStep('done') }
      } catch (e) {
        setAiGenError(`파싱 오류: ${e.message}`)
        setAiGenCatalog(null)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [aiGenPasted, catalogSource])

  // ── Step 1: 카탈로그 파싱 ────────────────────────────────
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
    catalogSource === 'builtin' ||
    (catalogSource === 'upload' && customCatalog && !catalogError) ||
    (catalogSource === 'ai-generate' && aiGenCatalog && !aiGenError)

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
                    {aiGenStep === 'input' && (
                      <div className="ai-gen-section">
                        <div className="ai-gen-label">어떤 도메인의 서비스를 만드나요?</div>
                        <textarea
                          className="yml-textarea"
                          style={{ minHeight: 100 }}
                          placeholder={'예) 헬스케어 예약 플랫폼. 의사·환자·병원이 사용자. 진료 예약, 처방전 관리, 원격 진료가 핵심.'}
                          value={aiGenDomain}
                          onChange={e => setAiGenDomain(e.target.value)}
                          autoFocus
                        />
                        <div className="step-footer" style={{ marginTop: 0 }}>
                          <button
                            className={`step-next-btn ${aiGenDomain.trim().length > 10 ? '' : 'disabled'}`}
                            onClick={handleAiGenPrompt}
                            style={{ fontSize: 12 }}
                          >
                            카탈로그 생성 프롬프트 →
                          </button>
                        </div>
                      </div>
                    )}

                    {aiGenStep === 'prompt' && (
                      <div className="ai-gen-section">
                        <div className="ai-gen-prompt-row">
                          <div className="ai-gen-col">
                            <div className="ai-gen-col-label">
                              <span className="col-num">①</span> Claude Code에 붙여넣기
                            </div>
                            <div className="prompt-box" style={{ minHeight: 200 }}>
                              <div className="prompt-box-header">
                                <span className="prompt-box-title">catalog 생성 프롬프트</span>
                                <button
                                  className={`copy-prompt-btn ${aiGenCopied ? 'copied' : ''}`}
                                  onClick={handleAiGenCopy}
                                >
                                  {aiGenCopied ? '✓ 복사됨' : '복사'}
                                </button>
                              </div>
                              <pre className="prompt-content">{aiGenPrompt}</pre>
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
                              value={aiGenPasted}
                              onChange={e => setAiGenPasted(e.target.value)}
                            />
                            {aiGenError && (
                              <div className="parse-error">⚠ {aiGenError}</div>
                            )}
                          </div>
                        </div>
                        <button
                          className="step-back-btn"
                          onClick={() => { setAiGenStep('input'); setAiGenPasted(''); setAiGenError(null) }}
                          style={{ alignSelf: 'flex-start', fontSize: 11 }}
                        >
                          ← 도메인 설명 수정
                        </button>
                      </div>
                    )}

                    {aiGenStep === 'done' && aiGenCatalog && (
                      <motion.div
                        className="catalog-ok ai-gen-done"
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      >
                        <div className="ai-gen-done-header">
                          ✓ 카탈로그 생성 완료
                        </div>
                        <div className="ai-gen-done-stats">
                          <span><strong>{aiGenCatalog.name}</strong></span>
                          <span className="ai-gen-stat">{aiGenCatalog.blocks.length}개 블럭</span>
                          <span className="ai-gen-stat">{aiGenCatalog.bundles.length}개 번들</span>
                          <span className="ai-gen-stat">{aiGenCatalog.worlds.length - 1}개 월드</span>
                        </div>
                        <button
                          className="step-back-btn"
                          onClick={() => { setAiGenStep('input'); setAiGenPasted(''); setAiGenCatalog(null) }}
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

              {catalogSource === 'builtin' && (
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
