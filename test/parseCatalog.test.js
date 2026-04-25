import { describe, it, expect } from 'vitest';
import { parseCatalogYml, validateCatalog } from '../web/src/parseCatalog.js';

// ── 테스트용 YAML 문자열 ─────────────────────────────────
const VALID_YAML = `
name: 테스트 카탈로그
domain: test
worlds:
  - id: w1
    title: World 1
    icon: "🌐"
bundles:
  - id: b1
    world_id: w1
blocks:
  - id: block-1
    bundle_id: b1
    name: 블럭 1
    effort_days: 3
  - id: block-2
    bundle_id: b1
    name: 블럭 2
    effort_days: 5
dependencies:
  - source: block-2
    target: block-1
    type: requires
    reason: "block-2는 block-1이 필요"
`;

// ═════════════════════════════════════════════════════════
describe('parseCatalogYml', () => {
  it('유효한 YAML을 파싱하여 구조화된 카탈로그 반환', () => {
    const catalog = parseCatalogYml(VALID_YAML);

    expect(catalog.name).toBe('테스트 카탈로그');
    expect(catalog.domain).toBe('test');
    expect(catalog.worlds.length).toBeGreaterThanOrEqual(1);
    expect(catalog.bundles).toHaveLength(1);
    expect(catalog.blocks).toHaveLength(2);
    expect(catalog.dependencies).toHaveLength(1);
  });

  it('blockMap과 bundleMap을 생성', () => {
    const catalog = parseCatalogYml(VALID_YAML);

    expect(catalog.blockMap['block-1']).toBeDefined();
    expect(catalog.blockMap['block-1'].name).toBe('블럭 1');
    expect(catalog.bundleMap['b1']).toBeDefined();
  });

  it('resolveDeps 함수를 생성하여 의존성 해결', () => {
    const catalog = parseCatalogYml(VALID_YAML);

    // block-2 선택 시 block-1이 자동 추가
    const result = catalog.resolveDeps(['block-2']);

    expect(result.allSelected.has('block-2')).toBe(true);
    expect(result.allSelected.has('block-1')).toBe(true);
    expect(result.autoAdded.has('block-1')).toBe(true);
  });

  it('의존성 없는 블럭만 선택 시 autoAdded 비어 있음', () => {
    const catalog = parseCatalogYml(VALID_YAML);

    const result = catalog.resolveDeps(['block-1']);

    expect(result.allSelected.has('block-1')).toBe(true);
    expect(result.autoAdded.size).toBe(0);
  });

  it('totalDays를 올바르게 합산', () => {
    const catalog = parseCatalogYml(VALID_YAML);

    // block-2 (5일) + block-1 (3일, 자동추가) = 8일
    const result = catalog.resolveDeps(['block-2']);
    expect(result.totalDays).toBe(8);
  });

  it('all 월드가 없으면 자동 추가', () => {
    const catalog = parseCatalogYml(VALID_YAML);

    const allWorld = catalog.worlds.find((w) => w.id === 'all');
    expect(allWorld).toBeDefined();
    expect(allWorld.title).toBe('전체 보기');
  });

  it('all 월드가 이미 있으면 중복 추가하지 않음', () => {
    const yamlWithAll = `
worlds:
  - id: all
    title: 전체
    icon: "🌐"
  - id: w1
    title: World 1
bundles:
  - id: b1
    world_id: w1
blocks:
  - id: block-1
    bundle_id: b1
    name: 블럭 1
`;
    const catalog = parseCatalogYml(yamlWithAll);
    const allWorlds = catalog.worlds.filter((w) => w.id === 'all');
    expect(allWorlds).toHaveLength(1);
  });

  it('name/domain 기본값 처리', () => {
    const minimal = `
bundles:
  - id: b1
    world_id: w1
blocks:
  - id: x
    bundle_id: b1
    name: X
`;
    const catalog = parseCatalogYml(minimal);
    expect(catalog.name).toBe('커스텀 카탈로그');
    expect(catalog.domain).toBe('custom');
  });

  it('들여쓰기가 있는 YAML도 dedent 처리', () => {
    const indented = `
      name: indented
      bundles:
        - id: b1
          world_id: w1
      blocks:
        - id: x
          bundle_id: b1
          name: X
    `;
    const catalog = parseCatalogYml(indented);
    expect(catalog.name).toBe('indented');
    expect(catalog.blocks).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════
describe('validateCatalog', () => {
  it('유효한 카탈로그는 빈 에러 배열', () => {
    const catalog = parseCatalogYml(VALID_YAML);
    const errors = validateCatalog(catalog);
    expect(errors).toEqual([]);
  });

  it('blocks 비어 있으면 에러', () => {
    const errors = validateCatalog({ blocks: [], bundles: [{ id: 'b' }] });
    expect(errors).toContain('blocks 배열이 비어 있습니다');
  });

  it('bundles 비어 있으면 에러', () => {
    const errors = validateCatalog({
      blocks: [{ id: 'x', bundle_id: 'b' }],
      bundles: [],
    });
    expect(errors).toContain('bundles 배열이 비어 있습니다');
  });

  it('블럭에 id 없으면 에러', () => {
    const errors = validateCatalog({
      blocks: [{ bundle_id: 'b', name: 'no-id' }],
      bundles: [{ id: 'b' }],
    });
    expect(errors.some((e) => e.includes('id가 없습니다'))).toBe(true);
  });

  it('블럭에 bundle_id 없으면 에러', () => {
    const errors = validateCatalog({
      blocks: [{ id: 'x', name: 'no-bundle' }],
      bundles: [{ id: 'b' }],
    });
    expect(errors.some((e) => e.includes('bundle_id가 없습니다'))).toBe(true);
  });
});
