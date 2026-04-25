/**
 * shared/meta-smelt-prompts.js — Meta-Smelt AI 카탈로그 생성 프롬프트.
 *
 * CLI(`lib/meta-smelt.js`)와 Web UI(`web/src/metaSmeltUtils.js`)가 모두 사용하도록
 * 공유 모듈로 추출. 동일한 SYSTEM_PROMPT 와 user message 형식이 양쪽에서 일관되게
 * 출력되어, 사용자가 어떤 진입점을 쓰든 같은 품질의 catalog.yml 을 받게 한다.
 *
 * 진입점:
 *   buildQuickCatalogPrompt(freeText)            — Quick 모드 (자유 입력 한 번)
 *   buildDeepCatalogPrompt(input)                 — Deep 모드 (6단계 설문 결과)
 */

import { ROLE_OPTIONS } from './domain-surveys.js';

/**
 * 구조 참고용 미니 예시 — 도메인 중립(인증/로그인).
 * 모든 최상위 섹션(worlds/bundles/blocks/dependencies/cascades/prerequisites)과
 * 필수 필드·패턴(user_desc 2겹 언어, analogy, requires 의존성, cascade 분기, World 0)을
 * 모두 담으면서 특정 버티컬(커머스·HR 등)에 편향되지 않게 구성.
 */
const MINI_EXAMPLE = `# Forge Protocol — 구조 참고용 미니 예시 (도메인 무관)
# 이 예시는 YAML 형식과 필드 규칙을 보여주는 최소 샘플입니다.
# 사용자 도메인에 맞게 완전히 새로 설계하세요 — 이 예시 내용 자체를 베끼지 마세요.

worlds:
  - id: w-core
    title: "핵심 기능의 세계"
    description: "사용자가 서비스와 처음 만나는 지점"
    order: 1
    slug: core-access            # 멀티모듈 emit 시 :domain-core-access

bundles:
  - id: b-core-auth
    world_id: w-core
    title: "인증"
    description: "가입과 로그인"

blocks:
  - id: signup
    bundle_id: b-core-auth
    name: "회원가입"
    user_desc: "새로운 사용자가 서비스에 처음 들어오는 문입니다. 주민등록을 하는 것과 비슷해요."
    tech_desc: "POST /auth/signup — 이메일/비밀번호 검증, BCrypt 해시, users 테이블 INSERT, JWT 발급"
    analogy: "주민등록"
    priority: required
    effort_days: 3

  - id: login
    bundle_id: b-core-auth
    name: "로그인"
    user_desc: "이미 가입한 사용자가 다시 들어오는 문입니다. 도어락 비밀번호를 누르는 것과 같아요."
    tech_desc: "POST /auth/login — BCrypt 검증, JWT 재발급, Refresh Token 관리"
    analogy: "열쇠로 문 열기"
    priority: required
    effort_days: 2

dependencies:
  - source: login
    target: signup
    type: requires
    condition: "가입된 계정이 있어야 로그인 가능"

cascades:
  - trigger: signup
    add_blocks: []
    ask_questions:
      - question: "소셜 로그인도 지원할까요?"
        options:
          - "이메일/비밀번호만"
          - "소셜 로그인(구글·카카오)도 지원"
        cascade_effects:
          - "OAuth2 블럭 추가 여부 결정"

prerequisites:
  - id: prereq-domain
    name: "도메인 구매"
    phase: "World 0"
    where: "가비아, Namecheap 등"
    time: "즉시"
    cost: "연 1~3만원"
    enables:
      - signup
      - login
`;

/**
 * 시스템 프롬프트 (Quick/Deep 공유). Forge Protocol 카탈로그 설계 규칙 + 미니 예시.
 */
