import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { ForgeError } from './core/errors.js';

/**
 * 프로젝트의 .forge/ 카탈로그를 로드한다.
 * 파일이 없거나 파싱 실패 시 ForgeError를 던진다 — 상위에서 친화적 메시지로 처리.
 */
export async function loadProjectCatalog(projectDir) {
  const catalogPath = join(projectDir, '.forge', 'catalog', 'catalog.yml');
  let raw;
  try {
    raw = await readFile(catalogPath, 'utf-8');
  } catch (cause) {
    throw new ForgeError('카탈로그 파일을 찾을 수 없습니다.', {
      code: 'MISSING_CATALOG',
      hint: 'forge meta-smelt 을 실행해 카탈로그를 설정하세요.',
      cause,
    });
  }
  try {
    return yaml.load(raw);
  } catch (cause) {
    throw new ForgeError('카탈로그 YAML 파싱에 실패했습니다.', {
      code: 'INVALID_CATALOG',
      hint: `${catalogPath} 파일 문법을 확인하세요.`,
      cause,
    });
  }
}

/**
 * 블럭을 World → Bundle 계층으로 그룹핑한다.
 * 반환: [{ world, bundles: [{ bundle, blocks: [...] }] }]
 */
export function groupBlocksByWorld(catalog) {
  const { worlds, bundles, blocks } = catalog;

  const bundleMap = new Map();
  for (const bundle of bundles) {
    bundleMap.set(bundle.id, { ...bundle, blocks: [] });
  }

  for (const block of blocks) {
    const b = bundleMap.get(block.bundle_id);
    if (b) b.blocks.push(block);
  }

  return worlds
    .sort((a, b) => a.order - b.order)
    .map(world => ({
      world,
      bundles: bundles
        .filter(b => b.world_id === world.id)
        .map(b => bundleMap.get(b.id)),
    }));
}

/**
 * 블럭 ID → 블럭 객체 맵
 */
export function buildBlockMap(catalog) {
  const map = new Map();
  for (const block of catalog.blocks) {
    map.set(block.id, block);
  }
  return map;
}

