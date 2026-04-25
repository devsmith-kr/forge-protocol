#!/usr/bin/env node
/**
 * P0 개선 사항 smoke test — 채용 도메인(결제 없음) 기준 회귀 검증
 * 사용: node scripts/verify-p0.mjs
 */

import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { collectConcerns, buildConcernFragments } from '../shared/concerns.js';
import { pickArchitectureStyle } from '../shared/architecture-style.js';
import { inferEndpoints } from '../shared/api-inference.js';
import { decideLayout } from '../shared/multi-module/layout.js';
import { generateDomainBuildGradle } from '../shared/multi-module/gradle.js';
import { CatalogSchema } from '../lib/schemas.js';

const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RESET = '\x1b[0m';
const ok   = (msg) => console.log(`  ${GREEN}✓${RESET} ${msg}`);
const fail = (msg) => console.log(`  ${RED}✗${RESET} ${msg}`);
const head = (msg) => console.log(`\n${DIM}=== ${msg} ===${RESET}`);

let passed = 0, failed = 0;
const check = (cond, okMsg, failMsg) => {
  if (cond) { ok(okMsg); passed++; }
  else      { fail(failMsg); failed++; }
};

// 공식 빌트인 템플릿으로 검증 (CI 에서도 동작 — .forge/ 는 gitignore)
const text = await readFile('./templates/job-aggregator/catalog.yml', 'utf-8');
const catalog = yaml.load(text);
const blocks = catalog.blocks;

// ── P0-1: API 계약 생성기 ───────────────────────────────
head('P0-1: API 계약 경로 (pluralize + api_style)');
const tests = [
  { id: 'saved-jobs',          expectPath: '/saved-jobs',       reject: /saved-jobss/ },
  { id: 'search-history',      expectPath: '/search-histories', reject: /historys/ },
  { id: 'job-detail',          expectPath: '/job-details/{id}', reject: /jobs\/\{id\}/ },
];
for (const t of tests) {
  const eps = inferEndpoints({ id: t.id, name: t.id });
  const paths = eps.map(e => e.path).join(' ');
  check(
    paths.includes(t.expectPath) && !t.reject.test(paths),
    `${t.id.padEnd(22)} → ${t.expectPath}`,
    `${t.id} 경로 문제: ${paths}`
  );
}

// internal 블럭은 엔드포인트 0
for (const id of ['duplicate-detector', 'job-normalizer', 'job-indexer', 'source-crawler']) {
  const eps = inferEndpoints({ id, name: id });
  check(eps.length === 0, `${id.padEnd(22)} → internal (엔드포인트 0개)`, `${id} 가 CRUD 생성됨`);
}

// ── P0-2: 도메인 고착 제거 ──────────────────────────────
head('P0-2: 채용 도메인에 결제 섹션 등장 여부');
const concerns = collectConcerns(blocks);
console.log(`  ${DIM}감지된 concerns: ${[...concerns].join(', ')}${RESET}`);
for (const phase of ['shape', 'temper', 'inspect']) {
  const text = buildConcernFragments(concerns, phase).join(' ');
  const hasPayment = /결제|PG\s|금액|WireMock/.test(text);
  check(!hasPayment, `${phase.padEnd(8)} 프롬프트에 결제/PG 단어 없음`, `${phase} 프롬프트에 결제 잔존: ${text.slice(0,120)}`);
}
// 반대로 크롤링·검색 관련은 들어있어야 함
const shape = buildConcernFragments(concerns, 'shape').join(' ');
check(/robots|저작권|크롤링/.test(shape), '크롤링 관련 섹션 포함', '크롤링 섹션 누락');
check(/nori|인덱스|검색/.test(shape),    '검색 관련 섹션 포함',    '검색 섹션 누락');

// ── P0-3: 아키텍처 스타일 가드레일 ───────────────────────
head('P0-3: 58일/1인 프로젝트 → modular-monolith');
const style = pickArchitectureStyle({ blockCount: blocks.length, totalEffortDays: 58, teamSize: 1, serviceCount: 4 });
check(style.style === 'modular-monolith', `${blocks.length}블럭/58일/1인 → ${style.choice}`, `잘못된 추천: ${style.choice}`);
check(Boolean(style.transition), '전환 트리거 자동 기록됨', '전환 트리거 누락');
console.log(`  ${DIM}trigger: ${style.transition}${RESET}`);

// 반대 케이스: 대형 팀은 MSA
const big = pickArchitectureStyle({ blockCount: 50, totalEffortDays: 600, teamSize: 8, serviceCount: 10 });
check(big.style === 'msa', `대형(8인/50블럭) → ${big.choice}`, `대형에도 모놀리스 추천됨`);

