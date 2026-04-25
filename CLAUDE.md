# Forge Protocol — 프로젝트 지침

## 프로젝트 정체

**Forge Protocol** — "바이브코딩 2.0" AI-Human 협업 개발 프로토콜.
한 줄 정의: "바이브(감각)에서 시작하되, 설계(구조)로 승격시키고, 검증(증거)으로 마무리하는 AI 협업 개발 프로토콜"

기존 AI 코딩 도구(Cursor, Copilot, Bolt)는 전부 "구현"에서 시작. Forge는 "설계를 강제하는 도구" — 이것이 빈 공간.
목표: 세계적 오픈소스 표준.

---

## 전체 흐름

```
forge init → forge meta-smelt → forge smelt → forge shape → forge forge → forge temper → forge inspect → forge verify
```

## 7단계 프로세스

| Phase | 이름 | 하는 일 | 출력물 |
|-------|------|---------|--------|
| 0 | **Meta-Smelt** (발굴) | 카탈로그 확정 — 빌트인 선택 or AI로 커스텀 생성 | .forge/catalog/catalog.yml |
| 1 | **Smelt** (제련) | 블럭 선택, 의존성 해결, 의도 추출 | intent.yml, selected-blocks.yml |
| 2 | **Shape** (성형) | 아키텍처 결정, ADR 기록 (team_size · 공수 기반 가드레일) | architecture.yml |
| 3 | **Forge** (단조) | API 계약 우선 정의 후 코드 생성 (api_style: resource/query/internal) | contracts.yml, src/ |
| 4 | **Temper** (담금질) | Given-When-Then 테스트 생성 (키워드·concerns 기반 시나리오) | test/ |
| 5 | **Inspect** (검수) | 보안/성능/운영/확장성 멀티 리뷰 (도메인 concerns 조건부) | forge-report.md |
| 6 | **Verify** (검증) | emit 결과물 컴파일·테스트 통과 여부 확인 | verify-report.json |

> **Meta-Smelt 역할**: 빌트인 템플릿(commerce)을 선택하거나, 내 도메인을 설명해 Claude가 catalog.yml을 AI로 생성한다. Smelt 이전의 필수 준비 단계.
>
> AI 모드는 두 가지로 분기된다 (CLI/Web 동일):
> - **Quick** (30초) — 자유 입력 한 번. AI가 누락 정보를 도메인 지식으로 보완.
> - **Deep** (5분) — 6단계 정밀 설문 (업종·사업구조·역할·핵심기능·규모·제약사항).

줌 레벨: World → Bundle → Block → TechSpec. 어떤 순간에도 사용자 앞에 5개 이하 선택지.

---

## CLI 현황 (v0.4.0) — Node.js ESM, commander/inquirer/chalk/js-yaml/ora/zod/pluralize

