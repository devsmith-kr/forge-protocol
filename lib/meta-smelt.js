import { writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import {
  DOMAIN_OPTIONS,
  SCALE_OPTIONS,
  ROLE_OPTIONS,
  getSurveyForDomain,
  getWorkflowQuestions,
} from './domain-surveys.js';
import { loadState, saveState, saveYaml } from './core/project.js';
import { buildQuickCatalogPrompt, buildDeepCatalogPrompt } from '../shared/meta-smelt-prompts.js';
import { commandHeader } from './core/ui.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const BUILTIN_TEMPLATES = [
  { value: 'commerce', name: chalk.bold('Commerce') + chalk.dim('       — 커머스 (쇼핑몰·마켓플레이스) 21개 블럭') },
  { value: 'job-aggregator', name: chalk.bold('Job Aggregator') + chalk.dim(' — 채용공고 통합 검색 서비스 17개 블럭') },
];

/**
 * forge meta-smelt
 * Phase 0: 카탈로그 확정 단계
 *
 * 플로우:
 *   Step 0 — 카탈로그 방식 선택
 *     A) 빌트인 템플릿 → 선택 즉시 .forge/catalog/ 복사 → 완료
 *     B) AI 커스텀 생성 → ★ Quick / Deep 모드 선택 ★
 *        - Quick: 자유 입력 한 번 (30초)
 *        - Deep:  6단계 정밀 설문 (5분)
 *
 * @param {object} [options] - { quick?: boolean, deep?: boolean } commander 플래그
 */
export async function runMetaSmelt(options = {}) {
  const projectDir = process.cwd();
  const forgeDir = join(projectDir, '.forge');

  // state.yml 체크
  const state = await loadState(forgeDir);
  if (!state) return;

  console.log(commandHeader(state, 'Meta-Smelt  (Phase 0: 발굴)'));
  console.log(chalk.dim('  Smelt를 시작하기 전에 카탈로그를 준비합니다.'));
  console.log();

  // ── Step 0: 카탈로그 방식 선택 ───────────────────────────
  console.log(chalk.bold.blue('  Step 0 — 카탈로그 방식 선택'));
  console.log();
  console.log('  ' + chalk.hex('#f97316').bold('A) 빌트인 템플릿 사용'));
  console.log(chalk.dim('     Commerce 선택 시 즉시 forge smelt로 이동합니다.'));
  console.log();
  console.log('  ' + chalk.hex('#f97316').bold('B) AI로 커스텀 생성'));
  console.log(chalk.dim('     내 도메인(HR·물류·핀테크 등)을 설명하면 Claude가'));
  console.log(chalk.dim('     맞춤 블럭 카탈로그(catalog.yml)를 설계해 줍니다.'));
  console.log();

  // 플래그(--quick / --deep)가 지정된 경우 카탈로그 모드 선택은 자동으로 AI로 진입한다.
  let catalogMode;
  if (options.quick || options.deep) {
    catalogMode = 'ai';
    console.log(chalk.dim('  (플래그 지정 — AI 모드로 자동 진입)'));
    console.log();
  } else {
    const ans = await inquirer.prompt([
      {
        type: 'list',
        name: 'catalogMode',
        message: '어떻게 진행할까요?',
        choices: [
          { name: chalk.hex('#f97316')('A) 빌트인 템플릿 사용') + chalk.dim('  — 바로 시작'), value: 'builtin' },
          { name: chalk.hex('#f97316')('B) AI 커스텀 생성') + chalk.dim('     — 내 도메인으로 설계'), value: 'ai' },
        ],
      },
    ]);
    catalogMode = ans.catalogMode;
    console.log();
  }

  if (catalogMode === 'builtin') {
    await runBuiltinSetup(forgeDir, state);
    return;
  }

  // ── AI 모드: Quick / Deep 선택 ────────────────────────────
  let aiMode;
  if (options.quick) aiMode = 'quick';
  else if (options.deep) aiMode = 'deep';
  else {
    console.log(chalk.bold.blue('  AI 카탈로그 생성 모드를 선택하세요'));
    console.log();
    console.log('  ' + chalk.hex('#f97316').bold('Quick') + chalk.dim('  — 자유 입력 한 번. 30초.'));
    console.log(chalk.dim('         도메인을 한 단락으로 설명하면 AI가 부족한 부분을 보편적'));
    console.log(chalk.dim('         베스트 프랙티스로 보완해서 카탈로그를 설계합니다.'));
    console.log();
    console.log('  ' + chalk.hex('#f97316').bold('Deep') + chalk.dim('   — 6단계 정밀 설문. 5분.'));
    console.log(chalk.dim('         업종·사업구조·역할·핵심기능·규모·제약사항을 차례로 묻습니다.'));
    console.log(chalk.dim('         결정 정보가 명확할수록 더 정확한 카탈로그가 나옵니다.'));
    console.log();

    const ans = await inquirer.prompt([
      {
        type: 'list',
        name: 'aiMode',
        message: '어느 모드로 진행할까요?',
        choices: [
          { name: chalk.hex('#f97316')('Quick') + chalk.dim('  — 자유 입력 한 번 (30초)'), value: 'quick' },
          { name: chalk.hex('#f97316')('Deep') + chalk.dim('   — 6단계 정밀 설문 (5분)'), value: 'deep' },
        ],
      },
    ]);
    aiMode = ans.aiMode;
    console.log();
  }

  if (aiMode === 'quick') {
    await runQuickMode(forgeDir, state);
  } else {
    await runDeepMode(forgeDir, state);
  }
}

