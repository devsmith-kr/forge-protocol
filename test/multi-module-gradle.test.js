/**
 * shared/multi-module/gradle.js — 멀티모듈 Gradle 생성기 회귀 테스트
 *
 * Step 2 핵심 단정 (HANDOFF-20260425):
 *   - domain build.gradle 에 다른 domain ID 가 절대 등장하지 않는다 (경계 위반)
 *   - :app 만 spring-boot plugin 적용, 그 외는 plain library
 *   - settings.gradle include 누락 0건
 */

import { describe, it, expect } from 'vitest';
import { decideLayout } from '../shared/multi-module/layout.js';
import {
  generateRootBuildGradle,
  generateRootSettingsGradle,
  generateCoreBuildGradle,
  generateDomainBuildGradle,
  generateAppBuildGradle,
} from '../shared/multi-module/gradle.js';

const sampleLayout = decideLayout({
  groups: [
    { service: 'Seller World' },
    { service: 'Buyer World' },
    { service: 'Payment World' },
  ],
  layoutOption: 'multi-module',
});

const domainModules = sampleLayout.modules.filter((m) => m.kind === 'domain');

describe('generateRootBuildGradle', () => {
  it('plugin DSL 에 spring-boot 가 apply false 로 선언', () => {
    const out = generateRootBuildGradle(sampleLayout.modules);
    expect(out).toContain("id 'org.springframework.boot' version '3.3.0' apply false");
    expect(out).toContain("id 'io.spring.dependency-management' version '1.1.5' apply false");
  });

  it('subprojects 에 java-library + dependency-management + lombok 공통', () => {
    const out = generateRootBuildGradle(sampleLayout.modules);
    expect(out).toMatch(/subprojects\s*\{/);
    expect(out).toContain("apply plugin: 'java-library'");
    expect(out).toContain("apply plugin: 'io.spring.dependency-management'");
    expect(out).toContain("annotationProcessor 'org.projectlombok:lombok'");
    expect(out).toContain('useJUnitPlatform()');
  });

  it('한글 주석/문자열 컴파일 위해 UTF-8 인코딩 강제', () => {
    const out = generateRootBuildGradle(sampleLayout.modules);
    expect(out).toContain('JavaCompile');
    expect(out).toContain("options.encoding = 'UTF-8'");
  });

  it('basePackage 로부터 group 추출 (마지막 segment 제거)', () => {
    const out = generateRootBuildGradle(sampleLayout.modules, {
      basePackage: 'com.acme.shop',
    });
    expect(out).toContain("group = 'com.acme'");
  });

  it('javaVersion 옵션 적용', () => {
    const out = generateRootBuildGradle(sampleLayout.modules, { javaVersion: '21' });
    expect(out).toContain('JavaVersion.VERSION_21');
  });
});

describe('generateRootSettingsGradle', () => {
  it('rootProject.name 과 모든 모듈 include 선언', () => {
    const out = generateRootSettingsGradle(sampleLayout.modules);
    expect(out).toContain("rootProject.name = 'forge-app'");
    expect(out).toContain("include ':core'");
    expect(out).toContain("include ':domain-seller'");
    expect(out).toContain("include ':domain-buyer'");
    expect(out).toContain("include ':domain-payment'");
    expect(out).toContain("include ':app'");
  });

  it('artifactId 옵션 반영', () => {
    const out = generateRootSettingsGradle(sampleLayout.modules, {
      artifactId: 'shop-platform',
    });
    expect(out).toContain("rootProject.name = 'shop-platform'");
  });
});

describe('generateCoreBuildGradle', () => {
  it("Spring Web/JPA 를 'api' 로 노출 (도메인이 transitively 사용)", () => {
    const out = generateCoreBuildGradle();
    expect(out).toContain("api 'org.springframework.boot:spring-boot-starter-web'");
    expect(out).toContain("api 'org.springframework.boot:spring-boot-starter-data-jpa'");
  });

  it('springdoc 도 api 노출 (Controller 의 @Tag/@Operation 사용)', () => {
    const out = generateCoreBuildGradle();
    expect(out).toMatch(/api\s+'org\.springdoc:springdoc-openapi-starter-webmvc-ui:/);
  });

  it('어떤 project(...) 의존성도 선언하지 않음 (core 는 grandparent)', () => {
    const out = generateCoreBuildGradle();
    expect(out).not.toMatch(/project\s*\(\s*':/);
  });

  it('spring-boot plugin 을 적용하지 않음 (라이브러리 only)', () => {
    const out = generateCoreBuildGradle();
    expect(out).not.toContain("id 'org.springframework.boot'");
  });
});

describe('generateDomainBuildGradle — 경계 강제', () => {
  it(":core 만 implementation, 다른 domain 모듈 ID 0건 (핵심 불변식)", () => {
    const sellerOut = generateDomainBuildGradle(
      domainModules.find((m) => m.slug === 'seller'),
    );
    expect(sellerOut).toContain("implementation project(':core')");
    // 다른 domain 모듈 이름이 절대 등장하면 안 됨
    expect(sellerOut).not.toContain('domain-buyer');
    expect(sellerOut).not.toContain('domain-payment');
  });

  it('각 domain 본인 이름이 헤더 주석에 표기됨 (디버깅용)', () => {
    const sellerOut = generateDomainBuildGradle(
      domainModules.find((m) => m.slug === 'seller'),
    );
    expect(sellerOut).toContain('domain-seller');
    expect(sellerOut).toContain('Seller World');
  });

  it('archunit-junit5 testImplementation 자동 포함 (Step 7 연동)', () => {
    const sellerOut = generateDomainBuildGradle(
      domainModules.find((m) => m.slug === 'seller'),
    );
    expect(sellerOut).toMatch(/testImplementation\s+'com\.tngtech\.archunit:archunit-junit5:/);
  });

  it('spring-boot plugin 미적용 (부트 jar 는 :app 만)', () => {
    const sellerOut = generateDomainBuildGradle(
      domainModules.find((m) => m.slug === 'seller'),
    );
    expect(sellerOut).not.toContain("id 'org.springframework.boot'");
  });

  it('domain kind 가 아닌 모듈 입력 시 throw', () => {
    expect(() => generateDomainBuildGradle({ kind: 'app' })).toThrow(/domain kind/);
    expect(() => generateDomainBuildGradle(null)).toThrow(/domain kind/);
  });
});

describe('generateAppBuildGradle', () => {
  it('spring-boot plugin 을 plugins {} 블록에서 적용 (버전 없이)', () => {
    const out = generateAppBuildGradle(sampleLayout.modules);
    expect(out).toMatch(/plugins\s*\{[\s\S]*id\s+'org\.springframework\.boot'[^\n]*\n[\s\S]*\}/);
    // 버전은 root 에서 와야 함 (중복 선언 금지)
    expect(out).not.toMatch(/id\s+'org\.springframework\.boot'\s+version/);
  });

  it('core + 모든 domain 모듈을 project() implementation 으로 묶음', () => {
    const out = generateAppBuildGradle(sampleLayout.modules);
    expect(out).toContain("implementation project(':core')");
    expect(out).toContain("implementation project(':domain-seller')");
    expect(out).toContain("implementation project(':domain-buyer')");
    expect(out).toContain("implementation project(':domain-payment')");
  });

  it("bootJar.mainClass 와 springBoot.mainClass 가 basePackage.Application 으로 일치", () => {
    const out = generateAppBuildGradle(sampleLayout.modules, {
      basePackage: 'com.acme.shop',
    });
    expect(out).toContain("mainClass = 'com.acme.shop.Application'");
    // 두 곳 모두 일치
    const matches = out.match(/mainClass\s*=\s*'com\.acme\.shop\.Application'/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });

  it('springdoc / h2 / web 의존성 포함', () => {
    const out = generateAppBuildGradle(sampleLayout.modules);
    expect(out).toContain("springdoc-openapi-starter-webmvc-ui:2.5.0");
    expect(out).toContain("runtimeOnly 'com.h2database:h2'");
    expect(out).toContain("spring-boot-starter-web");
  });
});

describe('통합 — 멀티모듈 의존성 그래프 일관성', () => {
  it('5모듈 구성에서 domain build.gradle 에 다른 domain ID 가 0건', () => {
    domainModules.forEach((domainMod) => {
      const out = generateDomainBuildGradle(domainMod);
      const otherDomains = domainModules.filter((m) => m.name !== domainMod.name);
      otherDomains.forEach((other) => {
        expect(out).not.toContain(other.name);
      });
    });
  });

  it('settings.gradle include 갯수 = layout.modules 갯수', () => {
    const out = generateRootSettingsGradle(sampleLayout.modules);
    const includeMatches = out.match(/include\s+':/g) ?? [];
    expect(includeMatches).toHaveLength(sampleLayout.modules.length);
  });
});
