import { describe, it, expect, vi, afterEach } from 'vitest';
import { ForgeError, warn, err as logError } from '../lib/core/errors.js';

describe('ForgeError', () => {
  it('기본 필드를 노출한다', () => {
    const e = new ForgeError('문제', { code: 'X', hint: 'do Y' });
    expect(e.message).toBe('문제');
    expect(e.code).toBe('X');
    expect(e.hint).toBe('do Y');
    expect(e.name).toBe('ForgeError');
    expect(e).toBeInstanceOf(Error);
  });

  it('cause를 보존한다', () => {
    const cause = new Error('원인');
    const e = new ForgeError('wrap', { cause });
    expect(e.cause).toBe(cause);
  });
});

describe('warn / err 로거', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warn은 stderr에 출력한다', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn('테스트 경고');
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0];
    expect(output).toContain('테스트 경고');
  });

  it('err은 ForgeError의 hint까지 출력한다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError(new ForgeError('실패함', { hint: '먼저 init하세요' }));

    const calls = spy.mock.calls.flat().join('\n');
    expect(calls).toContain('실패함');
    expect(calls).toContain('먼저 init하세요');
  });

  it('err은 일반 Error도 fallback 메시지로 출력한다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError(new Error('boom'), '기본 메시지');

    const calls = spy.mock.calls.flat().join('\n');
    expect(calls).toContain('기본 메시지');
    expect(calls).toContain('boom');
  });
});
