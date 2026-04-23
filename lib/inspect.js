import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import {
  loadState,
  loadArchitecture,
  loadContracts,
  loadTestScenarios,
  loadYaml,
  saveState,
} from './core/project.js';
import { SelectedBlocksSchema } from './schemas.js';
import { commandHeader } from './core/ui.js';
import { loadProjectCatalog, buildBlockMap } from './catalog.js';
import { collectConcerns, buildConcernFragments } from '../shared/concerns.js';

/**
 * forge inspect
 * Phase 5: 검수 — 보안 / 성능 / 운영 / 확장성 멀티 관점 리뷰
 *
 * 플로우:
 *   1. architecture.yml + contracts.yml + selected-blocks.yml 읽기
 *   2. 블럭/기술스택 기반 리스크 자동 감지
 *   3. 검토 관점 선택 (보안/성능/운영/확장성)
 *   4. forge-report.md + inspect-prompt.md 생성
 */
export async function runInspect() {
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
    console.log(chalk.yellow('  contracts.yml이 없습니다. 먼저 Forge를 실행하세요.'));
    console.log(chalk.dim('  ') + chalk.cyan('forge forge'));
    return;
  }

  // test-scenarios.yml은 있으면 참고, 없어도 진행
  const testScenarios = await loadTestScenarios(forgeDir);

  const blocks = selectedBlocks?.blocks ?? [];
  const techStack = architecture?.tech_stack ?? {};
  const detectedFeatures = new Set(architecture?.detected_features ?? []);

  console.log();
  console.log(commandHeader(state, 'Inspect  (Phase 5: 검수)'));
  console.log(chalk.dim(`  ${blocks.length}개 블럭 + 아키텍처를 4가지 관점에서 분석합니다.`));
  console.log();

  // ── 리스크 자동 감지 ──
  const spinner = ora('리스크 자동 감지 중...').start();
  const autoFindings = detectAutoFindings(blocks, techStack, detectedFeatures);
  const riskSummary = summarizeRisks(autoFindings);
  spinner.succeed(`감지 완료 — 위험 ${riskSummary.high}건, 주의 ${riskSummary.medium}건, 정보 ${riskSummary.low}건`);
  console.log();

  // 고위험 항목 미리 보여주기
  const highRisks = autoFindings.filter(f => f.severity === 'high');
  if (highRisks.length > 0) {
    console.log(chalk.red.bold('  ⚠️  고위험 항목:'));
    for (const r of highRisks) {
      console.log(`  ${chalk.red('●')} [${r.category}] ${r.title}`);
      console.log(chalk.dim(`      ${r.description}`));
    }
    console.log();
  }

  // ── 검토 관점 선택 ──
  console.log(chalk.bold.blue('  검토 관점 선택'));
  console.log(chalk.dim('  원하는 관점을 선택하세요. 선택된 관점만 상세 리뷰 프롬프트가 생성됩니다.'));
  console.log();

  const { perspectives } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'perspectives',
    message: '검토할 관점을 선택하세요:',
    choices: [
      {
        name: `🔐 보안 (Security) — 인증·주입·민감데이터·OWASP Top10  ${autoFindings.filter(f => f.category === 'security' && f.severity === 'high').length > 0 ? chalk.red('[⚠ 고위험]') : ''}`,
        value: 'security',
        checked: true,
      },
      {
        name: `⚡ 성능 (Performance) — N+1·캐싱·페이지네이션·인덱스  ${autoFindings.filter(f => f.category === 'performance' && f.severity === 'high').length > 0 ? chalk.red('[⚠ 고위험]') : ''}`,
        value: 'performance',
        checked: true,
      },
      {
        name: '🔧 운영 (Operations) — 로깅·모니터링·알럿·배포전략',
        value: 'operations',
        checked: true,
      },
      {
        name: `📈 확장성 (Scalability) — 단일장애점·DB병목·수평확장  ${autoFindings.filter(f => f.category === 'scalability' && f.severity === 'high').length > 0 ? chalk.red('[⚠ 고위험]') : ''}`,
        value: 'scalability',
        checked: false,
      },
    ],
    validate: v => v.length > 0 ? true : '최소 하나는 선택해야 합니다.',
  }]);
  console.log();

  // ── 리포트 상세 수준 선택 ──
  const { reportLevel } = await inquirer.prompt([{
    type: 'list',
    name: 'reportLevel',
    message: '리포트 상세 수준은?',
    choices: [
      { name: '요약 (핵심 항목만 — 빠른 검토)', value: 'summary' },
      { name: '표준 (발견사항 + 개선 방법 — 권장)', value: 'standard' },
      { name: '상세 (전체 체크리스트 + 코드 예시 포함)', value: 'detailed' },
    ],
    default: 'standard',
  }]);
  console.log();

  // ── 리포트 생성 ──
  const genSpinner = ora('리포트 생성 중...').start();

  const selectedFindings = autoFindings.filter(f => perspectives.includes(f.category));
  const checklistByPerspective = buildChecklist(blocks, techStack, detectedFeatures, perspectives);

  // forge-report.md
  const report = buildForgeReport(
    blocks, techStack, detectedFeatures, contracts,
    selectedFindings, checklistByPerspective, perspectives, reportLevel, testScenarios
  );
  await writeFile(
    join(forgeDir, 'project', 'forge-report.md'),
    report,
    'utf-8'
  );

  // inspect-prompt.md (AI에 붙여넣기용) — concerns 기반 조건부 섹션
  let concerns = new Set();
  try {
    const catalog = await loadProjectCatalog(projectDir);
    const blockMap = buildBlockMap(catalog);
    const fullBlocks = blocks.map(b => ({ ...(blockMap.get(b.id) || {}), ...b }));
    concerns = collectConcerns(fullBlocks);
  } catch {
    // 카탈로그 부재: legacy 휴리스틱 fallback
    concerns = collectConcerns(blocks);
  }
  const inspectPrompt = buildInspectPrompt(
    blocks, techStack, detectedFeatures, contracts,
    selectedFindings, checklistByPerspective, perspectives, reportLevel, concerns
  );
  await writeFile(
    join(forgeDir, 'project', 'inspect-prompt.md'),
    inspectPrompt,
    'utf-8'
  );

  // state 업데이트
  state.phase = 'inspect';
  await saveState(forgeDir, state);

  genSpinner.succeed('생성 완료');

  // ── 완료 메시지 ──
  const totalFindings = selectedFindings.length;
  const highCount = selectedFindings.filter(f => f.severity === 'high').length;
  const mediumCount = selectedFindings.filter(f => f.severity === 'medium').length;

  console.log();
  console.log(chalk.green.bold('  ✅ Inspect 완료!'));
  console.log();
  console.log(chalk.bold('  검수 결과:'));
  if (highCount > 0)   console.log(`    위험:  ${chalk.red.bold(highCount + '건')}`);
  if (mediumCount > 0) console.log(`    주의:  ${chalk.yellow(mediumCount + '건')}`);
  console.log(`    총 발견사항: ${chalk.cyan(totalFindings + '건')}`);
  console.log();
  console.log(chalk.dim('  생성 파일:'));
  console.log(chalk.dim('    .forge/project/forge-report.md    — 검수 리포트 (자체 검토용)'));
  console.log(chalk.dim('    .forge/project/inspect-prompt.md  — AI 상세 리뷰 프롬프트'));
  console.log();
  console.log(chalk.bold('  다음 단계:'));
  console.log(chalk.dim('    1. ') + chalk.white('forge-report.md') + chalk.dim(' 를 직접 검토하세요.'));
  console.log(chalk.dim('    2. ') + chalk.white('inspect-prompt.md') + chalk.dim(' 를 Claude에 붙여넣으면 상세 개선안이 제시됩니다.'));
  console.log(chalk.dim('    3. 위험 항목 해결 후 코드 구현을 시작하세요.'));
  console.log();
  if (highCount > 0) {
    console.log(chalk.red.bold('  ⚠️  고위험 항목이 있습니다. 구현 전 반드시 검토하세요.'));
    console.log();
  }
}

