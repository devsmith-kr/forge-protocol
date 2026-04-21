import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { loadProjectCatalog, buildBlockMap } from './catalog.js';
import {
  loadState,
  loadArchitecture,
  loadContracts,
  loadTestScenarios,
  loadYaml,
  saveState,
  saveYaml,
} from './core/project.js';
import { SelectedBlocksSchema } from './schemas.js';
import { commandHeader } from './core/ui.js';
import { detectFeatures, getRiskBlockIds, isRiskBlock } from './constants.js';

/**
 * forge temper
 * Phase 4: 담금질 — 선택된 블럭과 아키텍처를 바탕으로
 * Given-When-Then 테스트 시나리오와 테스트 코드 프롬프트를 생성한다.
 *
 * 플로우:
 *   1. contracts.yml + architecture.yml + selected-blocks.yml 읽기
 *   2. 테스트 범위 선택 (전체 or 블럭별)
 *   3. 테스트 유형 선택 (단위/통합/E2E)
 *   4. test-scenarios.yml + temper-prompt.md 생성
 */
export async function runTemper() {
  const projectDir = process.cwd();
  const forgeDir = join(projectDir, '.forge');

  // ── 선행 파일 확인 ──
  const state = await loadState(forgeDir);
  if (!state) return;

  const architecture = await loadArchitecture(forgeDir);
  if (!architecture) return;

  let selectedBlocks;
  try {
    selectedBlocks = await loadYaml(forgeDir, 'selected-blocks.yml', SelectedBlocksSchema);
  } catch {
    console.log();
    console.log(chalk.yellow('  selected-blocks.yml이 없습니다. 먼저 Smelt를 실행하세요.'));
    console.log(chalk.dim('  ') + chalk.cyan('forge smelt'));
    return;
  }

  const contracts = await loadContracts(forgeDir);
  if (!contracts) {
    console.log();
    console.log(chalk.yellow('  contracts.yml이 없습니다. 먼저 Build를 실행하세요.'));
    console.log(chalk.dim('  ') + chalk.cyan('forge build'));
    return;
  }

  const catalog = await loadProjectCatalog(projectDir);
  const blockMap = buildBlockMap(catalog);

  const blocks = selectedBlocks?.blocks ?? [];
  const techStack = architecture?.tech_stack ?? {};
  const detectedFeatures = new Set(architecture?.detected_features ?? []);

  console.log();
  console.log(commandHeader(state, 'Temper  (Phase 4: 담금질)'));
  console.log(chalk.dim(`  ${blocks.length}개 블럭 → Given-When-Then 시나리오 + 테스트 프롬프트`));
  console.log();

  // ── 테스트 유형 선택 ──
  console.log(chalk.bold.blue('  테스트 전략'));
  console.log();

  const { testTypes } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'testTypes',
    message: '생성할 테스트 유형을 선택하세요:',
    choices: [
      { name: '단위 테스트 (Service 레이어 비즈니스 로직)', value: 'unit', checked: true },
      { name: '통합 테스트 (API 엔드포인트 + DB)', value: 'integration', checked: true },
      { name: 'E2E 테스트 (핵심 사용자 시나리오)', value: 'e2e', checked: false },
    ],
    validate: v => v.length > 0 ? true : '최소 하나는 선택해야 합니다.',
  }]);
  console.log();

  // ── 테스트 집중 블럭 선택 ──
  const { focusMode } = await inquirer.prompt([{
    type: 'list',
    name: 'focusMode',
    message: '어떤 블럭에 집중할까요?',
    choices: [
      { name: '전체 블럭 (모든 블럭의 핵심 시나리오 생성)', value: 'all' },
      { name: '리스크 높은 블럭만 (결제/동시성/인증 중심)', value: 'risk' },
      { name: '직접 선택', value: 'pick' },
    ],
  }]);
  console.log();

  let targetBlocks;

  if (focusMode === 'all') {
    targetBlocks = blocks;
  } else if (focusMode === 'risk') {
    const riskIds = new Set(getRiskBlockIds(detectedFeatures));
    targetBlocks = blocks.filter(b => riskIds.has(b.id) || isRiskBlock(b.id));
    if (targetBlocks.length === 0) targetBlocks = blocks;
    console.log(chalk.dim(`  리스크 블럭 ${targetBlocks.length}개 선택됨: ${targetBlocks.map(b => b.name).join(', ')}`));
    console.log();
  } else {
    const { picked } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'picked',
      message: '테스트를 생성할 블럭을 선택하세요:',
      choices: blocks.map(b => ({ name: `${b.name} (${b.effort_days}일)`, value: b.id, checked: false })),
      validate: v => v.length > 0 ? true : '최소 하나는 선택해야 합니다.',
    }]);
    targetBlocks = blocks.filter(b => picked.includes(b.id));
    console.log();
  }

  // ── 시나리오 생성 ──
  const spinner = ora('테스트 시나리오 분석 중...').start();

  const scenarios = generateScenarios(targetBlocks, contracts, detectedFeatures, blockMap);

  spinner.succeed(`${scenarios.length}개 블럭, ${countTotalCases(scenarios)}개 테스트 케이스 생성`);
  console.log();

  // 요약 미리보기
  console.log(chalk.bold('  시나리오 미리보기:'));
  console.log();
  for (const s of scenarios.slice(0, 5)) {
    console.log(`  ${chalk.cyan(s.block_name)}`);
    for (const tc of s.test_cases.slice(0, 2)) {
      console.log(chalk.dim(`    • ${tc.name}`));
    }
    if (s.test_cases.length > 2) {
      console.log(chalk.dim(`    + ${s.test_cases.length - 2}개 더...`));
    }
  }
  if (scenarios.length > 5) {
    console.log(chalk.dim(`  ... 외 ${scenarios.length - 5}개 블럭`));
  }
  console.log();

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'test-scenarios.yml과 테스트 프롬프트를 생성할까요?',
    default: true,
  }]);

  if (!confirm) {
    console.log(chalk.yellow('  취소했습니다.'));
    return;
  }

  // ── 파일 생성 ──
  const genSpinner = ora('파일 생성 중...').start();

  await mkdir(join(forgeDir, 'generated', 'test'), { recursive: true });

  // test-scenarios.yml
  const testScenariosData = {
    phase: 'temper',
    generated_at: new Date().toISOString(),
    tech_stack: techStack,
    test_types: testTypes,
    total_blocks: targetBlocks.length,
    total_cases: countTotalCases(scenarios),
    scenarios,
  };
  await saveYaml(forgeDir, 'test-scenarios.yml', testScenariosData);

  // temper-prompt.md
  const prompt = buildTemperPrompt(scenarios, techStack, testTypes, contracts);
  await writeFile(
    join(forgeDir, 'project', 'temper-prompt.md'),
    prompt,
    'utf-8'
  );

  // state 업데이트
  state.phase = 'temper';
  await saveState(forgeDir, state);

  genSpinner.succeed('파일 생성 완료');

  // ── 완료 메시지 ──
  console.log();
  console.log(chalk.green.bold('  ✅ Temper 완료!'));
  console.log();
  console.log(chalk.bold('  결과:'));
  console.log(`    대상 블럭:    ${chalk.cyan(targetBlocks.length + '개')}`);
  console.log(`    테스트 케이스: ${chalk.cyan(countTotalCases(scenarios) + '개')}`);
  console.log(`    테스트 유형:  ${chalk.cyan(testTypes.join(', '))}`);
  console.log();
  console.log(chalk.dim('  생성 파일:'));
  console.log(chalk.dim('    .forge/project/test-scenarios.yml — Given-When-Then 시나리오 정의'));
  console.log(chalk.dim('    .forge/project/temper-prompt.md   — 테스트 코드 생성 프롬프트'));
  console.log();
  console.log(chalk.bold('  다음 단계:'));
  console.log(chalk.dim('    1. ') + chalk.white('temper-prompt.md') + chalk.dim(' 내용을 Claude에 붙여넣으세요.'));
  console.log(chalk.dim('    2. 생성된 테스트 코드를 ') + chalk.white('.forge/generated/test/') + chalk.dim('에 저장하세요.'));
  console.log(chalk.dim('    3. ') + chalk.cyan('forge inspect') + chalk.dim(' — 보안/성능/운영/확장성 멀티 관점 리뷰'));
  console.log();
}

