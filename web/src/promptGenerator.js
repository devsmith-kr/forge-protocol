// promptGenerator.js — CLI 수준 고품질 Claude 프롬프트 생성 엔진
//
// 설계 원칙:
//   1. generators.js 의 데이터 생성 함수를 재사용하여 일관성 보장
//   2. CLI (lib/build.js, lib/temper.js, lib/shape.js, lib/inspect.js) 와 동등한 품질
//   3. 순수 함수 — 사이드이펙트 없음, 입력 → 문자열 반환
//   4. 각 함수는 Claude에 바로 붙여넣을 수 있는 완성된 프롬프트 반환

import {
  generateArchitecture,
  generateContracts,
  generateTestScenarios,
  generateInspectReport,
} from './generators'
import { collectConcerns, buildConcernFragments } from '../../shared/concerns.js'

// ═══════════════════════════════════════════════════════════
// 내부 유틸
// ═══════════════════════════════════════════════════════════

function resolveBlocks(allSelected, catalogData) {
  const ids = [...allSelected]
  return ids.map(id => catalogData?.blockMap?.[id]).filter(Boolean)
}

function formatBlockList(blocks) {
  return blocks
    .map(b => `- **${b.name}** (\`${b.id}\`) — ${b.effort_days ?? 0}일`)
    .join('\n')
}

/**
 * 선택된 블럭의 concerns 기반으로 phase 별 추가 지침 섹션을 만든다.
 * outer template literal 안에 nested backtick 을 두면 vite/rollup parser 가
 * 처리 못해 빌드 실패하므로, 여기서 모두 처리해 string 만 반환한다.
 */
function buildConcernsSection(blocks, phase, headerLine) {
  const fragments = buildConcernFragments(collectConcerns(blocks), phase);
  if (!fragments.length) return '';
  const bullets = fragments.map((f) => `- ${f}`).join('\n');
  return `\n${headerLine}\n\n${bullets}\n`;
}

function formatTechStack(blocks) {
  const src = blocks.map(b => b.tech_desc || '').join(' ')
  const stack = {}
  if (/Spring Boot/i.test(src))            stack['Backend']  = 'Spring Boot 3 (Java 17+)'
  else                                      stack['Backend']  = 'Spring Boot 3 (Java 17+)'
  if (/JPA|QueryDSL/i.test(src))           stack['ORM']      = 'JPA + QueryDSL'
  if (/Spring Security|JWT/i.test(src))    stack['Security']  = 'Spring Security 6 + JWT'
  if (/Redis/i.test(src))                  stack['Cache']     = 'Redis 7'
  if (/Elasticsearch/i.test(src))          stack['Search']    = 'Elasticsearch 8'
  if (/MySQL|DB/i.test(src))               stack['Database']  = 'MySQL 8.0'
  else                                      stack['Database']  = 'H2 (개발) → MySQL 8.0 (운영)'
  return Object.entries(stack).map(([k, v]) => `- ${k}: ${v}`).join('\n')
}

// ═══════════════════════════════════════════════════════════
// Phase 2: Shape — 아키텍처 설계 프롬프트
// ═══════════════════════════════════════════════════════════

