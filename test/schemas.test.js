import { describe, it, expect, vi } from 'vitest';
import {
  StateSchema,
  IntentSchema,
  SelectedBlocksSchema,
  ArchitectureSchema,
  ContractsSchema,
  TestScenariosSchema,
  CatalogSchema,
  validateYaml,
} from '../lib/schemas.js';

// ═════════════════════════════════════════════════════════
describe('StateSchema', () => {
  it('유효한 state 데이터를 통과', () => {
    const data = { phase: 'smelt', created_at: '2025-01-01T00:00:00.000Z' };
    expect(StateSchema.safeParse(data).success).toBe(true);
  });

  it('optional 필드 허용', () => {
    const data = {
      phase: 'smelt',
      created_at: '2025-01-01',
      updated_at: '2025-01-02',
      template: 'commerce',
      selected_blocks_count: 5,
    };
    expect(StateSchema.safeParse(data).success).toBe(true);
  });

  it('phase 누락 시 실패', () => {
    const data = { created_at: '2025-01-01' };
    expect(StateSchema.safeParse(data).success).toBe(false);
  });

  it('created_at 누락 시 실패', () => {
    const data = { phase: 'init' };
    expect(StateSchema.safeParse(data).success).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════
describe('IntentSchema', () => {
  const validIntent = {
    phase: 'smelt',
    selected_blocks: [{ id: 'order', name: '주문' }],
    all_blocks: ['order', 'payment'],
  };

  it('유효한 intent 데이터를 통과', () => {
    expect(IntentSchema.safeParse(validIntent).success).toBe(true);
  });

  it('selected_blocks 비어 있어도 통과', () => {
    const data = { ...validIntent, selected_blocks: [], all_blocks: [] };
    expect(IntentSchema.safeParse(data).success).toBe(true);
  });

  it('selected_blocks의 id 누락 시 실패', () => {
    const data = { ...validIntent, selected_blocks: [{ name: '주문' }] };
    expect(IntentSchema.safeParse(data).success).toBe(false);
  });

  it('decisions 포함 시 통과', () => {
    const data = {
      ...validIntent,
      decisions: [{
        trigger: 'coupon',
        question: '할인 부담?',
        answer: '판매자',
      }],
    };
    expect(IntentSchema.safeParse(data).success).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════
describe('SelectedBlocksSchema', () => {
  it('유효한 selected-blocks 통과', () => {
    const data = {
      blocks: [{ id: 'order', name: '주문', priority: 'required', effort_days: 7 }],
      total_effort_days: 7,
    };
    expect(SelectedBlocksSchema.safeParse(data).success).toBe(true);
  });

  it('blocks 누락 시 실패', () => {
    expect(SelectedBlocksSchema.safeParse({}).success).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════
describe('ArchitectureSchema', () => {
  it('유효한 architecture 통과', () => {
    const data = {
      phase: 'shape',
      tech_stack: { backend: 'spring-boot', frontend: 'react' },
      detected_features: ['payment', 'auth'],
      adr: [{ id: 'ADR-001', title: '아키텍처 스타일', status: 'accepted' }],
    };
    expect(ArchitectureSchema.safeParse(data).success).toBe(true);
  });

  it('tech_stack 빈 객체도 통과', () => {
    const data = { phase: 'shape', tech_stack: {} };
    expect(ArchitectureSchema.safeParse(data).success).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════
describe('ContractsSchema', () => {
  it('유효한 contracts 통과', () => {
    const data = {
      apis: [{
        block_id: 'order',
        block_name: '주문',
        base_path: '/orders',
        endpoints: [{ method: 'GET', path: '/', description: '주문 목록' }],
      }],
    };
    expect(ContractsSchema.safeParse(data).success).toBe(true);
  });

  it('잘못된 HTTP method 시 실패', () => {
    const data = {
      apis: [{
        block_id: 'order',
        block_name: '주문',
        base_path: '/orders',
        endpoints: [{ method: 'INVALID', path: '/' }],
      }],
    };
    expect(ContractsSchema.safeParse(data).success).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════
describe('TestScenariosSchema', () => {
  it('유효한 test-scenarios 통과', () => {
    const data = {
      scenarios: [{
        block_id: 'order',
        test_cases: [{
          name: '정상 주문',
          given: '유효한 입력',
          when: 'POST /orders',
          then: '201 응답',
        }],
      }],
    };
    expect(TestScenariosSchema.safeParse(data).success).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════
describe('CatalogSchema', () => {
  it('유효한 catalog 통과', () => {
    // P0-4 참조 무결성 적용: 기존 고스트 의존성 (order→payment) 을 실제 블럭으로 교체
    const data = {
      worlds: [{ id: 'seller', title: '판매자' }],
      bundles: [{ id: 'product-mgmt', world_id: 'seller' }],
      blocks: [
        { id: 'product-register', bundle_id: 'product-mgmt', name: '상품 등록' },
        { id: 'product-edit',     bundle_id: 'product-mgmt', name: '상품 수정' },
      ],
      dependencies: [{ source: 'product-edit', target: 'product-register', type: 'requires' }],
    };
    expect(CatalogSchema.safeParse(data).success).toBe(true);
  });

  it('잘못된 dependency type 시 실패', () => {
    const data = {
      worlds: [{ id: 'w', title: 'W' }],
      bundles: [{ id: 'b', world_id: 'w' }],
      blocks: [{ id: 'x', bundle_id: 'b', name: 'X' }],
      dependencies: [{ source: 'a', target: 'b', type: 'invalid' }],
    };
    expect(CatalogSchema.safeParse(data).success).toBe(false);
  });

  it('dependencies 없어도 통과', () => {
    const data = {
      worlds: [{ id: 'w', title: 'W' }],
      bundles: [{ id: 'b', world_id: 'w' }],
      blocks: [{ id: 'x', bundle_id: 'b', name: 'X' }],
    };
    expect(CatalogSchema.safeParse(data).success).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════
describe('validateYaml', () => {
  it('유효한 데이터는 경고 없이 반환', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = { phase: 'init', created_at: '2025-01-01' };
    const result = validateYaml(StateSchema, data, 'state.yml');

    expect(result).toBe(data);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('무효한 데이터도 원본을 반환하되 경고 출력', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = { invalid: true };
    const result = validateYaml(StateSchema, data, 'state.yml');

    expect(result).toBe(data);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('state.yml');
    warnSpy.mockRestore();
  });
});