// ── 시나리오 생성 엔진 ───────────────────────────────

function generateScenarios(blocks, contracts, detectedFeatures, blockMap) {
  return blocks.map(block => {
    const catalogBlock = blockMap.get(block.id);
    const contract = contracts?.apis?.find(a => a.block_id === block.id);
    const testCases = buildTestCases(block, catalogBlock, contract, detectedFeatures);

    return {
      block_id: block.id,
      block_name: block.name,
      base_path: contract?.base_path ?? '',
      risk_level: getRiskLevel(block.id, detectedFeatures),
      test_cases: testCases,
    };
  });
}

function getRiskLevel(blockId, detectedFeatures) {
  if (blockId.includes('payment') || blockId.includes('refund')) return 'high';
  if (blockId.includes('inventory') || blockId.includes('cart') || blockId.includes('order')) return 'high';
  if (blockId.includes('auth') || blockId.includes('signup')) return 'medium';
  if (blockId.includes('notification') || blockId.includes('search')) return 'medium';
  return 'low';
}

function buildTestCases(block, catalogBlock, contract, detectedFeatures) {
  const id = block.id ?? '';
  const cases = [];

  // 공통: 정상 흐름 (Happy Path)
  cases.push({
    name: `[Happy Path] ${block.name} 정상 동작`,
    type: 'unit',
    given: `${block.name} 서비스가 초기화되어 있고, 유효한 요청 데이터가 준비된 상태`,
    when: `${block.name}의 핵심 기능을 호출한다`,
    then: `기대 결과가 반환되고 상태가 올바르게 변경된다`,
    priority: 'must',
  });

  // 패턴별 특화 케이스
  if (id.includes('signup') || id.includes('auth')) {
    cases.push(
      {
        name: '[Auth] 중복 이메일 가입 차단',
        type: 'unit',
        given: '이미 가입된 이메일이 DB에 존재한다',
        when: '동일 이메일로 회원가입을 시도한다',
        then: 'DuplicateEmailException 발생, HTTP 409 반환',
        priority: 'must',
      },
      {
        name: '[Auth] 잘못된 비밀번호로 로그인 실패',
        type: 'unit',
        given: '가입된 계정이 존재한다',
        when: '잘못된 비밀번호로 로그인을 시도한다',
        then: 'InvalidCredentialsException 발생, HTTP 401 반환, 시도 횟수 증가',
        priority: 'must',
      },
      {
        name: '[Auth] 만료된 토큰으로 API 호출 차단',
        type: 'integration',
        given: '만료된 JWT Access Token이 있다',
        when: '인증이 필요한 API를 호출한다',
        then: 'HTTP 401 반환, refresh 엔드포인트 안내',
        priority: 'must',
      },
    );
  }

  if (id.includes('payment') || id.includes('refund')) {
    cases.push(
      {
        name: '[Payment] 결제 성공 후 재고 차감 확인',
        type: 'integration',
        given: '재고가 5개 남은 상품이 존재하고, 유효한 결제 수단이 준비됐다',
        when: '2개 수량을 결제한다',
        then: '결제 성공, 재고 3개로 감소, 주문 상태 PAID로 변경',
        priority: 'must',
      },
      {
        name: '[Payment] 동일 주문 중복 결제 방지 (멱등성)',
        type: 'integration',
        given: '이미 처리 완료된 주문 ID가 있다',
        when: '동일 주문 ID로 결제를 재요청한다',
        then: '이전 결제 결과를 그대로 반환, 이중 청구 없음',
        priority: 'must',
      },
      {
        name: '[Refund] 부분 환불 후 정산 금액 검증',
        type: 'integration',
        given: '10,000원 결제 완료 주문이 있다',
        when: '3,000원 부분 환불을 요청한다',
        then: '환불 7,000원 정산 예정, 환불 상태 PARTIAL_REFUNDED',
        priority: 'should',
      },
    );
  }

  if (id.includes('inventory') || detectedFeatures.has('concurrency') && id.includes('cart')) {
    cases.push(
      {
        name: '[Concurrency] 재고 1개에 동시 주문 2건 — 1건만 성공',
        type: 'integration',
        given: '재고가 정확히 1개인 상품이 있다',
        when: '서로 다른 사용자가 동시에 해당 상품을 주문한다',
        then: '1건만 성공(재고 0), 나머지 1건은 OutOfStockException 발생',
        priority: 'must',
      },
      {
        name: '[Concurrency] Optimistic Lock 충돌 시 재시도 동작 확인',
        type: 'unit',
        given: '@Version이 설정된 Stock 엔티티가 있다',
        when: '동시에 재고를 수정하여 버전 충돌이 발생한다',
        then: 'ObjectOptimisticLockingFailureException 발생, 최대 1회 재시도 후 처리',
        priority: 'must',
      },
    );
  }

  if (id.includes('order')) {
    cases.push(
      {
        name: '[Order] 주문 상태 머신 전이 검증',
        type: 'unit',
        given: '주문이 PENDING 상태이다',
        when: '결제 완료 이벤트가 발생한다',
        then: '주문 상태가 PAID로 전이, 배송 준비 이벤트 발행',
        priority: 'must',
      },
      {
        name: '[Order] 불가능한 상태 전이 차단',
        type: 'unit',
        given: '주문이 DELIVERED 상태이다',
        when: '결제 취소를 시도한다',
        then: 'InvalidStateTransitionException 발생, 상태 변경 없음',
        priority: 'must',
      },
    );
  }

  if (id.includes('search')) {
    cases.push(
      {
        name: '[Search] 빈 쿼리 검색 결과 처리',
        type: 'unit',
        given: '검색 서비스가 준비됐다',
        when: '빈 문자열 또는 공백만으로 검색한다',
        then: '빈 결과 또는 추천 상품 목록 반환, 에러 없음',
        priority: 'should',
      },
      {
        name: '[Search] XSS 공격 쿼리 방어',
        type: 'unit',
        given: '검색 API가 노출되어 있다',
        when: '<script>alert(1)</script> 같은 악성 쿼리를 입력한다',
        then: '쿼리가 이스케이프되어 안전하게 처리, 결과 0건 반환',
        priority: 'must',
      },
    );
  }

  if (id.includes('cart')) {
    cases.push(
      {
        name: '[Cart] 품절 상품 장바구니 담기 차단',
        type: 'unit',
        given: '재고가 0인 상품이 있다',
        when: '해당 상품을 장바구니에 담으려 한다',
        then: 'OutOfStockException 발생, 장바구니 변경 없음',
        priority: 'must',
      },
    );
  }

  // 공통: 입력값 유효성 검사
  cases.push({
    name: `[Validation] ${block.name} 필수값 누락 요청 거부`,
    type: 'unit',
    given: `${block.name} API가 준비됐다`,
    when: '필수 필드가 누락된 요청을 전송한다',
    then: 'HTTP 400 반환, 누락된 필드 명시, DB 변경 없음',
    priority: 'must',
  });

  return cases;
}

