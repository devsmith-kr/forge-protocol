import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, readFile, mkdir, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { atomicWriteFile, loadYaml, saveYaml } from '../lib/core/project.js';

const TEST_DIR = join(tmpdir(), 'forge-test-' + Date.now());

// ── setup / teardown ─────────────────────────────────
async function ensureDir() {
  await mkdir(TEST_DIR, { recursive: true });
}

afterEach(async () => {
  try { await rm(TEST_DIR, { recursive: true }); } catch { /* cleanup ignore */ }
});

// ═════════════════════════════════════════════════════════
describe('atomicWriteFile', () => {
  it('파일을 정상적으로 작성', async () => {
    await ensureDir();
    const filePath = join(TEST_DIR, 'test.yml');
    await atomicWriteFile(filePath, 'phase: init\n');

    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('phase: init\n');
  });

  it('.tmp 파일이 남지 않음 (rename 완료)', async () => {
    await ensureDir();
    const filePath = join(TEST_DIR, 'state.yml');
    await atomicWriteFile(filePath, 'data: test\n');

    let tmpExists = true;
    try { await access(filePath + '.tmp'); } catch { tmpExists = false; }
    expect(tmpExists).toBe(false);
  });

  it('기존 파일을 안전하게 덮어쓰기', async () => {
    await ensureDir();
    const filePath = join(TEST_DIR, 'overwrite.yml');
    await writeFile(filePath, 'old content', 'utf-8');
    await atomicWriteFile(filePath, 'new content');

    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('new content');
  });

  it('한글 내용 정상 처리', async () => {
    await ensureDir();
    const filePath = join(TEST_DIR, 'korean.yml');
    await atomicWriteFile(filePath, 'phase: 제련\ntemplate: 커머스\n');

    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('제련');
    expect(content).toContain('커머스');
  });
});

// ═════════════════════════════════════════════════════════
describe('loadYaml / saveYaml (제네릭)', () => {
  async function ensureProjectDir() {
    await mkdir(join(TEST_DIR, 'project'), { recursive: true });
  }

  it('saveYaml → loadYaml 라운드트립', async () => {
    await ensureProjectDir();
    const payload = { phase: 'smelt', count: 3, tags: ['a', 'b'] };
    await saveYaml(TEST_DIR, 'sample.yml', payload);

    const loaded = await loadYaml(TEST_DIR, 'sample.yml');
    expect(loaded).toEqual(payload);
  });

  it('loadYaml — 파일 없으면 throw', async () => {
    await ensureProjectDir();
    await expect(loadYaml(TEST_DIR, 'missing.yml')).rejects.toThrow();
  });

  it('saveYaml — atomic: 중간 .tmp 잔재 없음', async () => {
    await ensureProjectDir();
    await saveYaml(TEST_DIR, 'atomic.yml', { ok: true });

    const tmpPath = join(TEST_DIR, 'project', 'atomic.yml.tmp');
    let tmpExists = true;
    try { await access(tmpPath); } catch { tmpExists = false; }
    expect(tmpExists).toBe(false);
  });

  it('한글 값 정상 직렬화', async () => {
    await ensureProjectDir();
    await saveYaml(TEST_DIR, 'ko.yml', { 단계: '제련', 템플릿: '커머스' });
    const loaded = await loadYaml(TEST_DIR, 'ko.yml');
    expect(loaded.단계).toBe('제련');
    expect(loaded.템플릿).toBe('커머스');
  });
});
