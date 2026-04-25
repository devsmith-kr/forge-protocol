/**
 * lib/emit/multi-emit.js — 멀티모듈 emit 통합 테스트
 *
 * 검증 포인트:
 *   - layout.modules 따라 디렉토리 트리가 정확히 생성
 *   - 각 도메인 Entity 가 :core 의 BaseEntity 를 상속
 *   - domain build.gradle 에 다른 domain 의 project(...) 의존성 0건
 *   - Application.java 가 scanBasePackages 명시
 *   - openapi.yml / README / settings.gradle / 핵심 :core 클래스 존재
 *   - target='backend' / 'tests' 분기
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decideLayout } from '../shared/multi-module/layout.js';
import { emitMultiModule } from '../lib/emit/multi-emit.js';

// ── 테스트 픽스처 ────────────────────────────────────────

const sellerEndpoint = (path, method, body, response) => ({ method, path, body, response });

const groups = [
  {
    service: 'Marketplace',
    slug: 'marketplace',
    endpoints: [
      sellerEndpoint('/api/v1/products', 'GET', '—', '200 { items, total, page }'),
      sellerEndpoint('/api/v1/products/{id}', 'GET', '—', '200 { id, name, price, createdAt }'),
      sellerEndpoint('/api/v1/products', 'POST', '{ name, price }', '201 { id, name }'),
    ],
  },
  {
    service: 'Storefront',
    slug: 'storefront',
    endpoints: [
      sellerEndpoint('/api/v1/cart', 'GET', '—', '200 { items, total }'),
      sellerEndpoint('/api/v1/cart/items', 'POST', '{ productId, quantity }', '201 { id }'),
    ],
  },
  {
    service: 'Billing',
    slug: 'billing',
    endpoints: [sellerEndpoint('/api/v1/payments', 'POST', '{ orderId, amount }', '201 { id, status }')],
  },
];

const layout = decideLayout({
  groups,
  layoutOption: 'multi-module',
});

const catalog = {
  name: 'Forge Test',
  worlds: [
    { id: 'w-seller', title: '파는 사람의 세계', slug: 'marketplace' },
    { id: 'w-buyer', title: '사는 사람의 세계', slug: 'storefront' },
    { id: 'w-money', title: '돈이 흐르는 세계', slug: 'billing' },
  ],
  bundles: [
    { id: 'b-products', world_id: 'w-seller', title: '상품' },
    { id: 'b-cart', world_id: 'w-buyer', title: '장바구니' },
    { id: 'b-pay', world_id: 'w-money', title: '결제' },
  ],
};

const blockMap = new Map([
  ['products', { id: 'products', bundle_id: 'b-products', name: '상품 관리' }],
  ['cart', { id: 'cart', bundle_id: 'b-cart', name: '장바구니' }],
  ['payment', { id: 'payment', bundle_id: 'b-pay', name: '결제' }],
]);

const scenarios = {
  blocks: [
    {
      block_id: 'products',
      block_name: '상품 관리',
      scenarios: [
        { name: '상품 등록 정상 흐름', given: 'a seller', when: 'POST /products', then: '201', type: 'happy' },
      ],
    },
    {
      block_id: 'payment',
      block_name: '결제',
      scenarios: [{ name: '결제 정상 흐름', given: 'an order', when: 'POST /payments', then: '201', type: 'happy' }],
    },
  ],
};

const contracts = {
  apis: [
    { block_id: 'products', block_name: '상품', base_path: '/api/v1', endpoints: [] },
    { block_id: 'cart', block_name: '장바구니', base_path: '/api/v1', endpoints: [] },
    { block_id: 'payment', block_name: '결제', base_path: '/api/v1', endpoints: [] },
  ],
};

let outDir;
let emitted;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'forge-multi-emit-'));
  emitted = await emitMultiModule({
    outDir,
    layout,
    groups,
    catalog,
    contracts,
    scenarios,
    blockMap,
    basePackage: 'com.forge.app',
    artifactId: 'forge-app',
    target: 'all',
  });
});

const fileExists = async (relPath) => {
  try {
    await stat(join(outDir, relPath));
    return true;
  } catch {
    return false;
  }
};

const readFileText = (relPath) => readFile(join(outDir, relPath), 'utf-8');

// ── 1. 디렉토리 트리 ────────────────────────────────────

describe('루트 빌드 파일', () => {
  it('build.gradle 과 settings.gradle 모두 emit', async () => {
    expect(await fileExists('build.gradle')).toBe(true);
    expect(await fileExists('settings.gradle')).toBe(true);
  });

  it('settings.gradle 이 모든 모듈을 include', async () => {
    const content = await readFileText('settings.gradle');
    expect(content).toContain("include ':core'");
    expect(content).toContain("include ':domain-marketplace'");
    expect(content).toContain("include ':domain-storefront'");
    expect(content).toContain("include ':domain-billing'");
    expect(content).toContain("include ':app'");
  });

  it('openapi.yml + README.md 루트에 emit', async () => {
    expect(await fileExists('openapi.yml')).toBe(true);
    expect(await fileExists('README.md')).toBe(true);
  });
});

// ── 2. :core 모듈 ────────────────────────────────────────

describe(':core 모듈', () => {
  it('build.gradle + 6개 클래스 emit', async () => {
    expect(await fileExists('core/build.gradle')).toBe(true);
    expect(await fileExists('core/src/main/java/com/forge/app/core/entity/BaseEntity.java')).toBe(true);
    expect(await fileExists('core/src/main/java/com/forge/app/core/web/CommonResponse.java')).toBe(true);
    expect(await fileExists('core/src/main/java/com/forge/app/core/web/PageResponse.java')).toBe(true);
    expect(await fileExists('core/src/main/java/com/forge/app/core/exception/ErrorCode.java')).toBe(true);
    expect(await fileExists('core/src/main/java/com/forge/app/core/exception/BusinessException.java')).toBe(true);
    expect(await fileExists('core/src/main/java/com/forge/app/core/exception/GlobalExceptionHandler.java')).toBe(true);
  });

  it('BaseEntity 가 @MappedSuperclass + 자동 timestamp', async () => {
    const content = await readFileText('core/src/main/java/com/forge/app/core/entity/BaseEntity.java');
    expect(content).toContain('@MappedSuperclass');
    expect(content).toContain('@PrePersist');
    expect(content).toContain('@PreUpdate');
  });
});

// ── 3. :app 모듈 ─────────────────────────────────────────

describe(':app 모듈', () => {
  it('build.gradle / Application.java / application.yml / ApplicationContextTest 모두 emit', async () => {
    expect(await fileExists('app/build.gradle')).toBe(true);
    expect(await fileExists('app/src/main/java/com/forge/app/Application.java')).toBe(true);
    expect(await fileExists('app/src/main/resources/application.yml')).toBe(true);
    expect(await fileExists('app/src/test/java/com/forge/app/ApplicationContextTest.java')).toBe(true);
  });

  it('Application 이 scanBasePackages 명시 (멀티모듈 핵심)', async () => {
    const content = await readFileText('app/src/main/java/com/forge/app/Application.java');
    expect(content).toContain('@SpringBootApplication(scanBasePackages = "com.forge.app")');
  });

  it('app/build.gradle 이 spring-boot plugin 적용 + 모든 도메인 + core 의존', async () => {
    const content = await readFileText('app/build.gradle');
    expect(content).toContain("id 'org.springframework.boot'");
    expect(content).toContain("implementation project(':core')");
    expect(content).toContain("implementation project(':domain-marketplace')");
    expect(content).toContain("implementation project(':domain-storefront')");
    expect(content).toContain("implementation project(':domain-billing')");
  });
});

// ── 4. :domain-* 모듈 ────────────────────────────────────

describe(':domain-marketplace 모듈', () => {
  const root = 'domain-marketplace';
  const javaBase = `${root}/src/main/java/com/forge/app/marketplace`;

  it('build.gradle / Entity / Controller / Service / Repository emit', async () => {
    expect(await fileExists(`${root}/build.gradle`)).toBe(true);
    expect(await fileExists(`${javaBase}/entity/Marketplace.java`)).toBe(true);
    expect(await fileExists(`${javaBase}/controller/MarketplaceController.java`)).toBe(true);
    expect(await fileExists(`${javaBase}/service/MarketplaceService.java`)).toBe(true);
    expect(await fileExists(`${javaBase}/repository/MarketplaceRepository.java`)).toBe(true);
  });

  it('Entity 가 :core 의 BaseEntity 를 상속', async () => {
    const content = await readFileText(`${javaBase}/entity/Marketplace.java`);
    expect(content).toContain('extends BaseEntity');
    expect(content).toContain('import com.forge.app.core.entity.BaseEntity;');
    // BaseEntity 가 처리하므로 inline @Id / createdAt 제거됨
    expect(content).not.toContain('private Long id;');
    expect(content).not.toContain('@PrePersist');
  });

  it('Controller 패키지 경로가 layout 의 packageSegment 따름 (marketplace)', async () => {
    const content = await readFileText(`${javaBase}/controller/MarketplaceController.java`);
    expect(content).toContain('package com.forge.app.marketplace.controller;');
  });

  it('build.gradle 이 :core 만 의존, 다른 domain 모듈 0건 (경계 강제)', async () => {
    const content = await readFileText(`${root}/build.gradle`);
    expect(content).toContain("implementation project(':core')");
    expect(content).not.toContain('domain-storefront');
    expect(content).not.toContain('domain-billing');
  });

  it('DTO 가 record 형태로 dto/ 디렉토리에 emit', async () => {
    expect(await fileExists(`${javaBase}/dto/CreateProductRequest.java`)).toBe(true);
  });

  it('ArchUnit 경계 테스트가 src/test 에 emit (다른 도메인 패키지 import 차단)', async () => {
    const archPath = `${root}/src/test/java/com/forge/app/marketplace/architecture/MarketplaceArchitectureTest.java`;
    expect(await fileExists(archPath)).toBe(true);
    const content = await readFileText(archPath);
    expect(content).toContain('@AnalyzeClasses(packages = "com.forge.app.marketplace")');
    expect(content).toContain('"com.forge.app.storefront.."');
    expect(content).toContain('"com.forge.app.billing.."');
  });
});

describe(':domain-storefront, :domain-billing 도 동일 구조', () => {
  it('storefront 패키지 경로', async () => {
    const content = await readFileText(
      'domain-storefront/src/main/java/com/forge/app/storefront/controller/StorefrontController.java',
    );
    expect(content).toContain('package com.forge.app.storefront.controller;');
  });

  it('billing 패키지 경로', async () => {
    const content = await readFileText(
      'domain-billing/src/main/java/com/forge/app/billing/controller/BillingController.java',
    );
    expect(content).toContain('package com.forge.app.billing.controller;');
  });
});

// ── 5. 테스트 클래스 (block-level GWT) ───────────────────

describe('GWT 테스트 emit — block 의 World → 모듈 매칭', () => {
  it('products 블럭은 marketplace 모듈의 src/test 에 emit', async () => {
    expect(await fileExists('domain-marketplace/src/test/java/com/forge/app/ProductsTest.java')).toBe(true);
  });

  it('payment 블럭은 billing 모듈의 src/test 에 emit', async () => {
    expect(await fileExists('domain-billing/src/test/java/com/forge/app/PaymentTest.java')).toBe(true);
  });
});

// ── 6. 누락 방어 ─────────────────────────────────────────

describe('emitMultiModule — 입력 방어', () => {
  it('layout.kind !== "multi-module" 입력 시 throw', async () => {
    await expect(
      emitMultiModule({
        outDir: '/tmp/forge-should-fail',
        layout: { kind: 'single', modules: [] },
        groups,
      }),
    ).rejects.toThrow(/multi-module/);
  });
});

// ── 7. 누적 검사 ─────────────────────────────────────────

describe('전체 emit 결과', () => {
  it('파일 30개 이상 emit (sanity check)', () => {
    expect(emitted.length).toBeGreaterThanOrEqual(30);
  });

  it('상대 경로만 반환 (절대 경로 0건)', () => {
    for (const p of emitted) {
      expect(p.startsWith('/')).toBe(false);
      expect(p).not.toMatch(/^[A-Z]:\\/);
    }
  });
});
