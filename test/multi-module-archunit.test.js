/**
 * shared/multi-module/archunit.js — 도메인 경계 ArchTest 생성기 테스트
 *
 * 검증 포인트:
 *   - relPath 가 domain 모듈의 src/test/java/{basePkg}/{packageSegment}/architecture/ 에 위치
 *   - 다른 모든 도메인 패키지가 resideInAnyPackage 인자에 포함
 *   - 자기 자신 패키지는 포함되지 않음 (자기 모듈 클래스에 의존하는 것은 정상)
 *   - 도메인 1개일 때 sentinel 룰 — 빌드 실패하지 않도록
 */

import { describe, it, expect } from 'vitest';
import { decideLayout } from '../shared/multi-module/layout.js';
import { domainBoundaryTestFile } from '../shared/multi-module/archunit.js';

const layout = decideLayout({
  groups: [
    { service: 'Marketplace', slug: 'marketplace' },
    { service: 'Storefront', slug: 'storefront' },
    { service: 'Billing', slug: 'billing' },
  ],
  layoutOption: 'multi-module',
});
const domainModules = layout.modules.filter((m) => m.kind === 'domain');

const findDomain = (slug) => domainModules.find((m) => m.slug === slug);

describe('domainBoundaryTestFile — relPath 구조', () => {
  it('상대 경로가 src/test/java/{basePkg}/{segment}/architecture/{Class}ArchitectureTest.java', () => {
    const { relPath } = domainBoundaryTestFile(
      findDomain('marketplace'),
      domainModules,
      'com.forge.app',
    );
    expect(relPath).toBe(
      'src/test/java/com/forge/app/marketplace/architecture/MarketplaceArchitectureTest.java',
    );
  });

  it('basePackage 변경 시 디렉토리도 따라감', () => {
    const { relPath } = domainBoundaryTestFile(
      findDomain('billing'),
      domainModules,
      'com.acme.shop',
    );
    expect(relPath).toBe(
      'src/test/java/com/acme/shop/billing/architecture/BillingArchitectureTest.java',
    );
  });

  it('domain kind 가 아닌 모듈 입력 시 throw', () => {
    expect(() =>
      domainBoundaryTestFile({ kind: 'app', slug: 'app' }, [], 'com.forge.app'),
    ).toThrow(/domain kind/);
  });
});

describe('domainBoundaryTestFile — content 구조 (3 도메인)', () => {
  const file = domainBoundaryTestFile(findDomain('marketplace'), domainModules, 'com.forge.app');

  it('@AnalyzeClasses(packages = "본인 패키지")', () => {
    expect(file.content).toContain('@AnalyzeClasses(packages = "com.forge.app.marketplace")');
  });

  it('JUnit 클래스명이 {Pascal}ArchitectureTest 형태', () => {
    expect(file.content).toMatch(/class MarketplaceArchitectureTest \{/);
  });

  it('ArchUnit 의존성 import (junit/lang/syntax)', () => {
    expect(file.content).toContain('import com.tngtech.archunit.junit.AnalyzeClasses;');
    expect(file.content).toContain('import com.tngtech.archunit.junit.ArchTest;');
    expect(file.content).toContain('import com.tngtech.archunit.lang.ArchRule;');
    expect(file.content).toContain('import com.tngtech.archunit.lang.syntax.ArchRuleDefinition;');
  });

  it('@ArchTest static final ArchRule 선언 존재', () => {
    expect(file.content).toMatch(/@ArchTest\s+static final ArchRule/);
  });

  it('resideInAPackage 로 본인 모듈 한정 + ".." 와일드카드', () => {
    expect(file.content).toContain('.resideInAPackage("com.forge.app.marketplace..")');
  });

  it('resideInAnyPackage 인자에 다른 도메인 패키지가 모두 포함', () => {
    expect(file.content).toContain('"com.forge.app.storefront.."');
    expect(file.content).toContain('"com.forge.app.billing.."');
  });

  it('자기 자신 패키지(marketplace)는 resideInAnyPackage 에 포함되지 않음', () => {
    // 다른 도메인 룰 안에서 marketplace 가 다시 나타나면 자기 자신을 금지하는 셈
    const ruleSection = file.content.split('resideInAnyPackage')[1] ?? '';
    expect(ruleSection).not.toContain('"com.forge.app.marketplace..');
  });

  it('한국어 because() 메시지 — 위반 시 사용자가 이해 가능', () => {
    expect(file.content).toContain('.because("도메인 모듈은 다른 도메인의 클래스에 직접 의존할 수 없습니다');
  });
});

describe('domainBoundaryTestFile — 도메인 1개 (sentinel)', () => {
  const soloLayout = decideLayout({
    groups: [{ service: 'Solo Domain', slug: 'solo' }],
    layoutOption: 'multi-module',
  });
  const solo = soloLayout.modules.find((m) => m.kind === 'domain');
  const file = domainBoundaryTestFile(solo, soloLayout.modules, 'com.forge.app');

  it('다른 도메인이 없으면 사용자 친화적 sentinel 룰만 emit', () => {
    expect(file.content).not.toContain('resideInAnyPackage');
    expect(file.content).toMatch(/classes_reside_in_own_package/);
    // 최소한 ArchTest 가 한 개는 있어야 빌드 통과
    expect(file.content).toMatch(/@ArchTest/);
  });
});

describe('domainBoundaryTestFile — 패키지명에 포함된 입력', () => {
  it('도메인 슬러그가 dental-clinic 이어도 ":domain-dental-clinic:test" 안내가 정확', () => {
    const layoutWithDash = decideLayout({
      groups: [
        { service: 'Dental Clinic', slug: 'dental-clinic' },
        { service: 'Patient Portal', slug: 'patient-portal' },
      ],
      layoutOption: 'multi-module',
    });
    const clinic = layoutWithDash.modules.find((m) => m.slug === 'dental-clinic');
    const others = layoutWithDash.modules.filter((m) => m.kind === 'domain');
    const file = domainBoundaryTestFile(clinic, others, 'com.forge.app');

    // packageSegment 는 dash 제거 (dentalclinic), 그러나 모듈 안내는 슬러그 그대로
    expect(file.content).toContain(':domain-dental-clinic:test');
    expect(file.content).toContain('@AnalyzeClasses(packages = "com.forge.app.dentalclinic")');
    expect(file.relPath).toContain('com/forge/app/dentalclinic/architecture/');
  });
});
