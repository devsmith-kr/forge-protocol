import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
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
import { commandHeader } from './core/ui.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const BUILTIN_TEMPLATES = [
  { value: 'commerce', name: chalk.bold('Commerce') + chalk.dim('  — 커머스 (쇼핑몰·마켓플레이스) 22개 블럭') },
];

/**
 * forge meta-smelt
 * Phase 0: 카탈로그 확정 단계
 *
 * 플로우:
 *   Step 0 — 카탈로그 방식 선택
 *     A) 빌트인 템플릿 → 선택 즉시 .forge/catalog/ 복사 → 완료
 *     B) AI 커스텀 생성 → Step 1~6 설문 → 프롬프트 생성 → catalog.yml 붙여넣기
 */
export async function runMetaSmelt() {
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

  const { catalogMode } = await inquirer.prompt([{
    type: 'list',
    name: 'catalogMode',
    message: '어떻게 진행할까요?',
    choices: [
      { name: chalk.hex('#f97316')('A) 빌트인 템플릿 사용') + chalk.dim('  — 바로 시작'), value: 'builtin' },
      { name: chalk.hex('#f97316')('B) AI 커스텀 생성') + chalk.dim('     — 내 도메인으로 설계'), value: 'ai' },
    ],
  }]);
  console.log();

  if (catalogMode === 'builtin') {
    await runBuiltinSetup(forgeDir, state);
    return;
  }

  // ── AI 커스텀 생성 플로우 ─────────────────────────────────
  const totalSteps = 6;
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
  const roleChoices = ROLE_OPTIONS.map(opt => ({
    ...opt,
    checked: survey.suggestedRoles.includes(opt.value),
  }));

  const { roles } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'roles',
      message: '서비스에 어떤 역할의 사용자가 있나요? (복수 선택):',
      choices: roleChoices,
      validate: (answer) => answer.length > 0 ? true : '최소 1개 역할을 선택해주세요.',
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
      validate: (answer) => answer.trim().length > 0 ? true : '최소 1개 기능을 입력해주세요.',
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
  const domainLabel = domain === 'other'
    ? domainDetail
    : DOMAIN_OPTIONS.find(o => o.value === domain).name;

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
  console.log(chalk.bold('  규모:       ') + SCALE_OPTIONS.find(o => o.value === scale).name);
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

  // 커머스 catalog.yml을 few-shot 예시로 로드
  let commerceExample;
  try {
    commerceExample = await readFile(
      join(__dirname, '..', 'templates', 'commerce', 'catalog.yml'),
      'utf-8'
    );
  } catch {
    commerceExample = '(커머스 템플릿을 찾을 수 없습니다)';
  }

  const prompt = buildPrompt(input, commerceExample);

  // 파일 저장
  await saveYaml(forgeDir, 'meta-smelt-input.yml', input);

  await writeFile(
    join(forgeDir, 'project', 'meta-smelt-prompt.md'),
    prompt,
    'utf-8'
  );

  // state.yml 업데이트
  state.phase = 'meta-smelt';
  await saveState(forgeDir, state);

  spinner.succeed('AI 프롬프트 생성 완료');

  // 완료 메시지
  console.log();
  console.log(chalk.green.bold('  ✅ Meta-Smelt 완료!'));
  console.log();
  console.log(chalk.bold('  생성된 파일:'));
  console.log(chalk.dim('    .forge/project/meta-smelt-input.yml') + '  — 수집된 원본 데이터');
  console.log(chalk.dim('    .forge/project/meta-smelt-prompt.md') + '  — AI 카탈로그 생성 프롬프트');
  console.log();
  console.log(chalk.bold('  다음 단계:'));
  console.log(chalk.dim('    1. ') + chalk.white('meta-smelt-prompt.md') + chalk.dim(' 내용을 Claude에 붙여넣으세요.'));
  console.log(chalk.dim('    2. AI가 생성한 YAML을 ') + chalk.white('.forge/catalog/catalog.yml') + chalk.dim('에 저장하세요.'));
  console.log(chalk.dim('    3. ') + chalk.cyan('forge smelt') + chalk.dim('를 실행하여 블럭을 선택하세요.'));
  console.log();
  console.log(chalk.dim('  💡 Forge Pro에서는 이 과정이 자동으로 진행됩니다.'));
  console.log();
}

