/**
 * lib/emit.js — multi-module 라우팅 단위 테스트
 *
 * runEmit 전체는 inquirer/state/contracts 의존성 때문에 통합 테스트가 무겁다.
 * 여기서는 라우팅의 두 분리된 부분만 검증한다:
 *   1) decideLayout 결과 → multi/single 분기 (loosely coupled — decideLayout 자체는 별도 테스트됨)
 *   2) backupExistingBackend 의 부수효과 (rename 동작)
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupExistingBackend } from '../lib/emit.js';
import { decideLayout } from '../shared/multi-module/layout.js';

const fileExists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

describe('backupExistingBackend', () => {
  it('outDir 가 없으면 null 반환 (백업 불필요)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-bak-'));
    const result = await backupExistingBackend(join(tmp, 'nonexistent'));
    expect(result).toBeNull();
  });

  it('outDir 가 존재하면 timestamp 백업으로 rename, 원본 사라짐', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-bak-'));
    const target = join(tmp, 'backend');
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'sentinel.txt'), 'old-data', 'utf-8');

    const backedUp = await backupExistingBackend(target);

    expect(backedUp).toMatch(/backend\.bak-/);
    expect(await fileExists(target)).toBe(false);
    expect(await fileExists(backedUp)).toBe(true);
    expect(await readFile(join(backedUp, 'sentinel.txt'), 'utf-8')).toBe('old-data');
  });

  it('두 번 연속 호출 시 충돌 없이 다른 백업 경로 (timestamp 차이)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-bak-'));
    const target = join(tmp, 'backend');

    await mkdir(target, { recursive: true });
    const first = await backupExistingBackend(target);

    await mkdir(target, { recursive: true });
    // 동일 millisecond 라도 ISO timestamp 가 다르도록 약간 대기
    await new Promise((r) => setTimeout(r, 5));
    const second = await backupExistingBackend(target);

    expect(first).not.toEqual(second);
    expect(await fileExists(first)).toBe(true);
    expect(await fileExists(second)).toBe(true);
  });
});

describe('runEmit 라우팅 — decideLayout 결과', () => {
  // emit.js 의 multi/single 분기는 단순히 layout.kind 를 체크한다.
  // decideLayout 의 모든 분기 케이스는 multi-module-layout.test.js 에서 이미 검증됨.
  // 여기서는 emit 라우팅이 의존하는 핵심 입력 조합만 명시적으로 단정한다.

  it('layoutOption: "multi-module" + 3 groups → kind=multi-module', () => {
    const layout = decideLayout({
      groups: [
        { service: 'A', slug: 'a' },
        { service: 'B', slug: 'b' },
        { service: 'C', slug: 'c' },
      ],
      layoutOption: 'multi-module',
    });
    expect(layout.kind).toBe('multi-module');
  });

  it('layoutOption: "single" 이면 archStyle 무관 single', () => {
    const layout = decideLayout({
      groups: [{ service: 'A' }, { service: 'B' }, { service: 'C' }],
      archStyle: 'modular-monolith',
      layoutOption: 'single',
    });
    expect(layout.kind).toBe('single');
  });

  it('layoutOption: 미지정, archStyle: "modular-monolith", groups 3 → multi (auto)', () => {
    const layout = decideLayout({
      groups: [{ service: 'A' }, { service: 'B' }, { service: 'C' }],
      archStyle: 'modular-monolith',
    });
    expect(layout.kind).toBe('multi-module');
  });

  it('layoutOption: 미지정, archStyle 없음 → single (보수적 fallback)', () => {
    const layout = decideLayout({
      groups: [{ service: 'A' }, { service: 'B' }],
    });
    expect(layout.kind).toBe('single');
  });
});
