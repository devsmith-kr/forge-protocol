import { describe, it, expect } from 'vitest';
import {
  generateArchitecture,
  generateContracts,
  generateTestScenarios,
  generateInspectReport,
} from '../web/src/generators.js';

// ── 테스트용 카탈로그 데이터 ─────────────────────────────
function makeCatalogData(blocks, worlds, bundles) {
  const blockMap = {};
  const bundleMap = {};
  for (const b of blocks) blockMap[b.id] = b;
  for (const b of bundles) bundleMap[b.id] = b;
  return { worlds, bundles, blocks, blockMap, bundleMap };
}

const WORLDS = [
  { id: 'seller', title: '판매자 월드', icon: '📦' },
  { id: 'buyer', title: '구매자 월드', icon: '👤' },
  { id: 'money', title: '결제 월드', icon: '💳' },
];

const BUNDLES = [
  { id: 'product-mgmt', world_id: 'seller' },
  { id: 'buyer-auth', world_id: 'buyer' },
  { id: 'payment-bundle', world_id: 'money' },
];

const BLOCKS = [
  { id: 'product-register', bundle_id: 'product-mgmt', name: '상품 등록', icon: '📦',
    tech_desc: 'Spring Boot JPA + QueryDSL + Redis 캐시', effort_days: 5 },
  { id: 'buyer-signup', bundle_id: 'buyer-auth', name: '회원가입', icon: '👤',
    tech_desc: 'Spring Security JWT + OAuth2 + RBAC 역할 기반 접근', effort_days: 4 },
  { id: 'payment', bundle_id: 'payment-bundle', name: '결제', icon: '💳',
    tech_desc: 'PG 연동 + Webhook 멱등(Idempotency) 처리', effort_days: 6 },
];

const CATALOG = makeCatalogData(BLOCKS, WORLDS, BUNDLES);

