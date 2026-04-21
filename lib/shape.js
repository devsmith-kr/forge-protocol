import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { loadState, loadSmeltResult, saveState, saveYaml, printDone } from './core/project.js';
import { commandHeader } from './core/ui.js';
import { FEATURE_DETECTORS, detectFeatures } from './constants.js';

/**
 * forge shape
 * Phase 2: 성형 — 블럭 구성을 바탕으로 아키텍처를 결정한다.
 *
 * 플로우:
 *   1. intent.yml + selected-blocks.yml 읽기
 *   2. 블럭 특성 분석 (결제/실시간/파일업로드 등 기술 결정 영향 요소 감지)
 *   3. 핵심 아키텍처 결정 질문 (인터랙티브)
 *   4. architecture.yml + architecture-prompt.md 생성
 */
export async function runShape() {
  const projectDir = process.cwd();
  const forgeDir = join(projectDir, '.forge');

  // ── 선행 파일 확인 ──
  const state = await loadState(forgeDir);
  if (!state) return;

  const smelt = await loadSmeltResult(forgeDir);
  if (!smelt) return;
  const { intent, selectedBlocks } = smelt;

  const blocks = selectedBlocks?.blocks ?? [];
  const blockIds = new Set(blocks.map(b => b.id));

  console.log();
  console.log(commandHeader(state, 'Shape  (Phase 2: 성형)'));
  console.log(chalk.dim(`  선택된 블럭 ${blocks.length}개를 분석하여 기술 스택을 결정합니다.`));
  console.log();

  // ── 블럭 특성 자동 감지 ──
  const spinner = ora('블럭 특성 분석 중...').start();
  const features = detectFeatures(blockIds);
  spinner.succeed(`특성 감지 완료 — ${features.map(f => f.label).join(', ')}`);
  console.log();

  // ── 아키텍처 결정 질문 ──
  console.log(chalk.bold.blue('  아키텍처 결정'));
  console.log(chalk.dim('  선택한 블럭 조합에 맞는 기술 스택을 결정합니다.'));
  console.log(chalk.dim('  모르는 항목은 "추천대로"를 선택하세요. AI가 최적안을 설명합니다.'));
  console.log();

  const decisions = {};

  // 1. 백엔드 언어/프레임워크
  const { backend } = await inquirer.prompt([{
    type: 'list',
    name: 'backend',
    message: '백엔드 언어/프레임워크는?',
    choices: [
      { name: 'Spring Boot (Java/Kotlin) — 엔터프라이즈, 안정성', value: 'spring-boot' },
      { name: 'Node.js (Express/Fastify) — 빠른 개발, JS 풀스택', value: 'nodejs' },
      { name: 'Node.js (NestJS) — 구조화된 Node.js', value: 'nestjs' },
      { name: 'Django (Python) — 빠른 프로토타입', value: 'django' },
      { name: 'FastAPI (Python) — API 중심, 고성능', value: 'fastapi' },
      { name: '추천대로 (AI가 결정)', value: 'ai-recommend' },
    ],
  }]);
  decisions.backend = backend;
  console.log();

  // 2. 프론트엔드
  const { frontend } = await inquirer.prompt([{
    type: 'list',
    name: 'frontend',
    message: '프론트엔드는?',
    choices: [
      { name: 'Next.js (React SSR) — SEO 필요한 서비스', value: 'nextjs' },
      { name: 'React (SPA) — 관리자/대시보드 중심', value: 'react' },
      { name: 'Vue.js — 간단하고 빠른 개발', value: 'vue' },
      { name: 'Flutter (앱 포함) — 웹+모바일 동시', value: 'flutter' },
      { name: '프론트엔드 없음 (API만)', value: 'none' },
      { name: '추천대로 (AI가 결정)', value: 'ai-recommend' },
    ],
  }]);
  decisions.frontend = frontend;
  console.log();

  // 3. 데이터베이스
  const { database } = await inquirer.prompt([{
    type: 'list',
    name: 'database',
    message: '메인 데이터베이스는?',
    choices: [
      { name: 'PostgreSQL — 범용, 안정적', value: 'postgresql' },
      { name: 'MySQL — 커머스/웹 전통적 선택', value: 'mysql' },
      { name: 'MongoDB — 유연한 스키마, NoSQL', value: 'mongodb' },
      { name: '추천대로 (AI가 결정)', value: 'ai-recommend' },
    ],
  }]);
  decisions.database = database;
  console.log();

  // 4. 배포 환경
  const { deploy } = await inquirer.prompt([{
    type: 'list',
    name: 'deploy',
    message: '배포 환경은?',
    choices: [
      { name: 'AWS — 국내 표준, 확장성', value: 'aws' },
      { name: 'GCP — AI/ML 연동, Firebase', value: 'gcp' },
      { name: 'Azure — 기업/공공', value: 'azure' },
      { name: 'Vercel + Supabase — 빠른 시작, 소규모', value: 'vercel-supabase' },
      { name: '온프레미스 (서버 직접 운영)', value: 'on-premise' },
      { name: '추천대로 (AI가 결정)', value: 'ai-recommend' },
    ],
  }]);
  decisions.deploy = deploy;
  console.log();

  // 5. 감지된 특성에 따른 추가 질문
  const additionalDecisions = await askFeatureQuestions(features, blockIds);
  Object.assign(decisions, additionalDecisions);

  // ── 결과 확인 ──
  console.log(chalk.dim('  ─'.repeat(25)));
  console.log(chalk.bold('  결정 요약:'));
  console.log();
  printDecision('백엔드', decisions.backend);
  printDecision('프론트엔드', decisions.frontend);
  printDecision('데이터베이스', decisions.database);
  printDecision('배포', decisions.deploy);
  for (const [key, val] of Object.entries(additionalDecisions)) {
    printDecision(key, val);
  }
  console.log();

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: '이 결정으로 architecture.yml과 AI 프롬프트를 생성할까요?',
    default: true,
  }]);

  if (!confirm) {
    console.log(chalk.yellow('  취소했습니다.'));
    return;
  }

  // ── 파일 생성 ──
  const genSpinner = ora('파일 생성 중...').start();

  // architecture.yml
  const architecture = {
    phase: 'shape',
    created_at: new Date().toISOString(),
    tech_stack: decisions,
    detected_features: features.map(f => f.id),
    adr: buildADR(decisions, features),
  };

  await saveYaml(forgeDir, 'architecture.yml', architecture);

  // architecture-prompt.md (AI에 붙여넣기용)
  const prompt = buildArchitecturePrompt(intent, selectedBlocks, decisions, features);
  await writeFile(
    join(forgeDir, 'project', 'architecture-prompt.md'),
    prompt,
    'utf-8'
  );

  // state.yml 업데이트
  state.phase = 'shape';
  await saveState(forgeDir, state);

  genSpinner.succeed('파일 생성 완료');

  // ── 완료 메시지 ──
  console.log();
  console.log(chalk.green.bold('  ✅ Shape 완료!'));
  console.log();
  console.log(chalk.dim('  생성 파일:'));
  console.log(chalk.dim('    .forge/project/architecture.yml       — 결정된 기술 스택 + ADR'));
  console.log(chalk.dim('    .forge/project/architecture-prompt.md — AI 아키텍처 설계 프롬프트'));
  console.log();
  console.log(chalk.bold('  다음 단계:'));
  console.log(chalk.dim('    1. ') + chalk.white('architecture-prompt.md') + chalk.dim(' 내용을 Claude에 붙여넣으세요.'));
  console.log(chalk.dim('    2. AI가 생성한 상세 아키텍처를 검토하세요.'));
  console.log(chalk.dim('    3. ') + chalk.cyan('forge build') + chalk.dim(' — API 계약 + 코드 생성 프롬프트'));
  console.log();
}

