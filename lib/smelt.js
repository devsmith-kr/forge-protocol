import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { loadProjectCatalog, groupBlocksByWorld, buildBlockMap } from './catalog.js';
import { resolveAll } from './dependency.js';
import { promptDecisions } from './decisions.js';
import { loadState, loadYaml, saveYaml, printDone } from './core/project.js';
import { commandHeader, log } from './core/ui.js';
import { warn } from './core/errors.js';

// ── Draft 저장/복원 헬퍼 ──────────────────────────────────

async function saveDraft(forgeDir, draft) {
  try {
    await saveYaml(forgeDir, 'smelt-draft.yml', draft);
  } catch (err) {
    warn('smelt draft 저장 실패', err);
  }
}

async function loadDraft(forgeDir) {
  try {
    return await loadYaml(forgeDir, 'smelt-draft.yml');
  } catch {
    return null;
  }
}

async function clearDraft(forgeDir) {
  try {
    await unlink(join(forgeDir, 'project', 'smelt-draft.yml'));
  } catch (err) {
    if (err?.code !== 'ENOENT') warn('smelt draft 삭제 실패', err);
  }
}

/**
 * forge smelt
 * Phase 1: 제련 — 대화형으로 블럭을 선택하고, 의존성 해결 후 intent.yml을 생성한다.
 */