// ── 자동 리스크 감지 ────────────────────────────────

function detectAutoFindings(blocks, techStack, detectedFeatures) {
  const findings = [];
  const blockIds = new Set(blocks.map(b => b.id));
  const backend = techStack.backend ?? '';

  // 보안
  if (detectedFeatures.has('auth') || blockIds.has('buyer-signup')) {
    findings.push({
      category: 'security',
      severity: 'high',
      title: 'JWT Secret 하드코딩 위험',
      description: 'JWT 시크릿이 코드에 하드코딩되면 토큰 위조 가능. 환경변수 분리 필수.',
      fix: 'application.yml에서 ${JWT_SECRET} 환경변수로 분리, Vault/SSM 연동 권장',
    });
    findings.push({
      category: 'security',
      severity: 'high',
      title: 'Refresh Token 저장소 보안',
      description: 'Refresh Token을 DB에 저장할 때 평문 저장 시 DB 유출 시 전체 계정 탈취 가능.',
      fix: 'Refresh Token SHA-256 해시 저장, Redis TTL 관리, Rotation 전략 적용',
    });
    findings.push({
      category: 'security',
      severity: 'medium',
      title: '로그인 실패 횟수 제한 (Rate Limiting) 미적용 시 Brute Force 가능',
      description: '횟수 제한 없이 비밀번호를 반복 시도할 수 있음.',
      fix: 'Redis로 IP/계정별 실패 횟수 관리, 5회 실패 시 30분 잠금',
    });
  }

  if (detectedFeatures.has('payment') || blockIds.has('payment')) {
    findings.push({
      category: 'security',
      severity: 'high',
      title: '결제 금액 서버 미검증 — 클라이언트 변조 가능',
      description: '프론트에서 넘어온 금액을 서버에서 재검증하지 않으면 할인 우회, 1원 결제 가능.',
      fix: '결제 요청 전 서버에서 OrderId로 실제 금액 조회 후 PG사 요청 금액과 비교 검증',
    });
    findings.push({
      category: 'security',
      severity: 'high',
      title: 'PG사 웹훅 위변조 방지 미적용',
      description: '웹훅 엔드포인트에 서명 검증이 없으면 외부에서 결제 완료를 위조할 수 있음.',
      fix: 'HMAC-SHA256 서명 검증 (PG사 제공 비밀키 사용), IP 화이트리스트 적용',
    });
  }

  if (blockIds.has('product-search') || detectedFeatures.has('search')) {
    findings.push({
      category: 'security',
      severity: 'medium',
      title: '검색 쿼리 XSS / Injection 방어',
      description: '검색 파라미터에 스크립트 또는 쿼리 인젝션 시도 가능.',
      fix: '입력값 화이트리스트 검증, Elasticsearch 쿼리 파라미터 이스케이프, Content-Security-Policy 헤더',
    });
  }

  // 성능
  if (blockIds.has('product-search')) {
    findings.push({
      category: 'performance',
      severity: 'high',
      title: '검색 결과 N+1 쿼리 위험',
      description: '검색 결과 목록에서 각 상품의 이미지/카테고리를 별도 쿼리로 조회하면 N+1 발생.',
      fix: 'Elasticsearch에서 필요한 필드를 모두 색인, 또는 Join Fetch로 한 번에 조회',
    });
  }

  if (blockIds.has('order') || blockIds.has('cart')) {
    findings.push({
      category: 'performance',
      severity: 'high',
      title: '주문/장바구니 조회 N+1 쿼리',
      description: '주문 목록 조회 시 각 주문의 상품 정보를 개별 쿼리로 조회 시 심각한 성능 저하.',
      fix: 'JPA: @EntityGraph 또는 fetch join + distinct, 또는 DTO 프로젝션 쿼리',
    });
  }

  if (detectedFeatures.has('payment') || blockIds.has('settlement')) {
    findings.push({
      category: 'performance',
      severity: 'medium',
      title: '정산 배치 처리 대량 데이터 OOM 위험',
      description: '월 정산 시 전체 주문을 메모리에 올리면 OOM 발생 가능.',
      fix: 'Spring Batch Chunk 처리 (JpaPagingItemReader, chunkSize=1000), Cursor 기반 스트리밍',
    });
  }

  if (blockIds.has('inventory-manage')) {
    findings.push({
      category: 'performance',
      severity: 'medium',
      title: '재고 조회 핫스팟 — 인기 상품 DB 병목',
      description: '피크 타임에 인기 상품 재고 조회가 집중되면 DB 레코드 락 경쟁 심화.',
      fix: 'Redis로 재고 캐싱, DB는 최종 확인용. 재고 0 상품은 별도 필터링 캐시 적용',
    });
  }

  // 운영
  findings.push({
    category: 'operations',
    severity: 'medium',
    title: '구조화 로깅 미적용 시 장애 추적 어려움',
    description: '단순 텍스트 로그는 분산 환경에서 트레이싱 불가. MDC 없으면 요청 단위 추적 불가.',
    fix: 'Logback MDC로 requestId/userId 자동 주입, JSON 로그 포맷 (ELK/CloudWatch 연동)',
  });

  if (detectedFeatures.has('payment') || blockIds.has('payment')) {
    findings.push({
      category: 'operations',
      severity: 'high',
      title: '결제 장애 시 알럿 / 자동 복구 전략 부재',
      description: '결제 실패율 급등 시 즉시 알럿이 없으면 수익 손실이 누적됨.',
      fix: 'Prometheus로 결제 실패율 메트릭 수집, 1분간 실패율 10% 초과 시 PagerDuty/슬랙 알럿',
    });
  }

  findings.push({
    category: 'operations',
    severity: 'medium',
    title: 'Health Check 엔드포인트 미설계',
    description: 'K8s / ECS / 로드밸런서가 앱 상태를 판단할 수 없으면 장애 서버로 트래픽이 계속 유입.',
    fix: 'Spring Actuator /actuator/health 활성화, Liveness(앱 기동) / Readiness(DB 연결) 분리',
  });

  // 확장성
  if (backend.includes('spring')) {
    findings.push({
      category: 'scalability',
      severity: 'medium',
      title: '세션/로컬 캐시 — 수평 확장 시 일관성 문제',
      description: '로컬 캐시(Caffeine, EhCache)는 서버 2대 이상이면 캐시 불일치 발생.',
      fix: 'Redis Cluster로 세션/캐시 외부화. @EnableCaching + RedisCacheManager 적용',
    });
  }

  if (detectedFeatures.has('concurrency') || blockIds.has('inventory-manage')) {
    findings.push({
      category: 'scalability',
      severity: 'high',
      title: 'Optimistic Lock — 트래픽 폭증 시 재시도 폭발',
      description: '재고 경쟁이 심한 상품(한정판 등)에 Optimistic Lock만 사용하면 재시도가 폭발적으로 증가.',
      fix: '일반 상품: Optimistic Lock. 한정 수량/타임세일: Redis 분산 락(Redisson) 또는 DB Pessimistic Lock 전환 기준 정의',
    });
  }

  if (blockIds.has('order') || blockIds.has('payment')) {
    findings.push({
      category: 'scalability',
      severity: 'medium',
      title: '주문/결제 단일 DB — 쓰기 병목 단일장애점',
      description: '모든 주문이 단일 DB에 쓰이면 피크 트래픽에서 병목 및 단일장애점이 됨.',
      fix: '단기: Read Replica로 읽기 분산. 중기: 주문/결제 이벤트 기반 분리 (Outbox Pattern + Kafka)',
    });
  }

  return findings;
}