export function generateShapePrompt(allSelected, catalogData) {
  const blocks = resolveBlocks(allSelected, catalogData)
  if (blocks.length === 0) return ''

  const arch = generateArchitecture(allSelected, catalogData)
  const totalDays = blocks.reduce((s, b) => s + (b.effort_days ?? 0), 0)

  const blockList = formatBlockList(blocks)

  const serviceList = arch.services
    .map(s => `- **${s.name}** — ${s.responsibilities.join(', ')} | 기술: ${s.tech.join(', ')} | 패턴: ${s.patterns.join(', ')}`)
    .join('\n')

  const infraList = arch.infra
    .map(i => `- ${i.icon} ${i.name} — ${i.desc}`)
    .join('\n')

  const decisionList = arch.decisions
    .map(d => `- **${d.title}**: ${d.choice} (${d.reason}) [${d.adr}]`)
    .join('\n')

  return `# Forge Protocol — 아키텍처 설계 프롬프트

> Forge Protocol Web UI가 자동 생성했습니다.
> 아래 내용을 Claude에 붙여넣으면 상세 아키텍처가 생성됩니다.

---

## System Prompt

당신은 시니어 소프트웨어 아키텍트입니다.
Forge Protocol의 블럭 명세와 자동 감지된 아키텍처 정보를 바탕으로 상세 아키텍처를 설계하세요.

### 출력 형식

다음 섹션을 순서대로 작성하세요:

1. **전체 아키텍처 다이어그램** (텍스트 기반 ASCII)
2. **레이어별 설계**
   - API 레이어 (엔드포인트 목록, RESTful 규칙)
   - 서비스 레이어 (핵심 비즈니스 로직)
   - 데이터 레이어 (핵심 엔티티, 관계)
3. **감지된 기술 과제별 해결책** (각 항목당 구체적 구현 방법)
4. **ADR (Architecture Decision Records)** — 각 결정의 이유와 트레이드오프
5. **개발 우선순위** — 어떤 순서로 구현할지

### 설계 원칙

- 과도한 설계 금지. 현재 블럭 수준에 맞는 적정 복잡도.
- 각 결정에 트레이드오프 명시 (왜 이 선택인가, 언제 바꿔야 하는가).
- "나중에 확장하면 되니까"로 현재 결정을 미루지 말 것.
- 한국어로 작성. 기술 용어는 영어 그대로.

---

## User Message

### 선택된 블럭 (${blocks.length}개, 총 ${totalDays}일)

${blockList}

### 자동 감지된 서비스 (${arch.serviceCount}개)

${serviceList || '(감지 없음)'}

### 인프라 구성

${infraList}

### 아키텍처 결정 (자동 생성)

${decisionList || '(없음)'}

### 추가 요청사항

- 각 블럭의 핵심 API 엔드포인트를 최소 1개씩 명시해주세요.
- 데이터 모델에서 가장 복잡한 관계(N:M, 상태머신 등)를 집중 설명해주세요.
- 초기 배포 아키텍처(최소 비용으로 시작하는 방법)도 포함해주세요.
${buildConcernsSection(blocks, 'shape', '### 도메인 특수 고려사항 (선택된 블럭 기반 자동 감지)')}`
}

// ═══════════════════════════════════════════════════════════
// Phase 3: Forge — 코드 생성 프롬프트
// ═══════════════════════════════════════════════════════════

