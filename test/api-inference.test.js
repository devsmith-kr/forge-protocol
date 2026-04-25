/**
 * shared/api-inference.js — API 계약 추론 회귀 테스트
 *
 * P0-1 개선의 일부로, 과거 결함(saved-jobss, job-searchs, 내부 서비스에도
 * CRUD 생성) 이 재발하지 않도록 고정한다.
 */

import { describe, it, expect } from 'vitest';
import { toResourcePath, inferApiStyle, inferEndpoints } from '../shared/api-inference.js';

describe('toResourcePath (pluralize)', () => {
  it('이미 복수형인 id 에 s 를 중복으로 붙이지 않는다', () => {
    // 과거 결함: saved-jobs → /saved-jobss
    expect(toResourcePath('saved-jobs')).toBe('/saved-jobs');
  });

  it('search → searches 규칙', () => {
    // 과거 결함: job-search → /job-searchs
    expect(toResourcePath('job-search')).toBe('/job-searches');
  });

  it('history → histories 규칙', () => {
    // 과거 결함: search-history → /search-historys
    expect(toResourcePath('search-history')).toBe('/search-histories');
  });

  it('status → statuses 규칙', () => {
    expect(toResourcePath('order-status')).toBe('/order-statuses');
  });

  it('category → categories 규칙', () => {
    expect(toResourcePath('product-category')).toBe('/product-categories');
  });

  it('단일 세그먼트도 정확히 복수화', () => {
    expect(toResourcePath('cart')).toBe('/carts');
    expect(toResourcePath('coupon')).toBe('/coupons');
  });

  it('빈 id 는 / 반환', () => {
    expect(toResourcePath('')).toBe('/');
    expect(toResourcePath(null)).toBe('/');
  });
});

describe('inferApiStyle', () => {
  it('명시된 api_style 을 최우선으로 따른다', () => {
    expect(inferApiStyle({ id: 'foo', api_style: 'query' })).toBe('query');
    expect(inferApiStyle({ id: 'foo', api_style: 'internal' })).toBe('internal');
  });

  it('internal 키워드 감지 — normalizer/indexer/crawler/scheduler/gateway', () => {
    expect(inferApiStyle({ id: 'job-normalizer' })).toBe('internal');
    expect(inferApiStyle({ id: 'job-indexer' })).toBe('internal');
    expect(inferApiStyle({ id: 'source-crawler' })).toBe('internal');
    expect(inferApiStyle({ id: 'crawl-scheduler' })).toBe('internal');
    expect(inferApiStyle({ id: 'notification-gateway' })).toBe('internal');
    expect(inferApiStyle({ id: 'duplicate-detector' })).toBe('internal');
  });

  it('query 키워드 감지 — search/filter/dashboard/monitor/history', () => {
    expect(inferApiStyle({ id: 'job-search' })).toBe('query');
    expect(inferApiStyle({ id: 'job-filter' })).toBe('query');
    expect(inferApiStyle({ id: 'admin-dashboard' })).toBe('query');
    expect(inferApiStyle({ id: 'crawl-monitor' })).toBe('query');
    expect(inferApiStyle({ id: 'search-history' })).toBe('query');
  });

  it('tech_desc 키워드도 고려한다 (한국어)', () => {
    expect(inferApiStyle({ id: 'x-y', tech_desc: '검색 엔진' })).toBe('query');
    expect(inferApiStyle({ id: 'x-y', tech_desc: '크롤러 스케줄링' })).toBe('internal');
  });

  it('특별한 패턴이 없으면 resource 기본값', () => {
    expect(inferApiStyle({ id: 'product' })).toBe('resource');
    expect(inferApiStyle({ id: 'order' })).toBe('resource');
    expect(inferApiStyle({ id: 'saved-jobs' })).toBe('resource');
  });
});

