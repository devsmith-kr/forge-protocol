import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { renderDashboard } from './core/ui.js';
import { loadYaml } from './core/project.js';
import { warn } from './core/errors.js';

/**
 * forge status
 * 프로젝트 대시보드 — Phase 진행 현황 + 파일 상태 시각화
 */
export async function showStatus() {
  const projectDir = process.cwd();
  const forgeDir = join(projectDir, '.forge');

  let state;
  try {
    state = await loadYaml(forgeDir, 'state.yml');
  } catch {
    console.log();
    console.log(chalk.yellow('  Forge 프로젝트가 초기화되지 않았습니다.'));
    console.log(chalk.dim('  먼저 ') + chalk.cyan('forge init --template commerce') + chalk.dim('을 실행하세요.'));
    console.log();
    return;
  }

  // project_name 보완 (없으면 cwd 이름 사용)
  if (!state.project_name) {
    state.project_name = projectDir.split(/[\\/]/).pop();
  }

  // 존재하는 파일 목록 수집
  let existingFiles = [];
  try {
    existingFiles = await readdir(join(forgeDir, 'project'));
  } catch (err) {
    // project 디렉토리 부재는 init 직후 정상 상태
    if (err?.code !== 'ENOENT') warn('project 디렉토리 읽기 실패', err);
  }

  // intent.yml에서 블럭 수/공수 보완 (선택적)
  if (!state.selected_blocks_count) {
    try {
      const intent = await loadYaml(forgeDir, 'intent.yml');
      state.selected_blocks_count = intent?.all_blocks?.length ?? intent?.selected_blocks?.length;
    } catch {
      // intent.yml은 선택적
    }
  }
  if (!state.total_effort_days) {
    try {
      const sb = await loadYaml(forgeDir, 'selected-blocks.yml');
      state.total_effort_days = sb?.total_effort_days;
    } catch {
      // selected-blocks.yml은 선택적
    }
  }

  console.log(renderDashboard(state, existingFiles));
}
