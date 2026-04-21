# Forge Protocol Web UI — 아키텍처 문서

> 최종 업데이트: 2026-04-17
> 경로: `web/`

---

## 개요

CLI와 동일한 6 Phase 프로세스를 브라우저에서 실행하는 시각형 모드.
CLI가 파일 출력 중심이라면, Web UI는 3가지 코드 생성 방식을 제공한다:

1. **프롬프트 복사** — 고품질 프롬프트를 클립보드에 복사 → Claude에 붙여넣기 (서버 불필요)
2. **Claude Code 실행** — Bridge 서버 경유 → 로컬 Claude Code CLI 호출 (구독자용)
3. **Claude API 호출** — Bridge 서버 경유 → Anthropic API 직접 호출 (API 키 과금)

---

## 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| 번들러 | Vite 5.4 | ESM 네이티브, 빠른 HMR |
| UI 라이브러리 | React 18.3 | 상태 기반 Phase 전환 |
| 애니메이션 | Framer Motion 12 | Phase 전환 슬라이드, 스프링 카운터 |
| 아이콘 | lucide-react | 일관된 아이콘셋 |
| YAML 파싱 | js-yaml | catalog.yml 클라이언트 파싱 |

---

## 파일별 역할

### `App.jsx` (~175줄)
메인 진입점. Phase 상태 관리 + 각 Phase 컴포넌트 렌더링.
이전의 단일 1647줄 파일을 phases/, components/, hooks/로 분리.

```
컴포넌트 계층:
App
├── PhaseBar            — 상단 Phase 탐색 바 (잠금/해금 제어)
├── AnimatePresence     — Phase 전환 슬라이드 애니메이션
│   ├── MetaSmeltPhase  — Phase 0: 카탈로그 선택 + 요구사항 분석
│   ├── SmeltPhase      — Phase 1: 블럭 선택 + 의존성 해결
│   ├── ShapePhase      — Phase 2: 아키텍처 결정
│   ├── BuildPhase      — Phase 3: API 계약 추론
│   ├── TemperPhase     — Phase 4: 테스트 시나리오 생성
│   └── InspectPhase    — Phase 5: 멀티 관점 검수
├── GuidePanel          — 우측 슬라이드 가이드 패널
└── OnboardingModal     — 첫 방문 AI 루프 안내 (3-step)
```

### 핵심 상태 (App.jsx)
```js
phase          // 현재 활성 Phase ID
maxUnlocked    // 해금된 최대 Phase 인덱스 (순서 강제)
activeCatalog  // 사용 중인 카탈로그 객체 (BUILTIN_CATALOG | custom)
metaResult     // Meta-Smelt 결과 { selectedIds, aiReasons, confidence, summary }
selectedIds    // Smelt에서 선택된 블럭 ID Set
```

### `phases/` — Phase 컴포넌트

| 파일 | 역할 |
|------|------|
| `MetaSmeltPhase.jsx` | 카탈로그 선택(3가지 모드) + 요구사항 입력 + Claude 응답 파싱 |
| `SmeltPhase.jsx` | WorldTabs + BundleSection + BlockCard + SelectionPanel |
| `ShapePhase.jsx` | 서비스 그룹 + 기술 스택 카드 + ADR |
| `BuildPhase.jsx` | API 엔드포인트 추론 + 3가지 코드 생성 모드 (프롬프트 복사 / Claude Code / API) |
| `TemperPhase.jsx` | GWT 테스트 카드 + 프롬프트 복사 |
| `InspectPhase.jsx` | ScoreRing + FindingItem |

### `components/` — 공통 컴포넌트

| 파일 | 역할 |
|------|------|
| `PhaseBar.jsx` | 상단 Phase 탐색 바, 잠금/해금 시각화 |
| `PhaseNav.jsx` | 이전/다음 Phase 네비게이션 버튼 |
| `AnimatedNumber.jsx` | Framer Motion 스프링 카운터 |
| `OnboardingModal.jsx` | 첫 방문 AI 루프 설명 모달 (3-step dot nav) |

### `hooks/usePersistedState.js`
localStorage 기반 세션 저장/복원.
- `loadSession(BUILTIN_CATALOG, CATALOGS)` — 앱 시작 시 저장된 세션 복원
- `saveSession(state)` — 상태 변경 시 자동 직렬화 저장
- `clearSession()` — 리셋 시 삭제
- 빌트인 카탈로그(commerce)는 domain 문자열만 저장 후 재구성. 커스텀은 전체 직렬화.

### `hooks/useClaudeBridge.js` ★ NEW
Bridge 서버(localhost:3001) 연결 Hook.
- `checkBridge()` — 서버 상태 확인 (Claude Code 설치 여부 포함)
- `useClaudeBridge()` — SSE 스트리밍으로 코드 생성 (상태/진행률/출력/취소)
- mode: `'claude-code'` (CLI 호출) | `'api'` (Anthropic API 프록시)

### `promptGenerator.js` ★ NEW
CLI의 `build-prompt.md`와 동일한 수준의 고품질 프롬프트 생성.
- `generateBuildPrompt(allSelected, catalogData)` — Build용 (기술 스택 + API 계약 + 블럭 명세 + 생성 규칙)
- `generateTemperPrompt(allSelected, catalogData)` — Temper용 (JUnit5 테스트 생성)

