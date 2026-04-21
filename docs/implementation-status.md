# Forge Protocol — 구현 현황 (Implementation Status)

> 최종 업데이트: 2026-04-10

---

## 전체 현황 요약

| 레이어 | 상태 | 비고 |
|--------|------|------|
| CLI (Node.js ESM) | ✅ 완료 | Phase 0~5 전체 구현, Rich UI |
| Web UI (React + Vite) | ✅ 완료 | Phase 0~5, localStorage 세션 |
| 코드 생성 연동 | 🔜 예정 | Web 출력물 → 실제 소스 생성 |
| npm 패키징 | 🔜 예정 | 개발 완성 후 진행 |

---

## CLI — 파일 구조

```
bin/forge.js              # 엔트리포인트 (인터랙티브 메뉴 + commander)
lib/
  core/
    project.js            # 공통 파일 로드 헬퍼
    ui.js                 # 리치 CLI UI 엔진 (phaseBar, dashboard 등)
  init.js                 # forge init
  meta-smelt.js           # forge meta-smelt
  smelt.js                # forge smelt
  shape.js                # forge shape
  build.js                # forge build
  temper.js               # forge temper
  inspect.js              # forge inspect
  assemble.js             # forge assemble
  assembler.js            # 조립 엔진
  status.js               # forge status
  catalog.js              # 카탈로그 로더
  dependency.js           # 의존성 재귀 해결 엔진
  domain-surveys.js       # 도메인별 맞춤 설문 정의
templates/
  commerce/catalog.yml    # 커머스 22개 블럭, 19개 의존성
```

---

## CLI — 커맨드별 상세

### `forge init`
- `.forge/` 디렉토리 구조만 생성 (catalog/, project/, generated/)
- `state.yml`: `{ phase: 'init' }`
- 다음 단계: `forge meta-smelt` 안내

### `forge meta-smelt` (Phase 0: 발굴)
- **Step 0**: 카탈로그 방식 선택
  - A) 빌트인 템플릿 (commerce) → `templates/commerce/catalog.yml` 즉시 복사 → 완료
  - B) AI 커스텀 생성 → 6단계 설문 → `meta-smelt-prompt.md` 생성
- 출력: `.forge/catalog/catalog.yml` (빌트인) 또는 `meta-smelt-prompt.md` (AI)
- `state.phase = 'meta-smelt'`

### `forge smelt` (Phase 1: 제련)
- `.forge/catalog/catalog.yml` 읽어 World별 블럭 체크박스 선택
- 의존성 재귀 해결 (`dependency.js`)
- 의사결정 사항, W0 준비물 정리
- World 완료마다 `smelt-draft.yml` 저장 (중단 후 재개 가능)
- 출력: `intent.yml`, `selected-blocks.yml`

### `forge shape` (Phase 2: 성형)
- 선택 블럭 `tech_desc` 분석 → 기술 스택/인프라 자동 감지
- 기술 스택 결정, ADR 생성
- 출력: `architecture.yml`, `architecture-prompt.md`

### `forge build` (Phase 3: 단조)
- 블럭별 API 엔드포인트 자동 추론
- RESTful 계약 명세 생성
- 출력: `contracts.yml`, `build-prompt.md`

### `forge temper` (Phase 4: 담금질)
- 블럭별 Given-When-Then 시나리오 생성
- Happy Path + Edge Case 포함
- 출력: `test-scenarios.yml`, `temper-prompt.md`

### `forge inspect` (Phase 5: 검수)
- 보안 / 성능 / 운영 / 확장성 4개 관점 자동 검수
- 블럭 `tech_desc` 기반 위험 항목 감지
- 출력: `forge-report.md`, `inspect-prompt.md`

### `forge assemble`
- 플랜 파일(md/yml) 파싱 → 블럭 자동 조립
- 출력: `roadmap.yml`, `intent.yml`

### `forge status`
- `renderDashboard()` 기반 리치 대시보드
- phaseBar + 진행도 + 파일 현황 + 다음 단계 안내

### 인터랙티브 메뉴
- 인자 없이 `forge` 실행 시 활성화
- header + phaseBar + progressBar + Phase 선택 목록
- 완료 Phase ✅, 현재 Phase ▶, 미완료 Phase 잠금

---

## Web UI — 파일 구조