function countTotalCases(scenarios) {
  return scenarios.reduce((sum, s) => sum + s.test_cases.length, 0);
}

// ── 테스트 프롬프트 빌더 ─────────────────────────────

function buildTemperPrompt(scenarios, techStack, testTypes, contracts) {
  const backend = techStack.backend ?? 'spring-boot';
  const database = techStack.database ?? 'postgresql';

  const frameworkGuide = getTestFrameworkGuide(backend);

  const scenarioBlocks = scenarios.map(s => {
    const cases = s.test_cases.map(tc =>
      `#### ${tc.name}\n- **Given**: ${tc.given}\n- **When**: ${tc.when}\n- **Then**: ${tc.then}\n- **Priority**: \`${tc.priority}\``
    ).join('\n\n');

    return `### ${s.block_name} (${s.block_id}) — 리스크: ${s.risk_level}\n\n${cases}`;
  }).join('\n\n---\n\n');

  const unitGuide = testTypes.includes('unit') ? `
#### 단위 테스트 규칙
- Service 클래스만 테스트. Repository는 Mockito로 모킹.
- 각 메서드당 정상/예외 케이스 최소 1개씩.
- \`@ExtendWith(MockitoExtension.class)\` 사용.
` : '';

  const integrationGuide = testTypes.includes('integration') ? `
#### 통합 테스트 규칙
- \`@SpringBootTest\` + Testcontainers(${database}) 사용.
- 각 테스트 전 DB 초기화 (\`@Transactional\` 또는 \`@Sql\`).
- API 테스트는 MockMvc 또는 RestAssured 사용.
` : '';

  const e2eGuide = testTypes.includes('e2e') ? `
#### E2E 테스트 규칙
- 핵심 사용자 시나리오 (회원가입 → 상품 검색 → 장바구니 → 결제) 흐름만.
- TestRestTemplate으로 실제 HTTP 요청.
- 외부 PG사는 Mock 서버로 대체.
` : '';

  return `# Forge Protocol — 테스트 코드 생성 프롬프트

> \`forge temper\`가 자동 생성했습니다.
> 아래 내용을 Claude에 붙여넣으면 테스트 코드가 생성됩니다.

---

## System Prompt

당신은 시니어 QA 엔지니어이자 테스트 전문가입니다.
Forge Protocol의 블럭 시나리오를 바탕으로 실제 실행 가능한 테스트 코드를 생성하세요.

### 기술 스택
- 백엔드: ${backend}
- 데이터베이스: ${database}
- 테스트 유형: ${testTypes.join(', ')}

${frameworkGuide}

${unitGuide}${integrationGuide}${e2eGuide}
### 출력 형식

각 테스트 클래스마다:
1. 파일명과 패키지 선언
2. 테스트 어노테이션 및 설정
3. Given-When-Then 구조를 메서드 이름과 주석으로 명확히 표현
4. 각 테스트 케이스 이름: \`given_상황_when_액션_then_결과\`

---

## User Message

### 테스트 시나리오 (총 ${countTotalCases(scenarios)}개 케이스)

${scenarioBlocks}

---

## 생성 요청

위 시나리오를 바탕으로 실제 실행 가능한 테스트 코드를 생성해주세요.

**추가 요청사항:**
- \`must\` 우선순위 케이스는 반드시 포함, \`should\`는 시간 허용 시 포함.
- 동시성 테스트는 \`ExecutorService\`로 멀티스레드 시뮬레이션.
- 결제 테스트는 PG사 웹훅 Mock 서버(\`MockWebServer\` 또는 WireMock) 포함.
- 각 테스트 파일 앞에 \`// === BLOCK: {block_id} ===\` 헤더 추가.
`;
}

