/**
 * forge verify — Phase 6: 검증
 *
 * emit 으로 생성된 코드가 실제 컴파일·테스트 통과하는지 확인한다.
 * "증거로 마무리" 슬로건의 실체 구현.
 *
 * 흐름:
 *   1. .forge/generated/backend/ 존재 확인
 *   2. gradle wrapper 준비 (gradlew 없으면 `gradle wrapper` 1회)
 *   3. compileJava → 오류 수집
 *   4. test → 실패 수집
 *   5. .forge/verify-report.json 기록 + 콘솔 요약
 *
 * 실패 리포트는 Phase 3/4 프롬프트 재생성의 입력으로 사용 가능.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { loadState, saveState } from './core/project.js';
import { commandHeader } from './core/ui.js';

/**
 * 하위 프로세스 실행. stdout/stderr 캡처 + exit code 반환.
 */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: true, ...opts });
    let stdout = '',
      stderr = '';
    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: err.message }));
  });
}

/**
 * javac 오류 라인 파싱.
 *
 * single-module 출력:
 *   /path/File.java:42: error: cannot find symbol
 *
 * multi-module 출력 (`> Task :{module}:compileJava` prefix 등장):
 *   > Task :domain-marketplace:compileJava
 *   /path/File.java:42: error: cannot find symbol
 *
 * 멀티모듈에선 각 에러에 module 필드를 첨부한다. single-module 호환을 위해
 * module prefix 가 없으면 module 필드를 만들지 않는다.
 */
export function parseCompileErrors(output) {
  const errors = [];
  const taskRe = /^>\s*Task\s+:(\S+):compile/i;
  const errRe = /^(.+?\.java):(\d+):\s*(?:error:)?\s*(.+)$/;
  let currentModule = null;

  for (const line of output.split(/\r?\n/)) {
    const tm = taskRe.exec(line);
    if (tm) {
      currentModule = tm[1];
      continue;
    }
    const m = errRe.exec(line);
    if (m) {
      const entry = {
        file: m[1].trim(),
        line: parseInt(m[2], 10),
        message: m[3].trim(),
      };
      if (currentModule) entry.module = currentModule;
      errors.push(entry);
    }
  }
  return errors;
}

/**
 * Gradle test 출력에서 실패 요약 파싱.
 *
 * multi-module 보강:
 *   - `> Task :{module}:test` prefix 가 있으면 각 실패에 module 필드 첨부
 *   - 클래스명에 "Architecture" 가 포함된 실패는 별도 boundary_violations 로 분리
 *     (ArchUnit 도메인 경계 위반 — 일반 비즈니스 테스트 실패와 구분해 보고)
 */
export function parseTestFailures(output) {
  const failures = [];
  const boundary_violations = [];
  const taskRe = /^>\s*Task\s+:(\S+):test\b/i;
  const failRe = /^([^>\s]+)\s*>\s*(.+?)\s+FAILED$/;
  let currentModule = null;

  for (const line of output.split(/\r?\n/)) {
    const tm = taskRe.exec(line);
    if (tm) {
      currentModule = tm[1];
      continue;
    }
    const m = failRe.exec(line);
    if (m) {
      const entry = { class: m[1].trim(), method: m[2].trim() };
      if (currentModule) entry.module = currentModule;
      if (/Architecture/.test(entry.class)) boundary_violations.push(entry);
      else failures.push(entry);
    }
  }

  // 통계 라인: "5 tests completed, 2 failed"
  const statsRe = /(\d+)\s+tests?\s+completed(?:,\s+(\d+)\s+failed)?/i;
  const stats = output.match(statsRe);
  const total = stats ? parseInt(stats[1], 10) : null;
  const failed = stats && stats[2] ? parseInt(stats[2], 10) : failures.length + boundary_violations.length;
  return { total, failed, failures, boundary_violations };
}

