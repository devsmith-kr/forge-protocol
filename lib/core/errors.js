/**
 * lib/core/errors.js
 * Forge 전용 에러 타입 + 공통 로거.
 *
 * 목적:
 *  - silent fail 패턴 제거
 *  - 에러 레이어링: FS/YAML/Validation을 ForgeError로 감싸 호출자에게 컨텍스트 전달
 *  - 일관된 사용자 메시지 출력 포맷 (stderr 분리, chalk 사용)
 *
 * 사용 규칙:
 *  - 라이브러리 레이어(lib/): ForgeError를 던지거나, silent 무시가 필요한 경우
 *    warn()으로 로깅한다. 빈 catch 블럭은 금지.
 *  - 커맨드 레이어(bin/, runX): ForgeError는 친화적 메시지로, 그 외는 stack trace 출력.
 */

import chalk from 'chalk';

/**
 * Forge 도메인 에러.
 * fs/yaml/zod 에러를 감싸거나, 프로젝트 상태 오류를 표현한다.
 */
export class ForgeError extends Error {
  /**
   * @param {string} message - 사용자 친화적 메시지
   * @param {object} [options]
   * @param {string} [options.code] - 'MISSING_FILE', 'INVALID_YAML', 'SCHEMA_FAIL' 등
   * @param {string} [options.hint] - 다음 액션 힌트 (예: 'forge init을 실행하세요')
   * @param {Error} [options.cause] - 원본 예외
   */
  constructor(message, { code = 'FORGE_ERROR', hint = null, cause = null } = {}) {
    super(message);
    this.name = 'ForgeError';
    this.code = code;
    this.hint = hint;
    if (cause) this.cause = cause;
  }
}

/**
 * 경고 로그 (stderr, non-fatal).
 * silent catch 대신 사용한다.
 */
export function warn(message, err = null) {
  const detail = err?.message ? chalk.dim(` (${err.message})`) : '';
  console.warn(chalk.yellow('  ⚠  ') + chalk.dim(message) + detail);
}

/**
 * 정보성 로그 (stdout).
 */
export function info(message) {
  console.log(chalk.dim('  ℹ  ') + message);
}

/**
 * 에러 로그 (stderr). ForgeError면 hint까지 출력한다.
 */
export function err(error, fallbackMessage = '오류가 발생했습니다.') {
  if (error instanceof ForgeError) {
    console.error();
    console.error(chalk.red('  ✖  ') + chalk.bold(error.message));
    if (error.hint) {
      console.error(chalk.dim('     ') + chalk.cyan(error.hint));
    }
    console.error();
    return;
  }
  console.error();
  console.error(chalk.red('  ✖  ') + chalk.bold(fallbackMessage));
  if (error?.message) console.error(chalk.dim('     ' + error.message));
  console.error();
}