export function generateBuildPrompt(allSelected, catalogData) {
  const blocks = resolveBlocks(allSelected, catalogData)
  if (blocks.length === 0) return ''

  const groups = generateContracts(allSelected, catalogData)
  const techSummary = formatTechStack(blocks)

  const blockDetails = blocks.map(b =>
    `### ${b.name} (\`${b.id}\`)\n- **일반 설명**: ${b.user_desc ?? '(없음)'}\n- **기술 명세**: ${b.tech_desc ?? '(없음)'}\n- **예상 공수**: ${b.effort_days ?? 0}일`
  ).join('\n\n')

  const contractSummary = groups.map(g => {
    const eps = g.endpoints
      .map(e => `  - \`${e.method.padEnd(6)} ${e.path}\` — ${e.summary}`)
      .join('\n')
    return `#### ${g.icon} ${g.service}\n${eps}`
  }).join('\n\n')

  const totalEndpoints = groups.reduce((s, g) => s + g.endpoints.length, 0)

  return `# Forge Protocol — 코드 생성 프롬프트

> Forge Protocol Web UI가 자동 생성했습니다.
> 아래 전체 내용을 Claude에 붙여넣으세요.

---

## System Prompt

당신은 시니어 풀스택 개발자입니다.
Forge Protocol의 블럭 명세와 아키텍처 결정을 바탕으로 실제 동작하는 코드를 생성하세요.

### 코드 생성 원칙

1. **계약 우선**: API 엔드포인트 시그니처를 먼저 정의하고, 구현은 그 계약을 따른다.
2. **레이어 분리**: Controller → Service → Repository 레이어를 명확히 분리한다.
3. **즉시 실행 가능**: 생성된 코드는 복사 후 최소한의 설정으로 실행 가능해야 한다.
4. **테스트 고려**: 각 Service 메서드에 단위 테스트 가능한 구조로 작성한다.
5. **한국어 주석**: 핵심 비즈니스 로직에는 한국어 주석 포함.

### 출력 형식

각 블럭마다 다음 순서로 코드를 생성하세요:

\`\`\`
1. Entity / Model 클래스
2. Repository 인터페이스
3. Service 클래스 (핵심 비즈니스 로직)
4. Controller / Router (API 엔드포인트)
5. DTO / Request-Response 객체
\`\`\`

파일명 규칙: \`{BlockName}{Layer}.java\` (예: \`ProductService.java\`, \`OrderController.java\`)

---

## 기술 스택

${techSummary}

## API 계약 (${groups.length}개 서비스, ${totalEndpoints}개 엔드포인트)

${contractSummary}

---

## 블럭별 명세 (${blocks.length}개)

${blockDetails}

---

## 생성 요청

위 ${blocks.length}개 블럭의 코드를 순서대로 생성해주세요.

각 블럭 코드 앞에 반드시 다음 헤더를 붙여주세요:
\`\`\`
// ═══════════════════════════════
// BLOCK: {block_id}
// ═══════════════════════════════
\`\`\`

추가 요청사항:
- 블럭 간 의존 관계가 있는 경우 (예: Order → Payment) 인터페이스로 의존성을 역전시켜 주세요.
- 상태 머신이 필요한 블럭(Order, Payment 등)은 상태 전이 로직을 명확히 표현해주세요.
- 동시성 처리가 필요한 블럭(재고, 예약 등)은 Lock 전략을 코드에 반영해주세요.
- 모든 코드는 \`.forge/generated/\` 하위에 저장되는 것을 전제로 패키지를 구성해주세요.
`
}

// ═══════════════════════════════════════════════════════════
// Phase 3: Forge — Claude Code 실행용 프롬프트 (파일 직접 생성)
// ═══════════════════════════════════════════════════════════