export async function runSmelt() {
  const projectDir = process.cwd();
  const forgeDir = join(projectDir, '.forge');

  // state.yml 체크
  const state = await loadState(forgeDir);
  if (!state) return;

  // 카탈로그 로드
  const catalog = await loadProjectCatalog(projectDir);
  const grouped = groupBlocksByWorld(catalog);
  const blockMap = buildBlockMap(catalog);

  console.log(commandHeader(state, 'Smelt  (Phase 1: 제련)'));
  console.log(chalk.dim('  어떤 기능이 필요한지 골라주세요. 의존성은 자동으로 해결됩니다.'));
  console.log();

  // ── Draft 복원 확인 ──
  const draft = await loadDraft(forgeDir);
  let selectedIds = [];
  let completedWorlds = new Set();

  if (draft?.selectedIds?.length > 0) {
    const { resume } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'resume',
        message: chalk.cyan(`  이전 작업이 있습니다 (${draft.selectedIds.length}개 블럭 선택됨). 이어서 진행할까요?`),
        default: true,
      },
    ]);

    if (resume) {
      selectedIds = draft.selectedIds;
      completedWorlds = new Set(draft.completedWorlds || []);
      console.log(chalk.green(`  ↩ 이어서 진행합니다. (완료된 World: ${completedWorlds.size}개)`));
      console.log();
    } else {
      await clearDraft(forgeDir);
    }
  }

  // Step 1: World별 블럭 선택
  for (const { world, bundles } of grouped) {
    if (completedWorlds.has(world.id)) {
      console.log(chalk.dim(`  ✓ ${world.title} — 이미 완료`));
      continue;
    }
    console.log(chalk.bold.blue(`  ── ${world.title} ──`));
    console.log(chalk.dim(`  ${world.description}`));
    console.log();

    const choices = [];
    for (const bundle of bundles) {
      for (const block of bundle.blocks) {
        const tag = block.priority === 'required' ? chalk.red(' [필수]') : chalk.dim(' [선택]');
        choices.push({
          name: `${block.name}${tag} — ${block.user_desc.slice(0, 50)}...`,
          value: block.id,
          checked: block.priority === 'required',
        });
      }
    }

    if (choices.length === 0) continue;

    const { selected } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: `${world.title}에서 필요한 블럭을 선택하세요:`,
        choices,
        pageSize: 15,
      },
    ]);

    selectedIds.push(...selected);
    completedWorlds.add(world.id);

    // World 완료 후 draft 저장 (중단해도 이어서 진행 가능)
    await saveDraft(forgeDir, {
      selectedIds,
      completedWorlds: [...completedWorlds],
      savedAt: new Date().toISOString(),
    });
    console.log();
  }

  if (selectedIds.length === 0) {
    console.log(chalk.yellow('  블럭을 하나도 선택하지 않았습니다. 종료합니다.'));
    return;
  }

  // Step 2: 의존성 해결
  const spinner = ora('의존성 분석 중...').start();
  const resolution = resolveAll(selectedIds, catalog);
  spinner.succeed('의존성 분석 완료');

  // 자동 추가 블럭 안내
  if (resolution.autoAdded.length > 0) {
    console.log();
    console.log(chalk.bold('  📦 자동 추가된 블럭 (의존성):'));
    for (const id of resolution.autoAdded) {
      const block = blockMap.get(id);
      console.log(
        chalk.cyan(`    + ${block?.name || id}`) + chalk.dim(` — ${block?.user_desc?.slice(0, 50) || ''}...`),
      );
    }
  }

  // 영향받는 블럭 안내
  if (resolution.affected.length > 0) {
    console.log();
    console.log(chalk.bold('  ⚡ 영향받는 블럭:'));
    for (const id of resolution.affected) {
      const block = blockMap.get(id);
      console.log(chalk.yellow(`    ~ ${block?.name || id}`) + chalk.dim(` — 선택한 블럭에 의해 영향받음`));
    }
  }

  // Step 3: 결정사항 질문
  const userDecisions = await promptDecisions(resolution.decisions, blockMap);

  // Step 4: World 0 준비물 안내
  if (resolution.prerequisites.length > 0) {
    console.log();
    console.log(chalk.bold('  📋 World 0 — 코드 전에 준비할 것:'));
    console.log();

    for (const prereq of resolution.prerequisites) {
      console.log(chalk.white(`    ${prereq.name}`));
      console.log(chalk.dim(`      어디서: ${prereq.where}`));
      console.log(chalk.dim(`      소요:   ${prereq.time}`));
      console.log(chalk.dim(`      비용:   ${prereq.cost}`));
    }
  }

  // Step 5: intent.yml 생성
  const intent = {
    phase: 'smelt',
    created_at: new Date().toISOString(),
    template: state.template,
    selected_blocks: selectedIds.map((id) => {
      const block = blockMap.get(id);
      return { id, name: block?.name || id };
    }),
    auto_added_blocks: resolution.autoAdded.map((id) => {
      const block = blockMap.get(id);
      return { id, name: block?.name || id, reason: 'dependency' };
    }),
    all_blocks: resolution.allBlocks,
    affected_blocks: resolution.affected.map((id) => {
      const block = blockMap.get(id);
      return { id, name: block?.name || id };
    }),
    decisions: userDecisions,
    prerequisites: resolution.prerequisites.map((p) => ({
      name: p.name,
      where: p.where,
      time: p.time,
      cost: p.cost,
    })),
  };

  await saveYaml(forgeDir, 'intent.yml', intent);

  // selected-blocks.yml 생성
  const selectedBlocks = {
    blocks: resolution.allBlocks.map((id) => {
      const block = blockMap.get(id);
      return {
        id,
        name: block?.name || id,
        priority: block?.priority || 'unknown',
        effort_days: block?.effort_days || 0,
      };
    }),
    total_effort_days: resolution.allBlocks.reduce((sum, id) => {
      const block = blockMap.get(id);
      return sum + (block?.effort_days || 0);
    }, 0),
  };

  await saveYaml(forgeDir, 'selected-blocks.yml', selectedBlocks);

  // state.yml 업데이트
  state.phase = 'smelt';
  state.updated_at = new Date().toISOString();
  state.selected_blocks_count = resolution.allBlocks.length;

  await saveYaml(forgeDir, 'state.yml', state);

  // draft 삭제 (정상 완료)
  await clearDraft(forgeDir);

  // 완료 메시지
  log.blank();
  log.success('Smelt 완료!');
  log.section('요약:');
  log.kv('선택한 블럭:', `${selectedIds.length}개`);
  log.kv('자동 추가:', `${resolution.autoAdded.length}개`);
  log.kv('총 블럭:', `${resolution.allBlocks.length}개`);
  log.kv('예상 공수:', `${selectedBlocks.total_effort_days}일`);
  log.kv('결정사항:', `${userDecisions.length}건`);
  log.kv('준비물:', `${resolution.prerequisites.length}건`);
  log.files(['.forge/project/intent.yml', '.forge/project/selected-blocks.yml', '.forge/project/state.yml (업데이트)']);
  log.next('forge shape');
}
