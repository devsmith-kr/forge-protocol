// ClaudeBridgePanel.jsx - Claude 연동 패널 (Phase A)
//
// 모드 2가지:
//   - 프롬프트 복사 (항상 가능, 서버 불필요)
//   - AI 생성 (api-service 프록시, 서버 보유 키 + 티어별 모델)
//
// Phase A 에서 제거됨: Claude Code CLI 버튼, API 키 인라인 입력.
// (CLI 는 클라우드 불가, 키는 서버가 보유)
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

function OutputPanel({ output, status, statusMessage, error, progress, progressStep, usage, onCancel, onReset }) {
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
      {status === 'generating' && (
        <ProgressBar progress={progress} step={progressStep} />
      )}

      <div className="bridge-output-status">
        <span className="bridge-status-text">
          {status === 'generating' && <span className="bridge-spinner" />}
          {status === 'generating' && (statusMessage || '백그라운드에서 코드 생성 중...')}
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

      {/* 토큰 사용량 (완료 시) */}
      {status === 'done' && usage && (
        <div className="bridge-usage">
          입력 {usage.inputTokens?.toLocaleString()} · 출력 {usage.outputTokens?.toLocaleString()} 토큰
        </div>
      )}

      {cleanOutput && (
        <pre className="bridge-output-code" ref={outputRef}>
          <code>{cleanOutput}</code>
        </pre>
      )}
    </motion.div>
  )
}

// ── 메인 패널 ─────────────────────────────────────────

/**
 * @param {string} prompt            - 복사용 프롬프트
 * @param {string} executionPrompt   - AI 실행용 프롬프트 (없으면 prompt 사용)
 * @param {string} copyLabel         - 복사 버튼 라벨
 * @param {string} outputDir         - 생성 결과 디렉토리 표시용
 */
export default function ClaudeBridgePanel({ prompt, executionPrompt, copyLabel = '프롬프트 복사', outputDir }) {
  const bridge = useClaudeBridge()
  const [copied, setCopied] = useState(false)

  const isGenerating = bridge.status === 'generating'
  const showOutput = bridge.status !== 'idle'
  const runPrompt = executionPrompt || prompt

  const handleCopy = useCallback(async () => {
    if (!prompt) return
    await copyToClipboard(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }, [prompt])

  const handleGenerate = useCallback(() => {
    if (!runPrompt || isGenerating) return
    bridge.generate(runPrompt)
  }, [runPrompt, isGenerating, bridge.generate])

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
          className="bridge-btn bridge-btn-claude-api"
          onClick={handleGenerate}
          disabled={!bridge.connected || !runPrompt || isGenerating}
          title={!bridge.connected ? 'API 서비스 미연결' : undefined}
        >
          {isGenerating ? '⏳ 생성 중...' : '✨ AI로 생성'}
        </button>
      </div>

      {/* 연결 상태 + 출력 디렉토리 힌트 */}
      {!bridge.connected && (
        <div className="bridge-hint">
          API 서비스 미연결 - <code>cd api-service &amp;&amp; npm run dev</code> 로 실행하세요
        </div>
      )}
      {bridge.connected && (
        <div className="bridge-hint connected">
          연결됨 · 티어 <strong>{bridge.tier}</strong>
          {bridge.model && <> · 모델 <code>{bridge.model}</code></>}
          {outputDir && <> · 출력: <code>{outputDir}</code></>}
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
            usage={bridge.usage}
            onCancel={bridge.cancel}
            onReset={bridge.reset}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
