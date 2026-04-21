import { describe, it, expect } from 'vitest';
import { resolveAll } from '../lib/dependency.js';

// ── 테스트용 카탈로그 팩토리 ────────────────────────────
function makeCatalog(deps = [], cascades = [], prerequisites = []) {
  return { dependencies: deps, cascades, prerequisites };
}

function req(source, target, reason = '') {
  return { source, target, type: 'requires', reason };
}

function aff(source, target, reason = '') {
  return { source, target, type: 'affects', reason };
}

// ═════════════════════════════════════════════════════════
describe('resolveAll', () => {
  // ── 기본 동작 ────────────────────────────────────────
  it('의존성 없는 단일 블럭 선택 시 자기 자신만 반환', () => {
    const result = resolveAll(['product'], makeCatalog());

    expect(result.allBlocks).toEqual(['product']);
    expect(result.autoAdded).toEqual([]);
    expect(result.affected).toEqual([]);
  });

  it('빈 선택 시 빈 결과 반환', () => {
    const result = resolveAll([], makeCatalog());

    expect(result.allBlocks).toEqual([]);
    expect(result.autoAdded).toEqual([]);
  });

  // ── requires 의존성 해결 ─────────────────────────────
  it('직접 의존성(requires)을 자동 추가', () => {
    const catalog = makeCatalog([
      req('order', 'payment'),
      req('order', 'cart'),
    ]);

    const result = resolveAll(['order'], catalog);

    expect(result.allBlocks).toContain('order');
    expect(result.allBlocks).toContain('payment');
    expect(result.allBlocks).toContain('cart');
    expect(result.autoAdded).toContain('payment');
    expect(result.autoAdded).toContain('cart');
    expect(result.autoAdded).not.toContain('order');
  });

  it('간접 의존성(requires 체인)을 재귀적으로 해결', () => {
    const catalog = makeCatalog([
      req('order', 'payment'),
      req('payment', 'pg-integration'),
    ]);

    const result = resolveAll(['order'], catalog);

    expect(result.allBlocks).toContain('pg-integration');
    expect(result.autoAdded).toContain('pg-integration');
  });

  it('이미 선택된 의존성은 autoAdded에 포함하지 않음', () => {
    const catalog = makeCatalog([
      req('order', 'payment'),
    ]);

    const result = resolveAll(['order', 'payment'], catalog);

    expect(result.allBlocks).toContain('payment');
    expect(result.autoAdded).not.toContain('payment');
  });

  // ── 순환 참조 방지 ───────────────────────────────────
  it('순환 의존성이 무한 루프를 발생시키지 않음', () => {
    const catalog = makeCatalog([
      req('A', 'B'),
      req('B', 'C'),
      req('C', 'A'),
    ]);

    const result = resolveAll(['A'], catalog);

    expect(result.allBlocks).toContain('A');
    expect(result.allBlocks).toContain('B');
    expect(result.allBlocks).toContain('C');
  });

  it('자기 자신을 requires하는 경우에도 안전', () => {
    const catalog = makeCatalog([
      req('A', 'A'),
    ]);

    const result = resolveAll(['A'], catalog);
    expect(result.allBlocks).toEqual(['A']);
    expect(result.autoAdded).toEqual([]);
  });

  // ── affects 관계 ────────────────────────────────────
  it('선택된 블럭의 affects 대상을 affected로 수집', () => {
    const catalog = makeCatalog([
      aff('coupon', 'payment'),
      aff('coupon', 'refund'),
    ]);

    const result = resolveAll(['coupon'], catalog);

    expect(result.affected).toContain('payment');
    expect(result.affected).toContain('refund');
  });

  it('이미 선택된(required) 블럭은 affected에 포함하지 않음', () => {
    const catalog = makeCatalog([
      req('order', 'payment'),
      aff('order', 'payment'),
    ]);

    const result = resolveAll(['order'], catalog);

    expect(result.allBlocks).toContain('payment');
    expect(result.affected).not.toContain('payment');
  });

  // ── prerequisites ────────────────────────────────────
  it('선택된 블럭을 enables하는 준비물을 수집', () => {
    const catalog = makeCatalog([], [], [
      { id: 'pg-contract', name: 'PG 계약', enables: ['payment'] },
      { id: 'aws-setup', name: 'AWS 계정', enables: ['notification'] },
    ]);

    const result = resolveAll(['payment'], catalog);

    expect(result.prerequisites).toHaveLength(1);
    expect(result.prerequisites[0].id).toBe('pg-contract');
  });

  it('enables가 없는 준비물은 무시', () => {
    const catalog = makeCatalog([], [], [
      { id: 'orphan', name: 'unused' },
    ]);

    const result = resolveAll(['payment'], catalog);
    expect(result.prerequisites).toHaveLength(0);
  });

  // ── cascades (사용자 결정) ───────────────────────────
  it('선택된 블럭의 cascade 질문을 수집', () => {
    const catalog = makeCatalog([], [
      {
        trigger: 'coupon',
        ask_questions: [
          {
            question: '쿠폰 할인 부담은?',
            options: ['판매자 부담', '플랫폼 부담'],
            cascade_effects: {},
          },
        ],
      },
    ]);

    const result = resolveAll(['coupon'], catalog);

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].trigger).toBe('coupon');
    expect(result.decisions[0].question).toBe('쿠폰 할인 부담은?');
  });

  it('선택되지 않은 블럭의 cascade는 무시', () => {
    const catalog = makeCatalog([], [
      {
        trigger: 'coupon',
        ask_questions: [{ question: '쿠폰 질문', options: [] }],
      },
    ]);

    const result = resolveAll(['order'], catalog);
    expect(result.decisions).toHaveLength(0);
  });

  // ── 복합 시나리오 ───────────────────────────────────
  it('requires + affects + cascades 복합 시나리오', () => {
    const catalog = makeCatalog(
      [
        req('order', 'cart'),
        req('order', 'payment'),
        aff('payment', 'settlement'),
      ],
      [
        {
          trigger: 'order',
          ask_questions: [
            { question: '부분 취소 허용?', options: ['예', '아니오'] },
          ],
        },
      ],
      [
        { id: 'pg-contract', name: 'PG 계약', enables: ['payment'] },
      ],
    );

    const result = resolveAll(['order'], catalog);

    // requires: cart, payment 자동 추가
    expect(result.allBlocks).toContain('cart');
    expect(result.allBlocks).toContain('payment');
    expect(result.autoAdded).toContain('cart');
    expect(result.autoAdded).toContain('payment');

    // affects: settlement (payment이 선택되었으므로)
    expect(result.affected).toContain('settlement');

    // cascades: 부분 취소 질문
    expect(result.decisions).toHaveLength(1);

    // prerequisites: PG 계약 (payment enables)
    expect(result.prerequisites).toHaveLength(1);
  });

  // ── 다이아몬드 의존성 ────────────────────────────────
  it('다이아몬드 의존성(A→B, A→C, B→D, C→D)에서 중복 없이 해결', () => {
    const catalog = makeCatalog([
      req('A', 'B'),
      req('A', 'C'),
      req('B', 'D'),
      req('C', 'D'),
    ]);

    const result = resolveAll(['A'], catalog);
    const dCount = result.allBlocks.filter(id => id === 'D').length;
    expect(dCount).toBe(1);
    expect(result.allBlocks).toHaveLength(4);
  });
});