const SYSTEM_PROMPT = `당신은 Forge Protocol의 카탈로그 설계자입니다.
사용자의 사업 아이디어를 분석하여, Forge Protocol 형식의 블럭 카탈로그(catalog.yml)를 YAML로 생성하세요.

### Forge Protocol 핵심 원칙

1. **줌 레벨 구조**: World(사업 도메인) → Bundle(기능 묶음) → Block(개별 기능)
2. **두 겹의 언어**: 모든 Block에는 반드시 두 가지 설명이 공존해야 합니다:
   - \`user_desc\`: 일반인이 이해할 수 있는 일상 언어. 비유와 예시를 사용.
   - \`tech_desc\`: 개발자를 위한 기술 명세. 구체적인 기술 스택, 패턴, 자료구조 포함.
3. **analogy**: 각 Block의 기능을 한 줄 비유로 표현 (예: "마트 쇼핑카트", "택배 조회하기")
4. **의존성 그래프**: Block 간 \`requires\`(필수 의존)와 \`affects\`(영향) 관계를 정의
5. **캐스케이드**: 특정 Block 선택 시 사용자에게 물어야 할 사업적 결정사항
6. **World 0 준비물**: 코드 작성 전에 현실에서 준비해야 할 것들 (사업자등록, 계약 등)

### YAML 스키마 (반드시 이 구조를 따르세요)

\`\`\`yaml
worlds:
  - id: w-{도메인}        # 고유 ID (w- 접두사)
    title: "..."          # 한글 제목 (일반인이 이해할 수 있는 표현)
    description: "..."    # 한 줄 설명
    order: 1
    slug: "..."           # 영문 kebab-case (멀티모듈 emit 시 모듈/패키지명)              # 표시 순서

bundles:
  - id: b-{세계}-{그룹}   # 고유 ID (b- 접두사)
    world_id: w-{도메인}   # 소속 World
    title: "..."
    description: "..."

blocks:
  - id: {기능명}           # 고유 ID (소문자-하이픈)
    bundle_id: b-{...}    # 소속 Bundle
    name: "..."           # 한글 기능 이름
    user_desc: "..."      # 일반인용 설명 (2~3문장, 비유 포함, 존댓말)
    tech_desc: "..."      # 개발자용 설명 (기술 스택, 패턴, 자료구조)
    analogy: "..."        # 한 줄 비유
    priority: required|optional   # 필수 vs 선택
    effort_days: N        # 예상 공수 (일 단위)

dependencies:
  - source: {블럭A}       # 의존하는 블럭
    target: {블럭B}       # 의존 대상
    type: requires|affects  # requires: B 없이 A 불가 / affects: A가 B에 영향
    condition: "..."      # 의존 이유 설명

cascades:
  - trigger: {블럭ID}     # 이 블럭 선택 시 질문 발생
    add_blocks: []        # 자동 추가할 블럭 (보통 비워둠)
    ask_questions:
      - question: "..."   # 사업적 결정 질문
        options:          # 2~4개 선택지
          - "..."
          - "..."
        cascade_effects:  # 이 결정이 코드에 미치는 영향
          - "..."

prerequisites:
  - id: prereq-{이름}
    name: "..."           # 준비물 이름
    phase: "World 0"
    where: "..."          # 어디서 준비하는지
    time: "..."           # 소요 기간
    cost: "..."           # 비용
    enables:              # 이 준비물이 활성화하는 블럭들
      - {블럭ID}
\`\`\`

### 설계 규칙

0. **World slug (중요)**: 각 World 에 도메인 맥락을 반영한 **영문 kebab-case slug** 를 부여하세요.
   - 멀티모듈 emit 시 \`:domain-{slug}\` Gradle 모듈명과 \`com.forge.app.{slug 영숫자만}\` Java 패키지가 됩니다.
   - 단순한 역할명("seller"/"buyer") 보다 **도메인 맥락이 살아있는 이름**을 선호하세요.
     - 좋은 예 (커머스): \`marketplace\` (판매자 측), \`storefront\` (구매자 측), \`fulfillment\` (물류), \`billing\` (정산)
     - 좋은 예 (치과 예약): \`dental-clinic\` (병원 측), \`patient-portal\` (환자 측)
     - 좋은 예 (채용): \`seeker\` (구직자), \`ingestion\` (수집), \`operator\` (운영)
     - 피해야 할 예: \`world1\`, \`buyer\`(너무 일반적), 한글, 공백 포함
   - 형식: 영문 소문자/숫자/하이픈만. 첫 글자는 영문/숫자.
   - 5~20자 권장. 추후 사용자가 catalog.yml 에서 자유롭게 수정 가능합니다.

1. **World 개수**: 3~7개. 사업 도메인을 사람 관점에서 분류 (예: "파는 사람의 세계", "사는 사람의 세계")
2. **Block 개수**: 규모에 따라 조절:
   - MVP: 10~15개 (필수만)
   - 소규모: 15~25개
   - 중규모: 25~40개
   - 대규모: 40개+
3. **필수(required) 비율**: 전체 블럭의 50~70%
4. **의존성**: 모든 requires 관계의 target 블럭은 blocks에 존재해야 함
5. **effort_days 기준**: 시니어 개발자 1명 기준. 소수점 없이 정수.
6. **캐스케이드**: 사업적 분기점이 있는 블럭에만. 기술적 결정이 아닌 사업적 결정만.
7. **World 0**: 해당 업종에서 법적으로 또는 실무적으로 반드시 필요한 준비물만.
8. **ID 규칙**: 모든 ID는 영문 소문자 + 하이픈. 공백/한글 금지.

### 참고 예시 (구조 샘플 — 도메인 무관)

아래는 YAML 구조와 필드 규칙을 보여주는 최소 예시입니다.
**구조·필드 사용법만 참고하고**, 내용은 사용자 도메인에 맞게 새로 설계하세요. 이 예시의 블럭(signup/login)을 그대로 포함하지 마세요.

<example>
${MINI_EXAMPLE}</example>`;

/**
 * 공통 프롬프트 셸 — 헤더 + System Prompt + User Message.
 */
function buildPrompt({ userMessageBody, modeLabel }) {
  return `# Forge Protocol — AI 카탈로그 생성 프롬프트 (${modeLabel})

> 이 파일은 \`forge meta-smelt\`가 자동 생성했습니다.
> 아래 내용을 Claude (또는 다른 AI)에 붙여넣으면 catalog.yml이 생성됩니다.

---

## System Prompt

${SYSTEM_PROMPT}

---

## User Message

${userMessageBody}
`;
}

