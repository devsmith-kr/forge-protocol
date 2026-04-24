import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { loadProjectCatalog, buildBlockMap } from './catalog.js';
import { loadState, loadSmeltResult, loadArchitecture, loadYaml, saveState, saveYaml, printDone } from './core/project.js';
import { commandHeader } from './core/ui.js';
import { inferEndpoints as inferEndpointsShared, inferApiStyle, toResourcePath } from '../shared/api-inference.js';

/**
 * forge forge
 * Phase 3: 단조 — 선택된 블럭과 아키텍처 결정을 바탕으로
 * API 계약(contracts.yml)과 코드 생성 프롬프트(build-prompt.md)를 만든다.
 *
 * 플로우:
 *   1. architecture.yml + selected-blocks.yml + intent.yml 읽기
 *   2. 생성 범위 선택 (전체 or 단계별)
 *   3. contracts.yml 생성 (API 계약 스켈레톤)
 *   4. build-prompt.md 생성 (Claude에 붙여넣기용)
 */
export async function runBuild() {
  const projectDir = process.cwd();
  const forgeDir = join(projectDir, '.forge');

  // ── 선행 파일 확인 ──
  const state = await loadState(forgeDir);
  if (!state) return;

  const smelt = await loadSmeltResult(forgeDir);
  if (!smelt) return;
  const { intent, selectedBlocks } = smelt;

  const architecture = await loadArchitecture(forgeDir);
  if (!architecture) return;

  // 카탈로그 로드 (블럭 상세 정보)
  const catalog = await loadProjectCatalog(projectDir);
  const blockMap = buildBlockMap(catalog);

  const blocks = selectedBlocks?.blocks ?? [];
  const techStack = architecture?.tech_stack ?? {};

  console.log();
  console.log(commandHeader(state, 'Forge  (Phase 3: 단조)'));
  console.log(chalk.dim(`  ${blocks.length}개 블럭 → API 계약 + 코드 생성 프롬프트`));
  console.log();

  // ── 생성 범위 선택 ──
  console.log(chalk.bold.blue('  생성 범위'));

  // roadmap.yml이 있으면 단계 선택 제공 (optional: 파일 부재 시 전체만 제공)
  let phases = null;
  let selectedPhase = 'all';
  try {
    const roadmap = await loadYaml(forgeDir, 'roadmap.yml');
    phases = roadmap?.phases;
  } catch {
    // roadmap.yml은 선택적이므로 부재 시 전체 모드로 폴백
  }

  if (phases && phases.length > 0) {
    const { scope } = await inquirer.prompt([{
      type: 'list',
      name: 'scope',
      message: '어느 범위의 코드를 생성할까요?',
      choices: [
        { name: `전체 (${blocks.length}개 블럭)`, value: 'all' },
        ...phases.map(p => ({
          name: `${p.name} 단계만 (${p.blocks?.length ?? 0}개 블럭)`,
          value: p.name,
        })),
      ],
    }]);
    selectedPhase = scope;
  }
  console.log();

  // 생성 대상 블럭 결정
  let targetBlockIds;
  if (selectedPhase === 'all') {
    targetBlockIds = blocks.map(b => b.id);
  } else {
    const phase = phases.find(p => p.name === selectedPhase);
    targetBlockIds = phase?.blocks?.map(b => b.id) ?? [];
  }

  const targetBlocks = targetBlockIds
    .map(id => blockMap.get(id) ?? blocks.find(b => b.id === id))
    .filter(Boolean);

  // ── 생성 방식 선택 ──
  const { buildMode } = await inquirer.prompt([{
    type: 'list',
    name: 'buildMode',
    message: '코드 생성 방식은?',
    choices: [
      {
        name: '통합 프롬프트 — 전체를 한 번에 Claude에 붙여넣기',
        value: 'unified',
      },
      {
        name: '블럭별 분리 — 블럭 하나씩 순서대로 생성 (대규모 프로젝트 추천)',
        value: 'per-block',
      },
    ],
  }]);
  console.log();

  // ── 파일 생성 ──
  const spinner = ora('contracts.yml + 빌드 프롬프트 생성 중...').start();

  await mkdir(join(forgeDir, 'generated', 'src'), { recursive: true });

  // contracts.yml 생성
  const contracts = buildContracts(targetBlocks, techStack);
  await saveYaml(forgeDir, 'contracts.yml', contracts);

  // build-prompt.md 생성
  const prompt = buildMode === 'unified'
    ? buildUnifiedPrompt(targetBlocks, techStack, contracts, intent, selectedPhase)
    : buildPerBlockPrompt(targetBlocks, techStack, contracts, intent, selectedPhase);

  await writeFile(
    join(forgeDir, 'project', 'build-prompt.md'),
    prompt,
    'utf-8'
  );

  // state.yml 업데이트
  state.phase = 'forge';
  await saveState(forgeDir, state);

  spinner.succeed('생성 완료');

  // ── 완료 메시지 ──
  const totalDays = targetBlocks.reduce((s, b) => s + (b.effort_days ?? 0), 0);

  console.log();
  console.log(chalk.green.bold('  ✅ Build 프롬프트 생성 완료!'));
  console.log();
  console.log(chalk.bold('  생성 범위:'));
  console.log(`    대상 단계:  ${chalk.cyan(selectedPhase)}`);
  console.log(`    블럭 수:    ${chalk.cyan(targetBlocks.length + '개')}`);
  console.log(`    예상 공수:  ${chalk.cyan(totalDays + '일')}`);
  console.log();
  console.log(chalk.dim('  생성 파일:'));
  console.log(chalk.dim('    .forge/project/contracts.yml   — API 계약 스켈레톤'));
  console.log(chalk.dim('    .forge/project/build-prompt.md — 코드 생성 프롬프트'));
  console.log();
  console.log(chalk.bold('  다음 단계:'));

  if (buildMode === 'unified') {
    console.log(chalk.dim('    1. ') + chalk.white('build-prompt.md') + chalk.dim(' 전체를 Claude에 붙여넣으세요.'));
    console.log(chalk.dim('    2. 생성된 코드를 ') + chalk.white('.forge/generated/src/') + chalk.dim('에 저장하세요.'));
  } else {
    console.log(chalk.dim('    1. ') + chalk.white('build-prompt.md') + chalk.dim('를 열면 블럭별 구분이 되어 있습니다.'));
    console.log(chalk.dim('    2. ') + chalk.bold('--- BLOCK:') + chalk.dim(' 구분선 단위로 하나씩 Claude에 붙여넣으세요.'));
    console.log(chalk.dim('    3. 생성된 코드를 블럭별로 ') + chalk.white('.forge/generated/src/') + chalk.dim('에 저장하세요.'));
  }
  console.log();
  console.log(chalk.dim('  💡 Forge Pro에서는 이 과정이 자동으로 진행됩니다.'));
  console.log();
}

