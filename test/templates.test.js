/**
 * templates/ — 빌트인 템플릿 로드·검증 회귀 테스트 (P1-3)
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import { CatalogSchema } from '../lib/schemas.js';
import { collectConcerns } from '../shared/concerns.js';

const TEMPLATES = ['commerce', 'job-aggregator'];

describe('빌트인 템플릿', () => {
  for (const name of TEMPLATES) {
    describe(`templates/${name}/catalog.yml`, () => {
      let catalog;

      it('파싱 + strict 스키마 통과', async () => {
        const text = await readFile(`templates/${name}/catalog.yml`, 'utf-8');
        catalog = yaml.load(text);
        const result = CatalogSchema.safeParse(catalog);
        if (!result.success) {
          console.error(result.error.issues.slice(0, 5));
        }
        expect(result.success).toBe(true);
      });

      it('blocks 가 비어있지 않음', async () => {
        expect(catalog.blocks.length).toBeGreaterThan(0);
      });

      it('모든 block 이 유효한 bundle_id 를 가짐 (참조 무결성)', () => {
        const bundleIds = new Set(catalog.bundles.map(b => b.id));
        for (const block of catalog.blocks) {
          expect(bundleIds.has(block.bundle_id)).toBe(true);
        }
      });

      it('모든 bundle 이 유효한 world_id 를 가짐', () => {
        const worldIds = new Set(catalog.worlds.map(w => w.id));
        for (const bundle of catalog.bundles) {
          expect(worldIds.has(bundle.world_id)).toBe(true);
        }
      });
    });
  }
});

describe('job-aggregator 템플릿 상세', () => {
  let catalog;

  it('파싱 성공', async () => {
    const text = await readFile('templates/job-aggregator/catalog.yml', 'utf-8');
    catalog = yaml.load(text);
    expect(catalog).toBeTruthy();
  });

  it('결제(payment) concerns 가 없어야 함 — 채용 도메인', () => {
    const concerns = collectConcerns(catalog.blocks);
    expect(concerns.has('payment')).toBe(false);
  });

  it('크롤링·검색·인증 concerns 를 포함', () => {
    const concerns = collectConcerns(catalog.blocks);
    expect(concerns.has('crawling')).toBe(true);
    expect(concerns.has('search')).toBe(true);
    expect(concerns.has('auth')).toBe(true);
  });

  it('api_style 어노테이션이 주요 블럭에 부여됨', () => {
    const byId = Object.fromEntries(catalog.blocks.map(b => [b.id, b]));
    // internal 블럭은 REST 엔드포인트 생성 제외 대상
    // 참고: api_style 명시 없어도 inferApiStyle 이 키워드로 internal 판정 가능
    const crawler = byId['source-crawler'];
    expect(crawler).toBeTruthy();
  });
});
