/**
 * shared/concerns.js — 도메인 관심사 태그 시스템 회귀 테스트
 *
 * P0-2 개선의 일부로, Phase 2/4/5 프롬프트의 "결제 보안 필수" 하드코딩을
 * concerns 태그 기반 조건부 삽입으로 교체했다. 이 테스트는 두 도메인
 * (commerce vs 채용 집계) 에서 올바르게 분기되는지 고정한다.
 */

import { describe, it, expect } from 'vitest';
import { KNOWN_CONCERNS, concernsOf, collectConcerns, buildConcernFragments } from '../shared/concerns.js';

describe('concernsOf', () => {
  it('명시된 concerns 필드를 최우선으로 따른다', () => {
    const block = { id: 'x', concerns: ['payment', 'auth'] };
    expect(concernsOf(block)).toEqual(['payment', 'auth']);
  });

  it('알 수 없는 concern 값은 필터링된다', () => {
    const block = { id: 'x', concerns: ['payment', 'unknown-tag'] };
    expect(concernsOf(block)).toEqual(['payment']);
  });

  it('concerns 필드 없으면 id 기반 레거시 매핑으로 fallback', () => {
    expect(concernsOf({ id: 'payment' })).toEqual(['payment', 'concurrency']);
    expect(concernsOf({ id: 'buyer-signup' })).toEqual(['auth', 'pii']);
    expect(concernsOf({ id: 'product-search' })).toEqual(['search']);
  });

  it('알 수 없는 id 는 빈 배열', () => {
    expect(concernsOf({ id: 'unknown-block' })).toEqual([]);
    expect(concernsOf(null)).toEqual([]);
  });
});

describe('collectConcerns', () => {
  it('블럭 리스트에서 concerns 합집합을 반환', () => {
    const blocks = [
      { id: 'x', concerns: ['payment'] },
      { id: 'y', concerns: ['auth', 'pii'] },
      { id: 'z', concerns: ['payment', 'concurrency'] },
    ];
    const set = collectConcerns(blocks);
    expect(set.has('payment')).toBe(true);
    expect(set.has('auth')).toBe(true);
    expect(set.has('pii')).toBe(true);
    expect(set.has('concurrency')).toBe(true);
    expect(set.size).toBe(4);
  });

  it('빈 입력은 빈 Set', () => {
    expect(collectConcerns([]).size).toBe(0);
    expect(collectConcerns(null).size).toBe(0);
  });
});

describe('buildConcernFragments — Phase 별 분기', () => {
  it('commerce 도메인 (payment 포함) → shape 프롬프트에 결제 섹션 포함', () => {
    const blocks = [{ id: 'x', concerns: ['payment', 'auth'] }];
    const concerns = collectConcerns(blocks);
    const fragments = buildConcernFragments(concerns, 'shape');
    expect(fragments.join('\n')).toMatch(/결제|PG|멱등/);
    expect(fragments.join('\n')).toMatch(/JWT|토큰/);
  });

  it('채용 집계 도메인 (payment 없음) → shape 프롬프트에 결제 섹션 0회', () => {
    // 핵심 회귀: 실사용에서 발견된 문제
    const blocks = [
      { id: 'crawler', concerns: ['crawling'] },
      { id: 'auth', concerns: ['auth', 'pii'] },
      { id: 'indexer', concerns: ['search'] },
    ];
    const concerns = collectConcerns(blocks);
    const fragments = buildConcernFragments(concerns, 'shape');
    const text = fragments.join('\n');

    // 결제·PG·금액 같은 단어가 없어야 함
    expect(text).not.toMatch(/결제/);
    expect(text).not.toMatch(/PG\s/);
    expect(text).not.toMatch(/금액/);

    // 대신 크롤링·검색·인증 섹션은 있어야 함
    expect(text).toMatch(/robots\.txt|저작권|크롤링/);
    expect(text).toMatch(/nori|인덱스|검색/);
    expect(text).toMatch(/JWT|토큰/);
  });

  it('temper phase: payment 있으면 WireMock, 없으면 미포함', () => {
    const withPayment = buildConcernFragments(new Set(['payment']), 'temper').join('\n');
    expect(withPayment).toMatch(/WireMock|PG/);

    const withoutPayment = buildConcernFragments(new Set(['crawling', 'search']), 'temper').join('\n');
    expect(withoutPayment).not.toMatch(/WireMock/);
    expect(withoutPayment).not.toMatch(/PG\s/);
  });

  it('inspect phase: payment 있으면 결제 보안 리뷰, 없으면 미포함', () => {
    const withPayment = buildConcernFragments(new Set(['payment']), 'inspect').join('\n');
    expect(withPayment).toMatch(/결제.*보안|금액.*검증|웹훅.*서명/);

    const withoutPayment = buildConcernFragments(new Set(['crawling']), 'inspect').join('\n');
    expect(withoutPayment).not.toMatch(/결제/);
    expect(withoutPayment).toMatch(/robots|저작권|ToS/);
  });

  it('concerns 결과는 KNOWN_CONCERNS 순서로 결정적', () => {
    // 순서 안정성: Set 순서에 의존하지 않고 KNOWN_CONCERNS 순회
    const fragments1 = buildConcernFragments(new Set(['pii', 'payment', 'auth']), 'shape');
    const fragments2 = buildConcernFragments(new Set(['auth', 'pii', 'payment']), 'shape');
    expect(fragments1).toEqual(fragments2);
  });
});