// ── API 계약 스켈레톤 생성 ───────────────────────────

function buildContracts(blocks, techStack) {
  const apis = blocks
    .map(block => {
      const style = inferApiStyle(block);
      // internal 블럭은 REST 엔드포인트 없음 → contracts 에서 제외
      if (style === 'internal') return null;
      const basePath = toResourcePath(block.id);
      // auth·payment 같은 특수 패턴은 shared 모듈이 절대 경로를 반환하므로
      // 그대로 쓰되, 표시용 base_path 는 절대 경로와 일치시킨다.
      const endpoints = inferEndpointsShared(block);
      return {
        block_id: block.id,
        block_name: block.name,
        base_path: basePath,
        api_style: style,
        endpoints: endpoints.map(e => ({
          method: e.method,
          path: e.path,
          description: e.description,
        })),
      };
    })
    .filter(Boolean);

  return {
    generated_at: new Date().toISOString(),
    tech_stack: techStack,
    apis,
  };
}

// ── 통합 프롬프트 빌더 ───────────────────────────────

function buildUnifiedPrompt(blocks, techStack, contracts, intent, phase) {
  const blockDetails = blocks.map(b =>
    `### ${b.name} (${b.id})\n- **일반 설명**: ${b.user_desc ?? ''}\n- **기술 명세**: ${b.tech_desc ?? ''}\n- **예상 공수**: ${b.effort_days ?? 0}일`
  ).join('\n\n');

  const contractSummary = contracts.apis.map(api =>
    `- **${api.block_name}** (\`${api.base_path}\`): ${api.endpoints.map(e => `${e.method} ${e.path || '/'}`).join(', ')}`
  ).join('\n');

  const techSummary = Object.entries(techStack)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  return `# Forge Protocol — 코드 생성 프롬프트 (${phase})

> \`forge forge\`가 자동 생성했습니다.
> 아래 전체 내용을 Claude에 붙여넣으세요.

---

## System Prompt

당신은 시니어 풀스택 개발자입니다.
Forge Protocol의 블럭 명세와 아키텍처 결정을 바탕으로 실제 동작하는 코드를 생성하세요.

### 코드 생성 원칙

1. **계약 우선**: API 엔드포인트 시그니처를 먼저 정의하고, 구현은 그 계약을 따른다.
2. **레이어 분리**: Controller → Service → Repository 레이어를 명확히 분리한다.
3. **즉시 실행 가능**: 생성된 코드는 복사 후 최소한의 설정으로 실행 가능해야 한다.
4. **테스트 고려**: 각 Service 메서드에 단위 테스트 가능한 구조로 작성한다.
5. **한국어 주석**: 핵심 비즈니스 로직에는 한국어 주석 포함.

### 출력 형식

각 블럭마다 다음 순서로 코드를 생성하세요:

\`\`\`
1. Entity / Model 클래스
2. Repository 인터페이스
3. Service 클래스 (핵심 비즈니스 로직)
4. Controller / Router (API 엔드포인트)
5. DTO / Request-Response 객체
\`\`\`

파일명 규칙: \`{BlockName}{Layer}.{ext}\` (예: \`ProductService.java\`, \`product.service.ts\`)

---

## 기술 스택

${techSummary}

## API 계약 (자동 생성 스켈레톤)

${contractSummary}

---

## 블럭별 명세 (${blocks.length}개)

${blockDetails}

---

## 생성 요청

위 ${blocks.length}개 블럭의 코드를 순서대로 생성해주세요.

각 블럭 코드 앞에 반드시 다음 헤더를 붙여주세요:
\`\`\`
// ═══════════════════════════════
// BLOCK: {block_id}
// ═══════════════════════════════
\`\`\`

추가 요청사항:
- 블럭 간 의존 관계가 있는 경우 (예: Order → Payment) 인터페이스로 의존성을 역전시켜 주세요.
- 상태 머신이 필요한 블럭(Order, Payment 등)은 상태 전이 로직을 명확히 표현해주세요.
- 동시성 처리가 필요한 블럭(재고, 예약 등)은 Lock 전략을 코드에 반영해주세요.
`;
}

