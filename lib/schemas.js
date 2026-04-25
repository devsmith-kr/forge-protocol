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

const ArchitectureStyleItem = z
  .object({
    style: z.string(),
    choice: z.string(),
    reason: z.string(),
    transition: z.string(),
  })
  .partial();

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
  icon: z.string().optional(), // UI 표시용 이모지
  description: z.string().optional(),
  order: z.number().optional(),
  // 멀티모듈 emit 시 모듈/패키지명으로 쓰이는 영문 슬러그 (선택).
  // AI 가 도메인 맥락을 반영해 추론하거나 사용자가 catalog.yml 에 직접 명시.
  // 형식: kebab-case 권장. snake_case/대문자 입력은 layout.normalizeSlug 가 흡수.
  // 비어있으면 자동 slugify(title) → fallback.
  slug: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, {
      message:
        '영문/숫자로 시작하는 영숫자/하이픈/언더스코어 조합이어야 합니다 (예: marketplace, dental-clinic, dental_hospital)',
    })
    .optional(),
});

const BundleItem = z.object({
  id: z.string(),
  world_id: z.string(),
  title: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
});

const BlockItem = z.object({
  id: z.string(),
  bundle_id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  user_desc: z.string().optional(),
  tech_desc: z.string().optional(),
  analogy: z.string().optional(),
  // priority 는 엄격 enum — 오탈자(required→mandatory 등) 즉시 거부
  priority: z.enum(['required', 'optional']).optional(),
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

export const CatalogSchema = z
  .object({
    name: z.string().optional(),
    domain: z.string().optional(),
    team_size: z.number().int().positive().optional(),
    worlds: z.array(WorldItem),
    bundles: z.array(BundleItem),
    blocks: z.array(BlockItem),
    dependencies: z.array(DependencyItem).optional(),
    cascades: z
      .array(
        z.object({
          trigger: z.string(),
          add_blocks: z.array(z.string()).optional(),
          ask_questions: z
            .array(
              z.object({
                question: z.string(),
                options: z.array(z.string()).optional(),
                cascade_effects: z.union([z.array(z.string()), z.record(z.unknown())]).optional(),
              }),
            )
            .optional(),
        }),
      )
      .optional(),
    prerequisites: z.array(PrerequisiteItem).optional(),
  })
  // 최상위 오탈자(block: 대신 blcok: 등) 즉시 거부
  .strict()
  // 참조 무결성: bundles.world_id / blocks.bundle_id / dependencies.source|target
  .superRefine((data, ctx) => {
    const worldIds = new Set(data.worlds.map((w) => w.id));
    const bundleIds = new Set(data.bundles.map((b) => b.id));
    const blockIds = new Set(data.blocks.map((b) => b.id));

    data.bundles.forEach((b, i) => {
      if (!worldIds.has(b.world_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['bundles', i, 'world_id'],
          message: `번들 "${b.id}" 의 world_id "${b.world_id}" 가 worlds 에 없습니다. 존재하는 world: ${[...worldIds].join(', ')}`,
        });
      }
    });

    data.blocks.forEach((b, i) => {
      if (!bundleIds.has(b.bundle_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', i, 'bundle_id'],
          message: `블럭 "${b.id}" 의 bundle_id "${b.bundle_id}" 가 bundles 에 없습니다`,
        });
      }
    });

    (data.dependencies ?? []).forEach((d, i) => {
      if (!blockIds.has(d.source)) {
        ctx.addIssue({
          code: 'custom',
          path: ['dependencies', i, 'source'],
          message: `의존성 source "${d.source}" 가 blocks 에 없습니다`,
        });
      }
      if (!blockIds.has(d.target)) {
        ctx.addIssue({
          code: 'custom',
          path: ['dependencies', i, 'target'],
          message: `의존성 target "${d.target}" 가 blocks 에 없습니다`,
        });
      }
    });
  });

// ── 검증 헬퍼 ─────────────────────────────────────────

/**
 * 스키마로 데이터를 검증한다. 기본은 관대(경고 후 통과), strict 옵션이면 예외 throw.
 *
 * @param {z.ZodSchema} schema
 * @param {unknown} data
 * @param {string} fileName - 에러 메시지에 표시할 파일명
 * @param {{strict?: boolean}} [options]
 * @returns {unknown} 검증된 데이터 (strict=false 실패 시에도 원본 반환)
 * @throws {Error} strict=true 이고 검증 실패 시
 */
export function validateYaml(schema, data, fileName, options = {}) {
  const { strict = false } = options;
  const result = schema.safeParse(data);
  if (result.success) return data; // 원본 참조 유지 (identity 테스트 호환)

  const issues = result.error.issues.map(formatIssue);
  const top = issues
    .slice(0, 5)
    .map((s) => `    ${s}`)
    .join('\n');
  const more = issues.length > 5 ? `\n    …외 ${issues.length - 5}건` : '';

  if (strict) {
    const err = new Error(`${fileName} 검증 실패 (${issues.length}건):\n${top}${more}`);
    err.issues = result.error.issues;
    throw err;
  }
  console.warn(`\n  ⚠ ${fileName} 구조 경고:\n${top}${more}\n`);
  return data;
}

/** zod 이슈 하나를 사람 읽기 좋은 한국어 문장으로 */
function formatIssue(issue) {
  const path = issue.path.length
    ? issue.path
        .map((p) => (typeof p === 'number' ? `[${p}]` : p))
        .join('.')
        .replace(/\.\[/g, '[')
    : '(최상위)';
  // 자주 등장하는 영문 zod 메시지 → 한국어
  const translated = issue.message
    .replace(/^Required$/, '필수 필드가 없습니다')
    .replace(/^Expected (.+), received (.+)$/, '타입 오류: $1 를 기대했으나 $2 를 받았습니다')
    .replace(/^Invalid enum value\. Expected (.+), received (.+)$/, '허용되지 않는 값: $1 중 하나여야 하나 $2 입니다')
    .replace(/^Unrecognized key\(s\) in object: (.+)$/, '알 수 없는 필드: $1');
  return `${path} — ${translated}`;
}
