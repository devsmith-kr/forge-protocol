/**
 * shared/multi-module/layout.js — v0.5.0 토폴로지 결정기 회귀 테스트
 *
 * Step 1 명세 (HANDOFF-20260425):
 *   - layoutOption 명시 → 그대로
 *   - 미지정 시 archStyle/groups 기반 자동 분기
 *   - 슬러그 충돌 throw, 한글 service → module-N fallback
 */

import { describe, it, expect } from 'vitest';
import { decideLayout, slugifyDomain, normalizeSlug } from '../shared/multi-module/layout.js';

const groupsOf = (...services) => services.map((service) => ({ service }));

describe('decideLayout — layoutOption 명시', () => {
  it("layoutOption: 'single' → kind=single, modules 빈 배열", () => {
    const result = decideLayout({
      groups: groupsOf('Seller World', 'Buyer World', 'Payment World'),
      archStyle: 'modular-monolith',
      layoutOption: 'single',
    });
    expect(result.kind).toBe('single');
    expect(result.modules).toEqual([]);
  });

  it("layoutOption: 'multi-module', groups 3개 → core + 3 domain + app (5개 모듈)", () => {
    const result = decideLayout({
      groups: groupsOf('Seller World', 'Buyer World', 'Payment World'),
      layoutOption: 'multi-module',
    });
    expect(result.kind).toBe('multi-module');
    expect(result.modules).toHaveLength(5);

    const [core, seller, buyer, payment, app] = result.modules;
    expect(core).toMatchObject({
      name: 'core',
      kind: 'shared',
      gradlePath: ':core',
      sourceRoot: 'core',
    });
    expect(seller).toMatchObject({
      name: 'domain-seller',
      kind: 'domain',
      gradlePath: ':domain-seller',
      sourceRoot: 'domain-seller',
      slug: 'seller',
      packageSegment: 'sellerworld',
      service: 'Seller World',
    });
    expect(buyer.slug).toBe('buyer');
    expect(buyer.packageSegment).toBe('buyerworld');
    expect(payment.slug).toBe('payment');
    expect(payment.packageSegment).toBe('paymentworld');
    expect(app).toMatchObject({
      name: 'app',
      kind: 'app',
      gradlePath: ':app',
      sourceRoot: 'app',
    });
  });
});

describe('decideLayout — 자동 판단 (layoutOption 미지정)', () => {
  it("archStyle: 'modular-monolith', groups 3개 → multi-module", () => {
    const result = decideLayout({
      groups: groupsOf('Seller World', 'Buyer World', 'Payment World'),
      archStyle: 'modular-monolith',
    });
    expect(result.kind).toBe('multi-module');
    expect(result.modules.filter((m) => m.kind === 'domain')).toHaveLength(3);
  });

  it("archStyle: 'modular-monolith', groups 1개 → single (groups<2 fallback 우선)", () => {
    const result = decideLayout({
      groups: groupsOf('Seller World'),
      archStyle: 'modular-monolith',
    });
    expect(result.kind).toBe('single');
  });

  it('archStyle/layoutOption 모두 미지정, groups 3개 → single', () => {
    const result = decideLayout({
      groups: groupsOf('A Service', 'B Service', 'C Service'),
    });
    expect(result.kind).toBe('single');
  });

  it("archStyle: 'msa', groups 5개 → multi-module", () => {
    const result = decideLayout({
      groups: groupsOf('Auth', 'Catalog', 'Order', 'Payment', 'Shipping'),
      archStyle: 'msa',
    });
    expect(result.kind).toBe('multi-module');
    expect(result.modules.filter((m) => m.kind === 'domain')).toHaveLength(5);
  });

  it('groups undefined → single (방어적 동작)', () => {
    const result = decideLayout({ archStyle: 'modular-monolith' });
    expect(result.kind).toBe('single');
  });
});