export function generateBuildExecutionPrompt(allSelected, catalogData, outputDir) {
  const blocks = resolveBlocks(allSelected, catalogData)
  if (blocks.length === 0) return ''

  const groups = generateContracts(allSelected, catalogData)
  const techSummary = formatTechStack(blocks)
  const totalEndpoints = groups.reduce((s, g) => s + g.endpoints.length, 0)

  const contractSummary = groups.map(g => {
    const eps = g.endpoints
      .map(e => `  - \`${e.method.padEnd(6)} ${e.path}\` — ${e.summary} | body: ${e.body} → ${e.response}`)
      .join('\n')
    return `#### ${g.icon} ${g.service} (id: ${g.id || 'unknown'})\n${eps}`
  }).join('\n\n')

  const blockDetails = blocks.map(b =>
    `- **${b.name}** (\`${b.id}\`): ${b.tech_desc ?? '(없음)'}`
  ).join('\n')

  const basePackage = 'com.forge.app'
  const basePath = basePackage.replace(/\./g, '/')

  // 생성할 파일 목록 추정
  const fileList = groups.flatMap(g => {
    const worldId = g.id || 'app'
    const pkg = worldId.replace(/^w-/, '').toLowerCase()
    return [
      `${outputDir}/src/main/java/${basePath}/${pkg}/entity/`,
      `${outputDir}/src/main/java/${basePath}/${pkg}/repository/`,
      `${outputDir}/src/main/java/${basePath}/${pkg}/controller/`,
      `${outputDir}/src/main/java/${basePath}/${pkg}/service/`,
      `${outputDir}/src/main/java/${basePath}/${pkg}/dto/`,
    ]
  })

  const totalSteps = groups.length + 3 // groups + pom + application.yml + README
  const stepPercent = Math.floor(85 / totalSteps)

  return `당신은 시니어 Spring Boot 개발자입니다.
아래 명세에 따라 실제 컴파일/실행 가능한 Spring Boot 프로젝트를 생성하세요.

## 중요: 작업 규칙

1. 모든 파일은 \`${outputDir}/\` 디렉토리에 생성하세요.
2. 각 단계 완료 시 아래 형식으로 진행 상황을 출력하세요:
   \`[FORGE:PROGRESS:XX:단계 설명]\`
   예: \`[FORGE:PROGRESS:15:Entity 클래스 생성 완료]\`
3. 파일은 반드시 하나씩 순서대로 생성하세요 (한 번에 여러 파일 X).
4. 모든 코드는 즉시 컴파일 가능해야 합니다. import 누락 금지.

## 코드 컨벤션

- **Java 17+** (record, sealed interface, text block 적극 사용)
- **패키지 구조**: \`${basePackage}.{domain}.{layer}\`
  - layer: entity, repository, controller, service, dto
- **네이밍 규칙**:
  - Entity: \`{Name}.java\` (단수형)
  - Repository: \`{Name}Repository.java\` (JpaRepository 상속)
  - Controller: \`{Name}Controller.java\` (@RestController, @RequestMapping)
  - Service: \`{Name}Service.java\` (interface) + \`{Name}ServiceImpl.java\`
  - DTO: \`{Name}Request.java\`, \`{Name}Response.java\` (Java record)
- **어노테이션**:
  - Entity: @Entity, @Table, @Id, @GeneratedValue(IDENTITY), @Column
  - 상태 필드: @Enumerated(EnumType.STRING)
  - 생성/수정일: @CreatedDate, @LastModifiedDate (@EntityListeners)
  - 동시성: @Version (Optimistic Lock이 필요한 경우)
- **API 응답**: ResponseEntity 제네릭 (T) 사용, 성공/실패 일관된 응답 구조
- **Validation**: @Valid + Jakarta Validation 어노테이션 (@NotBlank, @Positive 등)
- **한국어 주석**: 핵심 비즈니스 로직에만 간결한 한국어 주석

## 기술 스택

${techSummary}
- Build: Gradle (Kotlin DSL)
- DB: H2 (개발, 파일 모드) → MySQL 8.0 (운영)

## 생성 순서

### Step 1: 프로젝트 기본 파일 (0% → ${stepPercent}%)
- \`${outputDir}/build.gradle.kts\` — Spring Boot 3.2+, 필요 의존성 전체 포함
- \`${outputDir}/settings.gradle.kts\` — rootProject.name 설정
- \`${outputDir}/src/main/resources/application.yml\` — H2 파일 DB + JPA 설정
- \`${outputDir}/src/main/resources/application-prod.yml\` — MySQL 프로파일
- \`${outputDir}/src/main/java/${basePath}/Application.java\` — @SpringBootApplication

[FORGE:PROGRESS:${stepPercent}:프로젝트 기본 구조 생성]

${groups.map((g, i) => {
  const pct = stepPercent + (i + 1) * stepPercent
  const worldId = g.id || 'app'
  const pkg = worldId.replace(/^w-/, '').toLowerCase()
  return `### Step ${i + 2}: ${g.service} (${g.endpoints.length} endpoints) → ${pct}%
- 패키지: \`${basePackage}.${pkg}\`
- Entity: 각 핵심 도메인 객체 (필드, 관계, 상태 enum 포함)
- Repository: JpaRepository + 커스텀 쿼리 메서드
- DTO: Request/Response record (endpoint body/response 기반)
- Service: 인터페이스 + 구현체 (핵심 비즈니스 로직 포함)
- Controller: REST API (엔드포인트 명세 기반)

엔드포인트:
${g.endpoints.map(e => `  - \`${e.method} ${e.path}\` — ${e.summary} | body: ${e.body} → ${e.response}`).join('\n')}

[FORGE:PROGRESS:${pct}:${g.service} 완료]`
}).join('\n\n')}

### 마지막 Step: README + 마무리 → 100%
- \`${outputDir}/README.md\` — 실행 방법, API 목록, 기술 스택 요약
- 전체 파일 목록 출력

[FORGE:PROGRESS:100:전체 프로젝트 생성 완료]

## API 계약 명세 (${groups.length}개 서비스, ${totalEndpoints}개 엔드포인트)

${contractSummary}

## 블럭 기술 명세

${blockDetails}

---

**반드시 위 순서대로 파일을 생성하고, 각 단계마다 [FORGE:PROGRESS:XX:설명]을 출력하세요.**
**코드는 실제로 컴파일되고 실행 가능해야 합니다. TODO나 placeholder 금지.**
`
}