```
web/
  src/
    App.jsx                     # 메인 앱 (~175줄)
    catalog.js                  # 빌트인 Commerce 카탈로그 (JS)
    constants.js                # PHASES 공유 상수
    generators.js               # Phase별 출력물 생성 엔진
    promptGenerator.js          # CLI 수준 고품질 프롬프트 생성 엔진 ★ NEW
    codeGenerators.js           # OpenAPI + Java 스켈레톤 코드 생성
    metaSmeltUtils.js           # Claude 프롬프트 빌더/파서
    parseCatalog.js             # YAML 파싱 + 검증
    GuidePanel.jsx              # Phase별 사용 가이드 패널
    phases/
      MetaSmeltPhase.jsx        # Phase 0
      SmeltPhase.jsx            # Phase 1
      ShapePhase.jsx            # Phase 2
      BuildPhase.jsx            # Phase 3 (3가지 코드 생성 모드) ★ 확장
      TemperPhase.jsx           # Phase 4 (프롬프트 복사 추가) ★ 확장
      InspectPhase.jsx          # Phase 5
    components/
      PhaseBar.jsx              # 상단 Phase 탐색 바
      PhaseNav.jsx              # 이전/다음 네비게이션
      AnimatedNumber.jsx        # 스프링 카운터
      OnboardingModal.jsx       # 첫 방문 AI 루프 안내
      OnboardingModal.css
    hooks/
      usePersistedState.js      # localStorage 세션 저장/복원
      useClaudeBridge.js        # Bridge 서버 연결 Hook (SSE) ★ NEW
  server/
    bridge.js                   # Claude Code + API 프록시 서버 ★ NEW
```

---

## Web UI — Phase별 구현 상세

### MetaSmeltPhase (Phase 0)
3-Step 위저드:
1. 카탈로그 선택 — builtin-commerce / YAML 업로드 / AI 생성
2. 요구사항 입력 → Claude 프롬프트 자동 생성 + 복사
3. Claude 응답 붙여넣기 → 블럭 추천 파싱 (400ms 디바운스)

### SmeltPhase (Phase 1)
- World Tabs → Bundle Sections → Block Cards
- AI 추천 이유 + 신뢰도 배지 (Meta-Smelt 연동)
- 의존성 자동 해결 (autoAdded 시각화)
- SelectionPanel: 우측 슬라이드 (선택 현황 + 공수)

### ShapePhase (Phase 2)
- World = Bounded Context 그룹핑
- 기술 스택 + 인프라 카드 자동 감지
- ADR 결정사항 + Claude 프롬프트 복사

### BuildPhase (Phase 3) ★ 확장
- 서비스별 API 엔드포인트 추론
- EndpointRow: Method, Path, 설명
- 코드 생성 3가지 모드:
  - 📋 Claude 프롬프트 복사 (항상 가능, 서버 불필요)
  - 🚀 Claude Code 실행 (Bridge 서버 + Claude Code CLI)
  - 🔑 Claude API (Bridge 서버 + API 키, 모델 선택 가능)
- SSE 실시간 진행률 바
- Bridge 미연결 시 안내 메시지 표시

### TemperPhase (Phase 4) ★ 확장
- 블럭별 GWT 테스트 카드
- Happy Path / Edge Case 분류
- 📋 Claude 테스트 프롬프트 복사 버튼 추가

### InspectPhase (Phase 5)
- ScoreRing: 보안/성능/운영/확장성 점수 시각화
- FindingItem: 위험 항목 목록 (우선순위별)
- 종합 점수 계산

---

## 템플릿 현황

| 템플릿 | catalog.yml | 블럭 수 | 의존성 | 상태 |
|--------|-------------|---------|--------|------|
| commerce | ✅ | 22 | 19 | 완료 |

---

## .forge/ 디렉토리 구조

```
.forge/
├── catalog/
│   └── catalog.yml           # meta-smelt에서 복사/생성
├── project/
│   ├── state.yml             # 현재 Phase + 메타정보
│   ├── meta-smelt-input.yml  # AI 커스텀 설문 원본 (AI 모드만)
│   ├── meta-smelt-prompt.md  # Claude 전달용 프롬프트 (AI 모드만)
│   ├── smelt-draft.yml       # smelt 중간 저장 (완료 시 자동 삭제)
│   ├── intent.yml            # Phase 1 결과
│   ├── selected-blocks.yml
│   ├── architecture.yml      # Phase 2 결과
│   ├── architecture-prompt.md
│   ├── contracts.yml         # Phase 3 결과
│   ├── build-prompt.md
│   ├── test-scenarios.yml    # Phase 4 결과
│   ├── temper-prompt.md
│   ├── forge-report.md       # Phase 5 결과
│   └── inspect-prompt.md
└── generated/
    ├── src/
    └── test/
```
