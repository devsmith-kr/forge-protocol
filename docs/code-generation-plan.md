# 코드 생성 연동 계획 (Code Generation Plan)

> 작성일: 2026-04-09  
> 현재 상태: Web UI Phase 0~5 완료. 다음 단계: 웹 출력물 → 실제 소스 코드 생성

---

## 현재 Web UI가 하는 일

각 Phase는 **Claude에게 전달할 프롬프트**를 생성하고 복사 버튼을 제공한다.
사용자가 프롬프트를 Claude에게 직접 붙여넣어 결과를 얻는 **반자동** 루프.

```
Web UI → 프롬프트 생성 → [사용자가 Claude에 복사/붙여넣기] → 결과 획득
```

---

## 목표: 완전 자동화 루프

```
Web UI → Claude API 직접 호출 → 실제 파일 생성
```

---

## Phase별 코드 생성 범위

### Phase 2 (Shape) → 아키텍처 파일
- `architecture.yml`: 서비스 구조, 기술 스택, ADR
- `docs/architecture.md`: 사람이 읽을 수 있는 아키텍처 문서

### Phase 3 (Forge) → API 계약 + 스켈레톤 코드
우선순위 높음. 실제 가치 전달이 가장 명확한 단계.

**생성 대상:**
```
contracts/
  openapi.yml           # OpenAPI 3.1 명세
src/
  {service}/
    controller/
      {Resource}Controller.java   # @RestController 스켈레톤
    dto/
      {Resource}Request.java
      {Resource}Response.java
    service/
      {Resource}Service.java      # 인터페이스
```

**생성 전략:**
1. `generators.js`의 `generateContracts()` 결과를 구조화된 입력으로 활용
2. 블럭별 엔드포인트 추론 데이터 → OpenAPI 스펙 직접 생성 (Claude 없이 가능)
3. OpenAPI → Java 스켈레톤은 Claude API 또는 openapi-generator 활용

### Phase 4 (Temper) → 테스트 코드
```
src/test/java/
  {service}/
    {Resource}ControllerTest.java   # MockMvc 기반
    {Resource}ServiceTest.java      # Mockito 기반
```

Given-When-Then 시나리오 → JUnit5 + MockMvc 테스트 메서드 자동 생성

### Phase 5 (Inspect) → 체크리스트
```
docs/
  security-checklist.md
  performance-checklist.md
```

---

## 구현 접근법 (2가지 옵션)

### Option A: Claude API 직접 호출 (추천)
Web UI에서 Claude API를 직접 호출하여 코드 생성.

**장점:** 기존 프롬프트 재활용, 유연한 커스터마이징  
**단점:** API 키 관리 필요 (브라우저 노출 위험 → 서버 프록시 필요)

```
Web UI → 백엔드 프록시 → Claude API → 생성된 코드 → 다운로드
```

**구현 순서:**
1. 경량 백엔드 추가 (Node.js Express or Hono)
2. `/api/generate` 엔드포인트
3. Web UI에서 생성 버튼 → API 호출 → 결과 ZIP 다운로드

### Option B: 로컬 CLI 연동
Web UI가 생성한 YAML 파일을 로컬에 저장 → CLI `forge forge --from-web`으로 처리.

**장점:** API 키 불필요, 보안 이슈 없음  
**단점:** 브라우저-파일시스템 연동 복잡 (File System Access API 필요)

---

## 단기 실행 계획 (MVP)

### Step 1: Phase 3 (Forge) — OpenAPI 직접 생성 (Claude 없이)
`generators.js`의 엔드포인트 추론 데이터를 바탕으로 OpenAPI 3.1 YAML 직접 생성.
Claude 없이도 구조적으로 정확한 명세 생성 가능.

```js
// generators.js 확장
export function generateOpenApiSpec(allSelected, catalogData) → openapi.yml string
```

Web UI에 "Download openapi.yml" 버튼 추가.

### Step 2: Phase 3 (Forge) — Java 스켈레톤 생성
OpenAPI 스펙 → Claude API → Spring Boot 스켈레톤 코드.
결과를 ZIP으로 묶어 다운로드.

### Step 3: Phase 4 (Temper) — 테스트 코드 생성
GWT 시나리오 → Claude API → JUnit5 테스트 클래스.

---

## 다운로드 UX 설계

각 Phase 완료 시 "코드 내보내기" 버튼 추가:

```
[📥 openapi.yml 다운로드]   ← Phase 3 완료 시
[📥 스켈레톤 코드 ZIP]       ← Phase 3 + Claude 생성 시
[📥 테스트 코드 ZIP]         ← Phase 4 완료 시
[📥 전체 프로젝트 ZIP]       ← Inspect 완료 시 (전체 묶음)
```

---

## 관련 파일

- `web/src/generators.js`: 현재 구조화된 데이터 생성 로직 (확장 대상)
- `web/src/App.jsx`: 다운로드 버튼 추가 위치 (각 Phase 컴포넌트 하단)
- `templates/commerce/catalog.yml`: 블럭 메타데이터 정의 (tech_desc 활용)
