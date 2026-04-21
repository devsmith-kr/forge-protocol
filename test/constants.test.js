import { describe, it, expect } from 'vitest';
import {
  FEATURE_DETECTORS,
  detectFeatures,
  getRiskBlockIds,
  isRiskBlock,
  MATCH_SCORES,
} from '../lib/constants.js';

// ═════════════════════════════════════════════════════════
describe('FEATURE_DETECTORS', () => {
  it('7개 feature detector가 정의되어 있음', () => {
    expect(FEATURE_DETECTORS).toHaveLength(7);
  });

  it('각 detector에 id, label, blockIds, note가 있음', () => {
    for (const detector of FEATURE_DETECTORS) {
      expect(detector).toHaveProperty('id');
      expect(detector).toHaveProperty('label');
      expect(detector).toHaveProperty('blockIds');
      expect(detector).toHaveProperty('note');
      expect(detector.blockIds.length).toBeGreaterThan(0);
    }
  });

  it('필수 feature ID가 모두 포함됨', () => {
    const ids = FEATURE_DETECTORS.map(d => d.id);
    expect(ids).toContain('payment');
    expect(ids).toContain('auth');
    expect(ids).toContain('concurrency');
    expect(ids).toContain('search');
    expect(ids).toContain('realtime');
    expect(ids).toContain('file-upload');
    expect(ids).toContain('scheduling');
  });
});

// ═════════════════════════════════════════════════════════
describe('detectFeatures', () => {
  it('블럭 ID로 해당 feature를 감지', () => {
    const blockIds = new Set(['payment', 'buyer-signup']);
    const features = detectFeatures(blockIds);

    const featureIds = features.map(f => f.id);
    expect(featureIds).toContain('payment');
    expect(featureIds).toContain('auth');
  });

  it('매칭 없으면 빈 배열 반환', () => {
    const features = detectFeatures(new Set(['some-unknown-block']));
    expect(features).toEqual([]);
  });

  it('빈 Set이면 빈 배열 반환', () => {
    const features = detectFeatures(new Set());
    expect(features).toEqual([]);
  });

  it('간접 블럭 ID도 감지 (pg-integration → payment)', () => {
    const features = detectFeatures(new Set(['pg-integration']));
    expect(features.map(f => f.id)).toContain('payment');
  });
});

// ═════════════════════════════════════════════════════════
describe('getRiskBlockIds', () => {
  it('감지된 feature에 해당하는 리스크 블럭 ID 반환', () => {
    const detectedFeatures = new Set(['payment', 'auth']);
    const riskIds = getRiskBlockIds(detectedFeatures);

    expect(riskIds).toContain('payment');
    expect(riskIds).toContain('refund');
    expect(riskIds).toContain('buyer-signup');
  });

  it('빈 feature set이면 빈 배열 반환', () => {
    expect(getRiskBlockIds(new Set())).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════
describe('isRiskBlock', () => {
  it('리스크 키워드 포함 블럭 ID는 true', () => {
    expect(isRiskBlock('payment')).toBe(true);
    expect(isRiskBlock('buyer-signup')).toBe(true);
    expect(isRiskBlock('inventory-manage')).toBe(true);
    expect(isRiskBlock('order')).toBe(true);
  });

  it('리스크 키워드 미포함 블럭 ID는 false', () => {
    expect(isRiskBlock('product-register')).toBe(false);
    expect(isRiskBlock('notification')).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════
describe('MATCH_SCORES', () => {
  it('점수 상수가 올바르게 정의됨', () => {
    expect(MATCH_SCORES.EXACT).toBe(100);
    expect(MATCH_SCORES.NAME_INCLUDES).toBe(80);
    expect(MATCH_SCORES.ANALOGY).toBe(60);
    expect(MATCH_SCORES.DESC_MULTI_KEYWORD).toBe(50);
    expect(MATCH_SCORES.DESC_SINGLE_KEYWORD).toBe(30);
    expect(MATCH_SCORES.THRESHOLD).toBe(30);
  });

  it('THRESHOLD가 DESC_SINGLE_KEYWORD 이하', () => {
    expect(MATCH_SCORES.THRESHOLD).toBeLessThanOrEqual(MATCH_SCORES.DESC_SINGLE_KEYWORD);
  });
});
