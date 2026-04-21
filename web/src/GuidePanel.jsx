import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── 가이드 섹션 정의 ──────────────────────────────────────
const GUIDE_SECTIONS = [
  {
    id: 'overview',
    icon: '⚒️',
    label: '개요',
    content: <OverviewContent />,
  },
  {
    id: 'meta-smelt',
    icon: '✨',
    label: 'Meta-Smelt',
    content: <MetaSmeltContent />,
  },
  {
    id: 'smelt',
    icon: '🔥',
    label: 'Smelt',
    content: <SmeltContent />,
  },
  {
    id: 'shape',
    icon: '🏛️',
    label: 'Shape',
    content: <ShapeContent />,
  },
  {
    id: 'build',
    icon: '⚒️',
    label: 'Build',
    content: <BuildContent />,
  },
  {
    id: 'temper',
    icon: '💧',
    label: 'Temper',
    content: <TemperContent />,
  },
  {
    id: 'inspect',
    icon: '🔍',
    label: 'Inspect',
    content: <InspectContent />,
  },
]

// ── 공통 UI 조각 ──────────────────────────────────────────
function Step({ num, children }) {
  return (
    <div className="guide-step">
      <span className="guide-step-num">{num}</span>
      <span className="guide-step-text">{children}</span>
    </div>
  )
}

function Tip({ children }) {
  return <div className="guide-tip"><span>💡</span><span>{children}</span></div>
}

function Warn({ children }) {
  return <div className="guide-warn"><span>⚠</span><span>{children}</span></div>
}

function CodeSnip({ children }) {
  return <code className="guide-code">{children}</code>
}

function Divider() {
  return <div className="guide-divider" />
}

