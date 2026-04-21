# Forge Protocol — 시작 가이드

> 설계 우선 AI 협업 개발 프로토콜. 바이브에서 시작하되, 구조로 승격시키고, 증거로 마무리한다.

---

## 목차

1. [문제 정의](#문제-정의)
2. [Forge가 다른 이유](#forge가-다른-이유)
3. [설치](#설치)
4. [전체 워크스루 — CLI](#전체-워크스루--cli)
   - [Phase 0.5: Meta-Smelt](#phase-05-meta-smelt--카탈로그-설정)
   - [Phase 1: Smelt](#phase-1-smelt--블럭-선택)
   - [Phase 2: Shape](#phase-2-shape--아키텍처)
   - [Phase 3: Build](#phase-3-build--api-계약)
   - [Phase 4: Temper](#phase-4-temper--테스트-시나리오)
   - [Phase 5: Inspect](#phase-5-inspect--멀티-관점-검수)
5. [Web UI 워크스루](#web-ui-워크스루)
6. [블럭 의존성 구조 이해하기](#블럭-의존성-구조-이해하기)
7. [출력 파일 레퍼런스](#출력-파일-레퍼런스)
8. [커스텀 템플릿 만들기](#커스텀-템플릿-만들기)

---

## 문제 정의

오늘날의 AI 코딩 도구는 전부 "구현"에서 시작합니다.

```
User: "쇼핑몰 만들어줘"
AI:   [3,000줄 코드 생성]
```

코드는 실행됩니다. 그런데 3주 뒤 이런 상황이 옵니다:

- PG(결제대행사) 계약이 필요한데, 심사에 2~4주가 걸린다는 사실을 이제야 알았다
- 쿠폰을 뒤늦게 추가했더니 결제·환불·정산 로직을 전부 뜯어고쳐야 한다
- 아무도 물어보지 않았다: "주문이 부분 환불될 때 쿠폰은 복원되나요?"

**Forge는 코드 전에 설계를 강제합니다.** 설계가 고귀해서가 아니라, 의존성이 실재하고 나중에 고치면 비용이 크기 때문입니다.

---

## Forge가 다른 이유

| | Cursor / Copilot / Bolt | Forge Protocol |
|---|---|---|
| **시작점** | 구현 | 설계 |
| **의존성 추적** | 없음 | 자동 연쇄 해결 |
| **비코드 준비물** | 언급 없음 | 개발 전에 표면화 |
| **출력물** | 코드 | YAML 아티팩트 → 코드 |
| **AI 역할** | 코드 작성 | 설계 검증 |

**핵심 인사이트:** 사람은 시스템에 필요한 것의 약 30%만 말합니다. Forge는 나머지 70%를 의존성 그래프로 해결합니다.

예시 — "쿠폰" 블럭 선택 시 자동 발생하는 것:

```
쿠폰 선택됨
  → requires: 결제 (할인 차감 로직)
  → affects:  환불 (쿠폰 복원 정책)
  → affects:  정산 (비용 부담 주체)
  → 자동 질문 생성:
      "쿠폰 비용은 셀러가 부담하나요, 플랫폼이 부담하나요?"
      "주문 취소 시 이미 사용한 쿠폰은 복원되나요?"
```

이 질문들이 코딩 3주 뒤가 아닌, 설계 단계에서 표면화됩니다.

---

## 설치

### 사전 요구사항

- Node.js >= 18.0.0
- npm >= 9.0.0

### 글로벌 설치

```bash
npm install -g forge-protocol
forge --version
```

### 소스에서 직접 실행

```bash
git clone https://github.com/devsmith-kr/forge-protocol.git
cd forge-protocol
npm install
node bin/forge.js --help
```

### 설치 확인

```bash
forge --help
```

```
Usage: forge [command]

Commands:
  init          Forge 프로젝트 초기화
  meta-smelt    블럭 카탈로그 설정 (빌트인 또는 AI 생성)
  smelt         블럭 선택 및 의존성 해결
  shape         아키텍처 결정
  build         API 계약 및 코드 스켈레톤 생성
  temper        Given-When-Then 테스트 시나리오 생성
  inspect       멀티 관점 코드 검수
  status        프로젝트 대시보드 출력
  assemble      플랜 파일로 블럭 자동 조립
```

---

## 전체 워크스루 — CLI

빌트인 `commerce` 템플릿으로 커머스 플랫폼을 설계해봅니다.

### 프로젝트 초기화

```bash
mkdir my-shop && cd my-shop
forge init
```

```
✔ Forge 프로젝트 초기화 완료!

  Dir: .forge/

  다음 단계: forge meta-smelt — 카탈로그를 설정하세요.
```

`forge init`은 `.forge/` 디렉토리 구조만 만듭니다. 카탈로그 설정은 다음 단계인 `forge meta-smelt`에서 진행합니다.

---

### Phase 0.5: Meta-Smelt — 카탈로그 설정

```bash
forge meta-smelt
```

```
  Meta-Smelt  (Phase 0: 발굴)
  Smelt를 시작하기 전에 카탈로그를 준비합니다.

  Step 0 — 카탈로그 방식 선택

  A) 빌트인 템플릿 사용
     Commerce 선택 시 즉시 forge smelt로 이동합니다.

  B) AI 커스텀 생성
     내 도메인을 설명하면 Claude가 catalog.yml을 만들어줍니다.

  ? 카탈로그 방식을 선택하세요:
  ❯ 빌트인 템플릿 사용 (Commerce)
    AI로 커스텀 카탈로그 생성
```

두 가지 모드:
1. **빌트인 템플릿** — Commerce 선택 시 `catalog.yml`이 즉시 `.forge/catalog/`에 복사됩니다
2. **AI 커스텀 생성** — 6단계 설문(아이디어 → 업종 → 도메인 → 역할 → 기능/규모 → 제약사항) → Claude용 프롬프트 생성 → Claude가 만든 `catalog.yml`을 직접 저장

이 워크스루에서는 빌트인 **Commerce** 템플릿을 선택합니다.

---

### Phase 1: Smelt — 블럭 선택

```bash
forge smelt
```

블럭은 **World**(줌 레벨 1)로 구성됩니다. 매 순간 선택지는 5개 이하입니다.

```
  Phase ━━━━━━━━━━━━━━━━━━━━  Smelt (1/5)

  World 1: 고객 & 인증
  ┌─────────────────────────────────────────────┐
  │ [✔] 회원가입 & 로그인                        │
  │ [✔] 소셜 로그인 (OAuth2)                    │
  │ [ ] MFA / 2단계 인증                        │
  └─────────────────────────────────────────────┘

  World 2: 상품 & 카탈로그
  ┌─────────────────────────────────────────────┐
  │ [✔] 상품 관리                               │
  │ [✔] 카테고리 & 태그                          │
  │ [✔] 재고 관리   ← 자동 추가됨               │
  └─────────────────────────────────────────────┘

  World 3: 주문 & 결제
  ┌─────────────────────────────────────────────┐
  │ [✔] 주문 관리                               │
  │ [✔] 결제 처리                               │
  │ [✔] 쿠폰 & 할인                             │
  └─────────────────────────────────────────────┘

  의존성 해결 결과:
    직접 선택:  8개 블럭
    자동 추가:  3개 블럭 (재고, 환불, 정산)
    합계:      11개 블럭

  아키텍처 결정 사항:
  ? 쿠폰 비용 부담 주체는?
    ❯ 플랫폼이 전액 부담
      셀러가 전액 부담
      계약에 따라 분담
```

**출력:** `.forge/project/intent.yml`, `selected-blocks.yml`

> World 완료마다 진행 상황이 저장됩니다. 중간에 종료해도 `forge smelt`로 재개할 수 있습니다.

---

### Phase 2: Shape — 아키텍처

```bash
forge shape
```

Forge가 선택된 블럭의 `tech_desc` 필드를 분석해 아키텍처 결정을 자동 추론합니다.

```
  Phase ━━━━━━━━━━━━━━━━━━━━  Shape (2/5)

  감지된 패턴:
    ✔ JWT + OAuth2          → Spring Security
    ✔ Optimistic Locking    → JPA @Version
    ✔ 파일 업로드            → S3 호환 스토리지
    ✔ 비동기 알림            → Spring Events / Kafka (선택 필요)

  ? 메시징 레이어:
    ❯ Spring Events (단순, 인프라 불필요)
      Kafka (내구성, 분산)
      RabbitMQ

  ? 데이터베이스:
    ❯ H2 (개발) → MySQL/PostgreSQL (운영)
      PostgreSQL 전용
```

**출력:** `.forge/project/architecture.yml`, `architecture-prompt.md`

`architecture-prompt.md`는 Claude에 바로 붙여넣을 수 있는 ADR(Architecture Decision Record) 작성 프롬프트입니다.

---

### Phase 3: Build — API 계약

```bash
forge build
```

각 블럭의 REST 엔드포인트를 자동 추론해 계약을 생성합니다.

```yaml
# .forge/project/contracts.yml
services:
  - name: Auth Service
    endpoints:
      - method: POST
        path: /api/v1/auth/login
        body: "{ email, password }"
        response: "200 { accessToken, refreshToken }"
      - method: POST
        path: /api/v1/auth/refresh
        body: "{ refreshToken }"
        response: "200 { accessToken }"

  - name: Order Service
    endpoints:
      - method: POST
        path: /api/v1/orders
        body: "{ items[], shippingAddress, couponId? }"
        response: "201 { orderId, status: PENDING }"
      - method: GET
        path: /api/v1/orders/{orderId}
        response: "200 Order"
```

`build-prompt.md`는 이 계약을 OpenAPI 3.1 YAML로 확장하는 Claude 프롬프트입니다.

---

### Phase 4: Temper — 테스트 시나리오

```bash
forge temper
```

블럭별 Given-When-Then 시나리오를 `tech_desc` 키워드 기반으로 생성합니다.

```yaml
# .forge/project/test-scenarios.yml
- block: 쿠폰 & 할인
  tests:
    - name: 정상 쿠폰 적용
      given: 유효한 쿠폰, 최소 주문금액 충족
      when: POST /api/v1/orders { couponId: "SUMMER10" }
      then: 201, 할인 차감 완료, coupon.usage_count 증가

    - name: 쿠폰 중복 사용 차단 (멱등성)
      given: max_usage=1인 쿠폰, 이미 사용됨
      when: POST /api/v1/orders { couponId: "SUMMER10" }
      then: 409 COUPON_ALREADY_USED

    - name: 동시 쿠폰 사용 경합 조건
      given: remaining_count=1인 쿠폰, 2개 요청 동시 실행
      when: POST /api/v1/orders × 2 (동시)
      then: 하나는 201, 하나는 409 — 초과 발행 없음
```

키워드 → 테스트 유형 매핑:
- `jwt|oauth` → 인증 엣지케이스
- `optimistic_lock` → 동시 업데이트 시나리오
- `idempotency` → 중복 요청 처리
- `rbac` → 권한 경계 테스트

**출력:** `.forge/project/test-scenarios.yml`, `temper-prompt.md`

---

### Phase 5: Inspect — 멀티 관점 검수

```bash
forge inspect
```

4가지 관점에서 자동 검수합니다.

```
  Phase ━━━━━━━━━━━━━━━━━━━━  Inspect (5/5)

  🔴 보안         82/100
    [High]    JWT secret 하드코딩 금지 — 환경 변수로 분리하세요
    [Medium]  /auth/login에 Rate Limiting 추가 필요 (브루트포스 위험)

  🟡 성능         74/100
    [High]    주문 목록 엔드포인트에 페이지네이션 없음 (LIMIT 미추론)
    [Medium]  쿠폰 유효성 검사에서 N+1 쿼리 발생 가능 — @EntityGraph 추가 권장

  🔵 운영         88/100
    [Info]    Kubernetes readiness probe용 /actuator/health 추가 권장
    [Info]    구조화 로깅 권장 (ELK 스택 활용 시 JSON 포맷)

  🟢 확장성       71/100
    [High]    재고 차감이 동기 처리 — 트래픽 급증 시 병목
    [Medium]  쿠폰 차감에 분산 락 없음 — 다중 인스턴스 환경에서 경합 발생 가능
```

**출력:** `forge-report.md`, `inspect-prompt.md`

---

## Web UI 워크스루

Web UI는 동일한 6단계 흐름을 시각적으로 제공합니다. 비개발 직군 이해관계자와 협업하거나 시각적 흐름을 선호할 때 유용합니다.

### 기본 실행 (프롬프트 복사 모드)

```bash
git clone https://github.com/devsmith-kr/forge-protocol.git
cd forge-protocol/web
npm install
npm run dev
# http://localhost:5173 열기
```

### Bridge 서버 실행 (Claude Code / API 모드)

```bash
# 터미널 1: Web UI
cd web && npm run dev

# 터미널 2: Bridge 서버
npm run bridge -- --project-dir ../my-project
```

### 코드 생성 3가지 모드 (Phase 3 Build)

| 모드 | 버튼 | 필요 조건 | 비용 |
|------|------|----------|------|
| 📋 프롬프트 복사 | Claude 프롬프트 복사 | 없음 | 무료 (수동 붙여넣기) |
| 🚀 Claude Code | Claude Code 실행 | Bridge 서버 + Claude Code CLI | 월 $20 정액 |
| 🔑 Claude API | Claude API | Bridge 서버 + API 키 | ~$2-5/프로젝트 |

**주요 기능:**
- Phase 잠금/해금 제어 (순서 강제, 뒤로는 자유)
- 자동 추가 블럭 시각화 (의존성 그래프)
- Phase 3: 고품질 프롬프트 복사 / Claude Code 자동 실행 / API 호출
- Phase 3: `openapi.yml` 또는 Spring Boot 스켈레톤 ZIP 다운로드
- Phase 4: JUnit5 테스트 프롬프트 복사 + 테스트 클래스 ZIP 다운로드
- Phase 5: 전체 패키지 다운로드 (openapi + 스켈레톤 + 테스트)

프롬프트 복사 모드는 **백엔드나 API 키 없이 작동**합니다. Claude Code / API 모드는 Bridge 서버(`npm run bridge`)가 필요합니다.

---

## 블럭 의존성 구조 이해하기

Forge의 핵심입니다. 의존성은 두 가지 유형입니다.

### `requires` — 기술적 의존성

Block A가 Block B 없이는 동작할 수 없는 경우.

```yaml
- id: resume-attach
  name: 이력서 & 포트폴리오 첨부
  dependencies:
    - target: file-storage
      type: requires
      reason: "파일 업로드를 위한 S3 호환 스토리지 레이어 필요"
```

`resume-attach` 선택 시 `file-storage`가 자동으로 추가됩니다.

### `affects` — 비즈니스 로직 의존성

Block A가 Block B의 동작 방식을 변경하는 경우. 코드 임포트가 아닌, 설계 결정입니다.

```yaml
- id: coupon
  name: 쿠폰 & 할인
  dependencies:
    - target: payment
      type: affects
      question: "쿠폰 할인 비용을 플랫폼과 셀러 중 누가 부담하나요?"
    - target: refund
      type: affects
      question: "전액 환불 시 사용한 쿠폰이 복원되어야 하나요?"
    - target: settlement
      type: affects
      question: "쿠폰 비용이 셀러 정산에 어떻게 반영되나요?"
```

`affects` 의존성은 Smelt 단계에서 연쇄 질문을 생성합니다. 전통적으로 개발 3주 후에 등장하는 질문들입니다.

### 의존성 해결 알고리즘

```
resolveAll(selectedIds, catalog)
  → allBlocks:     자동 추가 포함 전체 블럭 목록
  → autoAdded:     requires 규칙으로 추가된 블럭
  → affected:      동작이 변경되는 블럭
  → decisions:     사용자에게 물어볼 질문 목록
  → prerequisites: 비코드 작업 (사업자등록, PG계약 등)
```

---

## 출력 파일 레퍼런스

```
.forge/
├── catalog/
│   └── catalog.yml           # 블럭 정의 + 의존성 그래프
└── project/
    ├── state.yml             # 현재 Phase
    ├── intent.yml            # Phase 1: 선택 블럭 + 결정사항
    ├── selected-blocks.yml   # 전체 블럭 목록 (자동 추가 포함)
    ├── architecture.yml      # Phase 2: 기술 스택 결정
    ├── architecture-prompt.md
    ├── contracts.yml         # Phase 3: REST API 계약
    ├── build-prompt.md
    ├── test-scenarios.yml    # Phase 4: GWT 시나리오
    ├── temper-prompt.md
    ├── prerequisites.yml     # 비코드 작업 목록
    └── forge-report.md       # Phase 5: 멀티 관점 검수 보고서
```

모든 파일은 사람이 읽을 수 있는 YAML 또는 Markdown입니다. **소스코드와 함께 커밋**하도록 설계되었습니다 — 이것이 곧 설계 아티팩트입니다.

---

## 커스텀 템플릿 만들기

템플릿은 `catalog.yml` 파일입니다. 구조:

```yaml
# templates/my-domain/catalog.yml
domain: my-domain
name: 나의 도메인 시스템

worlds:
  - id: world-1
    name: 코어 레이어
    icon: 🏗
    bundles:
      - id: bundle-1
        name: 인증
        blocks:
          - id: user-auth
            name: 사용자 인증
            priority: must-have
            user_desc: "일반 사용자를 위한 로그인과 회원가입"
            tech_desc: "JWT RS256, refresh token rotation, bcrypt 패스워드 해싱"
            dependencies:
              - target: email-service
                type: requires
                reason: "회원가입 이메일 인증"
              - target: audit-log
                type: affects
                question: "로그인 실패 이력을 감사 로그에 기록하나요?"
            prerequisites:
              - name: SSL 인증서
                phase: before-dev
                time: 1일
```

`templates/my-domain/catalog.yml`에 저장 후:

```bash
forge init --template my-domain
```

템플릿을 프로젝트에 기여하려면 [CONTRIBUTING.md](../CONTRIBUTING.md)를 참고하세요.

---

## 자주 묻는 질문

**"이거 너무 과설계 아닌가요?"**

간단한 스크립트나 개인 프로젝트엔 맞습니다. Forge는 의존성 누락의 비용이 실질적인 시스템을 대상으로 합니다: 커머스, 핀테크, 헬스케어, HR — 쿠폰/환불 질문 하나가 3주 재작업으로 이어지는 도메인들.

**"YAML을 왜 쓰나요? 데이터베이스는요?"**

YAML은 git에 삽니다. 설계 아티팩트가 코드와 함께 진화하고, PR에서 리뷰 가능하며, 인프라가 전혀 필요 없습니다. 프로토콜은 의도적으로 stateless합니다.

**"AI가 실제로 무슨 역할을 하나요?"**

Forge는 AI API를 직접 호출하지 않습니다. 각 Phase는 Claude/GPT에 붙여넣을 **프롬프트를 생성**합니다. AI가 설계를 생성하는 게 아니라 검증합니다. 덕분에 결정론적이고, 오프라인에서 동작하며, 무료입니다.

**"Spring Boot 말고 다른 스택은요?"**

코드 생성기는 Spring Boot를 타겟으로 합니다. 프로토콜 자체(YAML + 의존성 해결)는 언어 무관입니다. 다른 스택용 생성기 기여를 환영합니다.

**"CLI 없이 설계 프레임워크로만 써도 되나요?"**

네. `.forge/` 디렉토리 구조와 카탈로그 포맷이 곧 프로토콜입니다. CLI 없이 구조화된 문서로만 사용할 수 있습니다.

---

## 다음 단계

- [CONTRIBUTING.md](../CONTRIBUTING.md) — 템플릿 추가, 버그 수정, 생성기 개선 방법
- [docs/spec.md](spec.md) — 전체 데이터 모델과 블럭 스키마 레퍼런스
- [GitHub Issues](https://github.com/devsmith-kr/forge-protocol/issues) — 버그 리포트, 기능 요청

---

*Forge Protocol은 MIT 라이선스 오픈소스입니다.*