// ═══════════════════════════════════════════════════════════
// Phase 4: Temper — Claude Code 실행용 테스트 프롬프트
// ═══════════════════════════════════════════════════════════

export function generateTemperExecutionPrompt(allSelected, catalogData, outputDir) {
  const blocks = resolveBlocks(allSelected, catalogData)
  if (blocks.length === 0) return ''

  const scenarios = generateTestScenarios(allSelected, catalogData)
  const totalCases = scenarios.reduce((s, sc) => s + sc.tests.length, 0)
  const basePackage = 'com.forge.app'
  const basePath = basePackage.replace(/\./g, '/')
  const testDir = `${outputDir}/src/test/java/${basePath}`

  const stepPercent = Math.floor(85 / (scenarios.length + 1))

  const scenarioSteps = scenarios.map((sc, i) => {
    const pct = (i + 1) * stepPercent
    const cases = sc.tests.map(t => {
      const typeLabel = {
        'happy-path': 'Happy Path', 'edge-case': 'Edge Case',
        'security': 'Security', 'concurrency': 'Concurrency', 'idempotency': 'Idempotency',
      }[t.type] || t.type
      return `  - [${typeLabel}] ${t.name}\n    Given: ${t.given}\n    When: ${t.when}\n    Then: ${t.then}`
    }).join('\n')

    return `### Step ${i + 2}: ${sc.block} 테스트 (${sc.tests.length}개) → ${pct}%
- 파일: \`${testDir}/${sc.blockId ? sc.blockId.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('') : 'Block'}Test.java\`
${cases}

[FORGE:PROGRESS:${pct}:${sc.block} 테스트 완료]`
  }).join('\n\n')

  return `당신은 시니어 QA 엔지니어입니다.
아래 시나리오에 따라 실제 실행 가능한 JUnit 5 테스트 코드를 생성하세요.

## 중요: 작업 규칙

1. 모든 파일은 \`${outputDir}/\` 디렉토리에 생성하세요.
2. 각 단계 완료 시 \`[FORGE:PROGRESS:XX:단계 설명]\` 형식으로 진행 상황을 출력하세요.
3. 기존 \`${outputDir}/src/main/\` 의 소스 코드를 참조하여 테스트하세요.
4. 모든 코드는 즉시 컴파일 가능해야 합니다.

## 테스트 코드 컨벤션

- **JUnit 5** + Mockito + AssertJ
- \`@ExtendWith(MockitoExtension.class)\` 기본 사용
- 통합 테스트: \`@SpringBootTest\` + \`@Transactional\`
- API 테스트: \`@WebMvcTest\` + MockMvc
- 메서드 명: \`given_상황_when_액션_then_결과\` (snake_case)
- Given-When-Then 구조를 주석으로 명시
- 패키지: \`${basePackage}.{domain}\`

## 생성 순서

### Step 1: 테스트 설정 → ${stepPercent}%
- \`${testDir}/TestConfig.java\` — 공통 테스트 설정 (필요 시)
- build.gradle.kts에 테스트 의존성이 있는지 확인

[FORGE:PROGRESS:${stepPercent}:테스트 기��� 설정 완료]

${scenarioSteps}

### 마지막: 마무리 → 100%
- 전체 테스트 파일 목록 출력

[FORGE:PROGRESS:100:전체 테스트 생성 완료]

## 시나리오 (${scenarios.length}개 블럭, ${totalCases}개 케이스)

**반드시 위 순서대로 파일을 생성하고, 각 단계마다 [FORGE:PROGRESS:XX:설명]을 출력하세요.**
`
}

// ═══════════════════════════════════════════════════════════
// Phase 4: Temper — 테스트 코드 생성 프롬프트 (복사용)
// ═══════════════════════════════════════════════════════════