function Badge({ color, children }) {
  const colors = {
    orange: { bg: 'rgba(249,115,22,0.12)', text: '#f97316' },
    emerald:{ bg: 'rgba(16,185,129,0.12)', text: '#10b981' },
    violet: { bg: 'rgba(167,139,250,0.12)',text: '#a78bfa' },
    amber:  { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
    blue:   { bg: 'rgba(99,102,241,0.12)', text: '#818cf8' },
  }
  const c = colors[color] || colors.orange
  return (
    <span className="guide-badge" style={{ background: c.bg, color: c.text }}>
      {children}
    </span>
  )
}

// ── 섹션 콘텐츠 ───────────────────────────────────────────

function OverviewContent() {
  return (
    <div className="guide-content">
      <p className="guide-lead">
        바이브(감각)에서 시작하되, 설계(구조)로 승격시키고,<br />
        검증(증거)으로 마무리하는 AI 협업 개발 프로토콜
      </p>

      <Divider />

      <div className="guide-subtitle">전체 플로우</div>
      <div className="guide-flow">
        {[
          { icon: '✨', label: 'Meta-Smelt', ko: '요구사항 → AI 블럭 추천' },
          { icon: '🔥', label: 'Smelt',      ko: '블럭 선택 + 의존성 해결' },
          { icon: '🏛️', label: 'Shape',      ko: '아키텍처 결정 + ADR' },
          { icon: '⚒️', label: 'Build',      ko: 'API 계약 자동 생성' },
          { icon: '💧', label: 'Temper',     ko: 'GWT 테스트 시나리오' },
          { icon: '🔍', label: 'Inspect',    ko: '보안·성능·운영·확장성' },
        ].map((p, i, arr) => (
          <div key={p.label} className="guide-flow-row">
            <div className="guide-flow-phase">
              <span className="gf-icon">{p.icon}</span>
              <div>
                <div className="gf-label">{p.label}</div>
                <div className="gf-ko">{p.ko}</div>
              </div>
            </div>
            {i < arr.length - 1 && <div className="gf-arrow">↓</div>}
          </div>
        ))}
      </div>

      <Divider />

      <div className="guide-subtitle">핵심 철학</div>
      <div className="guide-principles">
        <div className="guide-principle">
          <Badge color="orange">무료</Badge>
          <span>프로토콜 자체 — 오픈소스</span>
        </div>
        <div className="guide-principle">
          <Badge color="violet">유료</Badge>
          <span>도메인 카탈로그 — 지식 자산</span>
        </div>
        <div className="guide-principle">
          <Badge color="emerald">위임</Badge>
          <span>카탈로그를 직접 만들어 가져올 수 있음</span>
        </div>
      </div>
    </div>
  )
}

function MetaSmeltContent() {
  return (
    <div className="guide-content">
      <p className="guide-lead">
        자연어 요구사항 → Claude Code → 블럭 추천.<br />
        API 키 없이 Claude Code CLI로 실행합니다.
      </p>

      <Divider />

      <div className="guide-subtitle">Claude Code 브릿지 방식</div>

      <Step num="1">카탈로그 선택</Step>
      <div className="guide-indent">
        <div className="guide-option"><Badge color="orange">기본</Badge> Commerce — 22개 블럭 즉시 사용</div>
        <div className="guide-option"><Badge color="blue">업로드</Badge> 내 <CodeSnip>catalog.yml</CodeSnip> 파일 또는 붙여넣기</div>
      </div>

      <Step num="2">요구사항 자연어 입력</Step>
      <div className="guide-indent">
        <div className="guide-example-box">
          "소규모 쇼핑몰 MVP.<br />
          상품 등록·결제·배송 추적이 핵심.<br />
          관리자 기능은 나중에."
        </div>
        <Tip>규모, 핵심 기능, 우선순위, 제약사항을 모두 포함할수록 추천 정확도가 높아집니다.</Tip>
      </div>

      <Step num="3">프롬프트 생성 & 복사</Step>
      <div className="guide-indent">
        [프롬프트 생성] 버튼 → [복사] 클릭
      </div>

      <Step num="4">터미널에서 Claude Code 실행</Step>
      <div className="guide-indent">
        <div className="guide-terminal">
          <span className="term-prompt">$</span> claude<br />
          <span className="term-dim">{'>'} (복사한 프롬프트 붙여넣기 → Enter)</span>
        </div>
      </div>

      <Step num="5">JSON 응답 붙여넣기</Step>
      <div className="guide-indent">
        Claude 응답을 그대로 붙여넣으면 자동으로 파싱됩니다.
        <Tip>코드블록(```json ... ```) 포함해도 됩니다.</Tip>
      </div>

      <Step num="6">Smelt 시작</Step>
      <div className="guide-indent">
        추천 블럭이 pre-selected 상태로 Smelt에 진입합니다.
      </div>

      <Divider />

      <div className="guide-subtitle">카탈로그 직접 만들기</div>
      <div className="guide-terminal">
        <span className="term-prompt">$</span> forge init --template commerce<br />
        <span className="term-dim"># catalog.yml 생성됨</span>
      </div>
      <div className="guide-indent" style={{ marginTop: 8 }}>
        생성된 파일을 편집해 커스텀 도메인 카탈로그를 만든 뒤<br />
        Meta-Smelt에서 업로드하세요.
      </div>
    </div>
  )
}

function SmeltContent() {
  return (
    <div className="guide-content">
      <p className="guide-lead">
        블럭을 클릭해서 선택하세요.<br />
        의존 관계는 자동으로 해결됩니다.
      </p>

      <Divider />

      <div className="guide-subtitle">블럭 선택</div>
      <div className="guide-rows">
        <div className="guide-row"><span>클릭</span><span>블럭 선택 / 해제</span></div>
        <div className="guide-row"><span>✓ 주황</span><span>직접 선택한 블럭</span></div>
        <div className="guide-row"><span>⛓ 노랑</span><span>의존성으로 자동 추가</span></div>
        <div className="guide-row"><span>호버</span><span>기술 스펙 설명으로 전환</span></div>
      </div>

      <Divider />

      <div className="guide-subtitle">월드 탭 필터</div>
      <div className="guide-rows">
        <div className="guide-row"><span>🏪 파는 사람</span><span>상품·재고 관리</span></div>
        <div className="guide-row"><span>🛍️ 사는 사람</span><span>인증·탐색·구매</span></div>
        <div className="guide-row"><span>💰 돈이 흐름</span><span>결제·환불·정산</span></div>
        <div className="guide-row"><span>🚚 물건 이동</span><span>배송·반품 물류</span></div>
        <div className="guide-row"><span>⚙️ 관리</span><span>운영 도구</span></div>
        <div className="guide-row"><span>🔗 연결</span><span>외부 시스템 연동</span></div>
      </div>

      <Divider />

      <div className="guide-subtitle">AI 추천 뱃지</div>
      <div className="guide-rows">
        <div className="guide-row">
          <Badge color="emerald">AI 추천</Badge>
          <span>핵심 기능 — high confidence</span>
        </div>
        <div className="guide-row">
          <Badge color="amber">AI 제안</Badge>
          <span>있으면 좋은 기능 — medium</span>
        </div>
        <div className="guide-row">
          <Badge color="blue">AI 고려</Badge>
          <span>나중에 추가할 기능 — low</span>
        </div>
      </div>

      <Tip>intent.yml 생성 버튼으로 현재 선택을 파일로 내보낼 수 있습니다.</Tip>
    </div>
  )
}

function ShapeContent() {
  return (
    <div className="guide-content">
      <p className="guide-lead">
        선택한 블럭을 분석해 최적 아키텍처를 자동으로 결정합니다.
      </p>

      <Divider />

      <div className="guide-subtitle">3가지 뷰</div>
      <div className="guide-rows">
        <div className="guide-row-v">
          <strong>레이어 다이어그램</strong>
          <span>Client → Gateway → Services → DB 전체 구조를 한눈에</span>
        </div>
        <div className="guide-row-v">
          <strong>서비스 명세</strong>
          <span>감지된 마이크로서비스별 책임·기술스택·패턴</span>
        </div>
        <div className="guide-row-v">
          <strong>ADR 결정 로그</strong>
          <span>Architecture Decision Record — 왜 이 결정을 했는지 근거 기록</span>
        </div>
      </div>

      <Divider />

      <div className="guide-subtitle">자동 감지 로직</div>
      <div className="guide-rows">
        <div className="guide-row"><span>상품 블럭</span><span>→ Product Service</span></div>
        <div className="guide-row"><span>회원 블럭</span><span>→ User Service</span></div>
        <div className="guide-row"><span>주문+장바구니</span><span>→ Order Service</span></div>
        <div className="guide-row"><span>결제+PG</span><span>→ Payment Service</span></div>
        <div className="guide-row"><span>배송 블럭</span><span>→ Logistics Service</span></div>
      </div>

      <Tip>서비스가 4개 이상이면 MSA, 미만이면 모듈러 모놀리스로 자동 결정됩니다.</Tip>
    </div>
  )
}

function BuildContent() {
  return (
    <div className="guide-content">
      <p className="guide-lead">
        블럭별 REST API 엔드포인트가 자동으로 생성됩니다.
      </p>

      <Divider />

      <div className="guide-subtitle">메서드 색상 코드</div>
      <div className="guide-rows">
        <div className="guide-row"><Badge color="emerald">GET</Badge><span>리소스 조회</span></div>
        <div className="guide-row"><Badge color="orange">POST</Badge><span>리소스 생성</span></div>
        <div className="guide-row"><Badge color="blue">PUT</Badge><span>리소스 수정</span></div>
        <div className="guide-row"><Badge color="violet">DEL</Badge><span>리소스 삭제</span></div>
      </div>

      <Divider />

      <div className="guide-subtitle">사용법</div>
      <div className="guide-rows">
        <div className="guide-row"><span>엔드포인트 클릭</span><span>Request Body / Response 확장</span></div>
        <div className="guide-row"><span>서비스 헤더</span><span>감지된 마이크로서비스 구분</span></div>
      </div>

      <Tip>이 계약서를 기반으로 팀원과 API 협의 후 실제 개발을 시작하세요.</Tip>
    </div>
  )
}

function TemperContent() {
  return (
    <div className="guide-content">
      <p className="guide-lead">
        블럭별 Given-When-Then 테스트 시나리오를 자동 생성합니다.
      </p>

      <Divider />

      <div className="guide-subtitle">GWT 구조</div>
      <div className="gwt-guide">
        <div className="gwt-guide-row given"><span>Given</span><span>테스트 사전 조건</span></div>
        <div className="gwt-guide-row when"><span>When</span><span>실행할 액션</span></div>
        <div className="gwt-guide-row then"><span>Then</span><span>기대 결과</span></div>
      </div>

      <Divider />

      <div className="guide-subtitle">시나리오 유형</div>
      <div className="guide-rows">
        <div className="guide-row"><Badge color="emerald">Happy Path</Badge><span>정상 동작 확인</span></div>
        <div className="guide-row"><Badge color="amber">Edge Case</Badge><span>경계값·예외 상황</span></div>
        <div className="guide-row"><Badge color="violet">Concurrency</Badge><span>동시성·레이스 컨디션</span></div>
        <div className="guide-row" style={{ '--rb': '#fb7185', '--rbt': 'rgba(244,63,94,0.12)' }}>
          <span style={{ color: '#fb7185', background: 'rgba(244,63,94,0.12)', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>Security</span>
          <span>인증·금액검증·멱등성</span>
        </div>
      </div>

      <Tip>좌측 사이드바에서 블럭을 선택하면 해당 블럭의 시나리오만 표시됩니다.</Tip>
    </div>
  )
}

function InspectContent() {
  return (
    <div className="guide-content">
      <p className="guide-lead">
        보안·성능·운영·확장성 4가지 관점으로 구성을 검수합니다.
      </p>

      <Divider />

      <div className="guide-subtitle">4가지 관점</div>
      <div className="guide-rows">
        <div className="guide-row-v">
          <strong>🔐 Security</strong>
          <span>JWT 설정, 결제 위변조 방지, SQL Injection, CORS</span>
        </div>
        <div className="guide-row-v">
          <strong>⚡ Performance</strong>
          <span>N+1 쿼리, 캐시 전략, 페이지네이션, DB 인덱스</span>
        </div>
        <div className="guide-row-v">
          <strong>🔧 Operations</strong>
          <span>분산 추적, 구조화 로깅, 헬스체크, Graceful Shutdown</span>
        </div>
        <div className="guide-row-v">
          <strong>📈 Scalability</strong>
          <span>Stateless 아키텍처, Circuit Breaker, CDN, DB 레플리카</span>
        </div>
      </div>

      <Divider />

      <div className="guide-subtitle">심각도 등급</div>
      <div className="guide-rows">
        <div className="guide-row"><span style={{ color: '#ef4444' }}>🔴 Critical</span><span>즉시 수정 필요</span></div>
        <div className="guide-row"><span style={{ color: '#f97316' }}>🟠 High</span><span>출시 전 반드시 해결</span></div>
        <div className="guide-row"><span style={{ color: '#f59e0b' }}>🟡 Medium</span><span>안정화 단계에서 해결</span></div>
        <div className="guide-row"><span style={{ color: '#6366f1' }}>🔵 Info</span><span>장기적으로 고려</span></div>
      </div>

      <Tip>점수 링을 클릭하면 해당 관점의 세부 항목이 표시됩니다.</Tip>
    </div>
  )
}

// 섹션 id → content 매핑 (JSX를 함수 컴포넌트로 처리)
const SECTION_CONTENT = {
  overview:    OverviewContent,
  'meta-smelt': MetaSmeltContent,
  smelt:       SmeltContent,
  shape:       ShapeContent,
  build:       BuildContent,
  temper:      TemperContent,
  inspect:     InspectContent,
}

const SECTION_META = [
  { id: 'overview',    icon: '⚒️', label: '개요' },
  { id: 'meta-smelt',  icon: '✨', label: 'Meta-Smelt' },
  { id: 'smelt',       icon: '🔥', label: 'Smelt' },
  { id: 'shape',       icon: '🏛️', label: 'Shape' },
  { id: 'build',       icon: '⚒️', label: 'Build' },
  { id: 'temper',      icon: '💧', label: 'Temper' },
  { id: 'inspect',     icon: '🔍', label: 'Inspect' },
]

// ── Guide Panel ───────────────────────────────────────────
export default function GuidePanel({ open, onClose, currentPhase }) {
  const [activeSection, setActiveSection] = useState(currentPhase || 'overview')

  // 현재 phase가 바뀌면 해당 섹션으로 자동 이동
  useEffect(() => {
    if (currentPhase && open) setActiveSection(currentPhase)
  }, [currentPhase, open])

  const ActiveContent = SECTION_CONTENT[activeSection] || OverviewContent

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="guide-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            className="guide-panel"
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 34 }}
          >
            {/* Header */}
            <div className="guide-panel-header">
              <div className="guide-panel-title">
                <span className="guide-panel-icon">📖</span>
                <span>사용 가이드</span>
              </div>
              <button className="guide-close-btn" onClick={onClose}>✕</button>
            </div>

            {/* Section nav */}
            <div className="guide-nav">
              {SECTION_META.map(s => (
                <button
                  key={s.id}
                  className={`guide-nav-btn ${activeSection === s.id ? 'active' : ''}`}
                  onClick={() => setActiveSection(s.id)}
                >
                  <span className="gnb-icon">{s.icon}</span>
                  <span className="gnb-label">{s.label}</span>
                  {s.id === currentPhase && <span className="gnb-current" />}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="guide-panel-body">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSection}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="guide-section-header">
                    <span className="guide-section-icon">
                      {SECTION_META.find(s => s.id === activeSection)?.icon}
                    </span>
                    <span className="guide-section-title">
                      {SECTION_META.find(s => s.id === activeSection)?.label}
                    </span>
                    {activeSection === currentPhase && (
                      <span className="guide-current-badge">현재 단계</span>
                    )}
                  </div>
                  <ActiveContent />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
