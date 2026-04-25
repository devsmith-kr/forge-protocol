// metaSmeltUtils.js — 프롬프트 빌더 + Claude 응답 파서

// CLI(`lib/meta-smelt.js`)와 동일한 프롬프트를 출력하기 위해 shared 모듈에서 re-export.
// MetaSmeltPhase.jsx 의 Quick/Deep 핸들러가 이 두 함수를 호출한다.
export { buildQuickCatalogPrompt, buildDeepCatalogPrompt } from '../../shared/meta-smelt-prompts.js';


// ── 카탈로그 자동 생성 프롬프트 ───────────────────────────
export function buildCatalogGenerationPrompt(domainDescription) {
  return `# Forge Protocol — 카탈로그 자동 생성 요청

## 도메인 설명
${domainDescription.trim()}

## 지시사항
위 도메인에 맞는 Forge Protocol 블럭 카탈로그를 YAML 형식으로 생성해주세요.

구성 기준:
- World: 큰 사용자 관점 그룹 (3~5개)
- Bundle: World 내 기능 묶음 (World당 1~3개)
- Block: 독립적으로 개발 가능한 기능 단위 (총 15~25개)
- Dependency: 블럭 간 실제 코드 레벨 의존 관계만 포함

아래 YAML 형식으로만 응답하세요 (설명 없이 코드블록만):

\`\`\`yaml
name: 서비스명
domain: domain-id   # 영문 소문자 kebab-case

worlds:
  - id: w-xxx
    title: 월드명 (한국어)
    icon: 이모지
    desc: 한줄 설명

bundles:
  - id: b-xxx-yyy
    world_id: w-xxx
    title: 번들명 (한국어)

blocks:
  - id: feature-name       # 영문 kebab-case, 고유해야 함
    bundle_id: b-xxx-yyy
    icon: 이모지
    name: 기능명 (한국어)
    user_desc: 비개발자가 이해할 수 있는 설명 (~하는 기능이에요 형식 권장)
    tech_desc: 기술 스택·패턴·라이브러리 중심 설명 (개발자용)
    priority: required      # required(핵심) | optional(부가)
    effort_days: 3          # 1인 개발자 기준 현실적 일수, 과소평가 금지

dependencies:
  - source: block-id       # 이 블럭이
    target: block-id       # 이 블럭을 필요로 함
    type: requires
    reason: 의존 이유 (한국어 한 문장)
\`\`\`

주의:
- user_desc는 기술 용어 없이, tech_desc는 기술 스택 명시
- priority required는 없으면 서비스가 동작 안 되는 것만
- dependency는 UX 흐름이 아닌 코드·데이터 레벨 의존성만`.trim()
}

// ── YAML 카탈로그 응답 파서 (코드블록 추출) ──────────────
export function extractYamlFromResponse(text) {
  const codeBlock = text.match(/```(?:yaml|yml)?\s*([\s\S]+?)\s*```/)
  return codeBlock ? codeBlock[1] : text.trim()
}

export function buildMetaSmeltPrompt(catalog, userInput) {
  const blockLines = catalog.blocks
    .map(b =>
      `• [${b.id}] ${b.name} — ${b.user_desc} (${b.priority === 'required' ? '필수' : '선택'}, ${b.effort_days}일)`
    )
    .join('\n')

  return `# Forge Protocol — Meta-Smelt 블럭 추천 요청

## 사용 가능한 블럭 카탈로그 (${catalog.name || '커머스'})
${blockLines}

## 프로젝트 요구사항
${userInput.trim()}

## 지시사항
위 요구사항을 분석해서 필요한 블럭을 추천하세요.
아래 JSON 형식으로만 응답하세요 (다른 설명 없이 JSON 코드블록만):

\`\`\`json
{
  "recommended": [
    { "id": "block-id", "reason": "추천 이유 (한국어 한 문장)", "confidence": "high" }
  ],
  "summary": "전체 구성 요약 (1-2문장, 총 예상 공수 포함)"
}
\`\`\`

confidence 기준:
- high   : 요구사항에 명시된 핵심 기능 — 반드시 포함
- medium : 언급되진 않았지만 함께 있으면 좋은 기능
- low    : 나중 단계에서 추가 고려할 기능

주의:
- 카탈로그에 없는 id는 절대 포함하지 마세요
- "MVP", "우선", "핵심" 같은 단어가 있으면 required 블럭 위주로 구성하세요
- confidence: low 항목은 최소화하세요 (없어도 됨)`.trim()
}

export function parseClaudeResponse(text) {
  // 코드블록 안의 JSON 우선 추출
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  const raw = codeBlock ? codeBlock[1] : text.trim()

  let data
  try {
    data = JSON.parse(raw)
  } catch {
    // 중괄호 범위 직접 추출 시도
    const jsonMatch = raw.match(/\{[\s\S]+\}/)
    if (!jsonMatch) throw new Error('JSON을 찾을 수 없습니다')
    data = JSON.parse(jsonMatch[0])
  }

  if (!Array.isArray(data.recommended)) {
    throw new Error('"recommended" 배열이 없습니다')
  }

  return {
    recommended: data.recommended.filter(r => r.id && typeof r.id === 'string'),
    summary:     data.summary || '',
  }
}

// 규칙 기반 즉시 추천 (API 응답 전 플레이스홀더용)
const KEYWORD_MAP = {
  '결제':    ['payment', 'pg-integration'],
  '카드':    ['payment', 'pg-integration'],
  '주문':    ['order', 'cart', 'buyer-signup'],
  '장바구니':['cart'],
  '배송':    ['shipping', 'order'],
  '택배':    ['shipping'],
  '회원':    ['buyer-signup'],
  '로그인':  ['buyer-signup'],
  '소셜':    ['social-login', 'buyer-signup'],
  '카카오':  ['social-login', 'buyer-signup'],
  '상품':    ['product-register', 'product-category', 'product-detail'],
  '검색':    ['product-search'],
  '재고':    ['inventory-manage'],
  '리뷰':    ['review'],
  '쿠폰':    ['coupon'],
  '환불':    ['refund', 'cancel-return'],
  '취소':    ['cancel-return'],
  '정산':    ['settlement'],
  '알림':    ['notification'],
  '문자':    ['notification'],
  '관리자':  ['admin-dashboard'],
  '대시보드':['admin-dashboard'],
  'mvp':     [],
  'MVP':     [],
}

export function quickRecommend(userInput, catalog) {
  const matched = new Set()
  const lower = userInput.toLowerCase()

  for (const [keyword, ids] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(keyword.toLowerCase())) {
      ids.forEach(id => matched.add(id))
    }
  }

  const validIds = new Set(catalog.blocks.map(b => b.id))
  const filtered = [...matched].filter(id => validIds.has(id))

  return filtered.map(id => ({
    id,
    reason: '키워드 기반 추천',
    confidence: 'medium',
  }))
}