export function generateTemperPrompt(allSelected, catalogData) {
  const blocks = resolveBlocks(allSelected, catalogData)
  if (blocks.length === 0) return ''

  const scenarios = generateTestScenarios(allSelected, catalogData)
  const groups = generateContracts(allSelected, catalogData)
  const techSummary = formatTechStack(blocks)
  const totalCases = scenarios.reduce((s, sc) => s + sc.tests.length, 0)

  const scenarioBlocks = scenarios.map(sc => {
    const cases = sc.tests.map(t => {
      const typeLabel = {
        'happy-path':  'Happy Path',
        'edge-case':   'Edge Case',
        'security':    'Security',
        'concurrency': 'Concurrency',
        'idempotency': 'Idempotency',
      }[t.type] || t.type

      return `#### [${typeLabel}] ${t.name}\n- **Given**: ${t.given}\n- **When**: ${t.when}\n- **Then**: ${t.then}`
    }).join('\n\n')

    return `### ${sc.icon} ${sc.block} (\`${sc.blockId}\`)\n\n${cases}`
  }).join('\n\n---\n\n')

  return `# Forge Protocol — 테스트 코드 생성 프롬프트

> Forge Protocol Web UI가 자동 생성했습니다.
> 아래 내용을 Claude에 붙여넣으면 테스트 코드가 생성됩니다.

---

## System Prompt

당신은 시니어 QA 엔지니어이자 테스트 전문가입니다.
Forge Protocol의 블럭 시나리오를 바탕으로 실제 실행 가능한 테스트 코드를 생성하세요.

### 기술 스택

${techSummary}
- 테스트 유형: 단위 테스트, 통합 테스트

### 테스트 프레임워크 (Spring Boot)

- 단위 테스트: JUnit 5 + Mockito
- 통합 테스트: @SpringBootTest + Testcontainers
- API 테스트: MockMvc (@WebMvcTest)
- 의존성: \`spring-boot-starter-test\`, \`testcontainers\`

#### 단위 테스트 규칙
- Service 클래스만 테스트. Repository는 Mockito로 모킹.
- 각 메서드당 정상/예외 케이스 최소 1개씩.
- \`@ExtendWith(MockitoExtension.class)\` 사용.

#### 통합 테스트 규칙
- \`@SpringBootTest\` + Testcontainers(MySQL) 사용.
- 각 테스트 전 DB 초기화 (\`@Transactional\` 또는 \`@Sql\`).
- API 테스트는 MockMvc 또는 RestAssured 사용.

### 출력 형식

각 테스트 클래스마다:
1. 파일명과 패키지 선언
2. 테스트 어노테이션 및 설정
3. Given-When-Then 구조를 메서드 이름과 주석으로 명확히 표현
4. 각 테스트 케이스 이름: \`given_상황_when_액션_then_결과\`

---

## User Message

### 테스트 시나리오 (${scenarios.length}개 블럭, 총 ${totalCases}개 케이스)

${scenarioBlocks}

---

## 생성 요청

위 시나리오를 바탕으로 실제 실행 가능한 테스트 코드를 생성해주세요.

**추가 요청사항:**
- 각 테스트 파일 앞에 \`// === BLOCK: {block_id} ===\` 헤더 추가.
- 모든 테스트는 \`.forge/generated/\` 하위의 소스 코드를 대상으로 작성해주세요.
${buildConcernsSection(blocks, 'temper', '**선택된 블럭에 적용되는 도메인 특수 지침:**')}`
}

// ═══════════════════════════════════════════════════════════
// Phase 5: Inspect — 검수 AI 리뷰 프롬프트
// ═══════════════════════════════════════════════════════════

