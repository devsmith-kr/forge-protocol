import { describe, it, expect } from 'vitest';
import { parsePlan, mapPlanToCatalog } from '../lib/assembler.js';

// ── 테스트용 블럭 팩토리 ────────────────────────────────
function makeBlock(id, name, opts = {}) {
  return {
    id,
    name,
    analogy: opts.analogy ?? '',
    user_desc: opts.user_desc ?? '',
    tech_desc: opts.tech_desc ?? '',
    ...opts,
  };
}

const SAMPLE_BLOCKS = [
  makeBlock('product-register', '상품 등록', { analogy: '매장 진열', user_desc: '판매할 상품 정보를 입력하고 등록하는 기능' }),
  makeBlock('cart', '장바구니', { analogy: '마트 쇼핑카트', user_desc: '구매할 상품을 담아두는 기능' }),
  makeBlock('payment', '결제', { analogy: '계산대', user_desc: 'PG 연동 결제 처리' }),
  makeBlock('order', '주문', { analogy: '주문서 작성', user_desc: '주문 생성 및 상태 관리' }),
  makeBlock('buyer-signup', '회원가입', { analogy: '회원카드 발급', user_desc: 'JWT + OAuth2 인증' }),
  makeBlock('inventory-manage', '재고 관리', { analogy: '창고 관리', user_desc: '재고 수량 추적 및 관리', tech_desc: 'Optimistic Lock' }),
];

const SAMPLE_CATALOG = { blocks: SAMPLE_BLOCKS };

// ═════════════════════════════════════════════════════════
describe('parsePlan', () => {
  // ── Markdown 파싱 ───────────────────────────────────
  describe('Markdown 형식', () => {
    it('## 헤더로 Phase를 분리', () => {
      const md = `# 프로젝트 로드맵
## MVP
- 상품 등록
- 장바구니
## Phase 2
- 결제
- 주문`;

      const result = parsePlan(md, 'md');

      expect(result.phases).toHaveLength(2);
      expect(result.phases[0].name).toBe('MVP');
      expect(result.phases[0].features).toEqual(['상품 등록', '장바구니']);
      expect(result.phases[1].name).toBe('Phase 2');
      expect(result.phases[1].features).toEqual(['결제', '주문']);
    });

    it('체크박스(- [ ], - [x]) 형식을 처리', () => {
      const md = `## MVP
- [ ] 상품 등록
- [x] 장바구니
- [X] 결제`;

      const result = parsePlan(md, 'md');

      expect(result.phases[0].features).toEqual(['상품 등록', '장바구니', '결제']);
    });

    it('* 리스트 항목도 인식', () => {
      const md = `## MVP
* 상품 등록
* 장바구니`;

      const result = parsePlan(md, 'md');
      expect(result.phases[0].features).toEqual(['상품 등록', '장바구니']);
    });

    it('## 섹션 없는 경우 전체를 MVP로 파싱', () => {
      const md = `- 상품 등록
- 장바구니
- 결제`;

      const result = parsePlan(md, 'md');

      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].name).toBe('MVP');
      expect(result.phases[0].features).toHaveLength(3);
    });

    it('빈 내용은 빈 phases 반환', () => {
      const result = parsePlan('', 'md');
      expect(result.phases).toEqual([]);
    });

    it('빈 줄과 공백을 적절히 처리', () => {
      const md = `## MVP

- 상품 등록

- 장바구니

`;
      const result = parsePlan(md, 'md');
      expect(result.phases[0].features).toEqual(['상품 등록', '장바구니']);
    });
  });

  // ── YAML 파싱 ───────────────────────────────────────
  describe('YAML 형식', () => {
    it('phases 키 아래의 feature 목록을 파싱', () => {
      const yml = `phases:
  mvp:
    features:
      - 상품 등록
      - 장바구니
  phase2:
    features:
      - 결제`;

      const result = parsePlan(yml, 'yml');

      expect(result.phases).toHaveLength(2);
      expect(result.phases[0].name).toBe('mvp');
      expect(result.phases[0].features).toEqual(['상품 등록', '장바구니']);
    });

    it('features 없이 배열만 있는 형식도 처리', () => {
      const yml = `phases:
  mvp:
    - 상품 등록
    - 장바구니`;

      const result = parsePlan(yml, 'yml');
      expect(result.phases[0].features).toEqual(['상품 등록', '장바구니']);
    });

    it('phases 키가 없으면 빈 결과', () => {
      const yml = `name: 테스트`;
      const result = parsePlan(yml, 'yaml');
      expect(result.phases).toEqual([]);
    });
  });
});

// ═════════════════════════════════════════════════════════
describe('mapPlanToCatalog', () => {
  it('정확한 이름 매칭 (100점)', () => {
    const plan = { phases: [{ name: 'MVP', features: ['상품 등록'] }] };
    const result = mapPlanToCatalog(plan, SAMPLE_CATALOG);

    expect(result.phases[0].mapped).toHaveLength(1);
    expect(result.phases[0].mapped[0].block.id).toBe('product-register');
    expect(result.phases[0].mapped[0].score).toBe(100);
    expect(result.phases[0].unmatched).toHaveLength(0);
  });

  it('이름 포함 매칭 (80점)', () => {
    const plan = { phases: [{ name: 'MVP', features: ['상품 등록 관리'] }] };
    const result = mapPlanToCatalog(plan, SAMPLE_CATALOG);

    expect(result.phases[0].mapped).toHaveLength(1);
    expect(result.phases[0].mapped[0].block.id).toBe('product-register');
    expect(result.phases[0].mapped[0].score).toBe(80);
  });

  it('매칭 실패 시 unmatched에 추가', () => {
    const plan = { phases: [{ name: 'MVP', features: ['양자컴퓨팅 시뮬레이터'] }] };
    const result = mapPlanToCatalog(plan, SAMPLE_CATALOG);

    expect(result.phases[0].mapped).toHaveLength(0);
    expect(result.phases[0].unmatched).toEqual(['양자컴퓨팅 시뮬레이터']);
  });

  it('allMappedBlockIds에 모든 매칭된 블럭 ID 수집', () => {
    const plan = {
      phases: [
        { name: 'MVP', features: ['상품 등록', '장바구니'] },
        { name: 'P2', features: ['결제'] },
      ],
    };
    const result = mapPlanToCatalog(plan, SAMPLE_CATALOG);

    expect(result.allMappedBlockIds).toContain('product-register');
    expect(result.allMappedBlockIds).toContain('cart');
    expect(result.allMappedBlockIds).toContain('payment');
  });

  it('동일 블럭이 여러 phase에서 매칭되어도 allMappedBlockIds에 한 번만', () => {
    const plan = {
      phases: [
        { name: 'P1', features: ['결제'] },
        { name: 'P2', features: ['결제'] },
      ],
    };
    const result = mapPlanToCatalog(plan, SAMPLE_CATALOG);
    const paymentCount = result.allMappedBlockIds.filter(id => id === 'payment').length;
    expect(paymentCount).toBe(1);
  });

  it('빈 플랜은 빈 결과 반환', () => {
    const plan = { phases: [] };
    const result = mapPlanToCatalog(plan, SAMPLE_CATALOG);

    expect(result.phases).toEqual([]);
    expect(result.allMappedBlockIds).toEqual([]);
  });
});