/**
 * 빌트인 템플릿 선택 → .forge/catalog/catalog.yml 복사 → state 업데이트
 */
async function runBuiltinSetup(forgeDir, state) {
  const { templateName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'templateName',
      message: '템플릿을 선택하세요:',
      choices: BUILTIN_TEMPLATES,
    },
  ]);

  const spinner = ora('카탈로그 복사 중...').start();

  const srcCatalog = join(__dirname, '..', 'templates', templateName, 'catalog.yml');
  const destCatalog = join(forgeDir, 'catalog', 'catalog.yml');

  await mkdir(join(forgeDir, 'catalog'), { recursive: true });
  await copyFile(srcCatalog, destCatalog);

  // state 업데이트
  state.phase = 'meta-smelt';
  state.template = templateName;
  await saveState(forgeDir, state);

  spinner.succeed(chalk.green(`${templateName} 카탈로그 준비 완료!`));
  console.log();
  console.log(chalk.dim('  생성 파일: ') + chalk.green('.forge/catalog/catalog.yml'));
  console.log();
  console.log(chalk.dim('  다음 단계: ') + chalk.cyan('forge smelt') + chalk.dim(' — 필요한 블럭을 선택하세요.'));
  console.log();
}

// ═══════════════════════════════════════════════════════════
// Quick 모드 — 자유 입력 한 번
// ═══════════════════════════════════════════════════════════

async function runQuickMode(forgeDir, state) {
  console.log(chalk.bold.blue('  ✨ Quick — 자유 입력 한 번'));
  console.log();
  console.log(chalk.dim('  어떤 서비스를 만드시나요? 자유롭게 설명해주세요.'));
  console.log(chalk.dim('  규모·핵심기능·사용자역할·제약사항을 한 단락에 담을수록'));
  console.log(chalk.dim('  AI가 더 정확한 카탈로그를 설계합니다.'));
  console.log();
  console.log(chalk.dim('  예시:'));
  console.log(chalk.dim('    • 치과 예약 플랫폼. 환자 예약, 의사 일정 관리, 진료 기록 저장.'));
  console.log(chalk.dim('    • B2B SaaS. RBAC 복잡, 감사 로그 필수, Stripe 결제, 워크스페이스 100개 규모.'));
  console.log();

  const { freeText } = await inquirer.prompt([
    {
      type: 'input',
      name: 'freeText',
      message: '서비스 설명:',
    },
  ]);

  if (!freeText || freeText.trim().length < 10) {
    console.log(chalk.yellow('  최소 10자 이상의 설명이 필요합니다. 종료합니다.'));
    return;
  }

  const trimmed = freeText.trim();
  console.log();

  const spinner = ora('AI 프롬프트 생성 중...').start();

  const input = {
    mode: 'quick',
    free_text: trimmed,
    created_at: new Date().toISOString(),
  };

  const prompt = buildQuickCatalogPrompt(trimmed);

  await saveYaml(forgeDir, 'meta-smelt-input.yml', input);
  await writeFile(join(forgeDir, 'project', 'meta-smelt-prompt.md'), prompt, 'utf-8');

  state.phase = 'meta-smelt';
  await saveState(forgeDir, state);

  spinner.succeed('AI 프롬프트 생성 완료');

  printNextSteps('Quick');
}

