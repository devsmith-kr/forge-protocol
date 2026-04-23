/**
 * Forge Protocol — YAML 파일 스키마 정의 (Zod)
 *
 * state.yml, intent.yml, architecture.yml, contracts.yml,
 * test-scenarios.yml, catalog.yml의 구조를 검증한다.
 */

import { z } from 'zod';

// ── state.yml ─────────────────────────────────────────
export const StateSchema = z.object({
  phase: z.string(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  template: z.string().optional(),
  selected_blocks_count: z.number().optional(),
});

// ── intent.yml ────────────────────────────────────────
const SelectedBlockItem = z.object({
  id: z.string(),
  name: z.string(),
});

const DecisionItem = z.object({
  trigger: z.string(),
  question: z.string(),
  answer: z.string().optional(),
  options: z.array(z.string()).optional(),
  cascade_effects: z.union([z.array(z.string()), z.record(z.unknown())]).optional(),
});

const PrerequisiteItem = z.object({
  id: z.string().optional(),
  name: z.string(),
  where: z.string().optional(),
  time: z.string().optional(),
  cost: z.string().optional(),
  phase: z.string().optional(),
  enables: z.array(z.string()).optional(),
});

export const IntentSchema = z.object({
  phase: z.string(),
  created_at: z.string().optional(),
  template: z.string().optional(),
  // 팀 규모 (Phase 2 아키텍처 스타일 가드레일 입력) — 미지정 시 1 가정
  team_size: z.number().int().positive().optional(),
  selected_blocks: z.array(SelectedBlockItem),
  auto_added_blocks: z.array(SelectedBlockItem.extend({ reason: z.string().optional() })).optional(),
  all_blocks: z.array(z.string()),
  affected_blocks: z.array(SelectedBlockItem).optional(),
  decisions: z.array(DecisionItem).optional(),
  prerequisites: z.array(PrerequisiteItem).optional(),
});

// ── selected-blocks.yml ───────────────────────────────
const BlockEstimate = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.string().optional(),
  effort_days: z.number().optional(),
});

export const SelectedBlocksSchema = z.object({
  blocks: z.array(BlockEstimate),
  total_effort_days: z.number().optional(),
});

// ── architecture.yml ──────────────────────────────────
const AdrItem = z.object({
  id: z.string(),
  title: z.string(),
  decision: z.string().optional(),
  context: z.string().optional(),
  status: z.string().optional(),
  transition_triggers: z.string().optional(),
});

const ArchitectureStyleItem = z.object({
  style: z.string(),
  choice: z.string(),
  reason: z.string(),
  transition: z.string(),
}).partial();

export const ArchitectureSchema = z.object({
  phase: z.string(),
  created_at: z.string().optional(),
  tech_stack: z.record(z.string(), z.string()),
  architecture_style: ArchitectureStyleItem.optional(),
  detected_features: z.array(z.string()).optional(),
  adr: z.array(AdrItem).optional(),
});

// ── contracts.yml ─────────────────────────────────────
const EndpointItem = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string(),
  description: z.string().optional(),
});

const ApiBlock = z.object({
  block_id: z.string(),
  block_name: z.string(),
  base_path: z.string(),
  endpoints: z.array(EndpointItem),
});

export const ContractsSchema = z.object({
  generated_at: z.string().optional(),
  tech_stack: z.record(z.string(), z.string()).optional(),
  apis: z.array(ApiBlock),
});

// ── test-scenarios.yml ────────────────────────────────
const TestCase = z.object({
  name: z.string(),
  type: z.string().optional(),
  given: z.string(),
  when: z.string(),
  then: z.string(),
  priority: z.string().optional(),
});

const ScenarioBlock = z.object({
  block_id: z.string(),
  block_name: z.string().optional(),
  base_path: z.string().optional(),
  risk_level: z.string().optional(),
  test_cases: z.array(TestCase),
});

export const TestScenariosSchema = z.object({
  phase: z.string().optional(),
  generated_at: z.string().optional(),
  tech_stack: z.record(z.string(), z.string()).optional(),
  test_types: z.array(z.string()).optional(),
  total_blocks: z.number().optional(),
  total_cases: z.number().optional(),
  scenarios: z.array(ScenarioBlock),
});

// ── catalog.yml ───────────────────────────────────────
const WorldItem = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  order: z.number().optional(),
});

const BundleItem = z.object({
  id: z.string(),
  world_id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

const BlockItem = z.object({
  id: z.string(),
  bundle_id: z.string(),
  name: z.string(),
  user_desc: z.string().optional(),
  tech_desc: z.string().optional(),
  analogy: z.string().optional(),
  priority: z.string().optional(),
  effort_days: z.number().optional(),
  // 블럭이 노출하는 API 유형 — contracts 추론에 영향.
  //   resource: CRUD (기본)
  //   query:    GET 만 (검색·대시보드·이력 등)
  //   internal: REST 없음 (스케줄러·정규화기·인덱서 등 내부 서비스)
  api_style: z.enum(['resource', 'query', 'internal']).optional(),
  // 블럭이 건드리는 도메인 관심사 태그 — 프롬프트에 조건부 섹션 삽입에 사용.
  // 값: payment | auth | concurrency | crawling | search | realtime
  //    | file-upload | notification | pii
  concerns: z.array(z.string()).optional(),
});

const DependencyItem = z.object({
  source: z.string(),
  target: z.string(),
  type: z.enum(['requires', 'affects']),
  condition: z.string().optional(),
  reason: z.string().optional(),
});

export const CatalogSchema = z.object({
  worlds: z.array(WorldItem),
  bundles: z.array(BundleItem),
  blocks: z.array(BlockItem),
  dependencies: z.array(DependencyItem).optional(),
  cascades: z.array(z.object({
    trigger: z.string(),
    add_blocks: z.array(z.string()).optional(),
    ask_questions: z.array(z.object({
      question: z.string(),
      options: z.array(z.string()).optional(),
      cascade_effects: z.union([z.array(z.string()), z.record(z.unknown())]).optional(),
    })).optional(),
  })).optional(),
  prerequisites: z.array(PrerequisiteItem).optional(),
});

// ── 검증 헬퍼 ─────────────────────────────────────────

/**
 * 스키마로 데이터를 검증한다.
 * 성공 시 data 반환, 실패 시 경고 메시지 출력 후 data를 그대로 반환 (하위 호환성 유지).
 *
 * @param {z.ZodSchema} schema
 * @param {unknown} data
 * @param {string} fileName - 에러 메시지에 표시할 파일명
 * @returns {unknown} 검증된 데이터 (실패해도 원본 반환)
 */
export function validateYaml(schema, data, fileName) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map(i => `    ${i.path.join('.')} — ${i.message}`)
      .join('\n');
    console.warn(`\n  ⚠ ${fileName} 구조 경고:\n${issues}\n`);
  }
  return data;
}