// ── 특성별 추가 질문 ──────────────────────────────────

async function askFeatureQuestions(features, blockIds) {
  const decisions = {};
  const featureIds = new Set(features.map(f => f.id));

  if (featureIds.has('search')) {
    console.log(chalk.dim('  [검색 기능 감지]'));
    const { search } = await inquirer.prompt([{
      type: 'list',
      name: 'search',
      message: '검색 구현 방식은?',
      choices: [
        { name: 'Elasticsearch — 대용량, 자동완성, 오타 보정', value: 'elasticsearch' },
        { name: 'DB Full-text Search — 간단, 소규모', value: 'db-fulltext' },
        { name: 'Typesense — Elasticsearch 대안, 쉬운 설정', value: 'typesense' },
        { name: '추천대로', value: 'ai-recommend' },
      ],
    }]);
    decisions['검색엔진'] = search;
    console.log();
  }

  if (featureIds.has('realtime')) {
    console.log(chalk.dim('  [실시간 기능 감지]'));
    const { realtime } = await inquirer.prompt([{
      type: 'list',
      name: 'realtime',
      message: '실시간 통신 방식은?',
      choices: [
        { name: 'WebSocket — 양방향, 채팅/알림', value: 'websocket' },
        { name: 'SSE (Server-Sent Events) — 단방향 푸시, 간단', value: 'sse' },
        { name: 'Polling — 가장 단순, 실시간성 낮음', value: 'polling' },
        { name: '추천대로', value: 'ai-recommend' },
      ],
    }]);
    decisions['실시간통신'] = realtime;
    console.log();
  }

  if (featureIds.has('concurrency')) {
    console.log(chalk.dim('  [동시성 처리 감지 — 재고/예약 충돌 방지]'));
    const { lock } = await inquirer.prompt([{
      type: 'list',
      name: 'lock',
      message: '동시성 제어 방식은?',
      choices: [
        { name: 'Optimistic Lock (DB @Version) — 충돌 드문 경우', value: 'optimistic' },
        { name: 'Pessimistic Lock (SELECT FOR UPDATE) — 충돌 잦은 경우', value: 'pessimistic' },
        { name: 'Redis 분산 락 — 다중 서버 환경', value: 'redis-lock' },
        { name: '추천대로', value: 'ai-recommend' },
      ],
    }]);
    decisions['동시성제어'] = lock;
    console.log();
  }

  if (featureIds.has('payment')) {
    console.log(chalk.dim('  [결제 기능 감지]'));
    const { pg } = await inquirer.prompt([{
      type: 'list',
      name: 'pg',
      message: 'PG사는?',
      choices: [
        { name: '토스페이먼츠 — 국내 점유율 1위, 문서 좋음', value: 'toss' },
        { name: '이니시스 — 전통적, B2B 강세', value: 'inicis' },
        { name: 'NHN KCP — 대기업 선호', value: 'kcp' },
        { name: '미정 (AI가 추천)', value: 'ai-recommend' },
      ],
    }]);
    decisions['PG사'] = pg;
    console.log();
  }

  return decisions;
}

