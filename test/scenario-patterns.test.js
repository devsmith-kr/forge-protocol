/**
 * shared/scenario-patterns.js — 시나리오 생성 엔진 회귀 테스트 (P1-1)
 *
 * 과거 결함: 블럭 18개에 동일 "유효한 입력 → 정상 처리" 템플릿.
 * 해결: tech_desc 키워드 + concerns 기반 매핑으로 블럭별 고유 시나리오.
 */

import { describe, it, expect } from 'vitest';
import { buildScenariosForBlock, PATTERN_RULES, CONCERN_SCENARIOS } from '../shared/scenario-patterns.js';

describe('buildScenariosForBlock', () => {
  it('모든 블럭에 Happy Path + 필수값 검증 기본 포함', () => {
    const s = buildScenariosForBlock({ id: 'foo', name: 'Foo' });
    expect(s.some((c) => c.name.includes('Happy Path'))).toBe(true);
    expect(s.some((c) => c.name.includes('Validation'))).toBe(true);
  });

  it('auth 블럭 → 중복 이메일·비밀번호 실패·만료 토큰 시나리오', () => {
    const s = buildScenariosForBlock({ id: 'user-account', name: '회원가입·로그인', tech_desc: 'JWT + OAuth2' });
    const names = s.map((c) => c.name).join(' ');
    expect(names).toMatch(/중복 이메일|비밀번호.*실패|만료.*토큰/);
  });

  it('crawler 블럭 → robots.txt / 429 백오프 / 파싱 실패율 시나리오', () => {
    const s = buildScenariosForBlock({
      id: 'source-crawler',
      name: '외부 사이트 크롤러',
      tech_desc: 'robots.txt 준수, 지수 백오프',
    });
    const names = s.map((c) => c.name).join(' ');
    expect(names).toMatch(/robots/);
    expect(names).toMatch(/레이트리밋|429|백오프/);
  });

  it('dedupe/SimHash 블럭 → hamming 경계·tie-break 시나리오', () => {
    const s = buildScenariosForBlock({
      id: 'duplicate-detector',
      name: '중복 공고 제거',
      tech_desc: 'SimHash 기반 유사도 (회사+제목+마감일) 복합키 지문, 클러스터링',
    });
    const text = s.map((c) => c.name + ' ' + c.given + ' ' + c.then).join(' ');
    expect(text).toMatch(/hamming|SimHash/);
    expect(text).toMatch(/cluster/i);
  });

  it('search 블럭 → 빈쿼리·XSS·Nori 시나리오', () => {
    const s = buildScenariosForBlock({
      id: 'job-search',
      name: '통합 공고 검색',
      tech_desc: 'Elasticsearch 기반 Full-text 검색',
    });
    const text = s.map((c) => c.name).join(' ');
    expect(text).toMatch(/빈 쿼리/);
    expect(text).toMatch(/XSS/);
  });

  it('saved-jobs 북마크 → 복합PK 멱등 + 10-thread 동시성 시나리오', () => {
    const s = buildScenariosForBlock({
      id: 'saved-jobs',
      name: '공고 저장(북마크)',
      tech_desc: 'User-Job N:M 관계 테이블, 낙관적 토글',
    });
    const text = s.map((c) => c.name).join(' ');
    expect(text).toMatch(/Idempotency|멱등/);
    expect(text).toMatch(/Concurrency|동시/);
  });

  it('payment 블럭 → 금액 재검증 · 멱등 · 웹훅 서명 3종 포함', () => {
    const s = buildScenariosForBlock({ id: 'payment', name: '결제', tech_desc: 'PG 연동, 금액 위변조 방지' });
    const text = s.map((c) => c.name).join(' ');
    expect(text).toMatch(/금액.*재검증/);
    expect(text).toMatch(/멱등/);
    expect(text).toMatch(/웹훅.*서명/);
  });

  it('concerns=pii 면 마스킹 시나리오 자동 추가', () => {
    const s = buildScenariosForBlock({ id: 'user-profile', name: '프로필' }, { concerns: ['pii'] });
    expect(s.some((c) => c.name.includes('PII') || c.name.includes('마스킹'))).toBe(true);
  });

  it('concerns=file-upload 면 용량·MIME 시나리오 추가', () => {
    const s = buildScenariosForBlock({ id: 'product-register', name: '상품 등록' }, { concerns: ['file-upload'] });
    const text = s.map((c) => c.name).join(' ');
    expect(text).toMatch(/용량 초과/);
    expect(text).toMatch(/MIME/);
  });

  it('시나리오 수가 6개로 제한됨 (과다 생성 방지)', () => {
    // 여러 패턴을 동시에 매치하는 블럭: auth + payment + notification
    const s = buildScenariosForBlock(
      {
        id: 'mega-auth-payment-notification',
        name: '합성',
        tech_desc: 'JWT OAuth2 결제 notification',
      },
      { concerns: ['pii', 'file-upload'] },
    );
    expect(s.length).toBeLessThanOrEqual(6);
    // 첫 요소는 Happy Path, 마지막은 Validation 유지
    expect(s[0].name).toMatch(/Happy Path/);
    expect(s[s.length - 1].name).toMatch(/Validation/);
  });

  it('단순 CRUD 블럭은 Happy Path + Validation 2개만 (과다 없음)', () => {
    const s = buildScenariosForBlock({ id: 'product-register', name: '상품 등록' });
    // auth/payment 등 특수 패턴 매치 없음 → 2개만
    expect(s.length).toBe(2);
  });

  it('모든 시나리오에 Given-When-Then 필드 존재', () => {
    const s = buildScenariosForBlock({ id: 'source-crawler', name: '크롤러', tech_desc: 'robots.txt' });
    for (const c of s) {
      expect(c.given).toBeTruthy();
      expect(c.when).toBeTruthy();
      expect(c.then).toBeTruthy();
      expect(['must', 'should']).toContain(c.priority);
    }
  });
});

describe('job-aggregator 카탈로그 전체 실증 테스트', () => {
  it('채용 도메인 17블럭 전체 → 블럭 고유 시나리오 10건 이상', async () => {
    const yaml = (await import('js-yaml')).default;
    const { readFile } = await import('node:fs/promises');
    const text = await readFile('templates/job-aggregator/catalog.yml', 'utf-8');
    const cat = yaml.load(text);

    const uniqueScenarioNames = new Set();
    for (const block of cat.blocks) {
      const cases = buildScenariosForBlock(block);
      for (const c of cases) uniqueScenarioNames.add(c.name);
    }

    // 실사용 회귀: 동일 템플릿만 반복되지 않도록 고유 이름 10개 이상
    expect(uniqueScenarioNames.size).toBeGreaterThanOrEqual(10);

    // 도메인 특화 시나리오 존재 확인
    const all = [...uniqueScenarioNames].join(' ');
    expect(all).toMatch(/robots/);
    expect(all).toMatch(/hamming|SimHash/);
    expect(all).toMatch(/Idempotency|멱등/);
  });
});