describe('decideLayout — 슬러그 처리', () => {
  it('group.slug 명시값이 service slugify 보다 우선', () => {
    const result = decideLayout({
      groups: [
        { service: 'Seller Marketplace', slug: 'mkt' },
        { service: 'Buyer World' },
      ],
      layoutOption: 'multi-module',
    });
    const seller = result.modules.find((m) => m.kind === 'domain' && m.slug === 'mkt');
    expect(seller).toBeDefined();
    expect(seller.name).toBe('domain-mkt');
  });

  it('슬러그 충돌 (같은 prefix) → 명확한 에러', () => {
    expect(() =>
      decideLayout({
        groups: groupsOf('Seller World', 'Seller Service'),
        layoutOption: 'multi-module',
      }),
    ).toThrow(/슬러그 충돌.*seller/);
  });

  it("slug 'core' / 'app' 예약어 → 에러", () => {
    expect(() =>
      decideLayout({
        groups: [{ service: 'Core' }, { service: 'Buyer' }],
        layoutOption: 'multi-module',
      }),
    ).toThrow(/예약어/);

    expect(() =>
      decideLayout({
        groups: [{ service: 'App Service' }, { service: 'Buyer' }],
        layoutOption: 'multi-module',
      }),
    ).toThrow(/예약어/);
  });

  it('한글 service ("데이터 수집") → slugify 빈 결과 → module-N fallback', () => {
    const result = decideLayout({
      groups: [{ service: '데이터 수집' }, { service: '리포트' }],
      layoutOption: 'multi-module',
    });
    const domains = result.modules.filter((m) => m.kind === 'domain');
    expect(domains).toHaveLength(2);
    expect(domains[0].slug).toBe('module-1');
    expect(domains[0].name).toBe('domain-module-1');
    expect(domains[0].packageSegment).toBe('module1'); // dash 제거 fallback
    expect(domains[1].slug).toBe('module-2');
  });

  it('공백/dash 포함 service → kebab-case slug', () => {
    const result = decideLayout({
      groups: groupsOf('Data Pipeline', 'Reporting Module'),
      layoutOption: 'multi-module',
    });
    const domains = result.modules.filter((m) => m.kind === 'domain');
    expect(domains[0].slug).toBe('data-pipeline');
    expect(domains[0].name).toBe('domain-data-pipeline');
    expect(domains[1].slug).toBe('reporting'); // "Module" 꼬리 제거
  });
});

describe('decideLayout — slug 정규화 (AI/사용자 입력 형식 차이 흡수)', () => {
  it('snake_case slug → kebab-case 정규화', () => {
    const result = decideLayout({
      groups: [{ service: 'Hospital', slug: 'dental_hospital' }],
      layoutOption: 'multi-module',
    });
    const domain = result.modules.find((m) => m.kind === 'domain');
    expect(domain.slug).toBe('dental-hospital');
    expect(domain.name).toBe('domain-dental-hospital');
    // packageSegment 는 dash 제거
    expect(domain.packageSegment).toBe('dentalhospital');
  });

  it('대문자 slug → 소문자', () => {
    const result = decideLayout({
      groups: [{ service: 'Marketplace', slug: 'Marketplace' }],
      layoutOption: 'multi-module',
    });
    const domain = result.modules.find((m) => m.kind === 'domain');
    expect(domain.slug).toBe('marketplace');
  });

  it('연속 dash/공백 압축 + trim', () => {
    const result = decideLayout({
      groups: [{ service: 'X', slug: '  domain--core  ' }],
      layoutOption: 'multi-module',
    });
    const domain = result.modules.find((m) => m.kind === 'domain');
    expect(domain.slug).toBe('domain-core');
  });

  it('의미 글자 0개인 slug ("_-_") → service slugify 로 fallback', () => {
    const result = decideLayout({
      groups: [{ service: 'Marketplace', slug: '_-_' }],
      layoutOption: 'multi-module',
    });
    const domain = result.modules.find((m) => m.kind === 'domain');
    expect(domain.slug).toBe('marketplace');
  });

  it('slug 정규화 후 packageSegment 도 명시 slug 기반 (한글 service 영향 없음)', () => {
    const result = decideLayout({
      groups: [{ service: '데이터 수집', slug: 'data-pipeline' }],
      layoutOption: 'multi-module',
    });
    const domain = result.modules.find((m) => m.kind === 'domain');
    expect(domain.slug).toBe('data-pipeline');
    expect(domain.packageSegment).toBe('datapipeline'); // pkgOf("데이터 수집") 무시
  });
});

describe('normalizeSlug — 단위 테스트', () => {
  it.each([
    ['dental_hospital', 'dental-hospital'],
    ['Dental_Hospital', 'dental-hospital'],
    ['  marketplace  ', 'marketplace'],
    ['domain--core', 'domain-core'],
    ['ABC_def-123', 'abc-def-123'],
    ['_-_', ''],
    ['', ''],
    [null, ''],
    [undefined, ''],
    [123, ''],
  ])('normalizeSlug(%j) === %j', (input, expected) => {
    expect(normalizeSlug(input)).toBe(expected);
  });
});

describe('slugifyDomain — 단위 테스트', () => {
  it.each([
    ['Seller World', 'seller'],
    ['Order Service', 'order'],
    ['Reporting Module', 'reporting'],
    ['Notification System', 'notification'],
    ['Payment', 'payment'],
    ['Data Pipeline', 'data-pipeline'],
    ['Multi   Word   Domain', 'multi-word-domain'],
    ['데이터 수집', ''],
    ['', ''],
    [null, ''],
    [undefined, ''],
  ])('slugifyDomain(%j) === %j', (input, expected) => {
    expect(slugifyDomain(input)).toBe(expected);
  });
});
