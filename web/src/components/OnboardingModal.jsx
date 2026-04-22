import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const STEPS = [
  {
    icon: '✨',
    title: 'Forge Protocol이란?',
    desc: 'AI와 함께 설계부터 코드까지 — "바이브"에서 시작해 "구조"로 승격시키는 개발 협업 도구입니다.',
    detail: '기존 AI 코딩 도구가 구현에서 시작한다면, Forge는 설계를 먼저 강제합니다.',
  },
  {
    icon: '🔄',
    title: 'AI 협업 방식',
    desc: 'Forge Web UI ↔ Claude Code (터미널) 두 창을 함께 쓰는 방식입니다.',
    detail: null,
    steps: [
      { num: '①', label: 'Forge에서 프롬프트 생성', sub: '요구사항을 입력하면 Claude용 프롬프트가 자동 생성됩니다' },
      { num: '②', label: '터미널에서 Claude 실행', sub: '터미널을 열고 claude 입력 후 프롬프트를 붙여넣으세요' },
      { num: '③', label: 'Claude 응답을 Forge에 붙여넣기', sub: 'Claude의 JSON 응답을 Forge 오른쪽 창에 붙여넣으면 자동 파싱됩니다' },
    ],
  },
  {
    icon: '⚒️',
    title: '6단계 프로세스',
    desc: '각 Phase는 이전 Phase 결과를 자동으로 이어받습니다. 단계를 건너뛸 수 없습니다.',
    phases: [
      { icon: '✨', name: 'Meta-Smelt', desc: 'AI 블럭 추천' },
      { icon: '🔥', name: 'Smelt',      desc: '블럭 선택' },
      { icon: '🏛️', name: 'Shape',      desc: '아키텍처 자동 생성' },
      { icon: '⚒️', name: 'Forge',      desc: 'API 계약 자동 생성' },
      { icon: '💧', name: 'Temper',     desc: '테스트 시나리오 생성' },
      { icon: '🔍', name: 'Inspect',    desc: '멀티 관점 리뷰' },
    ],
  },
]

export default function OnboardingModal({ onClose }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  const handleClose = () => {
    localStorage.setItem('forge-onboarding-done', '1')
    onClose()
  }

  return (
    <motion.div
      className="onboarding-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={handleClose}
    >
      <motion.div
        className="onboarding-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onClick={e => e.stopPropagation()}
      >
        {/* 상단 진행 점 */}
        <div className="onboarding-dots" role="tablist" aria-label="온보딩 단계">
          {STEPS.map((_, i) => (
            <button
              key={i}
              role="tab"
              className={`onboarding-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`${i + 1}단계`}
              aria-selected={i === step}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="onboarding-content"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
          >
            <div className="onboarding-icon">{current.icon}</div>
            <h2 id="onboarding-title" className="onboarding-title">{current.title}</h2>
            <p className="onboarding-desc">{current.desc}</p>

            {current.detail && (
              <p className="onboarding-detail">{current.detail}</p>
            )}

            {current.steps && (
              <div className="onboarding-steps">
                {current.steps.map(s => (
                  <div key={s.num} className="onboarding-step-row">
                    <span className="onboarding-step-num">{s.num}</span>
                    <div className="onboarding-step-body">
                      <div className="onboarding-step-label">{s.label}</div>
                      <div className="onboarding-step-sub">{s.sub}</div>
                    </div>
                  </div>
                ))}
                <div className="onboarding-claude-hint">
                  💡 <strong>claude</strong> 명령어가 없다면:{' '}
                  <code>npm install -g @anthropic-ai/claude-code</code>
                </div>
              </div>
            )}

            {current.phases && (
              <div className="onboarding-phases">
                {current.phases.map((p, i) => (
                  <div key={i} className="onboarding-phase-row">
                    <span className="onboarding-phase-icon">{p.icon}</span>
                    <span className="onboarding-phase-name">{p.name}</span>
                    <span className="onboarding-phase-desc">{p.desc}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="onboarding-footer">
          <button className="onboarding-skip" onClick={handleClose} aria-label="온보딩 건너뛰기">
            건너뛰기
          </button>
          <div className="onboarding-nav">
            {step > 0 && (
              <button className="onboarding-prev" onClick={() => setStep(s => s - 1)} aria-label="이전 단계">
                ← 이전
              </button>
            )}
            <motion.button
              className="onboarding-next"
              onClick={isLast ? handleClose : () => setStep(s => s + 1)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {isLast ? '시작하기 🔥' : '다음 →'}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
