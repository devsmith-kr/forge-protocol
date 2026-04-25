/**
 * lib/verify.js — forge verify 파서 단위 테스트 (P1-2)
 *
 * 실제 gradle 실행은 integration 이라 테스트 제외. 파서 로직만 검증.
 */

import { describe, it, expect } from 'vitest';
import { parseCompileErrors, parseTestFailures } from '../lib/verify.js';

describe('parseCompileErrors', () => {
  it('javac 표준 에러 형식 파싱', () => {
    const output = `
/home/user/src/Foo.java:42: error: cannot find symbol
    Bar b = new Bar();
    ^
/home/user/src/Baz.java:10: error: ';' expected
1 error
`;
    const errors = parseCompileErrors(output);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ file: '/home/user/src/Foo.java', line: 42 });
    expect(errors[0].message).toMatch(/cannot find symbol/);
    expect(errors[1].line).toBe(10);
  });

  it('에러 없는 출력 → 빈 배열', () => {
    expect(parseCompileErrors('BUILD SUCCESSFUL in 3s\n')).toEqual([]);
  });

  it('Windows 경로도 파싱', () => {
    const out = 'C:\\Users\\jinik\\src\\Foo.java:5: error: test';
    const errors = parseCompileErrors(out);
    expect(errors[0].file).toBe('C:\\Users\\jinik\\src\\Foo.java');
    expect(errors[0].line).toBe(5);
  });
});

describe('parseTestFailures', () => {
  it('Gradle test 출력에서 실패 메서드 추출', () => {
    const output = `
> Task :test
FooTest > should_work() PASSED
BarTest > should_fail() FAILED
    org.opentest4j.AssertionFailedError at BarTest.java:25
BazTest > another_test() FAILED

5 tests completed, 2 failed
`;
    const parsed = parseTestFailures(output);
    expect(parsed.failed).toBe(2);
    expect(parsed.total).toBe(5);
    expect(parsed.failures).toHaveLength(2);
    expect(parsed.failures[0]).toEqual({ class: 'BarTest', method: 'should_fail()' });
  });

  it('모두 통과한 출력도 total 반영', () => {
    const parsed = parseTestFailures('12 tests completed\n');
    expect(parsed.total).toBe(12);
    expect(parsed.failed).toBe(0);
  });

  it('통계 라인 없는 출력 → total=null, failures 만', () => {
    const parsed = parseTestFailures('FooTest > x() FAILED\n');
    expect(parsed.total).toBeNull();
    expect(parsed.failures).toHaveLength(1);
  });

  it('boundary_violations 필드는 항상 존재 (single 모드에서도)', () => {
    const parsed = parseTestFailures('FooTest > x() FAILED\n');
    expect(parsed.boundary_violations).toEqual([]);
  });
});

describe('parseCompileErrors — 멀티모듈 (Step 8)', () => {
  it('> Task :module:compileJava prefix 가 있으면 module 필드 첨부', () => {
    const output = `
> Task :domain-marketplace:compileJava
/home/u/MarketplaceController.java:42: error: cannot find symbol

> Task :domain-billing:compileJava
/home/u/BillingService.java:7: error: ';' expected
`;
    const errors = parseCompileErrors(output);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({
      file: '/home/u/MarketplaceController.java',
      line: 42,
      module: 'domain-marketplace',
    });
    expect(errors[1].module).toBe('domain-billing');
  });

  it('module prefix 없으면 module 필드 없음 (single 호환)', () => {
    const output = '/home/u/Foo.java:1: error: x';
    const errors = parseCompileErrors(output);
    expect(errors[0]).not.toHaveProperty('module');
  });

  it('compileTestJava prefix 도 module 필드 채움 (compile* 매칭)', () => {
    const output = `
> Task :domain-marketplace:compileTestJava
/home/u/MarketplaceTest.java:9: error: x
`;
    const errors = parseCompileErrors(output);
    expect(errors[0].module).toBe('domain-marketplace');
  });
});

describe('parseTestFailures — 멀티모듈 + boundary_violations (Step 8)', () => {
  it('> Task :module:test prefix 가 있으면 module 필드 첨부', () => {
    const output = `
> Task :domain-marketplace:test
ProductsTest > should_create() FAILED

> Task :domain-billing:test
PaymentTest > should_process() FAILED

5 tests completed, 2 failed
`;
    const parsed = parseTestFailures(output);
    expect(parsed.failures).toHaveLength(2);
    expect(parsed.failures[0]).toMatchObject({ class: 'ProductsTest', module: 'domain-marketplace' });
    expect(parsed.failures[1]).toMatchObject({ class: 'PaymentTest', module: 'domain-billing' });
  });

  it('Architecture 가 포함된 클래스 실패는 boundary_violations 로 분리', () => {
    const output = `
> Task :domain-marketplace:test
MarketplaceArchitectureTest > no_dependency_on_other_domains FAILED
ProductsTest > should_create() FAILED

3 tests completed, 2 failed
`;
    const parsed = parseTestFailures(output);
    expect(parsed.failures).toHaveLength(1);
    expect(parsed.failures[0].class).toBe('ProductsTest');
    expect(parsed.boundary_violations).toHaveLength(1);
    expect(parsed.boundary_violations[0]).toMatchObject({
      class: 'MarketplaceArchitectureTest',
      method: 'no_dependency_on_other_domains',
      module: 'domain-marketplace',
    });
    // failed 통계는 boundary 포함
    expect(parsed.failed).toBe(2);
  });

  it('boundary_violations 만 있고 일반 failures 0건 — failed 카운트 정확', () => {
    const output = `
> Task :domain-billing:test
BillingArchitectureTest > no_dependency_on_other_domains FAILED
`;
    const parsed = parseTestFailures(output);
    expect(parsed.failures).toHaveLength(0);
    expect(parsed.boundary_violations).toHaveLength(1);
    expect(parsed.failed).toBe(1);
  });
});
