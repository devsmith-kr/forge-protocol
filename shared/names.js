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
 * POST /api/v1/auth/login  → login
 * GET  /api/v1/products    → listProducts
 * GET  /api/v1/products/1  → getProduct
 * POST /api/v1/products    → createProduct
 */
export function methodName(method, path) {
  const segs = pathSegs(path);
  const hasId = path.includes('{id}');
  const resource = pascal(segs[0] || 'resource').replace(/s$/, '');
  const last = camel(segs[segs.length - 1] || segs[0] || 'resource');
  const isAction = segs.length >= 2;

  if (isAction) return last;
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

  if (isAction) return `${last}Request`;
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

  if (isAction) return `${last}Response`;
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