function summarizeRisks(findings) {
  return {
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
  };
}

// ── 체크리스트 생성 ──────────────────────────────────

function buildChecklist(blocks, techStack, detectedFeatures, perspectives) {
  const blockIds = new Set(blocks.map(b => b.id));
  const result = {};

  if (perspectives.includes('security')) {
    result.security = [
      { item: 'SQL Injection / NoSQL Injection 방어 확인', done: false },
      { item: 'CSRF 토큰 적용 (state-changing API)', done: false },
      { item: 'HTTPS 강제 (HTTP → HTTPS 리다이렉트)', done: false },
      { item: '민감 정보 응답 노출 방지 (비밀번호, 카드번호 마스킹)', done: false },
      { item: 'API 인가(Authorization) 검사 — 남의 주문 조회 차단', done: false },
      { item: '파일 업로드 확장자/크기 제한', done: blockIds.has('product-register') ? false : null },
      { item: 'PG사 웹훅 서명(HMAC) 검증', done: detectedFeatures.has('payment') ? false : null },
      { item: 'Refresh Token Rotation 전략 정의', done: detectedFeatures.has('auth') ? false : null },
      { item: '관리자 API 별도 인증 (IP 제한 또는 MFA)', done: false },
      { item: '개인정보 암호화 저장 (주민번호, 계좌번호)', done: false },
    ].filter(c => c.done !== null);
  }

  if (perspectives.includes('performance')) {
    result.performance = [
      { item: '핵심 API 응답 시간 목표 정의 (예: P99 < 500ms)', done: false },
      { item: 'DB 인덱스 전략 수립 (조회 조건 컬럼 인덱스)', done: false },
      { item: 'N+1 쿼리 발생 가능 위치 식별 및 해결', done: false },
      { item: '페이지네이션 구현 (오프셋 vs 커서)', done: false },
      { item: '자주 조회되는 데이터 캐싱 전략 (TTL 정의)', done: false },
      { item: 'DB Connection Pool 크기 적정성 검토', done: false },
      { item: '대용량 배치 처리 청크 단위 분리', done: detectedFeatures.has('scheduling') ? false : null },
      { item: 'Slow Query 탐지 설정 (MySQL: slow_query_log)', done: false },
    ].filter(c => c.done !== null);
  }

  if (perspectives.includes('operations')) {
    result.operations = [
      { item: 'Structured Logging 적용 (JSON 포맷, MDC requestId)', done: false },
      { item: 'Health Check 엔드포인트 구현 (liveness / readiness)', done: false },
      { item: '핵심 비즈니스 메트릭 수집 (결제 성공률, 주문 수 등)', done: false },
      { item: '알럿 기준 정의 (에러율, 응답시간, 재고 임박 등)', done: false },
      { item: 'Graceful Shutdown 처리 (진행 중 요청 완료 후 종료)', done: false },
      { item: '환경변수 / 시크릿 관리 전략 (Vault, AWS SSM)', done: false },
      { item: 'DB 마이그레이션 전략 (Flyway / Liquibase)', done: false },
      { item: '롤백 시나리오 정의 (배포 실패 시 이전 버전 복구)', done: false },
      { item: '결제 장애 시 수동 처리 프로세스', done: detectedFeatures.has('payment') ? false : null },
    ].filter(c => c.done !== null);
  }

  if (perspectives.includes('scalability')) {
    result.scalability = [
      { item: '목표 동시 사용자 수 / TPS 정의', done: false },
      { item: 'DB Read/Write 분리 (Read Replica)', done: false },
      { item: '분산 캐시 (Redis Cluster) 적용 여부 결정', done: false },
      { item: '단일장애점(SPOF) 제거 — LB + 다중 인스턴스', done: false },
      { item: 'Auto Scaling 정책 정의 (CPU 70% 초과 시 Scale Out)', done: false },
      { item: '이벤트 기반 아키텍처 필요성 검토 (Kafka/SQS)', done: false },
      { item: '분산 락 전략 — Optimistic vs Pessimistic vs Redis 기준 정의', done: detectedFeatures.has('concurrency') ? false : null },
    ].filter(c => c.done !== null);
  }

  return result;
}