// ── P0-4: strict 스키마 ──────────────────────────────────
head('P0-4: 카탈로그 strict 검증');
check(CatalogSchema.safeParse(catalog).success, '채용 카탈로그 strict 통과', '채용 카탈로그 실패');

const cases = [
  { name: '오탈자 blcok: 거부',        data: { ...catalog, blcok: [] },       shouldFail: true },
  { name: 'priority "mandatory" 거부', data: { ...catalog, blocks: [{ ...blocks[0], priority: 'mandatory' }] }, shouldFail: true },
  { name: 'ghost dependency 거부',     data: { ...catalog, dependencies: [{ source: 'ghost', target: 'ghost2', type: 'requires' }] }, shouldFail: true },
];
for (const c of cases) {
  const r = CatalogSchema.safeParse(c.data);
  check(r.success === !c.shouldFail, c.name, `${c.name} 실패 (success=${r.success})`);
}

// ── P0-5: 멀티모듈 emit 의존성 그래프 (v0.5.0) ──────────
head('P0-5: 멀티모듈 layout + 도메인 경계');

// commerce 카탈로그를 World→group 으로 변환 (catalog 의 slug 가 살아있는지 함께 검증)
const commerceText = await readFile('./templates/commerce/catalog.yml', 'utf-8');
const commerce = yaml.load(commerceText);
const groupsCommerce = commerce.worlds.map((w) => ({ service: w.title, slug: w.slug }));

const layoutCommerce = decideLayout({
  groups: groupsCommerce,
  archStyle: 'modular-monolith',
  layoutOption: 'multi-module',
});

check(
  layoutCommerce.kind === 'multi-module',
  'commerce + modular-monolith → multi-module 레이아웃',
  `multi-module 결정 실패 (kind=${layoutCommerce.kind})`,
);

const moduleNames = layoutCommerce.modules.map((m) => m.name);
check(moduleNames.includes('core'), ':core 모듈 존재', ':core 누락');
check(moduleNames.includes('app'), ':app 모듈 존재', ':app 누락');

const domainModules = layoutCommerce.modules.filter((m) => m.kind === 'domain');
check(
  domainModules.length === commerce.worlds.length,
  `domain 모듈 갯수 = catalog World 갯수 (${commerce.worlds.length}개)`,
  `갯수 불일치: domains=${domainModules.length}, worlds=${commerce.worlds.length}`,
);

// AI 슬러그(catalog 의 marketplace/storefront/...) 가 자동 slugify 보다 우선했는지
check(
  domainModules.some((m) => m.slug === 'marketplace'),
  'AI 슬러그 우선 (W-seller → marketplace, slugifyDomain fallback 미발생)',
  'AI 슬러그 적용 실패 — catalog World.slug 무시됨',
);

// 각 domain build.gradle 이 다른 domain 모듈 ID 를 0건 참조 (3중 방어선의 1번)
let crossDomainViolations = 0;
for (const dm of domainModules) {
  const buildGradle = generateDomainBuildGradle(dm);
  for (const other of domainModules) {
    if (other.name === dm.name) continue;
    if (buildGradle.includes(other.name)) {
      crossDomainViolations++;
      console.log(`  ${RED}!${RESET} ${dm.name}/build.gradle 가 ${other.name} 참조`);
    }
  }
}
const crossChecks = domainModules.length * Math.max(domainModules.length - 1, 0);
check(
  crossDomainViolations === 0,
  `domain build.gradle 의 cross-domain 참조 0건 (${domainModules.length}개 × ${domainModules.length - 1}개 검사)`,
  `cross-domain 의존성 ${crossDomainViolations}건 발견 — 경계 위반`,
);

// :core 만 implementation 단정 (스팟 체크)
const sampleDomain = domainModules[0];
const sampleBuildGradle = generateDomainBuildGradle(sampleDomain);
check(
  sampleBuildGradle.includes("implementation project(':core')"),
  `${sampleDomain.name} 가 :core 의존성 보유`,
  `${sampleDomain.name} build.gradle 에 :core 누락`,
);

// ── 요약 ──
console.log();
const total = passed + failed;
if (failed === 0) {
  console.log(`${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${GREEN}✓ ${passed}/${total} 전부 통과${RESET}`);
  process.exit(0);
} else {
  console.log(`${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${RED}✗ ${failed}/${total} 실패${RESET}`);
  process.exit(1);
}
