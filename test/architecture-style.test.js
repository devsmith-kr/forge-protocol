/**
 * shared/architecture-style.js — 아키텍처 스타일 가드레일 회귀 테스트
 *
 * P0-3 개선의 일부로, 58 person-day / 1인 프로젝트에 MSA 가 추천되던
 * 문제를 재발 방지한다.
 */

import { describe, it, expect } from 'vitest';
import { pickArchitectureStyle } from '../shared/architecture-style.js';

describe('pickArchitectureStyle — 과설계 차단', () => {
  it('1인 · 58일 · 17블럭 → modular-monolith (실사용 회귀)', () => {
    // 핵심 회귀: 실사용 job-aggregator 시나리오
    const result = pickArchitectureStyle({
      blockCount: 17,
      serviceCount: 4,
      totalEffortDays: 58,
      teamSize: 1,
    });
    expect(result.style).toBe('modular-monolith');
    expect(result.reason).toMatch(/1~2인|단일 배포/);
  });

  it('2인 · 150일 → 여전히 modular-monolith', () => {
    const result = pickArchitectureStyle({
      blockCount: 25,
      serviceCount: 5,
      totalEffortDays: 150,
      teamSize: 2,
    });
    expect(result.style).toBe('modular-monolith');
  });

  it('200일 이상 + 3인 이상 → 중간 구간 (여전히 modular-monolith 기본)', () => {
    const result = pickArchitectureStyle({
      blockCount: 30,
      serviceCount: 6,
      totalEffortDays: 250,
      teamSize: 3,
    });
    expect(result.style).toBe('modular-monolith');
    expect(result.reason).toMatch(/분리 경로/);
  });

  it('팀 5인 이상 → msa', () => {
    const result = pickArchitectureStyle({
      blockCount: 30,
      serviceCount: 6,
      totalEffortDays: 400,
      teamSize: 5,
    });
    expect(result.style).toBe('msa');
  });

  it('블럭 40개 이상 → msa', () => {
    const result = pickArchitectureStyle({
      blockCount: 50,
      serviceCount: 8,
      totalEffortDays: 600,
      teamSize: 3,
    });
    expect(result.style).toBe('msa');
  });

  it('forceStyle 명시 → 임계치 무시하고 그 값 반환', () => {
    const result = pickArchitectureStyle({
      blockCount: 5,
      teamSize: 1,
      totalEffortDays: 20,
      forceStyle: 'msa',
    });
    expect(result.style).toBe('msa');
    expect(result.reason).toMatch(/--force-style|명시/);
  });

  it('알 수 없는 forceStyle 은 무시하고 휴리스틱 적용', () => {
    const result = pickArchitectureStyle({
      blockCount: 17,
      teamSize: 1,
      totalEffortDays: 58,
      forceStyle: 'quantum-mesh',  // 존재하지 않는 스타일
    });
    expect(result.style).toBe('modular-monolith');
  });

  it('모든 결과에 transition triggers 포함', () => {
    const mono = pickArchitectureStyle({ blockCount: 10, teamSize: 1, totalEffortDays: 50 });
    expect(mono.transition).toMatch(/CPU|팀|블럭/);

    const msa = pickArchitectureStyle({ blockCount: 50, teamSize: 8, totalEffortDays: 800 });
    expect(msa.transition).toMatch(/서비스|경계/);
  });
});
