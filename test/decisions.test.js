import { describe, it, expect, vi } from 'vitest';
import { formatDecisionAnswer, promptDecisions } from '../lib/decisions.js';

// ── 테스트 팩토리 ────────────────────────────────────────

function makeDecision(overrides = {}) {
  return {
    trigger: 'coupon',
    question: '쿠폰 할인 부담은?',
    options: ['판매자 부담', '플랫폼 부담'],
    cascade_effects: { payment: 'discount_applied' },
    ...overrides,
  };
}

function makeBlockMap(entries = []) {
  return new Map(entries);
}

// ═════════════════════════════════════════════════════════
describe('formatDecisionAnswer', () => {
  it('decision의 trigger/question/cascade_effects와 answer를 합친 객체를 반환', () => {
    const decision = makeDecision();
    const out = formatDecisionAnswer(decision, '판매자 부담');

    expect(out).toEqual({
      trigger: 'coupon',
      question: '쿠폰 할인 부담은?',
      answer: '판매자 부담',
      cascade_effects: { payment: 'discount_applied' },
    });
  });

  it('cascade_effects가 없는 결정도 안전하게 처리 (undefined 전달)', () => {
    const decision = makeDecision({ cascade_effects: undefined });
    const out = formatDecisionAnswer(decision, 'yes');
    expect(out.cascade_effects).toBeUndefined();
    expect(out.answer).toBe('yes');
  });

  it('순수 함수 — 입력 객체를 변형하지 않음', () => {
    const decision = makeDecision();
    const snapshot = JSON.parse(JSON.stringify(decision));
    formatDecisionAnswer(decision, 'x');
    expect(decision).toEqual(snapshot);
  });
});

// ═════════════════════════════════════════════════════════
describe('promptDecisions', () => {
  it('decisions가 빈 배열이면 즉시 빈 배열 반환, prompt 호출 없음', async () => {
    const prompt = vi.fn();
    const log = vi.fn();

    const out = await promptDecisions([], makeBlockMap(), { prompt, log });

    expect(out).toEqual([]);
    expect(prompt).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('decisions가 null/undefined여도 빈 배열 반환', async () => {
    const prompt = vi.fn();
    const log = vi.fn();

    expect(await promptDecisions(null, makeBlockMap(), { prompt, log })).toEqual([]);
    expect(await promptDecisions(undefined, makeBlockMap(), { prompt, log })).toEqual([]);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('각 decision에 대해 prompt를 호출하고 answer를 formatDecisionAnswer 포맷으로 반환', async () => {
    const decisions = [
      makeDecision({ trigger: 'coupon', question: 'Q1' }),
      makeDecision({ trigger: 'refund', question: 'Q2', options: ['a', 'b'] }),
    ];
    const blockMap = makeBlockMap([
      ['coupon', { name: '쿠폰' }],
      ['refund', { name: '환불' }],
    ]);

    const prompt = vi.fn().mockResolvedValueOnce({ answer: '판매자 부담' }).mockResolvedValueOnce({ answer: 'a' });
    const log = vi.fn();

    const out = await promptDecisions(decisions, blockMap, { prompt, log });

    expect(prompt).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(2);
    expect(out[0].trigger).toBe('coupon');
    expect(out[0].answer).toBe('판매자 부담');
    expect(out[1].trigger).toBe('refund');
    expect(out[1].answer).toBe('a');
  });

  it('prompt에 전달되는 질문 설정(list 타입, choices)이 decision 스펙과 일치', async () => {
    const decisions = [makeDecision({ options: ['X', 'Y'] })];
    const prompt = vi.fn().mockResolvedValue({ answer: 'X' });
    const log = vi.fn();

    await promptDecisions(decisions, makeBlockMap(), { prompt, log });

    const [questions] = prompt.mock.calls[0];
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe('list');
    expect(questions[0].name).toBe('answer');
    expect(questions[0].choices).toEqual(['X', 'Y']);
  });

  it('blockMap에 trigger가 없어도 fallback으로 trigger ID를 사용하여 로그', async () => {
    const decisions = [makeDecision({ trigger: 'unknown-id' })];
    const prompt = vi.fn().mockResolvedValue({ answer: 'ok' });
    const log = vi.fn();

    const out = await promptDecisions(decisions, makeBlockMap(), { prompt, log });

    expect(out).toHaveLength(1);
    // 로그 중 어딘가에 trigger ID가 노출되어야 함
    const allLogs = log.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogs).toContain('unknown-id');
  });
});