// ── forge-report.md 빌더 ─────────────────────────────

function buildForgeReport(blocks, techStack, detectedFeatures, contracts, findings, checklist, perspectives, level, testScenarios) {
  const now = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const backend = techStack.backend ?? '-';
  const database = techStack.database ?? '-';

  const findingsBySeverity = {
    high:   findings.filter(f => f.severity === 'high'),
    medium: findings.filter(f => f.severity === 'medium'),
    low:    findings.filter(f => f.severity === 'low'),
  };

  const findingsSection = perspectives.map(p => {
    const pFindings = findings.filter(f => f.category === p);
    if (pFindings.length === 0) return '';

    const label = { security: '🔐 보안', performance: '⚡ 성능', operations: '🔧 운영', scalability: '📈 확장성' }[p];
    const items = pFindings.map(f => {
      const icon = f.severity === 'high' ? '🔴' : f.severity === 'medium' ? '🟡' : '🟢';
      const detail = level === 'summary' ? '' : `\n  - **개선 방법**: ${f.fix}`;
      return `${icon} **${f.title}**\n  - ${f.description}${detail}`;
    }).join('\n\n');

    return `### ${label}\n\n${items}`;
  }).filter(Boolean).join('\n\n---\n\n');

  const checklistSection = Object.entries(checklist).map(([p, items]) => {
    const label = { security: '🔐 보안', performance: '⚡ 성능', operations: '🔧 운영', scalability: '📈 확장성' }[p];
    const rows = items.map(c => `- [ ] ${c.item}`).join('\n');
    return `### ${label}\n\n${rows}`;
  }).join('\n\n');

  const testNote = testScenarios
    ? `\n\n> **Temper 연계**: 테스트 시나리오 ${testScenarios.total_cases ?? 0}개 생성됨. 발견된 리스크 항목과 매칭하여 테스트 보완 권장.`
    : '';

  return `# Forge Protocol — 검수 리포트 (Inspect)

> 생성일: ${now}
> 기술 스택: ${backend} / ${database}
> 블럭 수: ${blocks.length}개
> 검토 관점: ${perspectives.map(p => ({ security: '보안', performance: '성능', operations: '운영', scalability: '확장성' }[p])).join(', ')}

---

## 요약

| 구분 | 건수 |
|------|------|
| 🔴 위험 | **${findingsBySeverity.high.length}건** |
| 🟡 주의 | **${findingsBySeverity.medium.length}건** |
| 🟢 정보 | **${findingsBySeverity.low.length}건** |
| 총 발견사항 | **${findings.length}건** |
${testNote}

---

## 발견사항

${findingsSection || '> 선택한 관점에서 자동 감지된 항목이 없습니다.'}

---

## 검수 체크리스트

> 구현 시작 전 체크리스트를 검토하세요. 완료 항목은 \`[x]\`로 표시.

${checklistSection}

---

## 다음 액션

${findingsBySeverity.high.length > 0 ? `### 🔴 즉시 해결 (코드 작성 전)\n\n${findingsBySeverity.high.map(f => `- **${f.title}**: ${f.fix}`).join('\n')}\n\n` : ''}${findingsBySeverity.medium.length > 0 ? `### 🟡 MVP 포함 권장\n\n${findingsBySeverity.medium.map(f => `- **${f.title}**: ${f.fix}`).join('\n')}\n\n` : ''}---

> \`inspect-prompt.md\`를 Claude에 붙여넣으면 각 항목에 대한 구체적인 코드 예시와 개선안을 받을 수 있습니다.
`;
}

