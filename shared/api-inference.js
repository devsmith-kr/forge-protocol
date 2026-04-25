/**
 * Forge Protocol — API 계약 추론 공용 모듈
 *
 * CLI(`lib/build.js`)와 Web UI(`web/src/generators.js`)가 함께 사용한다.
 * 블럭 id·name·tech_desc·api_style 를 바탕으로 REST 엔드포인트를 추론한다.
 *
 * ## api_style
 *   - "resource" (기본): CRUD 5개 메서드 (또는 도메인 특수 패턴)
 *   - "query":          GET 만 (검색·대시보드·현황 등)
 *   - "internal":       REST 엔드포인트 없음 (정규화기·인덱서·스케줄러 등)
 *
 * api_style 이 명시되지 않으면 블럭 id/tech_desc 휴리스틱으로 추정한다.
 */

import pluralize from 'pluralize';

/**
 * 블럭 id → REST 리소스 경로. `pluralize` 가 영어 복수형 예외(search→searches,
 * history→histories, status→statuses)를 정확히 처리한다.
 *
 * 예: saved-jobs → /saved-jobs (이미 복수)
 *     search-history → /search-histories
 *     category → /categories
 */
export function toResourcePath(blockId) {
  const id = blockId ?? '';
  if (!id) return '/';
  const parts = id.split('-');
  const last = parts[parts.length - 1];
  const prefix = parts.slice(0, -1).join('-');
  const pluralLast = pluralize(last);
  return prefix ? `/${prefix}-${pluralLast}` : `/${pluralLast}`;
}

/**
 * api_style 이 명시되지 않았을 때 블럭 특성으로 추정.
 * 키워드 매칭으로 "internal" 또는 "query" 판정, 나머지는 "resource".
 */
export function inferApiStyle(block) {
  if (block?.api_style) return block.api_style;

  const haystack = `${block?.id ?? ''} ${block?.name ?? ''} ${block?.tech_desc ?? ''}`.toLowerCase();

  // internal: REST 엔드포인트를 노출하지 않는 내부 서비스
  const INTERNAL = [
    'normalizer', 'normaliz', '정규화',
    'indexer', 'indexing', '인덱스 갱신', '색인',
    'detector', 'dedup', '중복 제거',
    'scheduler', '스케줄',
    'gateway', '게이트웨이',
    'crawler', '크롤러',
    'parser', '파서',
  ];
  if (INTERNAL.some(k => haystack.includes(k))) return 'internal';

  // query: 읽기 중심
  const QUERY = [
    'search', '검색', 'filter', '필터',
    'dashboard', '대시보드',
    'monitor', '모니터',
    'history', '이력', '기록',
    'stats', 'analytics', '분석', '통계',
  ];
  if (QUERY.some(k => haystack.includes(k))) return 'query';

  return 'resource';
}

/**
 * 블럭 하나 → 엔드포인트 배열.
 * api_style 이 internal 이면 빈 배열 반환 (호출자가 스킵 처리).
 */
export function inferEndpoints(block, options = {}) {
  const { apiPrefix = '' } = options; // '/api/v1' 등을 앞에 붙일 경우
  const style = inferApiStyle(block);
  if (style === 'internal') return [];

  const id = block?.id ?? '';
  const name = block?.name ?? id;
  const base = apiPrefix + toResourcePath(id);

  // ── 도메인 특수 패턴 (resource 스타일 안에서 특화) ──

  // OAuth/소셜 로그인은 표준 auth 와 별도 경로 — 같은 도메인에 둘 다 있으면 충돌 방지
  if (/oauth|social/i.test(id)) {
    const authBase = apiPrefix + '/auth';
    return [
      { method: 'GET',  path: `${authBase}/oauth/{provider}`,          description: 'OAuth 인증 시작 (provider redirect)' },
      { method: 'GET',  path: `${authBase}/oauth/{provider}/callback`, description: 'OAuth 콜백 (Authorization Code → JWT)' },
      { method: 'POST', path: `${authBase}/oauth/{provider}/link`,     description: '기존 계정 소셜 연동' },
    ];
  }

  // auth 블럭: ID 의 의미가 분명히 인증 도메인일 때만 auth 패턴 부여.
  // 'register' 는 너무 광범위해 제거 — `product-register` 같은 일반 등록 블럭이
  // auth 분기로 빠지면서 여러 도메인에 같은 `/auth/login` 매핑이 생성돼
  // Spring Ambiguous mapping 으로 부트 실패하던 문제 (v0.5).
  if (/(^|-)(auth|signup|signin|login|logout)$|^auth-/i.test(id)) {
    const authBase = apiPrefix + '/auth';
    return [
      { method: 'POST',   path: `${authBase}/signup`,  description: '회원가입' },
      { method: 'POST',   path: `${authBase}/login`,   description: '로그인 (JWT 발급)' },
      { method: 'POST',   path: `${authBase}/refresh`, description: 'Access Token 갱신' },
      { method: 'DELETE', path: `${authBase}/logout`,  description: '로그아웃' },
    ];
  }

  if (/payment|refund/i.test(id)) {
    return [
      { method: 'POST', path: base,              description: `${name} 요청` },
      { method: 'GET',  path: `${base}/{id}`,    description: `${name} 상태 조회` },
      { method: 'POST', path: `${base}/{id}/confirm`, description: `${name} 확정` },
      { method: 'POST', path: `${base}/{id}/cancel`,  description: `${name} 취소` },
    ];
  }

  if (/webhook|integration/i.test(id)) {
    return [
      { method: 'POST', path: `${base}/notify`, description: 'Webhook 수신' },
      { method: 'GET',  path: `${base}/status`, description: '연동 상태 확인' },
    ];
  }

  if (/notification/i.test(id) && style === 'resource') {
    return [
      { method: 'GET',    path: base,            description: '알림 목록 (읽음/안읽음)' },
      { method: 'PATCH',  path: `${base}/{id}/read`, description: '알림 읽음 처리' },
      { method: 'DELETE', path: `${base}/{id}`,  description: '알림 삭제' },
    ];
  }

  if (/detail/i.test(id)) {
    // 상세는 조회만
    return [
      { method: 'GET', path: `${base}/{id}`, description: `${name} 조회` },
    ];
  }

  if (/report/i.test(id)) {
    return [
      { method: 'POST',  path: base,             description: `${name} 접수` },
      { method: 'GET',   path: base,             description: `${name} 목록 조회` },
      { method: 'GET',   path: `${base}/{id}`,   description: `${name} 상세` },
      { method: 'PATCH', path: `${base}/{id}`,   description: `${name} 상태 전이` },
    ];
  }

  // ── style 별 기본 패턴 ──
  if (style === 'query') {
    return [
      { method: 'GET', path: base,           description: `${name} 조회` },
      { method: 'GET', path: `${base}/{id}`, description: `${name} 상세 조회` },
    ];
  }

  // resource: CRUD
  return [
    { method: 'GET',    path: base,          description: `${name} 목록` },
    { method: 'POST',   path: base,          description: `${name} 생성` },
    { method: 'GET',    path: `${base}/{id}`, description: `${name} 상세` },
    { method: 'PUT',    path: `${base}/{id}`, description: `${name} 수정` },
    { method: 'DELETE', path: `${base}/{id}`, description: `${name} 삭제` },
  ];
}
