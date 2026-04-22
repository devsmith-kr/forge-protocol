#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { join } from 'node:path';
import { loadYaml } from '../lib/core/project.js';
import { initProject } from '../lib/init.js';
import { showStatus } from '../lib/status.js';
import { runMetaSmelt } from '../lib/meta-smelt.js';
import { runSmelt } from '../lib/smelt.js';
import { runAssemble } from '../lib/assemble.js';
import { runShape } from '../lib/shape.js';
import { runBuild } from '../lib/build.js';
import { runTemper } from '../lib/temper.js';
import { runInspect } from '../lib/inspect.js';
import { runEmit } from '../lib/emit.js';
import { phaseBar, getPhaseStatus, getNextPhase, progressBar, PHASES, header } from '../lib/core/ui.js';
import { VERSION } from '../lib/core/version.js';
import { ForgeError, err as logError } from '../lib/core/errors.js';

/**
 * 커맨드 액션을 ForgeError 친화 처리로 래핑.
 * ForgeError는 hint 포함 메시지, 그 외는 stack trace로 분리 출력.
 */
function wrap(action) {
  return async (...args) => {
    try {
      await action(...args);
    } catch (e) {
      if (e instanceof ForgeError) {
        logError(e);
        process.exit(1);
      }
      throw e;
    }
  };
}

const program = new Command();

program
  .name('forge')
  .description(chalk.bold('⚒  Forge Protocol') + ' — 바이브코딩 2.0 CLI')
  .version(VERSION);

program
  .command('init')
  .description('프로젝트 초기화 (.forge/ 디렉토리 생성)')
  .action(wrap(initProject));

program
  .command('status')
  .description('현재 프로젝트 상태 대시보드')
  .action(wrap(showStatus));

program
  .command('meta-smelt')
  .description('Phase 0: 발굴 — AI 카탈로그 생성 프롬프트')
  .action(wrap(runMetaSmelt));

program
  .command('smelt')
  .description('Phase 1: 제련 — 블럭 선택 + 의존성 해결')
  .action(wrap(runSmelt));

program
  .command('assemble')
  .description('Phase 1 (플랜 기반): 플랜 파일에서 블럭을 자동 조립')
  .option('-p, --plan <file>', '플랜 파일 경로 (roadmap.md 또는 roadmap.yml)')
  .action(wrap(runAssemble));

program
  .command('shape')
  .description('Phase 2: 성형 — 아키텍처 결정 + AI 설계 프롬프트')
  .action(wrap(runShape));

program
  .command('forge')
  .description('Phase 3: 단조 — API 계약 + 코드 생성 프롬프트')
  .action(wrap(runBuild));

program
  .command('temper')
  .description('Phase 4: 담금질 — Given-When-Then 테스트 시나리오')
  .action(wrap(runTemper));

program
  .command('inspect')
  .description('Phase 5: 검수 — 보안/성능/운영/확장성 멀티 관점 리뷰')
  .action(wrap(runInspect));

program
  .command('emit')
  .description('코드 생성 — contracts.yml → Spring Boot 스켈레톤 + JUnit5')
  .option('-t, --target <type>', '생성 대상 (backend | tests | all)')
  .option('-b, --build <tool>', '빌드 도구 (gradle | maven, 기본: gradle)')
  .action(wrap(runEmit));