/**
 * 빌트인 템플릿 선택 → .forge/catalog/catalog.yml 복사 → state 업데이트
 */
async function runBuiltinSetup(forgeDir, state) {
  const { templateName } = await inquirer.prompt([{
    type: 'list',
    name: 'templateName',
    message: '템플릿을 선택하세요:',
    choices: BUILTIN_TEMPLATES,
  }]);

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

/**
 * 시스템 프롬프트 + 사용자 메시지를 조합한다.
 * 도메인별 심층 답변, 워크플로우, 제약사항을 모두 포함.
 */
function buildPrompt(input, commerceExample) {
  const domainLabel = input.domain.startsWith('other:')
    ? input.domain.replace('other: ', '')
    : input.domain;

  const roleDescriptions = input.roles.map(r => {
    const found = ROLE_OPTIONS.find(o => o.value === r);
    return found ? `- ${found.name}` : `- ${r}`;
  }).join('\n');

  // 심층 질문 답변 포맷
  const deepDiveSection = Object.entries(input.deep_dive)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');

  // 워크플로우 포맷
  const workflowSection = Object.entries(input.workflows || {})
    .map(([role, flow]) => {
      const roleName = ROLE_OPTIONS.find(o => o.value === role)?.name?.split(' — ')[0] || role;
      return `- ${roleName}: ${flow}`;
    })
    .join('\n');

  // 제약사항 포맷
  const constraintSection = (input.constraints || [])
    .map(c => `- ${c}`)
    .join('\n');

  return `# Forge Protocol — AI 카탈로그 생성 프롬프트

> 이 파일은 \`forge meta-smelt\`가 자동 생성했습니다.
> 아래 내용을 Claude (또는 다른 AI)에 붙여넣으면 catalog.yml이 생성됩니다.

---

## System Prompt

당신은 Forge Protocol의 카탈로그 설계자입니다.
사용자의 사업 아이디어를 분석하여, Forge Protocol 형식의 블럭 카탈로그(catalog.yml)를 YAML로 생성하세요.

### Forge Protocol 핵심 원칙

1. **줌 레벨 구조**: World(사업 도메인) → Bundle(기능 묶음) → Block(개별 기능)
2. **두 겹의 언어**: 모든 Block에는 반드시 두 가지 설명이 공존해야 합니다:
   - \`user_desc\`: 일반인이 이해할 수 있는 일상 언어. 비유와 예시를 사용.
   - \`tech_desc\`: 개발자를 위한 기술 명세. 구체적인 기술 스택, 패턴, 자료구조 포함.
3. **analogy**: 각 Block의 기능을 한 줄 비유로 표현 (예: "마트 쇼핑카트", "택배 조회하기")
4. **의존성 그래프**: Block 간 \`requires\`(필수 의존)와 \`affects\`(영향) 관계를 정의
5. **캐스케이드**: 특정 Block 선택 시 사용자에게 물어야 할 사업적 결정사항
6. **World 0 준비물**: 코드 작성 전에 현실에서 준비해야 할 것들 (사업자등록, 계약 등)

### YAML 스키마 (반드시 이 구조를 따르세요)

\`\`\`yaml
worlds:
  - id: w-{도메인}        # 고유 ID (w- 접두사)
    title: "..."          # 한글 제목 (일반인이 이해할 수 있는 표현)
    description: "..."    # 한 줄 설명
    order: 1              # 표시 순서

bundles:
  - id: b-{세계}-{그룹}   # 고유 ID (b- 접두사)
    world_id: w-{도메인}   # 소속 World
    title: "..."
    description: "..."

blocks:
  - id: {기능명}           # 고유 ID (소문자-하이픈)
    bundle_id: b-{...}    # 소속 Bundle
    name: "..."           # 한글 기능 이름
    user_desc: "..."      # 일반인용 설명 (2~3문장, 비유 포함, 존댓말)
    tech_desc: "..."      # 개발자용 설명 (기술 스택, 패턴, 자료구조)
    analogy: "..."        # 한 줄 비유
    priority: required|optional   # 필수 vs 선택
    effort_days: N        # 예상 공수 (일 단위)

dependencies:
  - source: {블럭A}       # 의존하는 블럭
    target: {블럭B}       # 의존 대상
    type: requires|affects  # requires: B 없이 A 불가 / affects: A가 B에 영향
    condition: "..."      # 의존 이유 설명

cascades:
  - trigger: {블럭ID}     # 이 블럭 선택 시 질문 발생
    add_blocks: []        # 자동 추가할 블럭 (보통 비워둠)
    ask_questions:
      - question: "..."   # 사업적 결정 질문
        options:          # 2~4개 선택지
          - "..."
          - "..."
        cascade_effects:  # 이 결정이 코드에 미치는 영향
          - "..."

prerequisites:
  - id: prereq-{이름}
    name: "..."           # 준비물 이름
    phase: "World 0"
    where: "..."          # 어디서 준비하는지
    time: "..."           # 소요 기간
    cost: "..."           # 비용
    enables:              # 이 준비물이 활성화하는 블럭들
      - {블럭ID}
\`\`\`

### 설계 규칙

1. **World 개수**: 3~7개. 사업 도메인을 사람 관점에서 분류 (예: "파는 사람의 세계", "사는 사람의 세계")
2. **Block 개수**: 규모에 따라 조절:
   - MVP: 10~15개 (필수만)
   - 소규모: 15~25개
   - 중규모: 25~40개
   - 대규모: 40개+
3. **필수(required) 비율**: 전체 블럭의 50~70%
4. **의존성**: 모든 requires 관계의 target 블럭은 blocks에 존재해야 함
5. **effort_days 기준**: 시니어 개발자 1명 기준. 소수점 없이 정수.
6. **캐스케이드**: 사업적 분기점이 있는 블럭에만. 기술적 결정이 아닌 사업적 결정만.
7. **World 0**: 해당 업종에서 법적으로 또는 실무적으로 반드시 필요한 준비물만.
8. **ID 규칙**: 모든 ID는 영문 소문자 + 하이픈. 공백/한글 금지.

### 참고 예시 (커머스 도메인)

아래는 커머스 도메인의 catalog.yml 예시입니다. 구조와 톤을 참고하되, 사용자의 도메인에 맞게 새롭게 설계하세요.

<example>
${commerceExample}
</example>

---

## User Message

다음 정보를 기반으로 Forge Protocol catalog.yml을 YAML 형식으로 생성해주세요.
코드 블럭(\`\`\`yaml ... \`\`\`) 안에 YAML만 출력하세요. 설명은 YAML 주석으로 넣어주세요.

### 사업 아이디어
${input.idea}

### 업종
${domainLabel}

### 사업 구조 (심층 분석)
${deepDiveSection || '(추가 정보 없음)'}

### 서비스에 참여하는 역할
${roleDescriptions}

### 역할별 워크플로우
${workflowSection || '(정의되지 않음 — AI가 도메인 지식 기반으로 추론해주세요)'}

### 핵심 기능 (반드시 포함)
${input.core_features}

### 목표 규모
${input.scale === 'mvp' ? 'MVP (최소 기능, 빠른 검증) — 10~15개 블럭' :
  input.scale === 'small' ? '소규모 (초기 서비스) — 15~25개 블럭' :
  input.scale === 'medium' ? '중규모 (성장 단계) — 25~40개 블럭' :
  '대규모 (엔터프라이즈) — 40개+ 블럭'}

### 특수 제약사항 (World 0에 반영 필요)
${constraintSection || '(해당 없음)'}

### 추가 지시사항
- 사업 구조 답변을 바탕으로 도메인에 특화된 블럭을 설계하세요.
- 워크플로우를 참고하여 각 역할의 여정(journey)이 빠짐없이 블럭에 반영되었는지 확인하세요.
- 제약사항은 World 0 prerequisites에 구체적인 준비물로 변환하세요.
- 캐스케이드 질문은 사업 구조에서 분기가 생기는 지점에 집중하세요.
`;
}
