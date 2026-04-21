// ClaudeBridgePanel.jsx — Claude 연동 패널 (코드 생성 3가지 모드)
//
// 모드 C: 프롬프트 복사 (항상 가능, prompt 사용)
// 모드 B: Claude Code CLI 실행 (executionPrompt 우선 사용)
// 모드 A: Claude API 호출 (executionPrompt 우선 사용)
//
// BuildPhase, TemperPhase에서 재사용한다.

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useClaudeBridge from '../hooks/useClaudeBridge'

// ── 클립보드 복사 유틸 ────────────────────────────────

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

// ── 진행률 바 ─────────────────────────────────────────

function ProgressBar({ progress, step }) {
  return (
    <div className="bridge-progress">
      <div className="bridge-progress-bar">
        <motion.div
          className="bridge-progress-fill"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
      <div className="bridge-progress-info">
        <span className="bridge-progress-pct">{progress}%</span>
        {step && <span className="bridge-progress-step">{step}</span>}
      </div>
    </div>
  )
}

// ── 출력 패널 ─────────────────────────────────────────

function OutputPanel({ output, status, statusMessage, error, progress, progressStep, onCancel, onReset }) {
  const outputRef = useRef(null)
  const [outputCopied, setOutputCopied] = useState(false)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const handleCopyOutput = useCallback(async () => {
    await copyToClipboard(output)
    setOutputCopied(true)
    setTimeout(() => setOutputCopied(false), 2000)
  }, [output])

  // 출력에서 FORGE:PROGRESS 마커 제거한 버전
  const cleanOutput = useMemo(() =>
    output.replace(/\[FORGE:PROGRESS:\d+:[^\]]*\]\n?/g, ''),
    [output]
  )

  return (
    <motion.div
      className="bridge-output-panel"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* 진행률 바 (생성 중일 때) */}
      {status === 'generating' && (
        <ProgressBar progress={progress} step={progressStep} />
      )}

      {/* 상태 바 */}
      <div className="bridge-output-status">
        <span className="bridge-status-text">
          {status === 'generating' && <span className="bridge-spinner" />}
          {status === 'generating' && (statusMessage || '백그라운드에서 코드 생성 중…')}
          {status === 'done' && `✓ 완료 (${progress}%)`}
          {status === 'error' && `✗ ${error}`}
        </span>
        <span className="bridge-output-actions">
          {status === 'generating' && (
            <button className="bridge-action-btn cancel" onClick={onCancel}>취소</button>
          )}
          {status === 'done' && cleanOutput && (
            <button className="bridge-action-btn copy" onClick={handleCopyOutput}>
              {outputCopied ? '✓ 복사됨' : '결과 복사'}
            </button>
          )}
          {(status === 'done' || status === 'error') && (
            <button className="bridge-action-btn reset" onClick={onReset}>닫기</button>
          )}
        </span>
      </div>

      {/* 출력 영역 */}
      {cleanOutput && (
        <pre className="bridge-output-code" ref={outputRef}>
          <code>{cleanOutput}</code>
        </pre>
      )}
    </motion.div>
  )
}

// ── API 키 인라인 입력 ────────────────────────────────

function ApiKeyInput({ apiKey, onChange }) {
  return (
    <input
      type="password"
      className="bridge-api-key-input"
      placeholder="sk-ant-api03-..."
      value={apiKey}
      onChange={e => onChange(e.target.value)}
      autoComplete="off"
      spellCheck="false"
    />
  )
}

// ── 메인 패널 ─────────────────────────────────────────

/**
 * @param {string} prompt            — 복사용 프롬프트
 * @param {string} executionPrompt   — Claude Code/API 실행용 프롬프트 (없으면 prompt 사용)
 * @param {string} copyLabel         — 복사 버튼 라벨
 * @param {string} outputDir         — 생성 결과 디렉토리 표시용
 */
