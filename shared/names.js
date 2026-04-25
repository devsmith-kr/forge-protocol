/**
 * shared/names.js
 *
 * 파싱 유틸 + 이름 추론 — body/response 문자열을 분해하고 path + method에서
 * Java 식별자(메서드명, DTO 클래스명)를 유추한다.
 * CLI(`lib/emit`)와 Web(`web/src/codeGenerators`) 양쪽이 공유한다.
 */

// ── 문자열 변환 ─────────────────────────────────────────

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
export const camel = (s) => s.replace(/[-_\s]+([a-zA-Z])/g, (_, c) => c.toUpperCase());
export const pascal = (s) => cap(camel(s));

// "User Service" → "user" / "Order Service" → "order"
export const pkgOf = (svc) =>
  svc
    .toLowerCase()
    .replace(/\s*service$/i, '')
    .replace(/[\s-]+/g, '')
    .trim() || 'app';

/**
 * 그룹의 Java 패키지 세그먼트를 결정한다.
 *   1) grp.packageSegment 가 명시되어 있으면(멀티모듈 emit) 그것 우선 — layout 이 미리 결정함
 *   2) 그렇지 않으면 grp.service 에서 pkgOf 로 자동 추론 (single-module v0.4 호환)
 *
 * 멀티모듈 emit 에서는 layout.module.packageSegment 가 슬러그 우선순위 (AI 추론) 를 반영하므로
 * generator 들이 이걸 사용해야 한 모듈 안의 패키지 일관성이 보장된다.
 */
export const pkgSegmentOf = (grp) => {
  if (grp && typeof grp.packageSegment === 'string' && grp.packageSegment) {
    return grp.packageSegment;
  }
  return pkgOf(grp?.service ?? '');
};

/**
 * Java 클래스명을 결정한다 — Java 식별자 규칙(영문/숫자/_/$)을 보장.
 *
 *   1) grp.className 명시값이 있으면 그것 우선
 *   2) clsOf(grp.service) 결과가 ASCII 식별자면 채택 (영문 service 호환)
 *   3) 한글/비ASCII 가 섞였으면 grp.slug 또는 packageSegment 기반 PascalCase 로 fallback
 *
 *   "파는 사람의 세계" + slug:"marketplace"  → "Marketplace"  (한글 fallback)
 *   "Seller World"                            → "SellerWorld"  (기존 동작)
 *   "Order Service"                           → "Order"        (기존 동작 — service 꼬리 제거)
 */
export const classNameOf = (grp) => {
  if (grp && typeof grp.className === 'string' && grp.className) {
    return grp.className;
  }
  const fromService = clsOf(grp?.service ?? '');
  if (fromService && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(fromService)) {
    return fromService;
  }
  // ASCII 가 아니면 slug/packageSegment 기반 fallback
  if (grp?.slug) return pascal(String(grp.slug));
  if (grp?.packageSegment) return cap(String(grp.packageSegment));
  return 'Resource';
};

// "User Service" → "User"
export const clsOf = (svc) => pascal(svc.replace(/\s*service$/i, '').replace(/\s+/g, '-'));

// "User" → "userService"
export const svcVar = (cls) => cls[0].toLowerCase() + cls.slice(1) + 'Service';

// ── body/response 파서 ──────────────────────────────────

/**
 * body string → { kind: 'none'|'json'|'multipart'|'query'|'generic', fields: string[] }
 * 예: "{ email, password }" → { kind:'json', fields:['email','password'] }
 */
export function parseBody(bodyStr) {
  if (!bodyStr || bodyStr === '—') return { kind: 'none', fields: [] };
  if (bodyStr === 'multipart/form-data') return { kind: 'multipart', fields: ['file'] };
  if (bodyStr.startsWith('?')) return { kind: 'query', fields: [] };

  const m = bodyStr.match(/\{([^}]+)\}/);
  if (!m) return { kind: 'generic', fields: [] };

  const fields = m[1]
    .split(',')
    .map((f) => f.trim().replace(/\?$/, '').replace(/^\.+/, '').trim())
    .filter((f) => f && f !== 'fields' && !/^\./.test(f));

  return fields.length ? { kind: 'json', fields } : { kind: 'generic', fields: [] };
}

/**
 * response string → { status, kind, fields }
 * 예: "200 { accessToken }" → { status:'200', kind:'json', fields:['accessToken'] }
 */
export function parseResp(respStr) {
  const sm = respStr.match(/^(\d+)/);
  const status = sm ? sm[1] : '200';

  if (status === '204' || respStr.includes('No Content'))
    return { status: '204', kind: 'none', fields: [] };

  const bm = respStr.match(/\{([^}]+)\}/);
  if (bm) {
    const fields = bm[1]
      .split(',')
      .map((f) => f.trim().replace(/\[\]$/, '').replace(/\?$/, ''))
      .filter(Boolean);
    return { status, kind: 'json', fields };
  }

  return { status, kind: 'text', fields: [] };
}

// ── path + method → Java 식별자 ─────────────────────────

export function pathSegs(path) {
  return path
    .replace('/api/v1/', '')
    .split('/')
    .filter((s) => s && s !== '{id}');
}