// ═════════════════════════════════════════════════════════
describe('generateArchitecture', () => {
  it('catalog 기반으로 서비스를 World별 그룹핑', () => {
    const ids = ['product-register', 'buyer-signup', 'payment'];
    const result = generateArchitecture(new Set(ids), CATALOG);

    expect(result.services.length).toBeGreaterThanOrEqual(2);
    expect(result.serviceCount).toBe(result.services.length);
  });

  it('기술 스택을 tech_desc에서 추론', () => {
    const ids = ['product-register'];
    const result = generateArchitecture(new Set(ids), CATALOG);

    const sellerService = result.services.find(s => s.id === 'seller');
    expect(sellerService).toBeDefined();
    expect(sellerService.tech).toContain('Spring Boot 3');
    expect(sellerService.tech.some(t => /JPA/i.test(t))).toBe(true);
  });

  it('패턴을 tech_desc에서 추론', () => {
    const ids = ['payment'];
    const result = generateArchitecture(new Set(ids), CATALOG);

    const moneyService = result.services.find(s => s.id === 'money');
    expect(moneyService).toBeDefined();
    expect(moneyService.patterns.some(p => /Webhook|Idempotency/i.test(p))).toBe(true);
  });

  it('layers 4단계를 반환', () => {
    const result = generateArchitecture(new Set(['product-register']), CATALOG);

    expect(result.layers).toHaveLength(4);
    expect(result.layers.map(l => l.id)).toEqual(['client', 'gateway', 'app', 'db']);
  });

  it('ADR decisions를 반환', () => {
    const ids = ['product-register', 'buyer-signup', 'payment'];
    const result = generateArchitecture(new Set(ids), CATALOG);

    expect(result.decisions.length).toBeGreaterThanOrEqual(3);
    expect(result.decisions[0]).toHaveProperty('title');
    expect(result.decisions[0]).toHaveProperty('choice');
    expect(result.decisions[0]).toHaveProperty('reason');
    expect(result.decisions[0]).toHaveProperty('adr');
  });

  it('catalogData 없으면 빈 결과 반환', () => {
    const ids = new Set(['buyer-signup', 'order', 'payment']);
    const result = generateArchitecture(ids, null);

    expect(result.services).toHaveLength(0);
    expect(result.serviceCount).toBe(0);
  });

  it('빈 선택 시 빈 서비스 반환', () => {
    const result = generateArchitecture(new Set(), CATALOG);
    expect(result.services).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════
describe('generateContracts', () => {
  it('World별 서비스 그룹 + 엔드포인트 생성', () => {
    const ids = ['product-register', 'payment'];
    const result = generateContracts(new Set(ids), CATALOG);

    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const group of result) {
      expect(group).toHaveProperty('service');
      expect(group).toHaveProperty('endpoints');
      expect(group.endpoints.length).toBeGreaterThan(0);
    }
  });

  it('인증 블럭은 auth 엔드포인트를 생성', () => {
    const result = generateContracts(new Set(['buyer-signup']), CATALOG);

    const buyerGroup = result.find(g => g.service.includes('구매자'));
    expect(buyerGroup).toBeDefined();

    const authEndpoints = buyerGroup.endpoints.filter(e =>
      e.path.includes('/auth/')
    );
    expect(authEndpoints.length).toBeGreaterThanOrEqual(2);
  });

  it('엔드포인트에 method, path, summary, response 포함', () => {
    const result = generateContracts(new Set(['product-register']), CATALOG);
    const ep = result[0].endpoints[0];

    expect(ep).toHaveProperty('method');
    expect(ep).toHaveProperty('path');
    expect(ep).toHaveProperty('summary');
    expect(ep).toHaveProperty('response');
    expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(ep.method);
  });

  it('catalogData 없으면 빈 배열 반환', () => {
    const result = generateContracts(new Set(['buyer-signup', 'cart']), null);
    expect(result).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════
describe('generateTestScenarios', () => {
  it('블럭별 테스트 시나리오 생성', () => {
    const result = generateTestScenarios(new Set(['product-register', 'buyer-signup']), CATALOG);

    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const scenario of result) {
      expect(scenario).toHaveProperty('block');
      expect(scenario).toHaveProperty('tests');
      expect(scenario.tests.length).toBeGreaterThan(0);
    }
  });

  it('항상 happy-path 테스트를 포함', () => {
    const result = generateTestScenarios(new Set(['product-register']), CATALOG);

    const happyPath = result[0].tests.find(t => t.type === 'happy-path');
    expect(happyPath).toBeDefined();
    expect(happyPath).toHaveProperty('given');
    expect(happyPath).toHaveProperty('when');
    expect(happyPath).toHaveProperty('then');
  });

  it('인증 블럭에 보안 테스트 시나리오 추가', () => {
    const result = generateTestScenarios(new Set(['buyer-signup']), CATALOG);

    const securityTest = result[0].tests.find(t => t.type === 'security');
    expect(securityTest).toBeDefined();
  });

  it('멱등성 블럭에 idempotency 테스트 추가', () => {
    const result = generateTestScenarios(new Set(['payment']), CATALOG);

    const idempotencyTest = result[0].tests.find(t => t.type === 'idempotency');
    expect(idempotencyTest).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════
describe('generateInspectReport', () => {
  it('4개 관점(security, performance, operations, scalability)을 반환', () => {
    const result = generateInspectReport(
      new Set(['product-register', 'buyer-signup', 'payment']),
      CATALOG,
    );

    expect(result.perspectives).toHaveLength(4);
    const ids = result.perspectives.map(p => p.id);
    expect(ids).toEqual(['security', 'performance', 'operations', 'scalability']);
  });

  it('각 관점에 score, findings를 포함', () => {
    const result = generateInspectReport(new Set(['buyer-signup']), CATALOG);

    for (const p of result.perspectives) {
      expect(p.score).toBeGreaterThan(0);
      expect(p.score).toBeLessThanOrEqual(100);
      expect(p.findings.length).toBeGreaterThan(0);
    }
  });

  it('totalScore는 관점 점수의 평균', () => {
    const result = generateInspectReport(new Set(['buyer-signup', 'payment']), CATALOG);

    const expectedAvg = Math.round(
      result.perspectives.reduce((s, p) => s + p.score, 0) / result.perspectives.length
    );
    expect(result.totalScore).toBe(expectedAvg);
  });

  it('결제 블럭 포함 시 결제 관련 보안 finding 존재', () => {
    const result = generateInspectReport(new Set(['payment']), CATALOG);

    const securityFindings = result.perspectives[0].findings;
    const paymentFinding = securityFindings.find(f =>
      f.title.includes('결제') || f.title.includes('웹훅')
    );
    expect(paymentFinding).toBeDefined();
  });

  it('blockCount를 반환', () => {
    const result = generateInspectReport(new Set(['product-register', 'payment']), CATALOG);
    expect(result.blockCount).toBe(2);
  });
});