/**
 * Quick 모드 User Message — 자유 입력 + 보완 지시문.
 * AI가 누락 정보를 도메인 지식으로 추론하도록 유도한다.
 */
export function buildQuickUserMessage(freeText) {
  return `다음 정보를 기반으로 Forge Protocol catalog.yml을 YAML 형식으로 생성해주세요.
코드 블럭(\`\`\`yaml ... \`\`\`) 안에 YAML만 출력하세요. 설명은 YAML 주석으로 넣어주세요.

### 사용자 입력 (자유 형식)
${freeText}

### Quick 모드 보완 지시사항
- 위 입력에서 명시되지 않은 항목(역할/규모/제약사항/캐스케이드/World 0 준비물 등)은
  **도메인 지식과 보편적 베스트 프랙티스로 합리적 가정**을 하여 보완해주세요.
- 가정한 부분은 YAML 주석(\`# 가정: ...\`)으로 명시해주세요. 사용자가 검토/수정할 수 있도록.
- 입력에서 도메인을 명확히 추론할 수 없으면 가장 일반적인 케이스를 가정합니다.
- 규모가 명시되지 않았다면 **MVP(10~15개 블럭)** 를 기본으로 합니다.
- 사용자 역할이 명시되지 않았다면 도메인의 표준 역할(예: 사용자, 관리자)을 가정합니다.
- 캐스케이드 질문은 도메인의 핵심 사업적 분기점에 집중하세요.
- World 0 prerequisites는 해당 도메인에서 일반적으로 필요한 법적/실무적 준비물을 추론하세요.
`;
}

/**
 * Deep 모드 User Message — 6단계 설문 결과를 구조화하여 전달.
 */
export function buildDeepUserMessage(input) {
  const domainLabel = input.domain.startsWith('other:') ? input.domain.replace('other: ', '') : input.domain;

  const roleDescriptions = input.roles
    .map((r) => {
      const found = ROLE_OPTIONS.find((o) => o.value === r);
      return found ? `- ${found.name}` : `- ${r}`;
    })
    .join('\n');

  // 심층 질문 답변 포맷
  const deepDiveSection = Object.entries(input.deep_dive)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');

  // 워크플로우 포맷
  const workflowSection = Object.entries(input.workflows || {})
    .map(([role, flow]) => {
      const roleName = ROLE_OPTIONS.find((o) => o.value === role)?.name?.split(' — ')[0] || role;
      return `- ${roleName}: ${flow}`;
    })
    .join('\n');

  // 제약사항 포맷
  const constraintSection = (input.constraints || []).map((c) => `- ${c}`).join('\n');

  return `다음 정보를 기반으로 Forge Protocol catalog.yml을 YAML 형식으로 생성해주세요.
코드 블럭(\`\`\`yaml ... \`\`\`) 안에 YAML만 출력하세요. 설명은 YAML 주석으로 넣어주세요.

### 사업 아이디어
${input.idea}

### 업종
${domainLabel}

### 사업 구조 (심층 분석)
${deepDiveSection || '(추가 정보 없음)'}

### 서비스에 참여하는 역할
${roleDescriptions}

### 역할별 워크플로우
${workflowSection || '(정의되지 않음 — AI가 도메인 지식 기반으로 추론해주세요)'}

### 핵심 기능 (반드시 포함)
${input.core_features}

### 목표 규모
${
  input.scale === 'mvp'
    ? 'MVP (최소 기능, 빠른 검증) — 10~15개 블럭'
    : input.scale === 'small'
      ? '소규모 (초기 서비스) — 15~25개 블럭'
      : input.scale === 'medium'
        ? '중규모 (성장 단계) — 25~40개 블럭'
        : '대규모 (엔터프라이즈) — 40개+ 블럭'
}

### 특수 제약사항 (World 0에 반영 필요)
${constraintSection || '(해당 없음)'}

### 추가 지시사항
- 사업 구조 답변을 바탕으로 도메인에 특화된 블럭을 설계하세요.
- 워크플로우를 참고하여 각 역할의 여정(journey)이 빠짐없이 블럭에 반영되었는지 확인하세요.
- 제약사항은 World 0 prerequisites에 구체적인 준비물로 변환하세요.
- 캐스케이드 질문은 사업 구조에서 분기가 생기는 지점에 집중하세요.
`;
}

// ── 외부 진입점 ────────────────────────────────────────────

/**
 * Quick 모드 — 자유 입력 한 단락을 받아 SYSTEM_PROMPT 포함된 full prompt 반환.
 */
export function buildQuickCatalogPrompt(freeText) {
  return buildPrompt({ userMessageBody: buildQuickUserMessage(freeText), modeLabel: 'Quick' });
}

/**
 * Deep 모드 — 6단계 설문 결과(input)를 받아 SYSTEM_PROMPT 포함된 full prompt 반환.
 */
export function buildDeepCatalogPrompt(input) {
  return buildPrompt({ userMessageBody: buildDeepUserMessage(input), modeLabel: 'Deep' });
}

// buildQuickUserMessage / buildDeepUserMessage 는 위에서 이미 export 됨
