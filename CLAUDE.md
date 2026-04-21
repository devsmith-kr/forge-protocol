# Forge Protocol — 프로젝트 지침

## 프로젝트 정체

**Forge Protocol** — "바이브코딩 2.0" AI-Human 협업 개발 프로토콜.
한 줄 정의: "바이브(감각)에서 시작하되, 설계(구조)로 승격시키고, 검증(증거)으로 마무리하는 AI 협업 개발 프로토콜"

기존 AI 코딩 도구(Cursor, Copilot, Bolt)는 전부 "구현"에서 시작. Forge는 "설계를 강제하는 도구" — 이것이 빈 공간.
목표: 세계적 오픈소스 표준.

---

## 전체 흐름

```
forge init  →  forge meta-smelt  →  forge smelt  →  forge shape  →  forge build  →  forge temper  →  forge inspect
```

## 6단계 프로세스

| Phase | 이름 | 하는 일 | 출력물 |
|-------|------|---------|--------|
| 0 | **Meta-Smelt** (발굴) | 카탈로그 확정 — 빌트인 선택 or AI로 커스텀 생성 | .forge/catalog/catalog.yml |
| 1 | **Smelt** (제련) | 블럭 선택, 의존성 해결, 의도 추출 | intent.yml, selected-blocks.yml |
| 2 | **Shape** (성형) | 아키텍처 결정, ADR 기록 | architecture.yml |
| 3 | **Forge** (단조) | API 계약 우선 정의 후 코드 생성 | contracts.yml, src/ |
| 4 | **Temper** (담금질) | Given-When-Then 테스트 생성 | test/ |
| 5 | **Inspect** (검수) | 보안/성능/운영/확장성 멀티 리뷰 | forge-report.md |

> **Meta-Smelt 역할**: 빌트인 템플릿(commerce)을 선택하거나, 내 도메인을 설명해 Claude가 catalog.yml을 AI로 생성한다. Smelt 이전의 필수 준비 단계.

줌 레벨: World → Bundle → Block → TechSpec. 어떤 순간에도 사용자 앞에 5개 이하 선택지.

---

## CLI 현황 (v0.1.0) — Node.js ESM, commander/inquirer/chalk/js-yaml/ora

### 파일 구조
```
bin/forge.js              # 엔트리포인트 (인터랙티브 메뉴 + commander)
lib/
  core/
    project.js            # 공통 파일 로드 헬퍼 (loadState, loadSmeltResult 등)
    ui.js                 # 리치 CLI UI 엔진 (phaseBar, dashboard, commandHeader 등)
  init.js                 # forge init — .forge/ 디렉토리 구조만 생성
  meta-smelt.js           # forge meta-smelt — 카탈로그 확정 (빌트인 선택 or AI 생성)
  smelt.js                # forge smelt — 대화형 블럭 선택 (draft 저장/복원)
  shape.js                # forge shape — 아키텍처 결정
  build.js                # forge build — API 계약 추론
  temper.js               # forge temper — GWT 시나리오 생성
  inspect.js              # forge inspect — 멀티 관점 검수
  assemble.js             # forge assemble — 플랜 → 블럭 자동 조립
  assembler.js            # 조립 엔진
  status.js               # forge status — 리치 대시보드
  catalog.js              # 카탈로그 로더
  dependency.js           # 의존성 재귀 해결 엔진
  domain-surveys.js       # 도메인별 맞춤 설문 정의
templates/
  commerce/catalog.yml    # 커머스 블럭 21개 + 의존성 16개
```

### 구현 완료 ✓
- `forge init` — .forge/ 디렉토리 구조 생성, 다음 단계: meta-smelt 안내
- `forge meta-smelt` — Step 0: 빌트인 선택(즉시 catalog 복사) or AI 커스텀 생성(6단계 설문 → 프롬프트)
- `forge smelt` — 블럭 선택→의존성 해결→결정사항→W0 준비물→intent.yml (World별 draft 저장/복원)
- `forge assemble` — 플랜 파일(md/yml) → 블럭 자동 조립 → roadmap.yml + intent.yml
- `forge shape` — 블럭 특성 자동 감지 + 기술 스택 결정 → architecture.yml + architecture-prompt.md
- `forge build` — API 계약 자동 추론 → contracts.yml + build-prompt.md
- `forge temper` — 블럭별 Given-When-Then 시나리오 생성 → test-scenarios.yml + temper-prompt.md
- `forge inspect` — 보안/성능/운영/확장성 자동 감지 → forge-report.md + inspect-prompt.md
- `forge status` — 리치 대시보드 (phaseBar + 진행도 + 파일 현황)
- 인터랙티브 메뉴 — 인자 없이 `forge` 실행 시 Phase 선택 메뉴

---

## Web UI 현황 (v0.2.0) — React 18 + Vite 5 + Framer Motion

경로: `web/` | 실행: `cd web && npm run dev`

