import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log } from '../lib/core/ui.js';

// chalk는 NODE_ENV=test에서도 ANSI 코드를 섞는다.
// 눈으로 비교하기보다 substring/structure 검사에 초점.

describe('log utility', () => {
  let spy;
  beforeEach(() => {
    spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('blank()은 빈 문자열 한 줄을 출력', () => {
    log.blank();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('');
  });

  it('info()는 들여쓰기를 적용', () => {
    log.info('hello');
    const out = spy.mock.calls[0][0];
    expect(out.startsWith('  ')).toBe(true);
    expect(out).toContain('hello');
  });

  it('success()는 ✅과 메시지를 포함', () => {
    log.success('done');
    const out = spy.mock.calls[0][0];
    expect(out).toContain('✅');
    expect(out).toContain('done');
  });

  it('warn()은 ⚠과 메시지를 포함', () => {
    log.warn('careful');
    const out = spy.mock.calls[0][0];
    expect(out).toContain('⚠');
    expect(out).toContain('careful');
  });

  it('err()는 ✗과 메시지를 포함', () => {
    log.err('boom');
    const out = spy.mock.calls[0][0];
    expect(out).toContain('✗');
    expect(out).toContain('boom');
  });

  it('section()은 빈 줄 + 제목 (icon 없을 때)', () => {
    log.section('제목');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toBe('');
    expect(spy.mock.calls[1][0]).toContain('제목');
  });

  it('section()은 icon이 있으면 prefix로 붙임', () => {
    log.section('Smelt', '🔥');
    expect(spy.mock.calls[1][0]).toContain('🔥');
    expect(spy.mock.calls[1][0]).toContain('Smelt');
  });

  it('kv()는 label과 value를 한 줄에 출력', () => {
    log.kv('블럭', '5개');
    const out = spy.mock.calls[0][0];
    expect(out).toContain('블럭');
    expect(out).toContain('5개');
  });

  it('next()는 앞/뒤 빈 줄과 cmd를 출력', () => {
    log.next('forge smelt');
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls[0][0]).toBe('');
    expect(spy.mock.calls[1][0]).toContain('forge smelt');
    expect(spy.mock.calls[2][0]).toBe('');
  });

  it('files()는 헤더 + 파일 경로 목록을 출력', () => {
    log.files(['a.yml', 'b.yml']);
    // 빈 줄 + 헤더 + 2개 파일 = 4 calls
    expect(spy).toHaveBeenCalledTimes(4);
    expect(spy.mock.calls[1][0]).toContain('생성 파일');
    expect(spy.mock.calls[2][0]).toContain('a.yml');
    expect(spy.mock.calls[3][0]).toContain('b.yml');
  });

  it('item()은 prefix와 메시지를 포함', () => {
    log.item('블럭A');
    const out = spy.mock.calls[0][0];
    expect(out).toContain('•');
    expect(out).toContain('블럭A');
  });

  it('item({prefix: "+"})는 커스텀 prefix 적용', () => {
    log.item('블럭B', { prefix: '+', color: 'cyan' });
    const out = spy.mock.calls[0][0];
    expect(out).toContain('+');
    expect(out).toContain('블럭B');
  });
});
