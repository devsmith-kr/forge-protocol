# lib/ — 코드 작업 지침

## 각 파일 역할

### 핵심 유틸 (core/)

| 파일 | 역할 |
|------|------|
| `core/project.js` | 공통 파일 로드 헬퍼 — `loadState`, `loadSmeltResult`, `loadArchitecture`, `loadContracts`, `loadTestScenarios`, `printDone` |
| `core/ui.js` | 리치 CLI UI 엔진 — `phaseBar`, `progressBar`, `header`, `commandHeader`, `box`, `renderDashboard`, `renderPhaseTable`, `renderFileStatus`, `getPhaseStatus`, `getNextPhase` |

### 커맨드별

| 파일 | 역할 |
|------|------|
| `init.js` | `forge init` — `.forge/` 디렉토리 구조만 생성 (catalog 없음), state.yml 초기화. 카탈로그 설정은 meta-smelt에서 수행 |
| `meta-smelt.js` | `forge meta-smelt` — **Step 0**: 카탈로그 방식 선택 (빌트인 즉시 복사 or AI 커스텀 6단계 설문 → 프롬프트 생성) |
| `smelt.js` | `forge smelt` — World별 블럭 체크박스 → 의존성 해결 → 결정 질문 → `intent.yml` 생성. World 완료마다 draft 저장 (중단 후 재개 가능) |
| `shape.js` | `forge shape` — 블럭 tech_desc 분석 → 기술 스택/인프라 결정 → `architecture.yml` + `architecture-prompt.md` |
| `build.js` | `forge build` — 블럭별 API 엔드포인트 자동 추론 → `contracts.yml` + `build-prompt.md` |
| `temper.js` | `forge temper` — 블럭별 Given-When-Then 시나리오 → `test-scenarios.yml` + `temper-prompt.md` |
| `inspect.js` | `forge inspect` — 보안/성능/운영/확장성 4관점 자동 감지 → `forge-report.md` + `inspect-prompt.md` |
| `assemble.js` | `forge assemble` — 플랜 파일(md/yml) 파싱 → 블럭 자동 조립 → `roadmap.yml` + `intent.yml` |
| `assembler.js` | assemble 조립 엔진 |
| `status.js` | `forge status` — `renderDashboard()` 기반 리치 대시보드 출력 |
| `catalog.js` | `loadTemplate()`, `loadProjectCatalog()`, `groupBlocksByWorld()`, `buildBlockMap()` |
| `dependency.js` | `resolveAll(selectedIds, catalog)` — 의존성 재귀 해결, 자동추가, 영향블럭, W0 준비물 일괄 반환 |
| `decisions.js` | `promptDecisions(decisions, blockMap)` + `formatDecisionAnswer(d, a)` — cascade 결정 대화형 질문을 smelt.js에서 분리, prompt/log 주입으로 단위 테스트 가능 |
| `domain-surveys.js` | `getSurveyForDomain(domain)` — 도메인별 deepDive/suggestedRoles/constraints 반환 |

---

## 전체 흐름

```
forge init
  → .forge/{catalog/, project/, generated/} 생성
  → state.yml: { phase: 'init' }

forge meta-smelt
  → Step 0: 빌트인(commerce) 선택 시 → templates/commerce/catalog.yml 복사 → 완료
  → Step 0: AI 커스텀 선택 시 → 6단계 설문 → meta-smelt-prompt.md 생성 → 사용자가 catalog.yml 저장
  → state.phase = 'meta-smelt'

forge smelt
  → .forge/catalog/catalog.yml 읽기
  → World별 블럭 선택 → 의존성 해결 → intent.yml + selected-blocks.yml
  → state.phase = 'smelt'
```

---

## 의존성 해결 엔진 (dependency.js)

- `resolveRequired(blockId, deps)` — 재귀 직접+간접 의존성, 순환 방지
- `resolveAffected(blockId, deps)` — 영향받는 블럭 역방향 탐색
- `resolveAll(selectedIds, catalog)` → `{ allBlocks, autoAdded, affected, decisions, prerequisites }`
- `collectDecisions(selectedIds, catalog)` — cascade 질문 수집

## Meta-Smelt AI 커스텀 설문 플로우

Step 1 아이디어 → Step 2 업종 → Step 3 사업구조(도메인 심층질문) → Step 4 역할+워크플로우 → Step 5 핵심기능+규모 → Step 6 제약사항 → `meta-smelt-prompt.md` 생성

## 쿠폰 의존성 예시 (설계 핵심 사례)

쿠폰 블럭 선택 시: 결제(affects, 할인차감) + 환불(affects, 쿠폰복원정책) + 정산(affects, 비용부담주체) 자동 감지 → 사업적 결정 질문 2개 자동 생성