export function generateInspectPrompt(allSelected, catalogData) {
  const blocks = resolveBlocks(allSelected, catalogData)
  if (blocks.length === 0) return ''

  const report = generateInspectReport(allSelected, catalogData)
  const groups = generateContracts(allSelected, catalogData)
  const techSummary = formatTechStack(blocks)
  const blockList = formatBlockList(blocks)

  const allFindings = report.perspectives.flatMap(p =>
    p.findings.map(f => ({ ...f, category: p.id }))
  )

  const findingsText = allFindings.length > 0
    ? allFindings.map((f, i) => {
        const sevLabel = { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', info: 'INFO' }[f.severity] || f.severity
        return `${i + 1}. **[${sevLabel}] ${f.title}** (${f.category})\n   - 문제: ${f.desc}\n   - 방향: 코드 레벨 개선안 필요`
      }).join('\n\n')
    : '(자동 감지 없음)'

  const contractSummary = groups
    .map(g => `- **${g.service}** (${g.endpoints.length} endpoints): ${g.endpoints.map(e => `${e.method} ${e.path}`).join(', ')}`)
    .join('\n')

  return `# Forge Protocol — 검수 AI 리뷰 프롬프트

> Forge Protocol Web UI가 자동 생성했습니다.
> 아래 전체 내용을 Claude에 붙여넣으세요.

---

## System Prompt

당신은 10년 이상의 경험을 가진 시니어 소프트웨어 아키텍트입니다.
Forge Protocol로 설계된 프로젝트의 아키텍처와 기술 결정을 검수하세요.

### 검수 원칙
1. **실용주의**: 현재 단계(MVP)에 맞는 현실적인 개선안만 제시. 과도한 설계 금지.
2. **근거 제시**: 각 문제에 실제 발생 가능한 시나리오와 코드 예시 포함.
3. **우선순위**: 비즈니스 영향도(매출 손실 > 서비스 중단 > 기술부채) 기준으로 정렬.
4. **트레이드오프**: 개선안의 복잡도 증가 비용도 함께 제시.
5. 한국어로 작성. 코드는 Spring Boot 기준.

---

## User Message

### 프로젝트 기술 스택

${techSummary}

### 선택된 블럭 (${blocks.length}개)

${blockList}

### API 계약 현황

${contractSummary}

### 자동 감지된 리스크 (${allFindings.length}건)

${findingsText}

---

## 검수 요청

#### 보안 리뷰 요청
- OWASP Top 10 기준으로 현재 아키텍처의 취약점을 분석하세요.
- 인증/인가 흐름의 보안 허점을 찾아 구체적인 코드 패턴으로 개선안을 제시하세요.

#### 성능 리뷰 요청
- JPA/DB 사용 패턴에서 N+1, 풀테이블스캔, 인덱스 미사용 위험을 분석하세요.
- 각 API의 예상 쿼리 수를 추정하고, 최적화 방법을 제시하세요.
- 캐시 도입이 효과적인 위치를 찾고 TTL 전략을 제안하세요.

#### 운영 리뷰 요청
- 운영 중 장애를 빠르게 감지하고 복구하기 위한 모니터링 체계를 설계하세요.
- 로깅 전략 (무엇을, 어느 레벨로, 어떤 형식으로)을 구체적으로 제시하세요.
- 배포 전략 (Blue/Green, Canary, Rolling)과 롤백 시나리오를 제안하세요.

#### 확장성 리뷰 요청
- 현재 아키텍처에서 트래픽 10배 증가 시 병목이 될 위치를 예측하세요.
- 단일장애점을 제거하기 위한 아키텍처 변경안을 제시하세요.
- 이벤트 기반 아키텍처로의 점진적 전환 로드맵을 제안하세요.
${buildConcernsSection(blocks, 'inspect', '#### 도메인 특수 검수 요청 (선택된 블럭 기반 자동 감지)')}

---

### 출력 형식

각 관점마다 다음 구조로 작성하세요:

\`\`\`
## [관점명] 검수 결과

### 1. [항목명] — 심각도: HIGH/MEDIUM/INFO

**문제 상황**
(실제 코드에서 어떻게 문제가 발생하는지 구체적으로)

**개선 코드 예시**
// Before (문제 있는 코드)
// After (개선된 코드)

**적용 우선순위**: MVP 필수 / MVP 포함 권장 / v2 이후
\`\`\`

---

> 모든 고위험 항목은 코드 구현 전에 반드시 해결 방안을 확정하세요.
`
}