export async function runVerify() {
  const projectDir = process.cwd();
  const forgeDir = join(projectDir, '.forge');
  const backendDir = join(forgeDir, 'generated', 'backend');

  const state = await loadState(forgeDir);
  if (!state) return;

  console.log();
  console.log(commandHeader(state, 'Verify  (Phase 6: 검증)'));
  console.log(chalk.dim('  emit 으로 생성된 코드가 컴파일·테스트 통과하는지 확인합니다.'));
  console.log();

  if (!existsSync(backendDir)) {
    console.log(chalk.yellow('  .forge/generated/backend/ 가 없습니다. 먼저 emit 을 실행하세요.'));
    console.log(chalk.dim('  ') + chalk.cyan('forge emit'));
    return;
  }

  const hasGradle = existsSync(join(backendDir, 'build.gradle'));
  const hasMaven = existsSync(join(backendDir, 'pom.xml'));
  const hasSettings = existsSync(join(backendDir, 'settings.gradle'));

  if (!hasGradle && !hasMaven) {
    console.log(chalk.yellow('  build.gradle / pom.xml 을 찾을 수 없습니다.'));
    return;
  }

  const tool = hasGradle ? 'gradle' : 'maven';
  const isMultiModule = hasSettings;
  const report = {
    generated_at: new Date().toISOString(),
    tool,
    multi_module: isMultiModule,
    compile: { ok: false, errors: [] },
    tests: { ok: false, total: null, failed: null, failures: [], boundary_violations: [] },
  };

  // ── Gradle wrapper 준비 ──────────────────────────────
  const gradlewName = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
  const gradlew = join(backendDir, gradlewName);
  if (tool === 'gradle' && !existsSync(gradlew)) {
    const wrapSpinner = ora('gradle wrapper 설치 중...').start();
    const res = await run('gradle', ['wrapper'], { cwd: backendDir });
    if (res.code !== 0) {
      wrapSpinner.fail('gradle 이 시스템에 없습니다. https://gradle.org 에서 설치 후 재시도.');
      return;
    }
    wrapSpinner.succeed('gradle wrapper 준비 완료');
  }

  const wrapper =
    tool === 'gradle'
      ? process.platform === 'win32'
        ? '.\\gradlew.bat'
        : './gradlew'
      : process.platform === 'win32'
        ? 'mvnw.cmd'
        : './mvnw';

  // ── 컴파일 ──────────────────────────────────────────
  const compileSpinner = ora('컴파일 중 (compileJava)...').start();
  const compileArgs = tool === 'gradle' ? ['compileJava', '--console=plain', '-q'] : ['compile'];
  const compileRes = await run(wrapper, compileArgs, { cwd: backendDir });
  const compileOutput = compileRes.stdout + '\n' + compileRes.stderr;
  report.compile.ok = compileRes.code === 0;
  report.compile.errors = compileRes.code === 0 ? [] : parseCompileErrors(compileOutput);
  if (compileRes.code === 0) compileSpinner.succeed('컴파일 통과');
  else compileSpinner.fail(`컴파일 실패 (${report.compile.errors.length}건)`);

  // ── 테스트 (컴파일 성공 시만) ─────────────────────────
  if (report.compile.ok) {
    const testSpinner = ora('테스트 실행 중...').start();
    const testArgs = tool === 'gradle' ? ['test', '--console=plain'] : ['test'];
    const testRes = await run(wrapper, testArgs, { cwd: backendDir });
    const testOutput = testRes.stdout + '\n' + testRes.stderr;
    const parsed = parseTestFailures(testOutput);
    report.tests.ok = testRes.code === 0;
    report.tests.total = parsed.total;
    report.tests.failed = parsed.failed;
    report.tests.failures = parsed.failures;
    report.tests.boundary_violations = parsed.boundary_violations;
    if (testRes.code === 0) {
      testSpinner.succeed(`테스트 전부 통과${parsed.total ? ` (${parsed.total}개)` : ''}`);
    } else {
      const bv = parsed.boundary_violations.length;
      const fb = parsed.failures.length;
      const tail = bv > 0 ? `, 도메인 경계 위반 ${bv}건` : '';
      testSpinner.fail(`테스트 실패 (${parsed.failed}/${parsed.total ?? '?'}${tail})`);
    }
  }

  // ── 리포트 기록 ──────────────────────────────────────
  await writeFile(join(forgeDir, 'verify-report.json'), JSON.stringify(report, null, 2), 'utf-8');

  // state 갱신
  state.last_verify = {
    at: report.generated_at,
    compile_ok: report.compile.ok,
    tests_ok: report.tests.ok,
  };
  await saveState(forgeDir, state);

  // ── 요약 출력 ────────────────────────────────────────
  console.log();
  if (report.compile.ok && report.tests.ok) {
    console.log(chalk.green.bold('  ✅ 전부 통과 — 배포 준비 완료'));
    console.log();
    console.log(chalk.dim('  리포트: .forge/verify-report.json'));
    return;
  }

  console.log(chalk.red.bold('  ❌ 검증 실패'));
  console.log();
  if (!report.compile.ok) {
    console.log(chalk.bold('  컴파일 오류 상위 10건:'));
    report.compile.errors.slice(0, 10).forEach((e, i) => {
      const modTag = e.module ? chalk.magenta(`[${e.module}] `) : '';
      console.log(chalk.dim(`    ${i + 1}. `) + modTag + chalk.cyan(`${e.file}:${e.line}`));
      console.log(chalk.dim('       ') + e.message);
    });
    if (report.compile.errors.length > 10) {
      console.log(chalk.dim(`    …외 ${report.compile.errors.length - 10}건`));
    }
  }
  if (report.compile.ok && !report.tests.ok) {
    if (report.tests.boundary_violations.length) {
      console.log(chalk.bold.red('  도메인 경계 위반 (ArchUnit):'));
      report.tests.boundary_violations.slice(0, 10).forEach((v, i) => {
        const modTag = v.module ? chalk.magenta(`[${v.module}] `) : '';
        console.log(chalk.dim(`    ${i + 1}. `) + modTag + chalk.cyan(`${v.class}.${v.method}`));
      });
      console.log(chalk.dim('    → 다른 도메인 패키지를 import 한 클래스가 있는지 확인하세요.'));
      console.log();
    }
    if (report.tests.failures.length) {
      console.log(chalk.bold('  테스트 실패 상위 10건:'));
      report.tests.failures.slice(0, 10).forEach((f, i) => {
        const modTag = f.module ? chalk.magenta(`[${f.module}] `) : '';
        console.log(chalk.dim(`    ${i + 1}. `) + modTag + chalk.cyan(`${f.class}.${f.method}`));
      });
    }
  }
  console.log();
  console.log(chalk.dim('  상세 리포트: .forge/verify-report.json'));
  console.log(chalk.dim('  실패 내용을 Phase 3/4 프롬프트 재생성의 입력으로 사용할 수 있습니다.'));
  process.exitCode = 1;
}