// ── 인자 없이 실행 시: 인터랙티브 메인 메뉴 ──────────────
async function runInteractiveMenu() {
  const projectDir = process.cwd();
  const forgeDir   = join(projectDir, '.forge');

  let state = null;
  try {
    state = await loadYaml(forgeDir, 'state.yml');
    if (!state.project_name) state.project_name = projectDir.split(/[\\/]/).pop();
    try {
      const intent = await loadYaml(forgeDir, 'intent.yml');
      state.selected_blocks_count ??= intent?.all_blocks?.length ?? intent?.selected_blocks?.length;
    } catch {
      // intent.yml은 선택적: Smelt 이전에는 부재
    }
  } catch {
    // 미초기화된 디렉토리 — 아래 else 분기에서 안내
  }

  // ── 헤더 출력 ──
  console.log();
  console.log(header());
  console.log();

  if (state) {
    // Phase bar + 진행도
    console.log(phaseBar(state.phase));
    console.log();
    const phases    = getPhaseStatus(state.phase);
    const doneCount = phases.filter(p => p.done).length;
    console.log(progressBar(doneCount, PHASES.length));
    console.log();

    const projectInfo = [
      chalk.bold(state.project_name ?? ''),
      state.template ? chalk.cyan(state.template) : '',
      state.selected_blocks_count ? chalk.dim(`블럭 ${state.selected_blocks_count}개`) : '',
    ].filter(Boolean).join('  ·  ');
    console.log('  ' + projectInfo);
  } else {
    console.log('  ' + chalk.dim('아직 초기화되지 않은 디렉토리입니다.'));
  }

  console.log();

  // ── 메뉴 선택지 구성 ──
  const choices = buildMenuChoices(state);

  const { action } = await inquirer.prompt([{
    type:    'list',
    name:    'action',
    message: '무엇을 하시겠어요?',
    choices,
    pageSize: 12,
  }]);

  if (action === '__exit__') {
    console.log(chalk.dim('\n  종료합니다.\n'));
    return;
  }

  // 핸들러 직접 호출 (process.argv 재파싱 대신)
  if (action === 'forge init') {
    await initProject();
    return;
  }

  const handlers = {
    'forge meta-smelt': runMetaSmelt,
    'forge smelt':      runSmelt,
    'forge shape':      runShape,
    'forge forge':      runBuild,
    'forge temper':     runTemper,
    'forge inspect':    runInspect,
    'forge status':     showStatus,
  };

  const handler = handlers[action];
  if (handler) {
    await handler();
  } else {
    console.log(chalk.yellow(`\n  알 수 없는 명령: ${action}\n`));
  }
}

function buildMenuChoices(state) {
  const Separator = inquirer.Separator;
  const choices   = [];

  if (!state) {
    // 미초기화 상태
    choices.push({
      name:  chalk.hex('#f97316').bold('⚒   forge init') + chalk.dim('  —  프로젝트 초기화'),
      value: 'forge init',
    });
    choices.push(new Separator(chalk.dim('  ─────────────────────────────────────────')));
    choices.push({ name: chalk.dim('📊  forge status  — 대시보드'), value: 'forge status' });
    choices.push({ name: chalk.dim('❌  종료'), value: '__exit__' });
    return choices;
  }

  const phases = getPhaseStatus(state.phase);
  const next   = getNextPhase(state.phase);

  for (const p of phases) {
    const isNext = p.cmd === next?.cmd;
    let prefix, nameStr;

    if (p.done) {
      prefix  = chalk.green('✅ ');
      nameStr = chalk.green(p.label) + chalk.dim(`  —  ${p.ko} 완료`);
    } else if (isNext) {
      prefix  = chalk.hex('#f97316').bold('▶  ');
      nameStr = chalk.hex('#f97316').bold(p.label) + chalk.dim(`  —  ${p.ko}  ← 다음 단계`);
    } else {
      prefix  = chalk.dim('   ');
      nameStr = chalk.dim(`${p.label}  —  ${p.ko}  (이전 Phase 완료 후)`);
    }

    choices.push({
      name:     `  ${prefix} ${nameStr}`,
      value:    p.cmd,
      disabled: (!p.done && !isNext) ? chalk.dim('잠김') : false,
    });
  }

  choices.push(new Separator(chalk.dim('  ─────────────────────────────────────────')));
  choices.push({ name: chalk.dim('  📊  forge status  — 전체 대시보드'), value: 'forge status' });
  choices.push({ name: chalk.dim('  ❌  종료'), value: '__exit__' });

  return choices;
}

// Commander가 서브커맨드를 처리하지 못할 때 메뉴 실행
const hasArgs = process.argv.slice(2).length > 0;
if (hasArgs) {
  program.parse();
} else {
  runInteractiveMenu().catch(e => {
    if (e.isTtyError || e.message?.includes('User force closed')) {
      console.log(chalk.dim('\n  종료합니다.\n'));
      process.exit(0);
    }
    if (e instanceof ForgeError) {
      logError(e);
      process.exit(1);
    }
    console.error(chalk.red('\n  오류: ' + e.message + '\n'));
    process.exit(1);
  });
}
