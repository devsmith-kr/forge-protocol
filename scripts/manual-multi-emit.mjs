#!/usr/bin/env node
/**
 * 수동 검증 스크립트 — commerce 카탈로그로 멀티모듈 emit 후 트리 출력.
 *
 * 사용: node scripts/manual-multi-emit.mjs
 *
 * 인터랙티브 forge smelt/shape/forge 단계를 우회하고,
 * 빌트인 commerce 의 6개 World 에 mock CRUD endpoint 를 부여해
 * emitMultiModule 결과물을 임시 디렉토리에 만든다.
 */

import { readFile } from 'node:fs/promises';
import { mkdtemp, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import { decideLayout } from '../shared/multi-module/layout.js';
import { emitMultiModule } from '../lib/emit/multi-emit.js';

const DIM = '\x1b[2m', GREEN = '\x1b[32m', CYAN = '\x1b[36m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const text = await readFile('./templates/commerce/catalog.yml', 'utf-8');
const catalog = yaml.load(text);

console.log(`${BOLD}Commerce 카탈로그 로드:${RESET} ${catalog.worlds.length} worlds, ${catalog.bundles.length} bundles, ${catalog.blocks.length} blocks`);
console.log(`${DIM}World slugs:${RESET} ${catalog.worlds.map(w => `${w.id} → ${w.slug}`).join(', ')}\n`);

// 각 World 를 mock CRUD endpoint 3개를 가진 group 으로 변환.
// path 는 World slug 를 prefix 로 두어 도메인 간 매핑 충돌 방지 (실사용에선 자연히 분리됨).
const groups = catalog.worlds.map((w) => {
  const resource = `${w.slug}-items`;
  return {
    service: w.title,
    slug: w.slug,
    endpoints: [
      { method: 'GET',  path: `/api/v1/${resource}`,      body: '—',                response: '200 { items, total, page }' },
      { method: 'POST', path: `/api/v1/${resource}`,      body: '{ name, price }',  response: '201 { id, name }' },
      { method: 'GET',  path: `/api/v1/${resource}/{id}`, body: '—',                response: '200 { id, name, price, createdAt }' },
    ],
  };
});

const layout = decideLayout({
  groups,
  archStyle: 'modular-monolith',
  layoutOption: 'multi-module',
});

console.log(`${BOLD}Layout 결정:${RESET} kind=${GREEN}${layout.kind}${RESET}`);
console.log(`${DIM}modules:${RESET}`);
for (const m of layout.modules) {
  const detail = m.kind === 'domain' ? `slug=${m.slug}, pkg=${m.packageSegment}` : m.kind;
  console.log(`  ${CYAN}${m.name.padEnd(22)}${RESET} ${DIM}${detail}${RESET}`);
}
console.log();

// 임시 디렉토리에 emit
const outDir = await mkdtemp(join(tmpdir(), 'forge-manual-'));
const emitted = await emitMultiModule({
  outDir,
  layout,
  groups,
  catalog,
  basePackage: 'com.forge.app',
  artifactId: 'forge-app',
  target: 'all',
});

console.log(`${BOLD}Emit 완료:${RESET} ${emitted.length}개 파일`);
console.log(`${DIM}경로:${RESET} ${CYAN}${outDir}${RESET}\n`);

// 트리 구조 (depth 2 까지)
console.log(`${BOLD}디렉토리 구조 (depth 2):${RESET}`);
const tree = await readdir(outDir, { withFileTypes: true });
for (const ent of tree.sort((a, b) => a.name.localeCompare(b.name))) {
  if (ent.isDirectory()) {
    console.log(`  ${CYAN}${ent.name}/${RESET}`);
    const sub = await readdir(join(outDir, ent.name), { withFileTypes: true });
    for (const se of sub.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`    ${se.isDirectory() ? CYAN + se.name + '/' + RESET : se.name}`);
    }
  } else {
    console.log(`  ${ent.name}`);
  }
}
console.log();