### 파일 구조
```
web/
  src/
    App.jsx                     # 메인 앱 (~175줄, Phase 조율)
    catalog.js                  # 빌트인 Commerce 카탈로그 (JS)
    constants.js                # PHASES 공유 상수
    generators.js               # Phase별 출력물 생성 엔진
    promptGenerator.js          # CLI 수준 고품질 Claude 프롬프트 생성 (Shape/Build/Temper/Inspect)
    codeGenerators.js           # OpenAPI + Java 스켈레톤 코드 생성
    metaSmeltUtils.js           # Claude 프롬프트 빌더/파서
    parseCatalog.js             # YAML 파싱 + 검증
    GuidePanel.jsx              # Phase별 사용 가이드 패널
    phases/
      MetaSmeltPhase.jsx        # Phase 0: 카탈로그 선택(빌트인/업로드/AI) + 요구사항
      SmeltPhase.jsx            # Phase 1: 블럭 선택 + 의존성 시각화
      ShapePhase.jsx            # Phase 2: 아키텍처 결정 + 프롬프트 복사
      BuildPhase.jsx            # Phase 3: API 계약 + 코드 생성 + 프롬프트 복사
      TemperPhase.jsx           # Phase 4: 테스트 시나리오 + 프롬프트 복사
      InspectPhase.jsx          # Phase 5: 멀티 관점 검수 + 프롬프트 복사
    components/
      PhaseBar.jsx              # 상단 Phase 탐색 바
      PhaseNav.jsx              # 이전/다음 네비게이션
      AnimatedNumber.jsx        # 스프링 카운터
      OnboardingModal.jsx       # 첫 방문 AI 루프 안내
    hooks/
      usePersistedState.js      # localStorage 세션 저장/복원
  server/
    bridge.js                   # Claude Code + API 프록시 서버
```

### 실행 방법

```bash
cd web && npm run dev
```

### 구현 완료 ✓
- Phase 0~5 전체 UI 구현 (MetaSmelt → Smelt → Shape → Build → Temper → Inspect)
- Phase 잠금/해금 제어 (순서 강제, 뒤로는 자유)
- MetaSmelt: 빌트인(commerce) / YAML 업로드 / AI 생성 3가지 카탈로그 모드
- Smelt: AI 추천 이유 표시, 의존성 시각화, SelectionPanel
- Shape/Build/Temper/Inspect: generators.js 기반 자동 생성 + Claude 프롬프트 복사
- GuidePanel: Phase별 사용 가이드 슬라이드 패널
- localStorage 세션 저장/복원 (새로고침 후 상태 유지)
- OnboardingModal: 첫 방문 AI 루프 안내 (3-step)
- Framer Motion Phase 전환 애니메이션, 스프링 카운터

### 구현 완료 (추가) ✓
- 코드 생성 연동 — Phase 3: OpenAPI YAML + Spring Boot 스켈레톤 ZIP, Phase 4: JUnit5 테스트 ZIP, Phase 5: 전체 패키지 ZIP
- Claude 프롬프트 생성 — Phase 2~5: CLI 수준 고품질 프롬프트 자동 생성 + 클립보드 복사 (promptGenerator.js)

---

## 코드 생성 출력 디렉토리 규칙

`/forge-build`로 생성된 모든 파일은 **`.forge/generated/`** 하위에 저장된다.
프로젝트 루트 오염 금지. `src/`는 절대 사용하지 않는다.

```
.forge/generated/
  backend/                    # Spring Boot 소스 (mvn spring-boot:run으로 실행)
    pom.xml
    src/main/java/com/forge/{domain}/
    src/main/resources/
      application.yml         # H2 파일 DB 기본, prod 프로파일로 MySQL 전환
      application-prod.yml    # MySQL/Oracle/PostgreSQL 연결 템플릿
    src/test/java/com/forge/{domain}/
  frontend/                   # Vue.js SPA
    package.json
    src/
      api/client.js           # Axios + JWT 인터셉터
      views/                  # 블럭별 페이지
  README.md                   # 로컬 실행 가이드 (Swagger URL 포함)
```

**DB 추상화 전략:**
- MVP: H2 파일 DB (`jdbc:h2:file:./data/{domain}`) — 외부 솔루션 불필요, 데이터 영구 저장
- 운영 전환: `--spring.profiles.active=prod` + `application-prod.yml` 수정만으로 MySQL/PostgreSQL/Oracle 교체

## 다음 할 일 (우선순위순)

1. **코드 생성 연동** — Web UI 출력물 → 실제 소스 코드 생성 + ZIP 다운로드
    - Phase 3 (Build): OpenAPI 3.1 YAML 직접 생성 → Java 스켈레톤
    - Phase 4 (Temper): GWT → JUnit5 테스트 코드
    - 상세: `docs/code-generation-plan.md` 참고
2. **npm publish** — `npm install -g forge-protocol`로 배포
3. 테스트 코드 추가 (CLI 단위 테스트)

> 상세 스펙(데이터 모델, 커머스 카탈로그 전체 구조): `docs/spec.md` 참고
> 구현 현황 전체: `docs/implementation-status.md`
> Web UI 아키텍처: `docs/web-ui-architecture.md`
