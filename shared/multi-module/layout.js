/**
 * shared/multi-module/layout.js — v0.5.0 멀티모듈 토폴로지 결정기
 *
 * 입력 (groups + archStyle + layoutOption) 으로부터 emit 트리의 형태를 결정한다.
 * 순수 함수: 파일 시스템에 손대지 않으며, lib/emit/multi-emit.js 가 결과를 소비한다.
 *
 * 분기 우선순위:
 *   1) layoutOption 명시 → 그대로 따름 ('single' | 'multi-module')
 *   2) groups.length < 2 → 단일 모듈 (강제 분리 의미 없음)
 *   3) archStyle ∈ {modular-monolith, msa} → 멀티모듈
 *   4) 그 외 → 단일 모듈
 *
 * 멀티모듈 출력은 항상 [core, domain-*, app] 형태로 구성된다.
 * core/app 은 고정, domain-* 는 group 별 1개씩.
 */

import { pkgOf } from '../names.js';

/**
 * 도메인 이름을 모듈 슬러그로 정규화한다.
 *
 *   "Seller World"   → "seller"   (꼬리 World/Service/Module/System 제거)
 *   "Order Service"  → "order"
 *   "Payment"        → "payment"
 *   "Data Pipeline"  → "data-pipeline"
 *   "데이터 수집"      → ""         (호출자가 fallback 처리)
 *
 * @param {string} service
 * @returns {string} 비어있을 수 있음 — 호출자가 fallback 처리해야 함
 */
export function slugifyDomain(service) {
  if (!service || typeof service !== 'string') return '';
  return service
    .replace(/\s*(world|service|module|system)\s*$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @typedef {Object} ModuleEntry
 * @property {string} name              모듈 이름 (디렉토리/Gradle 식별자)
 * @property {'shared'|'domain'|'app'} kind
 * @property {string} gradlePath        ":core", ":domain-seller", ":app"
 * @property {string} sourceRoot        emit 시 backend/ 기준 상대 경로
 * @property {string=} slug             domain 모듈만 (모듈 디렉토리/이름 어미)
 * @property {string=} packageSegment   domain 모듈만 (com.forge.app.{packageSegment})
 * @property {string=} service          domain 모듈만 (group.service 원문)
 * @property {object=} group            domain 모듈만 (원본 group 참조)
 */

/**
 * @typedef {Object} LayoutResult
 * @property {'single'|'multi-module'} kind
 * @property {ModuleEntry[]} modules    kind === 'single' 이면 빈 배열
 */

/**
 * @param {object} ctx
 * @param {Array<object>} [ctx.groups]      smelt 결과의 World/Group 배열 (각 항목에 service, slug?, ... 포함)
 * @param {string} [ctx.archStyle]          pickArchitectureStyle().style
 * @param {'single'|'multi-module'} [ctx.layoutOption]  CLI --layout 명시값
 * @returns {LayoutResult}
 */
export function decideLayout({ groups, archStyle, layoutOption } = {}) {
  const safeGroups = Array.isArray(groups) ? groups : [];

  if (layoutOption === 'single') {
    return { kind: 'single', modules: [] };
  }
  if (layoutOption === 'multi-module') {
    return buildMultiLayout(safeGroups);
  }

  // 자동 판단
  if (safeGroups.length < 2) {
    return { kind: 'single', modules: [] };
  }
  if (archStyle === 'modular-monolith' || archStyle === 'msa') {
    return buildMultiLayout(safeGroups);
  }
  return { kind: 'single', modules: [] };
}

function buildMultiLayout(groups) {
  if (groups.length === 0) {
    throw new Error(
      'multi-module 레이아웃을 만들려면 최소 1개 이상의 group 이 필요합니다.',
    );
  }

  const modules = [
    { name: 'core', kind: 'shared', gradlePath: ':core', sourceRoot: 'core' },
  ];

  const seenSlugs = new Map(); // slug → group.service (충돌 메시지용)

  groups.forEach((group, index) => {
    const slug = deriveSlug(group, index);

    if (slug === 'core' || slug === 'app') {
      throw new Error(
        `World 모듈 슬러그 "${slug}" 는 예약어입니다 (core/app 와 충돌). group: ${describeGroup(group)}`,
      );
    }
    if (seenSlugs.has(slug)) {
      const previous = seenSlugs.get(slug);
      throw new Error(
        `World 모듈 슬러그 충돌: "${slug}" — ${previous} 와 ${describeGroup(group)} 가 같은 슬러그로 매핑됩니다.`,
      );
    }
    seenSlugs.set(slug, describeGroup(group));

    const packageSegment = derivePackageSegment(group, slug);
    const name = `domain-${slug}`;
    modules.push({
      name,
      kind: 'domain',
      gradlePath: `:${name}`,
      sourceRoot: name,
      slug,
      packageSegment,
      service: group?.service ?? null,
      group,
    });
  });

  modules.push({ name: 'app', kind: 'app', gradlePath: ':app', sourceRoot: 'app' });

  return { kind: 'multi-module', modules };
}

/**
 * 외부에서 들어온 slug 를 Gradle/Java 친화 형태로 정규화한다.
 *
 *   "Dental_Hospital" → "dental-hospital"  (snake/대문자 → kebab/소문자)
 *   "  marketplace "  → "marketplace"       (공백 trim)
 *   "domain--core"    → "domain-core"       (연속 dash 압축)
 *   "_-_"             → ""                  (의미 있는 글자 0개)
 */
export function normalizeSlug(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveSlug(group, index) {
  // 우선순위: AI/사용자 명시 slug > service 자동 slugify > module-N fallback
  const explicit = normalizeSlug(group?.slug);
  if (explicit) return explicit;
  const fromService = slugifyDomain(group?.service);
  if (fromService) return fromService;
  return `module-${index + 1}`;
}

/**
 * Java 패키지 세그먼트는 [a-z0-9] 만 허용.
 *
 *   1) group.slug 명시값이 있으면 그것의 dash 제거판 (AI 의도 반영)
 *   2) 그 외 pkgOf(service) 가 ASCII 면 채택 (기존 v0.4 호환)
 *   3) 마지막 fallback: slug 의 dash 제거판
 */
function derivePackageSegment(group, slug) {
  const explicit = normalizeSlug(group?.slug);
  if (explicit) return explicit.replace(/-/g, '');
  const seg = pkgOf(group?.service || '');
  if (seg && seg !== 'app' && /^[a-z0-9]+$/.test(seg)) {
    return seg;
  }
  return slug.replace(/-/g, '');
}

function describeGroup(group) {
  if (!group) return '(unknown)';
  return group.service || group.slug || '(unnamed)';
}
