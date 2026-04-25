/**
 * shared/multi-module/emit-files.js — 순수 함수 단위 테스트
 *
 * fs 의존성 없이 [{path, content}] 만 반환 — Web UI 의 ZIP 다운로드와
 * CLI 의 fs emit 이 같은 결과를 내는지 1차 검증.
 *
 * 통합 검증(emitMultiModule 의 fs 호출) 은 multi-module-emit.test.js 가 담당.
 */

import { describe, it, expect } from 'vitest';
import { decideLayout } from '../shared/multi-module/layout.js';
import { buildMultiModuleFiles } from '../shared/multi-module/emit-files.js';

const groups = [
  {
    service: 'Marketplace',
    slug: 'marketplace',
    endpoints: [
      { method: 'GET', path: '/api/v1/products', body: '—', response: '200 { items, total, page }' },
      { method: 'POST', path: '/api/v1/products', body: '{ name, price }', response: '201 { id }' },
    ],
  },
  {
    service: 'Storefront',
    slug: 'storefront',
    endpoints: [
      { method: 'GET', path: '/api/v1/cart', body: '—', response: '200 { items, total }' },
    ],
  },
];

const layout = decideLayout({ groups, layoutOption: 'multi-module' });

describe('buildMultiModuleFiles — 순수 함수', () => {
  it('fs 의존성 없이 array 반환', () => {
    const files = buildMultiModuleFiles({ layout, groups });
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  it('각 항목이 {path, content} 형태', () => {
    const files = buildMultiModuleFiles({ layout, groups });
    for (const f of files) {
      expect(typeof f.path).toBe('string');
      expect(typeof f.content).toBe('string');
      expect(f.path).not.toMatch(/^\//);  // 절대 경로 없음
    }
  });

  it('layout.kind !== "multi-module" 입력 시 throw', () => {
    expect(() =>
      buildMultiModuleFiles({
        layout: { kind: 'single', modules: [] },
        groups,
      }),
    ).toThrow(/multi-module/);
  });

  it('루트 build.gradle / settings.gradle 포함', () => {
    const files = buildMultiModuleFiles({ layout, groups });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('build.gradle');
    expect(paths).toContain('settings.gradle');
    expect(paths).toContain('openapi.yml');
    expect(paths).toContain('README.md');
  });

  it(':core 의 6 클래스 + build.gradle', () => {
    const files = buildMultiModuleFiles({ layout, groups });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('core/build.gradle');
    expect(paths).toContain('core/src/main/java/com/forge/app/core/entity/BaseEntity.java');
    expect(paths).toContain('core/src/main/java/com/forge/app/core/web/CommonResponse.java');
    expect(paths).toContain('core/src/main/java/com/forge/app/core/exception/GlobalExceptionHandler.java');
  });

  it(':app 의 Application.java / application.yml / ContextTest', () => {
    const files = buildMultiModuleFiles({ layout, groups });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('app/build.gradle');
    expect(paths).toContain('app/src/main/java/com/forge/app/Application.java');
    expect(paths).toContain('app/src/main/resources/application.yml');
    expect(paths).toContain('app/src/test/java/com/forge/app/ApplicationContextTest.java');
  });

  it('도메인 모듈마다 Controller/Entity/Repository/Service + ArchTest', () => {
    const files = buildMultiModuleFiles({ layout, groups });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('domain-marketplace/build.gradle');
    expect(paths).toContain('domain-marketplace/src/main/java/com/forge/app/marketplace/entity/Marketplace.java');
    expect(paths).toContain('domain-marketplace/src/main/java/com/forge/app/marketplace/controller/MarketplaceController.java');
    expect(paths).toContain('domain-marketplace/src/test/java/com/forge/app/marketplace/architecture/MarketplaceArchitectureTest.java');
    expect(paths).toContain('domain-storefront/build.gradle');
    expect(paths).toContain('domain-storefront/src/main/java/com/forge/app/storefront/controller/StorefrontController.java');
  });

  it('Application.java 가 scanBasePackages 명시', () => {
    const files = buildMultiModuleFiles({ layout, groups });
    const app = files.find((f) => f.path.endsWith('Application.java'));
    expect(app.content).toContain('@SpringBootApplication(scanBasePackages = "com.forge.app")');
  });

  it('Entity 가 BaseEntity 를 상속 (multi 모드)', () => {
    const files = buildMultiModuleFiles({ layout, groups });
    const entity = files.find((f) => f.path.endsWith('Marketplace.java'));
    expect(entity.content).toContain('extends BaseEntity');
    expect(entity.content).toContain('import com.forge.app.core.entity.BaseEntity;');
  });

  it('target="tests" 면 backend 파일 없이 테스트만', () => {
    const files = buildMultiModuleFiles({ layout, groups, target: 'tests' });
    const paths = files.map((f) => f.path);
    // backend 파일들 없음
    expect(paths).not.toContain('build.gradle');
    expect(paths).not.toContain('core/build.gradle');
    expect(paths).not.toContain('app/build.gradle');
  });

  it('basePackage 변경 시 디렉토리/패키지 모두 반영', () => {
    const files = buildMultiModuleFiles({ layout, groups, basePackage: 'com.acme.shop' });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('app/src/main/java/com/acme/shop/Application.java');
    expect(paths).toContain('core/src/main/java/com/acme/shop/core/entity/BaseEntity.java');
    const baseEntity = files.find((f) => f.path.endsWith('BaseEntity.java'));
    expect(baseEntity.content).toContain('package com.acme.shop.core.entity;');
  });
});