### 파일 구조
```
bin/forge.js              # 엔트리포인트 (인터랙티브 메뉴 + commander)
lib/
  core/
    project.js            # 공통 파일 로드 헬퍼 (loadState, loadSmeltResult 등)
    ui.js                 # 리치 CLI UI 엔진 (phaseBar, dashboard, commandHeader 등)
    errors.js             # 표준 에러/예외 클래스
    version.js            # CLI 버전 상수
  init.js                 # forge init — .forge/ 디렉토리 구조만 생성
  meta-smelt.js           # forge meta-smelt — 카탈로그 확정 (빌트인 commerce/job-aggregator/AI)
  smelt.js                # forge smelt — 대화형 블럭 선택 (draft 저장/복원)
  shape.js                # forge shape — 아키텍처 결정 (team_size + 공수 가드레일)
  build.js                # forge forge — API 계약 추론 (api_style 분기, 파일명은 build.js)
  temper.js               # forge temper — GWT 시나리오 생성 (scenario-patterns 위임)
  inspect.js              # forge inspect — 멀티 관점 검수 (concerns 조건부)
  verify.js               # forge verify — emit 결과물 컴파일·테스트 검증 (Phase 6)
  emit.js                 # forge emit — contracts/tests → 실제 파일 기록 (--layout single|multi-module)
  emit/generators.js      # CLI emit용 내부 생성기 래퍼
  emit/multi-emit.js      # forge emit --layout multi-module — buildMultiModuleFiles 의 fs 래퍼
  assemble.js             # forge assemble — 플랜 → 블럭 자동 조립
  assembler.js            # 조립 엔진
  status.js               # forge status — 리치 대시보드
  catalog.js              # 카탈로그 로더
  dependency.js           # 의존성 재귀 해결 엔진
  domain-surveys.js       # 도메인별 맞춤 설문 정의
  decisions.js            # Phase별 결정 로직(Shape/Build/Temper/Inspect 공용)
  schemas.js              # zod 스키마(intent/contracts/scenarios 등)
  constants.js            # CLI 전역 상수
shared/                   # CLI/Web 공용 모듈
  api-inference.js        # 블럭 → REST 엔드포인트 (pluralize + api_style) [P0-1]
  concerns.js             # 도메인 관심사 태그 → 프롬프트 조건부 섹션 [P0-2]
  architecture-style.js   # pickArchitectureStyle 가드레일 [P0-3]
  scenario-patterns.js    # 테스트 시나리오 패턴 테이블 (11 규칙) [P1-1]
  openapi.js              # OpenAPI 3.1 YAML 생성
  java-api.js             # Controller/DTO 스켈레톤 (extendsBaseEntity 옵션 — v0.5)
  java-service.js         # Service/Repository/Entity 스켈레톤
  java-test.js            # JUnit5 테스트 클래스
  names.js                # 식별자/패키지명 규칙 (pkgSegmentOf — v0.5)
  project.js              # pom.xml / build.gradle / application.yml
  domain-surveys.js       # Meta-Smelt Deep 모드용 도메인별 설문 (CLI/Web 공유)
  multi-module/           # v0.5.0 멀티모듈 emit
    layout.js             # decideLayout 토폴로지 결정 + AI 슬러그 우선순위
    gradle.js             # root/core/domain/app 5종 빌드 파일 생성기
    core-sources.js       # :core 의 6 공통 클래스
    archunit.js           # 도메인 경계 ArchTest 자동 생성
    emit-files.js         # buildMultiModuleFiles — CLI/Web 공통 (fs 의존성 0)
  index.js                # 퍼블릭 진입점
templates/
  commerce/catalog.yml           # 커머스 블럭 21개 (api_style + concerns 어노테이션)
  job-aggregator/catalog.yml     # 채용공고 통합 블럭 17개 [P1-3]
scripts/
  verify-p0.mjs           # P0 생성 품질 회귀 smoke test (CI 에서도 실행)
```

### 구현 완료 ✓
- `forge init` — .forge/ 디렉토리 구조 생성, 다음 단계: meta-smelt 안내
- `forge meta-smelt` — Step 0: 빌트인 선택(즉시 catalog 복사) or AI 커스텀 생성. AI 모드는 Quick(자유 입력 1번) / Deep(6단계 정밀 설문) 중 선택. `--quick` / `--deep` 플래그로 모드 선택 단계 스킵 가능
- `forge smelt` — 블럭 선택→의존성 해결→결정사항→W0 준비물→intent.yml (World별 draft 저장/복원)
- `forge assemble` — 플랜 파일(md/yml) → 블럭 자동 조립 → roadmap.yml + intent.yml
- `forge shape` — 블럭 특성 자동 감지 + 기술 스택 결정 → architecture.yml + architecture-prompt.md
- `forge forge` — API 계약 자동 추론 → contracts.yml + build-prompt.md
- `forge temper` — 블럭별 Given-When-Then 시나리오 생성 → test-scenarios.yml + temper-prompt.md
- `forge inspect` — 보안/성능/운영/확장성 자동 감지 → forge-report.md + inspect-prompt.md
- `forge emit` — `contracts.yml` + `test-scenarios.yml` → `.forge/generated/backend/` 실제 파일 기록 (`--target backend|tests|all`, `--build gradle|maven`)
- `forge verify` — `.forge/generated/backend/` 의 Java 코드가 실제 컴파일·테스트 통과하는지 확인 → verify-report.json [P1-2]
- `forge status` — 리치 대시보드 (phaseBar + 진행도 + 파일 현황)
- 인터랙티브 메뉴 — 인자 없이 `forge` 실행 시 Phase 선택 메뉴
- `shared/` 모듈 — CLI/Web 코드 생성기 단일 소스로 통합