describe('inferEndpoints', () => {
  it('api_style=internal 블럭은 엔드포인트 0개', () => {
    // 핵심 회귀: duplicate-detector 가 POST/PUT/DELETE 를 뿌리지 않는다
    expect(inferEndpoints({ id: 'duplicate-detector', api_style: 'internal' })).toEqual([]);
    expect(inferEndpoints({ id: 'job-normalizer', api_style: 'internal' })).toEqual([]);
    // 명시 없어도 휴리스틱으로 internal 판정
    expect(inferEndpoints({ id: 'job-indexer' })).toEqual([]);
  });

  it('api_style=query 블럭은 GET 만', () => {
    const endpoints = inferEndpoints({ id: 'search-history', api_style: 'query', name: '검색 이력' });
    expect(endpoints.length).toBeGreaterThan(0);
    expect(endpoints.every((e) => e.method === 'GET')).toBe(true);
  });

  it('auth 블럭은 /auth/login|signup|refresh|logout 고정 패턴', () => {
    const endpoints = inferEndpoints({ id: 'buyer-signup', name: '회원가입' });
    const paths = endpoints.map((e) => e.path);
    expect(paths).toContain('/auth/login');
    expect(paths).toContain('/auth/signup');
    expect(paths).toContain('/auth/refresh');
    expect(paths).toContain('/auth/logout');
  });

  it('product-register / inventory-register 는 auth 분기 빠지면 안됨 (v0.5 결함 회귀)', () => {
    // 'register' 단어를 포함하는 일반 등록 블럭이 auth/login endpoint 를 만들면
    // 여러 도메인 컨트롤러에 같은 매핑이 생겨 Spring Ambiguous mapping 부트 실패.
    const productRegister = inferEndpoints({ id: 'product-register', name: '상품 등록' });
    const productPaths = productRegister.map((e) => e.path);
    expect(productPaths).not.toContain('/auth/login');
    expect(productPaths).not.toContain('/auth/signup');
    expect(productPaths.some((p) => p.startsWith('/product-registers'))).toBe(true);

    const inventoryRegister = inferEndpoints({ id: 'inventory-register', name: '재고 등록' });
    expect(inventoryRegister.map((e) => e.path)).not.toContain('/auth/login');
  });

  it('정상 auth 블럭은 여전히 auth 패턴 적용 (회귀 보호)', () => {
    expect(inferEndpoints({ id: 'signup', name: '회원가입' }).map((e) => e.path)).toContain('/auth/signup');
    expect(inferEndpoints({ id: 'auth-login', name: '로그인' }).map((e) => e.path)).toContain('/auth/login');
    expect(inferEndpoints({ id: 'buyer-signup', name: '회원가입' }).map((e) => e.path)).toContain('/auth/login');
    expect(inferEndpoints({ id: 'user-logout', name: '로그아웃' }).map((e) => e.path)).toContain('/auth/logout');
  });

  it('social/oauth 블럭은 auth 와 다른 경로 (충돌 방지) — v0.5 결함 회귀', () => {
    const endpoints = inferEndpoints({ id: 'social-login', name: '소셜 로그인' });
    const paths = endpoints.map((e) => e.path);
    expect(paths.every((p) => p.includes('/oauth/'))).toBe(true);
    // 표준 auth 의 경로와 겹치지 않아야 함
    expect(paths).not.toContain('/auth/login');
    expect(paths).not.toContain('/auth/signup');
  });

  it('oauth 블럭은 provider/callback 포함', () => {
    const endpoints = inferEndpoints({ id: 'oauth-google', name: 'Google OAuth' });
    const paths = endpoints.map((e) => e.path);
    expect(paths.some((p) => p.includes('{provider}'))).toBe(true);
    expect(paths.some((p) => p.includes('callback'))).toBe(true);
  });

  it('detail 블럭은 단일 GET /{id}', () => {
    const endpoints = inferEndpoints({ id: 'product-detail', name: '상품 상세' });
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe('GET');
    expect(endpoints[0].path).toBe('/product-details/{id}');
  });

  it('payment 블럭은 confirm/cancel 포함', () => {
    const endpoints = inferEndpoints({ id: 'payment', name: '결제' });
    const paths = endpoints.map((e) => e.path);
    expect(paths.some((p) => p.endsWith('/confirm'))).toBe(true);
    expect(paths.some((p) => p.endsWith('/cancel'))).toBe(true);
  });

  it('기본 resource 블럭은 CRUD 5개', () => {
    const endpoints = inferEndpoints({ id: 'cart', name: '장바구니' });
    expect(endpoints).toHaveLength(5);
    const methods = endpoints.map((e) => e.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });

  it('saved-jobs 경로에 s 가 중복으로 붙지 않음 (회귀)', () => {
    const endpoints = inferEndpoints({ id: 'saved-jobs', name: '북마크' });
    for (const e of endpoints) {
      expect(e.path).not.toMatch(/saved-jobss/);
    }
  });
});