// 파일 카테고리별 카운트
const cats = {
  '루트 빌드/문서': emitted.filter(p => !p.includes('/')).length,
  ':core 클래스':    emitted.filter(p => p.startsWith('core/')).length,
  ':app 파일':       emitted.filter(p => p.startsWith('app/')).length,
  '도메인 모듈':      emitted.filter(p => p.startsWith('domain-')).length,
};
console.log(`${BOLD}파일 카테고리:${RESET}`);
for (const [k, v] of Object.entries(cats)) {
  console.log(`  ${k.padEnd(16)} ${GREEN}${v}${RESET}`);
}

// 핵심 파일 내용 spot-check 출력
const { readFile: rf } = await import('node:fs/promises');
console.log(`\n${BOLD}─── settings.gradle ───${RESET}`);
console.log(await rf(join(outDir, 'settings.gradle'), 'utf-8'));

console.log(`${BOLD}─── domain-marketplace/.../entity/Marketplace.java ───${RESET}`);
const entity = await rf(join(outDir, 'domain-marketplace/src/main/java/com/forge/app/marketplace/entity/Marketplace.java'), 'utf-8');
console.log(entity);

// ── 자동 Gradle 빌드 검증 ────────────────────────────────
const { spawn } = await import('node:child_process');

function runCmd(cmd, args, cwd, label) {
  return new Promise((resolve) => {
    console.log(`\n${BOLD}▶ ${label}${RESET} ${DIM}${cmd} ${args.join(' ')}${RESET}`);
    const child = spawn(cmd, args, { cwd, shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { const s = d.toString(); stdout += s; process.stdout.write(s); });
    child.stderr.on('data', (d) => { const s = d.toString(); stderr += s; process.stderr.write(s); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const gradleBat = `${process.env.USERPROFILE}\\.local\\gradle-8.7\\bin\\gradle.bat`;
console.log(`\n${BOLD}════════════════════════════════════════════${RESET}`);
console.log(`${BOLD}자동 빌드 검증 (gradle 8.7)${RESET}`);
console.log(`${BOLD}════════════════════════════════════════════${RESET}`);

// 1) gradle wrapper 생성
const wrap = await runCmd(gradleBat, ['wrapper', '--quiet'], outDir, 'gradle wrapper');
if (wrap.code !== 0) {
  console.log(`\n${BOLD}\x1b[31m✗ gradle wrapper 실패 (exit ${wrap.code})${RESET}`);
  process.exit(1);
}

// 2) ./gradlew build (compile + test 통합)
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
const build = await runCmd(gradlew, ['build', '--console=plain'], outDir, './gradlew build');

console.log(`\n${BOLD}════════════════════════════════════════════${RESET}`);
if (build.code === 0) {
  console.log(`${BOLD}${GREEN}✅ 빌드 + 테스트 + ArchUnit 전부 통과${RESET}`);
  console.log(`${DIM}  - core / 6 domain modules / app 모두 컴파일 OK${RESET}`);
  console.log(`${DIM}  - ArchUnit *ArchitectureTest 도메인 경계 검증 통과${RESET}`);
  console.log(`${DIM}  - ApplicationContextTest Spring 컨텍스트 로드 OK${RESET}`);
} else {
  console.log(`${BOLD}\x1b[31m❌ 빌드 실패 (exit ${build.code})${RESET}`);
  // 컴파일 에러 추출
  const errLines = (build.stdout + build.stderr).split('\n').filter(l => /error:|FAILED|FAILURE:/i.test(l));
  console.log(`${BOLD}에러 라인 ${errLines.length}건:${RESET}`);
  errLines.slice(0, 20).forEach(l => console.log(`  ${l.trim()}`));
}
console.log(`\n${BOLD}출력 디렉토리:${RESET} ${CYAN}${outDir}${RESET}`);
