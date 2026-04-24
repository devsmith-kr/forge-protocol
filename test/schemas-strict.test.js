/**
 * schemas.js — P0-4 strict 검증 회귀 테스트
 *
 * 카탈로그 스키마 강화 작업:
 * - 최상위 오탈자 거부 (.strict())
 * - 참조 무결성 (superRefine)
 * - priority enum 제한
 * - 한국어 에러 메시지 + strict 모드 throw
 */

import { describe, it, expect, vi } from 'vitest';
import { CatalogSchema, validateYaml } from '../lib/schemas.js';

const validCatalog = {
  worlds: [{ id: 'w1', title: 'World 1' }],
  bundles: [{ id: 'b1', world_id: 'w1' }],
  blocks: [{
    id: 'block-1',
    bundle_id: 'b1',
    name: '블럭 1',
    priority: 'required',
    effort_days: 3,
  }],
  dependencies: [],
};

describe('CatalogSchema strict — 오탈자·알 수 없는 필드 거부', () => {
  it('유효한 카탈로그 통과', () => {
    expect(CatalogSchema.safeParse(validCatalog).success).toBe(true);
  });

  it('최상위 오탈자 "blcok" 거부', () => {
    const bad = { ...validCatalog, blcok: [] };   // typo
    const r = CatalogSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });

  it('priority "mandatory" 거부 (required|optional 만 허용)', () => {
    const bad = {
      ...validCatalog,
      blocks: [{ ...validCatalog.blocks[0], priority: 'mandatory' }],
    };
    const r = CatalogSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });
});

describe('CatalogSchema 참조 무결성', () => {
  it('bundles.world_id 가 worlds 에 없으면 거부 + 위치 표시', () => {
    const bad = {
      ...validCatalog,
      bundles: [{ id: 'b1', world_id: 'w-nonexistent' }],
    };
    const r = CatalogSchema.safeParse(bad);
    expect(r.success).toBe(false);
    const msg = r.error.issues.map(i => i.message).join('\n');
    expect(msg).toMatch(/w-nonexistent/);
  });

  it('blocks.bundle_id 가 bundles 에 없으면 거부', () => {
    const bad = {
      ...validCatalog,
      blocks: [{ ...validCatalog.blocks[0], bundle_id: 'b-missing' }],
    };
    const r = CatalogSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(r.error.issues.some(i => i.message.includes('b-missing'))).toBe(true);
  });

  it('dependencies.source 가 blocks 에 없으면 거부', () => {
    const bad = {
      ...validCatalog,
      dependencies: [{ source: 'ghost-block', target: 'block-1', type: 'requires' }],
    };
    const r = CatalogSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(r.error.issues.some(i => i.message.includes('ghost-block'))).toBe(true);
  });

  it('dependencies.target 가 blocks 에 없으면 거부', () => {
    const bad = {
      ...validCatalog,
      dependencies: [{ source: 'block-1', target: 'ghost-block', type: 'requires' }],
    };
    const r = CatalogSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });
});

describe('validateYaml — 한국어 에러 포맷 + strict 모드', () => {
  it('strict=false 기본: 경고 후 데이터 반환 (하위 호환)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = { ...validCatalog, unknown_field: 'x' };
    const result = validateYaml(CatalogSchema, bad, 'catalog.yml');
    expect(result).toBe(bad);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('strict=true: 예외 throw + 한국어 메시지 포함', () => {
    const bad = {
      ...validCatalog,
      blocks: [{ ...validCatalog.blocks[0], priority: 'mandatory' }],
    };
    expect(() => validateYaml(CatalogSchema, bad, 'catalog.yml', { strict: true }))
      .toThrow(/검증 실패/);
  });

  it('에러 메시지에 필드 경로가 포함된다', () => {
    const bad = {
      ...validCatalog,
      dependencies: [{ source: 'ghost', target: 'block-1', type: 'requires' }],
    };
    try {
      validateYaml(CatalogSchema, bad, 'catalog.yml', { strict: true });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.message).toMatch(/dependencies\[0\]\.source/);
      expect(e.message).toMatch(/ghost/);
    }
  });
});