// ── 블럭별 분리 프롬프트 빌더 ───────────────────────

function buildPerBlockPrompt(blocks, techStack, contracts, intent, phase) {
  const techSummary = Object.entries(techStack)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const header = `# Forge Protocol — 블럭별 코드 생성 프롬프트 (${phase})

> \`forge forge\`가 자동 생성했습니다.
> \`--- BLOCK:\` 구분선 단위로 하나씩 Claude에 붙여넣으세요.
> 앞 블럭의 코드를 참고해야 하는 경우, 이전 결과를 함께 붙여넣으세요.

## 공통 컨텍스트 (모든 블럭 프롬프트 앞에 포함)

### 기술 스택
${techSummary}

### 코드 생성 원칙
- Controller → Service → Repository 레이어 분리
- 각 블럭은 독립적으로 테스트 가능한 구조
- 한국어 주석, 즉시 실행 가능한 코드
- 파일명: \`{BlockName}{Layer}.{ext}\`

---
`;

  const blockPrompts = blocks.map((block, i) => {
    const contract = contracts.apis.find(a => a.block_id === block.id);
    const endpointList = contract?.endpoints
      .map(e => `  - ${e.method.padEnd(6)} ${contract.base_path}${e.path} — ${e.description}`)
      .join('\n') ?? '';

    return `
--- BLOCK: ${block.id} (${i + 1}/${blocks.length}) ---

## ${block.name}

**일반 설명**: ${block.user_desc ?? ''}

**기술 명세**: ${block.tech_desc ?? ''}

**API 엔드포인트**:
${endpointList}

**생성 요청**:
위 명세를 바탕으로 \`${block.name}\` 블럭의 전체 코드를 생성해주세요.
Entity → Repository → Service → Controller → DTO 순서로 작성하세요.
`;
  }).join('\n');

  return header + blockPrompts;
}