// ── inspect-prompt.md 빌더 ──────────────────────────

function buildInspectPrompt(blocks, techStack, detectedFeatures, contracts, findings, checklist, perspectives, level, concerns = new Set()) {
  const backend = techStack.backend ?? 'spring-boot';
  const database = techStack.database ?? 'mysql';

  const findingsText = findings.map((f, i) =>
    `${i + 1}. **[${f.severity.toUpperCase()}] ${f.title}** (${f.category})\n   - 문제: ${f.description}\n   - 방향: ${f.fix}`
  ).join('\n\n');

  const perspectiveInstructions = perspectives.map(p => {
    const instructions = {
      security: `#### 보안 리뷰 요청
- OWASP Top 10 기준으로 현재 아키텍처의 취약점을 분석하세요.
- 인증/인가 흐름의 보안 허점을 찾아 구체적인 코드 패턴으로 개선안을 제시하세요.`,
      performance: `#### 성능 리뷰 요청
- JPA/DB 사용 패턴에서 N+1, 풀테이블스캔, 인덱스 미사용 위험을 분석하세요.
- 각 API의 예상 쿼리 수를 추정하고, 최적화 방법을 제시하세요.
- 캐시 도입이 효과적인 위치를 찾고 TTL 전략을 제안하세요.`,
      operations: `#### 운영 리뷰 요청
- 운영 중 장애를 빠르게 감지하고 복구하기 위한 모니터링 체계를 설계하세요.
- 로깅 전략 (무엇을, 어느 레벨로, 어떤 형식으로)을 구체적으로 제시하세요.
- 배포 전략 (Blue/Green, Canary, Rolling)과 롤백 시나리오를 제안하세요.`,
      scalability: `#### 확장성 리뷰 요청
- 현재 아키텍처에서 트래픽 10배 증가 시 병목이 될 위치를 예측하세요.
- 단일장애점을 제거하기 위한 아키텍처 변경안을 제시하세요.
- 이벤트 기반 아키텍처로의 점진적 전환 로드맵을 제안하세요.`,
    };
    return instructions[p] ?? '';
  }).join('\n\n');

  const techSummary = Object.entries(techStack).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  const blockList = blocks.map(b => `- ${b.name} (${b.id})`).join('\n');

  return `# Forge Protocol — 검수 AI 리뷰 프롬프트

> \`forge inspect\`가 자동 생성했습니다.
> 아래 전체 내용을 Claude에 붙여넣으세요.

---

## System Prompt

당신은 10년 이상의 경험을 가진 시니어 소프트웨어 아키텍트입니다.
Forge Protocol로 설계된 프로젝트의 아키텍처와 기술 결정을 검수하세요.

### 검수 원칙
1. **실용주의**: 현재 단계(MVP)에 맞는 현실적인 개선안만 제시. 과도한 설계 금지.
2. **근거 제시**: 각 문제에 실제 발생 가능한 시나리오와 코드 예시 포함.
3. **우선순위**: 비즈니스 영향도(매출 손실 > 서비스 중단 > 기술부채) 기준으로 정렬.
4. **트레이드오프**: 개선안의 복잡도 증가 비용도 함께 제시.
5. 한국어로 작성. 코드는 ${backend} 기준.

---

## User Message

### 프로젝트 기술 스택
${techSummary}

### 선택된 블럭 (${blocks.length}개)
${blockList}

### 자동 감지된 리스크 (${findings.length}건)

${findingsText || '(자동 감지 없음)'}

---

## 검수 요청

${perspectiveInstructions}
${(() => {
  const bullets = buildConcernFragments(concerns, 'inspect').map(f => `- ${f}`).join('\n');
  return bullets ? '\n#### 도메인 특수 검수 요청 (선택된 블럭 기반 자동 감지)\n' + bullets : '';
})()}

---

### 출력 형식

각 관점마다 다음 구조로 작성하세요:

\`\`\`
## [관점명] 검수 결과

### 1. [항목명] — 심각도: 🔴/🟡/🟢

**문제 상황**
(실제 코드에서 어떻게 문제가 발생하는지 구체적으로)

**개선 코드 예시**
\`\`\`language
// Before (문제 있는 코드)
// After (개선된 코드)
\`\`\`

**적용 우선순위**: MVP 필수 / MVP 포함 권장 / v2 이후
\`\`\`

---

> 모든 고위험(🔴) 항목은 코드 구현 전에 반드시 해결 방안을 확정하세요.
`;
}
