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
});