function getTestFrameworkGuide(backend) {
  const guides = {
    'spring-boot': `### 테스트 프레임워크 (Spring Boot)
- 단위 테스트: JUnit 5 + Mockito
- 통합 테스트: @SpringBootTest + Testcontainers
- API 테스트: MockMvc (@WebMvcTest)
- 의존성: \`spring-boot-starter-test\`, \`testcontainers\``,

    'nestjs': `### 테스트 프레임워크 (NestJS)
- 단위 테스트: Jest + @nestjs/testing
- 통합 테스트: supertest + in-memory DB
- 모킹: jest.mock(), createMock<T>()`,

    'nodejs': `### 테스트 프레임워크 (Node.js)
- 단위 테스트: Jest + sinon
- 통합 테스트: supertest
- DB: jest-mongodb 또는 testcontainers-node`,

    'django': `### 테스트 프레임워크 (Django)
- 단위 테스트: pytest-django
- 통합 테스트: Django TestCase + test DB
- API 테스트: DRF APITestCase`,

    'fastapi': `### 테스트 프레임워크 (FastAPI)
- 단위 테스트: pytest + unittest.mock
- 통합 테스트: httpx.AsyncClient + SQLite in-memory`,
  };

  return guides[backend] ?? guides['spring-boot'];
}
