/**
 * shared/names.js — methodName / reqDtoName / respDtoName 회귀 테스트
 *
 * v0.5 결함 회귀: 같은 도메인 안에 다른 resource 가 같은 action 을 가질 때
 * method/DTO 이름이 충돌해 컴파일 실패하던 문제. resource prefix 추가로 해결.
 */

import { describe, it, expect } from 'vitest';
import { methodName, reqDtoName, respDtoName, classNameOf } from '../shared/names.js';

describe('methodName — CRUD (단일 segment)', () => {
  it.each([
    ['GET',    '/api/v1/products',     'listProducts'],
    ['GET',    '/api/v1/products/{id}', 'getProduct'],
    ['POST',   '/api/v1/products',     'createProduct'],
    ['PUT',    '/api/v1/products/{id}', 'updateProduct'],
    ['PATCH',  '/api/v1/products/{id}', 'patchProduct'],
    ['DELETE', '/api/v1/products/{id}', 'deleteProduct'],
  ])('%s %s → %s', (m, p, expected) => {
    expect(methodName(m, p)).toBe(expected);
  });
});

describe('methodName — action (resource prefix 충돌 방지)', () => {
  it('payments + refunds 의 confirm action 이 충돌하지 않음', () => {
    expect(methodName('POST', '/api/v1/payments/{id}/confirm')).toBe('confirmPayment');
    expect(methodName('POST', '/api/v1/refunds/{id}/confirm')).toBe('confirmRefund');
  });

  it('orders + payments 의 cancel 도 충돌 없음', () => {
    expect(methodName('POST', '/api/v1/orders/{id}/cancel')).toBe('cancelOrder');
    expect(methodName('POST', '/api/v1/payments/{id}/cancel')).toBe('cancelPayment');
  });

  it('id 없는 action 도 prefix 부여', () => {
    expect(methodName('POST', '/api/v1/payments/refund')).toBe('refundPayment');
  });
});

describe('methodName — auth/oauth 표준 그룹은 prefix 없이', () => {
  it.each([
    ['POST', '/api/v1/auth/login',   'login'],
    ['POST', '/api/v1/auth/signup',  'signup'],
    ['POST', '/api/v1/auth/logout',  'logout'],
    ['POST', '/api/v1/auth/refresh', 'refresh'],
    ['POST', '/api/v1/oauth/callback', 'callback'],
    ['POST', '/api/v1/webhook/payment', 'payment'],
  ])('%s %s → %s', (m, p, expected) => {
    expect(methodName(m, p)).toBe(expected);
  });
});

describe('reqDtoName / respDtoName — action prefix 충돌 방지', () => {
  it('confirm 액션이 다른 resource 에서 다른 DTO 이름', () => {
    expect(reqDtoName('POST', '/api/v1/payments/{id}/confirm')).toBe('ConfirmPaymentRequest');
    expect(reqDtoName('POST', '/api/v1/refunds/{id}/confirm')).toBe('ConfirmRefundRequest');
    expect(respDtoName('POST', '/api/v1/payments/{id}/confirm')).toBe('ConfirmPaymentResponse');
    expect(respDtoName('POST', '/api/v1/refunds/{id}/confirm')).toBe('ConfirmRefundResponse');
  });

  it('auth 표준 그룹은 prefix 없는 DTO', () => {
    expect(reqDtoName('POST', '/api/v1/auth/login')).toBe('LoginRequest');
    expect(respDtoName('POST', '/api/v1/auth/login')).toBe('LoginResponse');
  });

  it('CRUD 의 DTO 이름은 변경 없음 (회귀 보호)', () => {
    expect(reqDtoName('POST', '/api/v1/products')).toBe('CreateProductRequest');
    expect(respDtoName('GET', '/api/v1/products')).toBe('ProductListResponse');
    expect(respDtoName('GET', '/api/v1/products/{id}')).toBe('ProductResponse');
  });
});

describe('classNameOf — 한글 service fallback', () => {
  it('영문 service 는 그대로 PascalCase', () => {
    expect(classNameOf({ service: 'Marketplace' })).toBe('Marketplace');
    expect(classNameOf({ service: 'Order Service' })).toBe('Order');
  });

  it('한글 service 는 slug 기반 fallback', () => {
    expect(classNameOf({ service: '파는 사람의 세계', slug: 'marketplace' })).toBe('Marketplace');
    expect(classNameOf({ service: '돈이 흐르는 세계', slug: 'billing' })).toBe('Billing');
  });

  it('명시 className 이 모든 것보다 우선', () => {
    expect(classNameOf({ service: 'Marketplace', className: 'Custom' })).toBe('Custom');
  });

  it('service/slug 모두 없으면 packageSegment 기반', () => {
    expect(classNameOf({ packageSegment: 'shop' })).toBe('Shop');
  });

  it('아무것도 없으면 Resource fallback', () => {
    expect(classNameOf({})).toBe('Resource');
  });
});

