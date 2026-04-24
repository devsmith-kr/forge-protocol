# 변경 이력 (Changelog)

이 프로젝트의 모든 주요 변경사항을 기록합니다.

형식은 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)를 따르며,
[유의적 버전 관리(Semantic Versioning)](https://semver.org/spec/v2.0.0.html)를 준수합니다.

## [0.4.0] - 2026-04-23

실사용(채용공고 통합 검색 서비스 종단 흐름) 에서 발견된 생성 품질 결함을 제거하고,
도메인 불가지론·검증 루프·두 번째 빌트인 템플릿을 도입. 본격적인 OSS 공개 직전의
품질 바닥 다지기.

### 추가

- **`forge verify` 명령** (Phase 6) — `.forge/generated/backend/` 의 Java 코드가 실제
  `compileJava` + `test` 를 통과하는지 확인. 결과는 `.forge/verify-report.json` 에
  구조화 기록, 실패 시 상위 10건 콘솔 출력 + exit code 1
- **Job Aggregator 빌트인 템플릿** (`templates/job-aggregator/catalog.yml`) — 채용공고
  통합 검색 도메인 17개 블럭. Commerce 외 두 번째 공식 템플릿으로, CLI meta-smelt
  선택지와 Web UI MetaSmeltPhase 카드에 편입
- **`shared/api-inference.js`** — 블럭 id → REST 경로·엔드포인트 추론 공용 모듈
  (CLI/Web 단일 소스). `pluralize` 라이브러리로 영어 복수형 정확화
- **`shared/concerns.js`** — 도메인 관심사 태그 시스템 (payment, auth, concurrency,
  crawling, search, realtime, file-upload, notification, pii). Phase 2/4/5 프롬프트를
  선택 블럭의 concerns 합집합에 맞춰 조건부 조립
- **`shared/architecture-style.js`** — `pickArchitectureStyle` 가드레일. 팀 규모·
  총 공수·블럭/서비스 수 기반으로 modular-monolith vs MSA 자동 판단
- **`shared/scenario-patterns.js`** — 테스트 시나리오 생성 엔진 (11 패턴 룰 +
  3 concerns 룰). 블럭 id·tech_desc 키워드 매칭으로 도메인 고유 시나리오 생성,
  과다 생성은 6개로 cap
- **카탈로그 스키마 강화** — `api_style` (resource/query/internal), `concerns` 배열,
  `icon` 필드. 참조 무결성(bundles.world_id, blocks.bundle_id, dependencies.source/target)
  을 zod `superRefine` 으로 검증, 실패 시 한국어 메시지
- **`scripts/verify-p0.mjs`** — 생성 품질 회귀 스모크 테스트 (19개 체크)

### 변경

- **API 계약 생성기 재작성** — 블럭 id 에 `+ "s"` 로 단순 복수화하던 로직을
  `pluralize` 라이브러리로 교체. `saved-jobs`, `search-history`, `product-category`
  같은 영어 불규칙 복수형 올바르게 처리. `api_style: internal` 블럭
  (normalizer / indexer / crawler 등) 은 REST 엔드포인트에서 자동 제외
- **Phase 2/4/5 프롬프트에서 결제 하드코딩 제거** — "결제/인증/동시성 처리는 반드시…"
  와 "결제 테스트는 PG사 웹훅 Mock 서버 포함" 같은 무조건적 지시를 제거.
  선택된 블럭의 concerns 태그에 해당하는 섹션만 삽입 (커머스는 기존 동작 유지)
- **아키텍처 스타일 자동 추천 가드레일** — 58일/1인 프로젝트에도 MSA 가
  추천되던 결함 해결. 2인 이하 + 200일 미만은 무조건 modular-monolith, 5인+ 또는
  40블럭+ 만 MSA. ADR-000 에 `transition_triggers` 자동 기록
- **테스트 시나리오 생성 데이터 구동화** — 기존 하드코딩된 `if (id.includes('payment'))`
  사슬을 `PATTERN_RULES` 테이블로 교체. 채용·컨텐츠 등 비커머스 도메인에도 적용
- **`priority` 필드 enum 제한** — `required | optional` 만 허용 (오탈자
  "mandatory" 거부)
- **`validateYaml` 한국어 에러** — zod 영문 메시지를 한국어로 번역 (`Unrecognized
  key(s)` → `알 수 없는 필드`), `strict=true` 옵션으로 실패 시 예외 throw
- **Web UI 다중 빌트인 템플릿 지원** — `BUILTIN_CATALOG` 단일 변수 → `BUILTIN_TEMPLATES`
  배열 + `getBuiltinCatalog(id)`. Vite `?raw` import 로 YAML 런타임 파싱
- **`package.json` `files`** — `templates/commerce/` → `templates/` 전체 포함
  (신규 템플릿 자동 배포)

### 수정

- **`DuplicateDetector` 블로킹 로직 결함** (실사용 검수에서 발견) — 기존 로직이
  `findByClusterId(-1)` 로 무조건 빈 결과를 반환해 중복 제거가 동작하지 않던
  부분 수정. (검수 보고서 `forge-report-20260423.md` P0-2.1 항목)
- **CI node 매트릭스에 Windows/macOS 추가** (테스트 잡)
- **Commerce 카탈로그 21블럭에 `api_style` + `concerns` 어노테이션** 일괄 부여

### 내부

- 테스트 89개 추가 (api-inference 19, concerns 11, architecture-style 8,
  schemas-strict 10, templates 10, scenario-patterns 12, verify 6,
  기존 업데이트 13). 전체 232개 통과
- `lib/core/ui.js` `PHASES` 에 verify 추가, `STATE_ORDER` 연동

## [0.3.0] - 2026-04-24

첫 npm 공개 릴리스. CLI 코드 생성(`forge emit`)과 CLI/Web 공용 생성기 모듈을 도입했습니다.

### 추가

- **`forge emit` CLI 명령** — `contracts.yml` (+ 선택적 `test-scenarios.yml`)을 읽어
  Spring Boot 백엔드 스켈레톤과 JUnit5 테스트 코드를 `.forge/generated/backend/` 에 직접 생성
  - `--target <backend|tests|all>` — 생성 범위 선택
  - `--build <gradle|maven>` — 빌드 도구 선택 (기본 gradle)
  - Web UI 다운로드 ZIP과 동일한 출력
- **`shared/` 공용 생성기 모듈** — CLI(`lib/emit`)와 Web UI(`web/src/codeGenerators.js`)가
  동일한 OpenAPI / Java Controller / Service / Entity / Test 생성기를 공유 (single source of truth)
- **i18n 인프라** — Web UI 다국어 메시지 키 분리 (한국어 기본, 영어 추가 준비)
- **Storage Guard** — `localStorage` 손상/용량 초과 방어 로직
- **`promptGenerator.js`** — Web UI Phase 2~5에서 CLI 수준 고품질 Claude 프롬프트
  자동 생성 + 클립보드 복사
- **릴리스 CI** (`.github/workflows/release.yml`) — `v*` 태그 푸시 시 lint/test/build 검증 후
  `npm publish --provenance` 자동 실행 + GitHub Release 생성
- **`lib/decisions.js`** — cascade 결정 대화 로직을 `smelt.js`에서 분리, 단위 테스트 가능
- **`lib/core/errors.js`** — `ForgeError` + 통합 에러 출력기 (`logError`)

### 변경

- **Phase 3 명령어 rename**: `forge build` → `forge forge` — Phase 이름 "Forge (단조)"와
  실제 코드를 만들어내는 의지를 명령어에 일치. 대장간 은유(제련→성형→단조→담금질) 일관성 유지.
  구현 파일명(`lib/build.js`)은 그대로, 사용자 노출 명령어와 Phase 라벨만 변경.
- `bin/forge.js` — `ForgeError` 친화 wrap 적용, 모든 명령어가 일관된 에러 표시
- `lib/core/` 디렉토리로 공통 유틸 통합 (`project.js`, `ui.js`, `errors.js`, `version.js`)
- `package.json` `files` 필드에 `lib/`, `shared/`, `CHANGELOG.md` 포함 — npm 패키지에
  `forge emit` 런타임 의존성 누락 방지
- README — `forge emit` 명령 및 `shared/` 모듈 설명 추가
- SECURITY.md — 공급망 보안 강화 (npm provenance, SLSA 목표, 커뮤니티 템플릿 검증 가이드)

### 수정

- 카탈로그 블럭 수 표기 정정: Commerce 22개 → **21개** (실제 `templates/commerce/catalog.yml` 기준)
- `.claude/commands/` 슬래시 커맨드 — `forge emit` CLI 대안 안내 추가, Phase 탐지 규칙에
  `.forge/generated/` 코드 산출물 감지 추가

## [0.2.0] - 2026-04-15

### 추가

- Zod 기반 스키마 검증 (`lib/core/schema.js`)
- 원자적 파일 쓰기 (`lib/core/fs.js`) — 쓰기 중 크래시 시 데이터 손실 방지
- Error Boundary (`web/src/components/ErrorBoundary.jsx`) — UI 크래시 복구
- 접근성 개선 — ARIA 레이블, 키보드 네비게이션
- Vitest + ESLint + Prettier 코드 품질 인프라
- CI 워크플로우 (`.github/workflows/ci.yml`)

### 제거

- 레거시 코드 정리 (미사용 import, 데드 코드)

## [0.1.0] - 2026-04-09

### 추가

#### CLI
- `forge init` — 템플릿 선택이 포함된 프로젝트 초기화
- `forge meta-smelt` — 도메인별 심층 질문, 워크플로우 매핑, 제약 분석이 포함된 6단계 적응형 설문; AI 프롬프트 생성
- `forge smelt` — 의존성 해결, 의사결정 포인트, W0 준비물이 포함된 인터랙티브 블럭 선택; `intent.yml` 출력
- `forge shape` — 블럭 특성 자동 감지 및 기술 스택 결정; `architecture.yml` + `architecture-prompt.md` 출력
- `forge build` — 아키텍처 기반 API 계약 추론; `contracts.yml` + `build-prompt.md` 출력
- `forge temper` — 블럭별 Given-When-Then 테스트 시나리오 생성; `test-scenarios.yml` + `temper-prompt.md` 출력
- `forge inspect` — 멀티 관점 검수 (보안, 성능, 운영, 확장성); `forge-report.md` + `inspect-prompt.md` 출력
- `forge assemble` — 플랜 파일(md/yml) → 블럭 자동 조립; `roadmap.yml` + `intent.yml` 출력
- `forge status` — 프로젝트 현황 대시보드
- `chalk`, `ora` 기반 리치 CLI UI
- 재귀적 의존성 해결 엔진

#### Web UI
- Phase 0~5 전체 UI (MetaSmelt → Smelt → Shape → Build → Temper → Inspect)
- Phase 잠금/해금 제어 (순서 강제, 뒤로는 자유)
- MetaSmelt: 3단계 위저드 (카탈로그 선택 → 요구사항 입력 → Claude 응답 파싱)
- 3가지 카탈로그 모드: 빌트인, YAML 업로드, AI 생성
- Smelt: AI 추천 이유, 의존성 시각화, SelectionPanel
- Shape/Build/Temper/Inspect: generators.js 기반 자동 생성 + Claude 프롬프트 복사
- GuidePanel: Phase별 사용 가이드 슬라이드 패널
- Framer Motion Phase 전환 애니메이션 + 스프링 카운터
- 코드 생성: OpenAPI 3.1 YAML, Spring Boot 스켈레톤, JUnit5 테스트 클래스
- 전체 프로젝트 ZIP 다운로드

#### 템플릿
- **Commerce**: 21개 블럭, 19개 의존성, 6개 World (커머스 플랫폼)

#### 문서
- 프로젝트 상세 스펙 (`docs/spec.md`)
- 구현 현황 (`docs/implementation-status.md`)
- Web UI 아키텍처 (`docs/web-ui-architecture.md`)
- 코드 생성 계획 (`docs/code-generation-plan.md`)

[0.3.0]: https://github.com/devsmith-kr/forge-protocol/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/devsmith-kr/forge-protocol/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/devsmith-kr/forge-protocol/releases/tag/v0.1.0