export default function ClaudeBridgePanel({ prompt, executionPrompt, copyLabel = '프롬프트 복사', outputDir }) {
  const bridge = useClaudeBridge()
  const [copied, setCopied] = useState(false)
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem('forge-api-key') || '' } catch { return '' }
  })
  const [showApiInput, setShowApiInput] = useState(false)

  useEffect(() => {
    try {
      if (apiKey) localStorage.setItem('forge-api-key', apiKey)
      else localStorage.removeItem('forge-api-key')
    } catch { /* 무시 */ }
  }, [apiKey])

  const isGenerating = bridge.status === 'generating'
  const showOutput = bridge.status !== 'idle'
  const runPrompt = executionPrompt || prompt

  const handleCopy = useCallback(async () => {
    if (!prompt) return
    await copyToClipboard(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }, [prompt])

  const handleClaudeCode = useCallback(() => {
    if (!runPrompt || isGenerating) return
    bridge.generate(runPrompt, 'claude-code')
  }, [runPrompt, isGenerating, bridge.generate])

  const handleClaudeApi = useCallback(() => {
    if (!runPrompt || isGenerating || !apiKey.trim()) return
    bridge.generate(runPrompt, 'api', { apiKey: apiKey.trim() })
  }, [runPrompt, isGenerating, apiKey, bridge.generate])

  return (
    <div className="bridge-panel">
      {/* 버튼 행 */}
      <div className="bridge-buttons">
        <button
          className="bridge-btn bridge-btn-copy"
          onClick={handleCopy}
          disabled={!prompt || isGenerating}
          style={{
            background: copied
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              : undefined,
          }}
        >
          {copied ? '✓ 복사 완료!' : `📋 ${copyLabel}`}
        </button>

        <button
          className="bridge-btn bridge-btn-claude-code"
          onClick={handleClaudeCode}
          disabled={!bridge.connected || !bridge.claudeAvailable || !runPrompt || isGenerating}
          title={
            !bridge.connected ? 'Bridge 서버 미연결 (npm run bridge)'
            : !bridge.claudeAvailable ? 'Claude Code CLI 미설치'
            : undefined
          }
        >
          {isGenerating && bridge.mode === 'claude-code' ? '⏳ 생성 중…' : '🖥️ Claude Code 실행'}
        </button>

        <div className="bridge-api-group">
          <button
            className="bridge-btn bridge-btn-claude-api"
            onClick={apiKey.trim() ? handleClaudeApi : () => setShowApiInput(v => !v)}
            disabled={!bridge.connected || isGenerating || (showApiInput && !apiKey.trim())}
            title={!bridge.connected ? 'Bridge 서버 미연결 (npm run bridge)' : undefined}
          >
            {isGenerating && bridge.mode === 'api' ? '⏳ 호출 중…' : '🔑 Claude API'}
          </button>
          <AnimatePresence>
            {showApiInput && !isGenerating && (
              <motion.div
                className="bridge-api-input-wrapper"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ApiKeyInput apiKey={apiKey} onChange={setApiKey} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 연결 상태 + 출력 디렉토리 힌트 */}
      {!bridge.connected && (
        <div className="bridge-hint">
          Bridge 서버 미연결 — <code>npm run bridge</code>로 실행하세요
        </div>
      )}
      {bridge.connected && bridge.claudeAvailable && (
        <div className="bridge-hint connected">
          Bridge 연결됨 · Claude {bridge.claudeVersion}
          {outputDir && <> · 출력: <code>{outputDir}</code></>}
        </div>
      )}
      {bridge.connected && !bridge.claudeAvailable && (
        <div className="bridge-hint partial">
          Bridge 연결됨 · Claude CLI 미설치 (API만 사용 가능)
        </div>
      )}

      {/* 출력 패널 */}
      <AnimatePresence>
        {showOutput && (
          <OutputPanel
            output={bridge.output}
            status={bridge.status}
            statusMessage={bridge.statusMessage}
            error={bridge.error}
            progress={bridge.progress}
            progressStep={bridge.progressStep}
            onCancel={bridge.cancel}
            onReset={bridge.reset}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