/**
 * 인증/액션 엔드포인트는 첫 segment 가 resource 가 아닐 수 있으므로
 * 그 자체로 의미 있는 이름이라 resource prefix 를 안 붙인다.
 *   /auth/login, /auth/signup, /oauth/callback, /webhook/payment …
 */
function isStandaloneActionRoot(seg) {
  return /^(auth|oauth|sso|webhook|webhooks|callback)$/i.test(seg);
}
const STANDALONE_ACTION_PATTERN = isStandaloneActionRoot;

/**
 * POST /api/v1/auth/login                    → login
 * GET  /api/v1/products                      → listProducts
 * GET  /api/v1/products/1                    → getProduct
 * POST /api/v1/products                      → createProduct
 * POST /api/v1/payments/{id}/confirm         → confirmPayment   ← v0.5: resource prefix 추가
 * POST /api/v1/refunds/{id}/confirm          → confirmRefund    ← 같은 도메인 내 충돌 방지
 *
 * 같은 group 안에서 다른 resource(payments/refunds) 가 같은 action(confirm)을 가질 때
 * resource prefix 가 없으면 method 이름이 중복돼 컴파일 실패.
 */
export function methodName(method, path) {
  const segs = pathSegs(path);
  const hasId = path.includes('{id}');
  const resource = pascal(segs[0] || 'resource').replace(/s$/, '');
  const last = camel(segs[segs.length - 1] || segs[0] || 'resource');
  const isAction = segs.length >= 2;

  if (isAction) {
    // /auth/login 같은 표준 그룹은 prefix 없이 — 의도한 동사가 그 자체로 충분
    if (STANDALONE_ACTION_PATTERN(segs[0])) return last;
    // 그 외 action: confirm + Payment = confirmPayment
    return `${last}${resource}`;
  }
  switch (method.toUpperCase()) {
    case 'GET':
      return hasId ? `get${resource}` : `list${resource}s`;
    case 'POST':
      return `create${resource}`;
    case 'PUT':
      return `update${resource}`;
    case 'PATCH':
      return `patch${resource}`;
    case 'DELETE':
      return `delete${resource}`;
    default:
      return last;
  }
}

export function reqDtoName(method, path) {
  const segs = pathSegs(path);
  const resource = pascal(segs[0] || 'resource').replace(/s$/, '');
  const last = pascal(segs[segs.length - 1] || segs[0] || 'resource');
  const isAction = segs.length >= 2;

  if (isAction) {
    if (STANDALONE_ACTION_PATTERN(segs[0])) return `${last}Request`;
    return `${last}${resource}Request`;
  }
  switch (method.toUpperCase()) {
    case 'POST':
      return `Create${resource}Request`;
    case 'PUT':
      return `Update${resource}Request`;
    case 'PATCH':
      return `Patch${resource}Request`;
    default:
      return `${resource}Request`;
  }
}

export function respDtoName(method, path) {
  const segs = pathSegs(path);
  const hasId = path.includes('{id}');
  const resource = pascal(segs[0] || 'resource').replace(/s$/, '');
  const last = pascal(segs[segs.length - 1] || segs[0] || 'resource');
  const isAction = segs.length >= 2;

  if (isAction) {
    if (STANDALONE_ACTION_PATTERN(segs[0])) return `${last}Response`;
    return `${last}${resource}Response`;
  }
  switch (method.toUpperCase()) {
    case 'GET':
      return hasId ? `${resource}Response` : `${resource}ListResponse`;
    default:
      return `${resource}Response`;
  }
}

// ── 타입 추론 ──────────────────────────────────────────

export function javaType(field) {
  if (/[Ii]d$/.test(field)) return 'Long';
  if (/[Cc]ount|[Tt]otal|[Ss]core|[Pp]age|[Ss]ize/.test(field)) return 'int';
  if (/[Pp]rice|[Aa]mount/.test(field)) return 'BigDecimal';
  if (/[Aa]t$|[Dd]ate|[Tt]ime/.test(field)) return 'LocalDateTime';
  if (/^is[A-Z]|[Bb]oolean/.test(field)) return 'boolean';
  if (/items|[Ll]ist/.test(field)) return 'List<Object>';
  return 'String';
}

// ── CRUD/Entity 추론 ───────────────────────────────────

export function isCrudEndpoint(ep) {
  return pathSegs(ep.path).length < 2;
}

/**
 * 그룹의 엔드포인트에서 엔티티 필드를 추론:
 *   1) GET /{id} 응답 필드가 가장 완전함
 *   2) 없으면 POST 요청 필드로 폴백
 *   3) 둘 다 없으면 ['name']
 */
export function inferEntityFields(grp) {
  const getById = grp.endpoints.find(
    (ep) => ep.method === 'GET' && ep.path.includes('{id}'),
  );
  if (getById) {
    const r = parseResp(getById.response);
    if (r.kind === 'json' && r.fields.length) return r.fields;
  }
  const post = grp.endpoints.find((ep) => ep.method === 'POST' && isCrudEndpoint(ep));
  if (post) {
    const b = parseBody(post.body);
    if (b.kind === 'json' && b.fields.length) return b.fields;
  }
  return ['name'];
}