### `constants.js`
```js
export const PHASES = [
  { id: 'meta-smelt', label: 'Meta-Smelt', ko: '발굴', icon: '✨', desc: '요구사항 분석' },
  { id: 'smelt',      label: 'Smelt',      ko: '제련', icon: '🔥', desc: '블럭 선택' },
  { id: 'shape',      label: 'Shape',      ko: '성형', icon: '🏛️', desc: '아키텍처' },
  { id: 'build',      label: 'Build',      ko: '단조', icon: '⚒️', desc: 'API 계약' },
  { id: 'temper',     label: 'Temper',     ko: '담금질',icon: '💧', desc: '테스트' },
  { id: 'inspect',    label: 'Inspect',    ko: '검수', icon: '🔍', desc: '멀티 리뷰' },
]
```

### `catalog.js`
빌트인 Commerce 카탈로그 (JS 객체). `web/`에서만 사용 (CLI는 `templates/commerce/catalog.yml` 사용).
`worlds`, `bundles`, `blocks`, `blockMap`, `bundleMap`, `resolveDeps`, `BUILTIN_CATALOG` export.

### `generators.js`
각 Phase의 콘텐츠를 자동 생성하는 순수 함수 모음.
`catalogData.blockMap`의 `tech_desc` 키워드 분석 → 기술/패턴/인프라 추론.

```js
generateArchitecture(allSelected, catalogData)  → ShapePhase용
generateContracts(allSelected, catalogData)     → BuildPhase용
generateTestScenarios(allSelected, catalogData) → TemperPhase용
generateInspectReport(allSelected, catalogData) → InspectPhase용
```

### `parseCatalog.js`
YAML 텍스트 → JS 카탈로그 객체 변환 + 검증.

```js
parseCatalogYml(yml: string) → catalog object
validateCatalog(catalog) → string[] (오류 목록)
```

### `metaSmeltUtils.js`
```js
buildMetaSmeltPrompt(catalog, userInput)     → 블럭 추천 요청 프롬프트
buildCatalogGenerationPrompt(domainDesc)     → catalog.yml 생성 요청 프롬프트
parseClaudeResponse(text, catalog)           → { selectedIds, aiReasons, confidence, summary }
extractYamlFromResponse(text)                → 응답에서 YAML 블럭 추출
```

---

## 핵심 상태 흐름

```
MetaSmelt 완료
  → activeCatalog (선택된 카탈로그)
  → metaResult { selectedIds, aiReasons, confidence, summary }
  → Smelt로 selectedIds pre-select

Smelt에서 블럭 선택
  → selectedIds (Set<string>)
  → activeCatalog.resolveDeps(selectedIds) → { allSelected, autoAdded, totalDays, reasons }
  → allSelected가 Shape/Build/Temper/Inspect로 전파
```

---

## Phase 잠금 제어

```
maxUnlocked: number  (초기값 0 = meta-smelt만 열림)

Phase 진행 시: setMaxUnlocked(max(prev, nextIdx))
뒤로 이동:    자유롭게 이동 가능 (maxUnlocked 이하)
앞으로 이동:  maxUnlocked 초과 시 잠금 (locked 클래스)
```

---

## MetaSmelt 카탈로그 모드 3가지

| 모드 | ID | 설명 |
|------|-----|------|
| 빌트인 커머스 | `builtin` | 내장 Commerce 카탈로그 즉시 사용 |
| 파일 업로드 | `upload` | catalog.yml 업로드 또는 붙여넣기 → 실시간 파싱 |
| AI 생성 | `ai-generate` | 도메인 설명 → 생성 프롬프트 → Claude 응답 붙여넣기 → 자동 파싱 |

---

## 빌드 및 실행

### 기본 (프롬프트 복사 모드만)

```bash
cd web
npm install
npm run dev      # 개발 서버 (localhost:5173)
npm run build    # dist/ 빌드
npm run preview  # 빌드 결과 미리보기
```

### Bridge 서버 포함 (Claude Code / API 모드)

```bash
# 터미널 1: Web UI
cd web && npm run dev

# 터미널 2: Bridge 서버
npm run bridge -- --project-dir ../my-project
# → http://localhost:3001 (Claude Code CLI + API 프록시)
```

Bridge 서버 옵션:
- `--port 3001` — 서버 포트 (기본 3001)
- `--project-dir /path` — 코드 생성 대상 프로젝트 디렉토리

---

## 코드 생성 모드 비교

| 모드 | 버튼 | 서버 필요 | 비용 | 코드 품질 |
|------|------|----------|------|----------|
| **프롬프트 복사** | 📋 Claude 프롬프트 복사 | 없음 | 무료 (수동) | CLI(my-shop) 수준 |
| **Claude Code** | 🚀 Claude Code 실행 | Bridge 서버 | 월 $20 정액 | CLI 수준 |
| **Claude API** | 🔑 Claude API | Bridge 서버 | ~$2-5/프로젝트 | 모델 의존 |
| **스켈레톤 ZIP** | 📦 스켈레톤 코드 ZIP | 없음 | 무료 | 기본 CRUD만 |

### Bridge 서버 아키텍처 (`web/server/bridge.js`)

```
Web UI (localhost:5173)
  │
  ├─ POST /api/generate { mode: 'claude-code', prompt }
  │   → spawn('claude', ['-p']) → SSE 스트리밍
  │
  └─ POST /api/generate { mode: 'api', apiKey, model, prompt }
      → https.request('api.anthropic.com') → SSE 스트리밍
```

- GET `/api/status` — 서버 상태 + Claude Code 설치 여부 확인
- POST `/api/generate` — SSE로 실시간 코드 생성 스트리밍
- API 키는 브라우저 localStorage에만 저장, 서버 미저장
