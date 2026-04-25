import { readFile, access } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { loadProjectCatalog, buildBlockMap } from './catalog.js';
import { resolveAll } from './dependency.js';
import { parsePlan, mapPlanToCatalog } from './assembler.js';
import { loadState, saveState, saveYaml } from './core/project.js';

/**
 * forge assemble --plan <file>
 *
 * 플로우:
 *   1. 플랜 파일 파싱 (md / yml)
 *   2. 카탈로그 블럭에 매핑 (점수제)
 *   3. 미매칭 항목 수동 처리 (건너뛰기 or 직접 선택)
 *   4. 단계별 의존성 해결
 *   5. roadmap.yml + intent.yml 생성
 */
export async function runAssemble(options) {
  const projectDir = process.cwd();
  const forgeDir = join(projectDir, '.forge');

  // ── state.yml 체크 ──
  const state = await loadState(forgeDir);
  if (!state) return;

  // ── 플랜 파일 결정 ──
  let planPath = options.plan;

  if (!planPath) {
    // 기본 위치 자동 탐색
    const candidates = [
      join(projectDir, 'roadmap.md'),
      join(projectDir, 'roadmap.yml'),
      join(projectDir, 'plan.md'),
      join(projectDir, 'plan.yml'),
    ];
    for (const c of candidates) {
      try {
        await access(c);
        planPath = c;
        break;
      } catch {
        // 이 후보 경로엔 없음 — 다음 후보로 진행
      }
    }

    if (!planPath) {
      const { inputPath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'inputPath',
          message: '플랜 파일 경로를 입력하세요 (roadmap.md 또는 roadmap.yml):',
          validate: (v) => (v.trim() ? true : '경로를 입력해주세요.'),
        },
      ]);
      planPath = join(projectDir, inputPath.trim());
    }
  }

  // ── 파일 읽기 ──
  let planContent;
  try {
    planContent = await readFile(planPath, 'utf-8');
  } catch {
    console.log(chalk.red(`  파일을 찾을 수 없습니다: ${planPath}`));
    return;
  }

  const ext = extname(planPath).replace('.', '').toLowerCase();
  const fileName = basename(planPath);

  console.log();
  console.log(chalk.bold('  📋 Assemble — 플랜 기반 블럭 조립'));
  console.log(chalk.dim(`  파일: ${fileName}`));
  console.log();

  // ── 플랜 파싱 ──
  const spinner = ora('플랜 파싱 중...').start();
  const plan = parsePlan(planContent, ext);
  spinner.stop();

  if (plan.phases.length === 0) {
    console.log(chalk.red('  플랜에서 항목을 찾을 수 없습니다.'));
    console.log(chalk.dim('  마크다운: ## Phase명 + - 항목 / YAML: phases: { mvp: { features: [...] } }'));
    return;
  }

  const totalFeatures = plan.phases.reduce((s, p) => s + p.features.length, 0);
  console.log(chalk.bold(`  ${plan.phases.length}개 단계, ${totalFeatures}개 항목 발견`));
  for (const phase of plan.phases) {
    console.log(chalk.dim(`    ${chalk.cyan(phase.name)}: ${phase.features.length}개`));
  }
  console.log();

  // ── 카탈로그 로드 + 매핑 ──
  const catalog = await loadProjectCatalog(projectDir);
  const blockMap = buildBlockMap(catalog);

  const mappingSpinner = ora('카탈로그 블럭 매핑 중...').start();
  const mapping = mapPlanToCatalog(plan, catalog);
  mappingSpinner.succeed('매핑 완료');

  // ── 매핑 결과 출력 ──
  console.log();
  for (const phase of mapping.phases) {
    console.log(chalk.bold.blue(`  ── ${phase.name} ──`));

    for (const { feature, block, score } of phase.mapped) {
      const confidence = score >= 80 ? chalk.green('확실') : score >= 50 ? chalk.yellow('추정') : chalk.dim('낮음');
      console.log(`    ${chalk.green('✓')} ${feature} → ${chalk.cyan(block.name)} ${chalk.dim(`[${confidence}]`)}`);
    }

    if (phase.unmatched.length > 0) {
      for (const feature of phase.unmatched) {
        console.log(`    ${chalk.red('?')} ${feature} → ${chalk.red('매칭 실패')}`);
      }
    }
    console.log();
  }

  // ── 미매칭 항목 수동 처리 ──
  const allUnmatched = mapping.phases.flatMap((p) => p.unmatched.map((f) => ({ phase: p.name, feature: f })));

  const manualSelections = []; // { phase, feature, blockId }

  if (allUnmatched.length > 0) {
    console.log(chalk.bold(`  ⚠️  ${allUnmatched.length}개 항목이 자동 매핑되지 않았습니다.`));
    console.log(chalk.dim('  직접 블럭을 선택하거나 건너뛸 수 있습니다.'));
    console.log();

    const blockChoices = catalog.blocks.map((b) => ({
      name: `${b.name} — ${b.user_desc?.slice(0, 40)}...`,
      value: b.id,
    }));

    for (const { phase, feature } of allUnmatched) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: `[${phase}] "${feature}" 처리 방법:`,
          choices: [
            { name: '블럭 직접 선택', value: 'pick' },
            { name: '건너뛰기 (나중에 추가)', value: 'skip' },
          ],
        },
      ]);

      if (action === 'pick') {
        const { blockId } = await inquirer.prompt([
          {
            type: 'list',
            name: 'blockId',
            message: `"${feature}"에 해당하는 블럭을 선택하세요:`,
            choices: blockChoices,
            pageSize: 15,
          },
        ]);
        manualSelections.push({ phase, feature, blockId });

        // mapping에 반영
        const phaseEntry = mapping.phases.find((p) => p.name === phase);
        const block = blockMap.get(blockId);
        if (phaseEntry && block) {
          phaseEntry.mapped.push({ feature, block, score: 100 });
          phaseEntry.unmatched = phaseEntry.unmatched.filter((f) => f !== feature);
        }
      }
    }
    console.log();
  }

  // ── 최종 확인 ──
  const totalMapped = mapping.phases.reduce((s, p) => s + p.mapped.length, 0);
  const totalSkipped = mapping.phases.reduce((s, p) => s + p.unmatched.length, 0);

  console.log(chalk.dim('  ─'.repeat(25)));
  console.log(chalk.bold('  조립 요약:'));
  console.log(`    매핑된 블럭: ${chalk.cyan(totalMapped + '개')}`);
  if (totalSkipped > 0) {
    console.log(`    건너뛴 항목: ${chalk.yellow(totalSkipped + '개')}`);
  }
  console.log();

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: '이 구성으로 roadmap.yml과 intent.yml을 생성할까요?',
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('  취소했습니다.'));
    return;
  }

  // ── 의존성 해결 + 파일 생성 ──
  const outputSpinner = ora('의존성 해결 및 파일 생성 중...').start();

  // 단계별 블럭 ID 목록
  const phaseBlockIds = mapping.phases.map((p) => ({
    name: p.name,
    blockIds: p.mapped.map((m) => m.block.id),
  }));

  // 전체 선택된 블럭 (중복 제거)
  const allSelectedIds = [...new Set(phaseBlockIds.flatMap((p) => p.blockIds))];
  const resolution = resolveAll(allSelectedIds, catalog);

  // roadmap.yml — 단계별 블럭 구성
  const roadmap = {
    generated_by: 'forge assemble',
    source_file: fileName,
    created_at: new Date().toISOString(),
    phases: phaseBlockIds.map((p) => ({
      name: p.name,
      blocks: p.blockIds.map((id) => {
        const block = blockMap.get(id);
        return { id, name: block?.name || id, effort_days: block?.effort_days || 0 };
      }),
      total_effort_days: p.blockIds.reduce((s, id) => s + (blockMap.get(id)?.effort_days || 0), 0),
    })),
    auto_added_by_dependency: resolution.autoAdded.map((id) => {
      const block = blockMap.get(id);
      return { id, name: block?.name || id };
    }),
    total_effort_days: resolution.allBlocks.reduce((s, id) => s + (blockMap.get(id)?.effort_days || 0), 0),
  };

  // intent.yml — smelt와 동일한 구조
  const intent = {
    phase: 'smelt',
    source: 'assemble',
    created_at: new Date().toISOString(),
    template: state.template,
    plan_file: fileName,
    selected_blocks: allSelectedIds.map((id) => {
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
    decisions: [], // assemble은 결정 질문 없이 생성. forge smelt로 보완 가능.
    prerequisites: resolution.prerequisites.map((p) => ({
      name: p.name,
      where: p.where,
      time: p.time,
      cost: p.cost,
    })),
  };

  // selected-blocks.yml
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
    total_effort_days: resolution.allBlocks.reduce((s, id) => s + (blockMap.get(id)?.effort_days || 0), 0),
  };

  await Promise.all([
    saveYaml(forgeDir, 'roadmap.yml', roadmap),
    saveYaml(forgeDir, 'intent.yml', intent),
    saveYaml(forgeDir, 'selected-blocks.yml', selectedBlocks),
  ]);

  // state.yml 업데이트
  state.phase = 'smelt';
  state.selected_blocks_count = resolution.allBlocks.length;
  await saveState(forgeDir, state);

  outputSpinner.succeed('파일 생성 완료');

  // ── 완료 메시지 ──
  console.log();
  console.log(chalk.green.bold('  ✅ Assemble 완료!'));
  console.log();
  console.log(chalk.bold('  결과:'));
  console.log(`    총 블럭:    ${chalk.cyan(resolution.allBlocks.length + '개')}`);
  console.log(`    자동 추가:  ${chalk.cyan(resolution.autoAdded.length + '개')} (의존성)`);
  console.log(`    예상 공수:  ${chalk.cyan(selectedBlocks.total_effort_days + '일')}`);
  console.log(`    준비물:     ${chalk.cyan(resolution.prerequisites.length + '건')}`);
  console.log();

  // 단계별 공수 요약
  console.log(chalk.bold('  단계별 공수:'));
  for (const phase of roadmap.phases) {
    console.log(`    ${chalk.cyan(phase.name)}: ${phase.blocks.length}개 블럭, ${phase.total_effort_days}일`);
  }
  console.log();

  console.log(chalk.dim('  생성 파일:'));
  console.log(chalk.dim('    .forge/project/roadmap.yml       — 단계별 블럭 구성'));
  console.log(chalk.dim('    .forge/project/intent.yml         — Smelt 호환 의도 파일'));
  console.log(chalk.dim('    .forge/project/selected-blocks.yml'));
  console.log();

  if (resolution.prerequisites.length > 0) {
    console.log(chalk.bold('  📋 World 0 — 코드 전에 준비할 것:'));
    for (const p of resolution.prerequisites) {
      console.log(`    ${chalk.white(p.name)} ${chalk.dim(`(${p.where}, ${p.time}, ${p.cost})`)}`);
    }
    console.log();
  }

  console.log(chalk.dim('  다음 단계: ') + chalk.cyan('forge shape'));
  console.log();
}