---

## Web UI 현황 (v0.3.0) — React 18 + Vite 5 + Framer Motion

경로: `web/` | 실행: `cd web && npm run dev` | Bridge: `npm run bridge`

### 파일 구조
```
web/
  src/
    App.jsx                     # 메인 앱 (Phase 조율)
    catalog.js                  # 빌트인 Commerce 카탈로그 (JS)
    constants.js                # PHASES 공유 상수
    generators.js               # Phase별 출력물 생성 엔진
    promptGenerator.js          # CLI 수준 고품질 Claude 프롬프트 생성 (Shape/Build/Temper/Inspect)
    codeGenerators.js           # shared/ 래핑 — OpenAPI + Java 스켈레톤 생성
    metaSmeltUtils.js           # Claude 프롬프트 빌더/파서
    parseCatalog.js             # YAML 파싱 + 검증
    GuidePanel.jsx              # Phase별 사용 가이드 패널
    guide.css / meta-smelt.css  # Phase 전용 스타일
    i18n/                       # 다국어 컨텍스트
    locales/                    # ko / en 번역 리소스
    context/                    # React Context (프로젝트 상태 등)
    phases/
      MetaSmeltPhase.jsx        # Phase 0: 카탈로그 선택(빌트인/업로드/AI Quick/AI Deep) + 요구사항
      SmeltPhase.jsx            # Phase 1: 블럭 선택 + 의존성 시각화
      ShapePhase.jsx            # Phase 2: 아키텍처 결정 + 프롬프트 복사
      BuildPhase.jsx            # Phase 3: API 계약 + 코드 생성 + Bridge 실행
      TemperPhase.jsx           # Phase 4: 테스트 시나리오 + Bridge 실행
      InspectPhase.jsx          # Phase 5: 멀티 관점 검수 + 프롬프트 복사
    components/
      PhaseBar.jsx              # 상단 Phase 탐색 바
      PhaseNav.jsx               # 이전/다음 네비게이션
      PhaseShell.jsx            # Phase 공통 껍데기(헤더/푸터/DownloadBar)
      AnimatedNumber.jsx        # 스프링 카운터
      OnboardingModal.jsx       # 첫 방문 AI 루프 안내
      ErrorBoundary.jsx         # 런타임 에러 캡처
      ClaudeBridgePanel.jsx     # Bridge 3가지 모드 UI(프롬프트 복사 / Claude Code / Claude API)
    hooks/
      usePersistedState.js      # localStorage 세션 저장/복원
      useClaudeBridge.js        # Bridge 서버 SSE 연결 Hook
  server/
    bridge.js                   # Claude Code CLI + Claude API 프록시 서버(SSE)
```

### 실행 방법

```bash
cd web && npm run dev           # Web UI (프롬프트 복사 모드만 사용 시 이것으로 충분)
cd web && npm run bridge        # Bridge 서버 (Claude Code / Claude API 실행 모드에 필요)
```