// ═══════════════════════════════════════════════════════════
// Deep 모드 — 6단계 정밀 설문
// ═══════════════════════════════════════════════════════════

async function runDeepMode(forgeDir, state) {
  const totalSteps = 6;
  console.log(chalk.bold.blue('  🔬 Deep — 6단계 정밀 설문'));
  console.log();
  console.log(chalk.dim('  AI가 당신의 아이디어를 분석하여 블럭 카탈로그를 설계합니다.'));
  console.log(chalk.dim('  6단계 맞춤 질문에 답해주세요. 편하게 일상 언어로 설명하시면 됩니다.'));
  console.log();

  // ── Step 1: 사업 아이디어 ──
  console.log(chalk.bold.blue(`  Step 1/${totalSteps} — 아이디어`));
  const { idea } = await inquirer.prompt([
    {
      type: 'input',
      name: 'idea',
      message: '어떤 서비스를 만들고 싶으세요? 자유롭게 설명해주세요:',
    },
  ]);

  if (!idea || idea.trim().length === 0) {
    console.log(chalk.yellow('  아이디어를 입력하지 않았습니다. 종료합니다.'));
    return;
  }
  console.log();

  // ── Step 2: 업종/도메인 ──
  console.log(chalk.bold.blue(`  Step 2/${totalSteps} — 업종`));
  const { domain } = await inquirer.prompt([
    {
      type: 'list',
      name: 'domain',
      message: '가장 가까운 업종을 선택하세요:',
      choices: DOMAIN_OPTIONS,
      pageSize: 10,
    },
  ]);

  let domainDetail = '';
  if (domain === 'other') {
    const { detail } = await inquirer.prompt([
      {
        type: 'input',
        name: 'detail',
        message: '어떤 업종인지 설명해주세요:',
      },
    ]);
    domainDetail = detail;
  }
  console.log();

  // 도메인별 설문 로드
  const survey = getSurveyForDomain(domain);

  // ── Step 3: 도메인별 심층 질문 ──
  console.log(chalk.bold.blue(`  Step 3/${totalSteps} — 사업 구조`));
  console.log(chalk.dim('  업종에 맞는 핵심 질문입니다. 정확한 카탈로그 설계에 도움이 됩니다.'));
  console.log();

  const deepDiveAnswers = {};
  for (const question of survey.deepDive) {
    const answer = await inquirer.prompt([question]);
    Object.assign(deepDiveAnswers, answer);
  }
  console.log();

  // ── Step 4: 역할 선택 + 워크플로우 ──
  console.log(chalk.bold.blue(`  Step 4/${totalSteps} — 사용자 역할 & 워크플로우`));

  // 도메인 추천 역할을 기본 체크
  const roleChoices = ROLE_OPTIONS.map((opt) => ({
    ...opt,
    checked: survey.suggestedRoles.includes(opt.value),
  }));

  const { roles } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'roles',
      message: '서비스에 어떤 역할의 사용자가 있나요? (복수 선택):',
      choices: roleChoices,
      validate: (answer) => (answer.length > 0 ? true : '최소 1개 역할을 선택해주세요.'),
    },
  ]);
  console.log();

  // 역할별 워크플로우 질문
  const workflowQuestions = getWorkflowQuestions(roles);
  const workflows = {};

  if (workflowQuestions.length > 0) {
    console.log(chalk.dim('  각 역할이 서비스에서 하는 핵심 행동을 알려주세요.'));
    console.log(chalk.dim('  잘 모르는 부분은 간단히 적어도 괜찮아요. AI가 보완합니다.'));
    console.log();

    for (const wq of workflowQuestions) {
      const { workflow } = await inquirer.prompt([
        {
          type: 'input',
          name: 'workflow',
          message: `[${wq.roleName}] ${wq.question}`,
          default: '',
        },
      ]);
      if (workflow.trim()) {
        workflows[wq.role] = workflow.trim();
      }
    }
  }
  console.log();

  // ── Step 5: 핵심 기능 + 규모 ──
  console.log(chalk.bold.blue(`  Step 5/${totalSteps} — 핵심 기능 & 규모`));
  const { coreFeatures } = await inquirer.prompt([
    {
      type: 'input',
      name: 'coreFeatures',
      message: '반드시 있어야 하는 핵심 기능 3~5개를 알려주세요 (쉼표로 구분):',
      validate: (answer) => (answer.trim().length > 0 ? true : '최소 1개 기능을 입력해주세요.'),
    },
  ]);

  const { scale } = await inquirer.prompt([
    {
      type: 'list',
      name: 'scale',
      message: '예상 서비스 규모를 선택하세요:',
      choices: SCALE_OPTIONS,
    },
  ]);
  console.log();

  // ── Step 6: 특수 제약사항 ──
  console.log(chalk.bold.blue(`  Step 6/${totalSteps} — 특수 제약사항`));
  console.log(chalk.dim('  해당하는 항목을 체크하세요. AI가 World 0 준비물에 반영합니다.'));
  console.log();

  const { constraints } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'constraints',
      message: '해당하는 제약사항을 선택하세요:',
      choices: survey.constraints,
    },
  ]);
  console.log();

  // ── 수집 결과 확인 ──
  const domainLabel = domain === 'other' ? domainDetail : DOMAIN_OPTIONS.find((o) => o.value === domain).name;

  console.log(chalk.dim('  ─'.repeat(25)));
  console.log(chalk.bold('  수집된 정보 요약:'));
  console.log();
  console.log(chalk.bold('  아이디어:   ') + idea.trim().slice(0, 80) + (idea.trim().length > 80 ? '...' : ''));
  console.log(chalk.bold('  업종:       ') + domainLabel);
  console.log(chalk.bold('  사업구조:   ') + Object.values(deepDiveAnswers).join(', '));
  console.log(chalk.bold('  역할:       ') + roles.join(', '));
  if (Object.keys(workflows).length > 0) {
    console.log(chalk.bold('  워크플로우: ') + Object.keys(workflows).length + '개 역할 정의됨');
  }
  console.log(chalk.bold('  핵심기능:   ') + coreFeatures);
  console.log(chalk.bold('  규모:       ') + SCALE_OPTIONS.find((o) => o.value === scale).name);
  if (constraints.length > 0) {
    console.log(chalk.bold('  제약사항:   ') + constraints.length + '개 선택');
  }
  console.log();

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: '이 정보로 AI 카탈로그 생성 프롬프트를 만들까요?',
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('  취소했습니다. 다시 실행해주세요.'));
    return;
  }

  // ── 프롬프트 생성 ──
  const spinner = ora('AI 프롬프트 생성 중...').start();

  const input = {
    mode: 'deep',
    idea: idea.trim(),
    domain: domain === 'other' ? `other: ${domainDetail}` : domain,
    deep_dive: deepDiveAnswers,
    roles,
    workflows,
    core_features: coreFeatures,
    scale,
    constraints,
    created_at: new Date().toISOString(),
  };

  const prompt = buildDeepCatalogPrompt(input);

  // 파일 저장
  await saveYaml(forgeDir, 'meta-smelt-input.yml', input);

  await writeFile(join(forgeDir, 'project', 'meta-smelt-prompt.md'), prompt, 'utf-8');

  // state.yml 업데이트
  state.phase = 'meta-smelt';
  await saveState(forgeDir, state);

  spinner.succeed('AI 프롬프트 생성 완료');

  printNextSteps('Deep');
}

function printNextSteps(modeLabel) {
  console.log();
  console.log(chalk.green.bold(`  ✅ Meta-Smelt 완료! (${modeLabel} 모드)`));
  console.log();
  console.log(chalk.bold('  생성된 파일:'));
  console.log(chalk.dim('    .forge/project/meta-smelt-input.yml') + '  — 수집된 원본 데이터');
  console.log(chalk.dim('    .forge/project/meta-smelt-prompt.md') + '  — AI 카탈로그 생성 프롬프트');
  console.log();
  console.log(chalk.bold('  다음 단계:'));
  console.log(chalk.dim('    1. ') + chalk.white('meta-smelt-prompt.md') + chalk.dim(' 내용을 Claude에 붙여넣으세요.'));
  console.log(
    chalk.dim('    2. AI가 생성한 YAML을 ') + chalk.white('.forge/catalog/catalog.yml') + chalk.dim('에 저장하세요.'),
  );
  console.log(chalk.dim('    3. ') + chalk.cyan('forge smelt') + chalk.dim('를 실행하여 블럭을 선택하세요.'));
  console.log();
  console.log(chalk.dim('  💡 Forge Pro에서는 이 과정이 자동으로 진행됩니다.'));
  console.log();
}