// ── ADR 생성 ──────────────────────────────────────────

function buildADR(decisions, features) {
  const adrs = [];

  if (decisions.backend !== 'ai-recommend') {
    adrs.push({
      id: 'ADR-001',
      title: '백엔드 프레임워크 선택',
      decision: decisions.backend,
      status: 'accepted',
    });
  }

  if (decisions.database !== 'ai-recommend') {
    adrs.push({
      id: 'ADR-002',
      title: '데이터베이스 선택',
      decision: decisions.database,
      status: 'accepted',
    });
  }

  features.forEach((f, i) => {
    adrs.push({
      id: `ADR-00${3 + i}`,
      title: `${f.label} 처리 전략`,
      context: f.note,
      status: 'pending-ai-detail',
    });
  });

  return adrs;
}

// ── AI 프롬프트 빌더 ──────────────────────────────────

function buildArchitecturePrompt(intent, selectedBlocks, decisions, features) {
  const blockList = (selectedBlocks?.blocks ?? [])
    .map(b => `- ${b.name} (${b.effort_days}일)`)
    .join('\n');

  const decisionList = Object.entries(decisions)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const featureList = features
    .map(f => `- ${f.label}: ${f.note}`)
    .join('\n');

  return `# Forge Protocol — 아키텍처 설계 프롬프트

> \`forge shape\`가 자동 생성했습니다.
> 아래 내용을 Claude에 붙여넣으면 상세 아키텍처가 생성됩니다.

---

## System Prompt

당신은 시니어 소프트웨어 아키텍트입니다.
Forge Protocol의 selected-blocks.yml과 기술 결정사항을 바탕으로 상세 아키텍처를 설계하세요.

### 출력 형식

다음 섹션을 순서대로 작성하세요:

1. **전체 아키텍처 다이어그램** (텍스트 기반 ASCII)
2. **레이어별 설계**
   - API 레이어 (엔드포인트 목록, RESTful 규칙)
   - 서비스 레이어 (핵심 비즈니스 로직)
   - 데이터 레이어 (핵심 엔티티, 관계)
3. **감지된 기술 과제별 해결책** (각 항목당 구체적 구현 방법)
4. **ADR (Architecture Decision Records)** — 각 결정의 이유와 트레이드오프
5. **개발 우선순위** — 어떤 순서로 구현할지

### 설계 원칙

- 과도한 설계 금지. 현재 블럭 수준에 맞는 적정 복잡도.
- 각 결정에 트레이드오프 명시 (왜 이 선택인가, 언제 바꿔야 하는가).
- "나중에 확장하면 되니까"로 현재 결정을 미루지 말 것.
- 한국어로 작성. 기술 용어는 영어 그대로.

---

## User Message

### 선택된 블럭 (${selectedBlocks?.blocks?.length ?? 0}개, 총 ${selectedBlocks?.total_effort_days ?? 0}일)

${blockList}

### 기술 결정사항

${decisionList}

### 자동 감지된 기술 과제

${featureList || '(없음)'}

### 추가 요청사항

- 각 블럭의 핵심 API 엔드포인트를 최소 1개씩 명시해주세요.
- 데이터 모델에서 가장 복잡한 관계(N:M, 상태머신 등)를 집중 설명해주세요.
- 결제/인증/동시성 처리는 반드시 구체적인 코드 패턴을 포함해주세요.
- 초기 배포 아키텍처(최소 비용으로 시작하는 방법)도 포함해주세요.
`;
}

function printDecision(label, value) {
  const display = value === 'ai-recommend' ? chalk.dim('AI 추천') : chalk.cyan(value);
  console.log(`    ${chalk.bold(label + ':')} ${display}`);
}