### 구현 완료 ✓
- Phase 0~5 전체 UI 구현 (MetaSmelt → Smelt → Shape → Build → Temper → Inspect)
- Phase 잠금/해금 제어 (순서 강제, 뒤로는 자유)
- MetaSmelt: 빌트인(commerce) / YAML 업로드 / AI 생성 3가지 카탈로그 모드. AI 모드는 다시 Quick(자유 입력 한 번) / Deep(6단계 wizard sub-steps)으로 분기.
- Smelt: AI 추천 이유 표시, 의존성 시각화, SelectionPanel
- Shape/Build/Temper/Inspect: generators.js 기반 자동 생성 + Claude 프롬프트 복사
- GuidePanel: Phase별 사용 가이드 슬라이드 패널
- i18n (ko/en) — `i18n/` + `locales/` 구조로 언어 전환 지원
- ErrorBoundary + PhaseShell 공통 껍데기 (Phase 레이아웃/에러 복구 일원화)
- localStorage 세션 저장/복원 (새로고침 후 상태 유지)
- OnboardingModal: 첫 방문 AI 루프 안내 (3-step)
- Framer Motion Phase 전환 애니메이션, 스프링 카운터

### 구현 완료 (추가) ✓
- 코드 생성 연동 — Phase 3: OpenAPI YAML + Spring Boot 스켈레톤 ZIP, Phase 4: JUnit5 테스트 ZIP, Phase 5: 전체 패키지 ZIP (`shared/` 모듈 공용)
- Claude 프롬프트 생성 — Phase 2~5: CLI 수준 고품질 프롬프트 자동 생성 + 클립보드 복사 (`promptGenerator.js`)
- **Claude Bridge** — `web/server/bridge.js` + `useClaudeBridge.js` + `ClaudeBridgePanel.jsx`로 Build/Temper Phase에서 3가지 실행 모드 제공:
  - 📋 프롬프트 복사 (서버 불필요)
  - 🚀 Claude Code CLI 실행 (SSE 스트리밍)
  - 🔑 Claude API 프록시 (모델 선택 가능)

---

## 코드 생성 출력 디렉토리 규칙

`/forge-build`로 생성된 모든 파일은 **`.forge/generated/`** 하위에 저장된다.
프로젝트 루트 오염 금지. `src/`는 절대 사용하지 않는다.

```
.forge/generated/
  backend/                    # Spring Boot 소스 (gradle/maven 선택, forge emit --build로 토글)
    build.gradle  또는  pom.xml
    src/main/java/com/forge/{domain}/
    src/main/resources/
      application.yml         # H2 파일 DB 기본, prod 프로파일로 MySQL 전환
      application-prod.yml    # MySQL/Oracle/PostgreSQL 연결 템플릿
    src/test/java/com/forge/{domain}/
  README.md                   # 로컬 실행 가이드 (Swagger URL 포함)
```

> 현재 코드 생성 범위는 **백엔드(Spring Boot) + 테스트(JUnit5)** 까지다. `forge shape`에서 선택한 프론트엔드(React/Vue/Svelte)는 `architecture.yml`에만 기록되며 실제 프론트엔드 스켈레톤 emit은 아직 구현되지 않았다.

**DB 추상화 전략:**
- MVP: H2 파일 DB (`jdbc:h2:file:./data/{domain}`) — 외부 솔루션 불필요, 데이터 영구 저장
- 운영 전환: `--spring.profiles.active=prod` + `application-prod.yml` 수정만으로 MySQL/PostgreSQL/Oracle 교체

## 다음 할 일 (우선순위순)

