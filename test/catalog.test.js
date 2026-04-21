import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { groupBlocksByWorld, buildBlockMap, loadProjectCatalog } from '../lib/catalog.js';
import { ForgeError } from '../lib/core/errors.js';

// ── 테스트 데이터 ──────────────────────────────────────
const CATALOG = {
  worlds: [
    { id: 'seller', title: '판매자', order: 1 },
    { id: 'buyer', title: '구매자', order: 2 },
  ],
  bundles: [
    { id: 'product-mgmt', world_id: 'seller' },
    { id: 'buyer-auth', world_id: 'buyer' },
    { id: 'buyer-shopping', world_id: 'buyer' },
  ],
  blocks: [
    { id: 'product-register', bundle_id: 'product-mgmt', name: '상품 등록' },
    { id: 'inventory', bundle_id: 'product-mgmt', name: '재고 관리' },
    { id: 'buyer-signup', bundle_id: 'buyer-auth', name: '회원가입' },
    { id: 'cart', bundle_id: 'buyer-shopping', name: '장바구니' },
  ],
};

// ═════════════════════════════════════════════════════════
describe('groupBlocksByWorld', () => {
  it('World → Bundle → Block 계층으로 그룹핑', () => {
    const groups = groupBlocksByWorld(CATALOG);

    expect(groups).toHaveLength(2);
    // seller world
    expect(groups[0].world.id).toBe('seller');
    expect(groups[0].bundles).toHaveLength(1);
    expect(groups[0].bundles[0].blocks).toHaveLength(2);
    // buyer world
    expect(groups[1].world.id).toBe('buyer');
    expect(groups[1].bundles).toHaveLength(2);
  });

  it('World order 기준으로 정렬', () => {
    const reversed = {
      ...CATALOG,
      worlds: [
        { id: 'buyer', title: '구매자', order: 2 },
        { id: 'seller', title: '판매자', order: 1 },
      ],
    };

    const groups = groupBlocksByWorld(reversed);

    expect(groups[0].world.id).toBe('seller');
    expect(groups[1].world.id).toBe('buyer');
  });

  it('블럭이 없는 번들은 빈 blocks 배열', () => {
    const catalog = {
      worlds: [{ id: 'w1', title: 'W1', order: 1 }],
      bundles: [{ id: 'empty-bundle', world_id: 'w1' }],
      blocks: [],
    };

    const groups = groupBlocksByWorld(catalog);
    expect(groups[0].bundles[0].blocks).toEqual([]);
  });

  it('bundle_id가 존재하지 않는 블럭은 무시', () => {
    const catalog = {
      ...CATALOG,
      blocks: [
        ...CATALOG.blocks,
        { id: 'orphan', bundle_id: 'nonexistent', name: '고아 블럭' },
      ],
    };

    const groups = groupBlocksByWorld(catalog);
    const allBlocks = groups.flatMap(g => g.bundles.flatMap(b => b.blocks));
    expect(allBlocks.find(b => b.id === 'orphan')).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════
describe('buildBlockMap', () => {
  it('블럭 ID → 블럭 객체 맵 생성', () => {
    const map = buildBlockMap(CATALOG);

    expect(map.get('product-register')).toBeDefined();
    expect(map.get('product-register').name).toBe('상품 등록');
    expect(map.get('cart').name).toBe('장바구니');
  });

  it('존재하지 않는 ID는 undefined', () => {
    const map = buildBlockMap(CATALOG);
    expect(map.get('nonexistent')).toBeUndefined();
  });

  it('빈 blocks는 빈 맵', () => {
    const map = buildBlockMap({ blocks: [] });
    expect(map.size).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════
describe('loadProjectCatalog', () => {
  async function makeProject() {
    const dir = await mkdtemp(join(tmpdir(), 'forge-cat-'));
    await mkdir(join(dir, '.forge', 'catalog'), { recursive: true });
    return dir;
  }

  it('catalog.yml 부재 시 MISSING_CATALOG ForgeError를 던진다', async () => {
    const dir = await makeProject();
    try {
      await expect(loadProjectCatalog(dir)).rejects.toMatchObject({
        name: 'ForgeError',
        code: 'MISSING_CATALOG',
      });
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('잘못된 YAML에는 INVALID_CATALOG ForgeError를 던진다', async () => {
    const dir = await makeProject();
    await writeFile(join(dir, '.forge', 'catalog', 'catalog.yml'), 'broken: [\n  unclosed', 'utf-8');
    try {
      const err = await loadProjectCatalog(dir).catch(e => e);
      expect(err).toBeInstanceOf(ForgeError);
      expect(err.code).toBe('INVALID_CATALOG');
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('정상 catalog.yml은 파싱되어 반환된다', async () => {
    const dir = await makeProject();
    await writeFile(
      join(dir, '.forge', 'catalog', 'catalog.yml'),
      'worlds: []\nbundles: []\nblocks: []\n',
      'utf-8',
    );
    try {
      const cat = await loadProjectCatalog(dir);
      expect(cat).toEqual({ worlds: [], bundles: [], blocks: [] });
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
