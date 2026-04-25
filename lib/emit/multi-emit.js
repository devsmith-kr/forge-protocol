/**
 * lib/emit/multi-emit.js — v0.5.0 멀티모듈 emit 의 fs 래퍼.
 *
 * 핵심 로직(파일 트리 생성)은 `shared/multi-module/emit-files.js` 의
 * 순수 함수 `buildMultiModuleFiles` 가 담당한다 — 같은 함수를 Web UI 에서도
 * JSZip 에 넣어 ZIP 다운로드한다.
 *
 * 이 모듈은 결과 array 를 받아 mkdir/writeFile 만 수행하는 얇은 래퍼다.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildMultiModuleFiles } from '../../shared/multi-module/emit-files.js';

/**
 * @param {object} args
 * @param {string} args.outDir          최종 백엔드 트리 루트 (예: .forge/generated/backend)
 * @param {object} args.layout          decideLayout({...}) 결과 — kind === 'multi-module'
 * @param {Array}  args.groups          buildGroupsFromContracts 결과
 * @param {object} [args.catalog]       catalog.yml
 * @param {object} [args.contracts]     contracts.yml
 * @param {object} [args.scenarios]     test-scenarios.yml
 * @param {Map}    [args.blockMap]      block_id → block
 * @param {string} [args.basePackage='com.forge.app']
 * @param {string} [args.artifactId='forge-app']
 * @param {'backend'|'tests'|'all'} [args.target='all']
 * @returns {Promise<string[]>}         emit 한 파일들의 outDir 기준 상대 경로
 */
export async function emitMultiModule(args) {
  const { outDir, ...rest } = args;
  const files = buildMultiModuleFiles(rest);

  await mkdir(outDir, { recursive: true });
  for (const { path, content } of files) {
    const abs = join(outDir, path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf-8');
  }
  return files.map((f) => f.path);
}