1. **npm 배포 (v0.5.0)** — 멀티모듈 emit 완비. `npm publish` 실행 + npm 뱃지 갱신. 2FA 필요, dry-run 검증 후 publish.
2. **데모 자산 추가** — Vercel 호스팅 + asciinema 60초 GIF + 스크린샷 5장 (Phase 1/2/3/5 UI + 멀티모듈 ZIP 다운로드). README 상단 Live Demo 버튼.
3. **세 번째 빌트인 템플릿** — commerce + job-aggregator 로 범용성 증명 완료. SaaS 또는 Content 도메인 추가로 정착 유도. v0.5.0 의 AI 슬러그 prompt 가 새 도메인에서도 합리적으로 동작하는지 검증 함께.
4. **`forge verify --repair`** — 실패 리포트(특히 boundary_violations) 를 Phase 3/4 프롬프트 재생성의 입력으로 자동 변환.
5. **Web UI 에 verify 연동** — Claude Bridge 통해 verify 실행, ArchUnit 위반을 UI 에서 강조.
6. **추가 개선 (v0.6.0+)**
   - Maven 멀티모듈 지원 (v0.5.0 은 Gradle 만)
   - `:api-contracts` 모듈 분리 (DTO 만 별도 모듈로)
   - catalog 오탈자 에러 메시지에 YAML 라인 번호 표시 (js-yaml position tracking)

### v0.5.0 완료 (2026-04-25, 멀티모듈 emit + AI 슬러그)

- **Step 1** 토폴로지 결정기 (`shared/multi-module/layout.js`) — `decideLayout` 순수 함수, AI 슬러그 우선순위
- **Step 1.5** AI 도메인 슬러그 — catalog World.slug 스키마 + meta-smelt 시스템 프롬프트 강화 + 빌트인 catalog 의미 부여
- **Step 2** Gradle 빌드 파일 생성기 (`gradle.js`) — root/core/domain/app 5종, `:domain-X` 가 `:core` 만 의존
- **Step 3** `:core` 공통 클래스 (`core-sources.js`) — BaseEntity/CommonResponse/PageResponse/ErrorCode/BusinessException/GlobalExceptionHandler 6개
- **Step 4** `generateEntity` 옵션 확장 — `extendsBaseEntity:true` 로 `:core.BaseEntity` 상속, single 모드 회귀 0
- **Step 5** `emitMultiModule` 본체 (`lib/emit/multi-emit.js`) — layout 따라 디렉토리 트리 emit, 패키지 일관성
- **Step 6** `forge emit --layout` 라우팅 + 자동 백업 (`backend.bak-{timestamp}/`)
- **Step 7** ArchUnit 경계 테스트 (`archunit.js`) — 도메인 모듈마다 `*ArchitectureTest.java`
- **Step 8** `forge verify` 멀티모듈 적응 — `> Task :module:` parsing, `boundary_violations` 별도 분류
- **Step 10** verify-p0 P0-5 추가 — commerce 6 World × 5 cross-check, AI 슬러그 우선 단정 (26/26)
- **Step 11** Web UI 동기화 — 단일 소스 `buildMultiModuleFiles` 로 CLI/Web ZIP 1:1 동일, BuildPhase "🏗️ 멀티모듈 ZIP" 버튼

> **테스트 카운트**: 232 (v0.4) → **385 passed** (v0.5, +153 신규, 회귀 0건)

### v0.4.0 완료 (2026-04-23, P0+P1)

- **P0-1** API 계약 생성기 수정 — pluralize + api_style (internal/query/resource)
- **P0-2** 결제 하드코딩 제거 — concerns 태그 기반 조건부 프롬프트
- **P0-3** 아키텍처 스타일 가드레일 — team_size/공수 기반 자동 분기
- **P0-4** 카탈로그 스키마 strict — 오탈자·참조 무결성·한국어 에러
- **P1-1** 테스트 시나리오 심화 — 11 패턴 + 3 concerns 시나리오 테이블
- **P1-2** `forge verify` 신설 — gradle 컴파일·테스트 자동 검증
- **P1-3** job-aggregator 빌트인 템플릿 — 17블럭 채용공고 도메인

> 상세 스펙(데이터 모델, 커머스 카탈로그 전체 구조): `docs/spec.md` 참고
> 구현 현황 전체: `docs/implementation-status.md`
> Web UI 아키텍처: `docs/web-ui-architecture.md`
