/**
 * lib/core/project.js
 * 프로젝트 상태 파일 읽기 + 에러 처리 공통 유틸
 * 7개 CLI 파일에서 반복되는 패턴을 한 곳으로 통합
 */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import {
  StateSchema,
  IntentSchema,
  SelectedBlocksSchema,
  ArchitectureSchema,
  ContractsSchema,
  TestScenariosSchema,
  validateYaml,
} from '../schemas.js';

const YAML_DUMP_OPTS = { lineWidth: 120 };

/**
 * 제네릭 YAML 로더.
 * forgeDir/project/{fileName}을 읽어 파싱하고, schema가 주어지면 Zod 검증한다.
 * 파일이 없거나 파싱 실패 시 예외를 던진다 — 호출자가 적절히 처리해야 한다.
 *
 * @param {string} forgeDir - .forge 절대경로
 * @param {string} fileName - 'state.yml' 같은 프로젝트 상대 파일명
 * @param {object} [schema] - 선택적 Zod 스키마
 * @returns {Promise<object>}
 */
export async function loadYaml(forgeDir, fileName, schema = null) {
  const filePath = join(forgeDir, 'project', fileName);
  const raw = await readFile(filePath, 'utf-8');
  const data = yaml.load(raw);
  return schema ? validateYaml(schema, data, fileName) : data;
}

/**
 * 제네릭 YAML 저장기.
 * forgeDir/project/{fileName}에 원자적으로 저장. schema가 주어지면 사전 검증한다.
 *
 * @param {string} forgeDir - .forge 절대경로
 * @param {string} fileName - 'state.yml' 같은 프로젝트 상대 파일명
 * @param {object} data
 * @param {object} [schema] - 선택적 Zod 스키마
 */
export async function saveYaml(forgeDir, fileName, data, schema = null) {
  if (schema) validateYaml(schema, data, fileName);
  const filePath = join(forgeDir, 'project', fileName);
  await atomicWriteFile(filePath, yaml.dump(data, YAML_DUMP_OPTS));
}

/**
 * state.yml을 읽는다.
 * 없으면 사용자 친화적 에러 메시지를 출력하고 null을 반환한다.
 */
export async function loadState(forgeDir) {
  try {
    return await loadYaml(forgeDir, 'state.yml', StateSchema);
  } catch {
    console.log();
    console.log(chalk.yellow('  Forge 프로젝트가 초기화되지 않았습니다.'));
    console.log(chalk.dim('  먼저 ') + chalk.cyan('forge init') + chalk.dim('을 실행하세요.'));
    return null;
  }
}

/**
 * intent.yml + selected-blocks.yml을 읽는다.
 * 없으면 사용자 친화적 에러 메시지를 출력하고 null을 반환한다.
 */
export async function loadSmeltResult(forgeDir) {
  try {
    const [intent, selectedBlocks] = await Promise.all([
      loadYaml(forgeDir, 'intent.yml', IntentSchema),
      loadYaml(forgeDir, 'selected-blocks.yml', SelectedBlocksSchema),
    ]);
    return { intent, selectedBlocks };
  } catch {
    console.log();
    console.log(chalk.yellow('  intent.yml이 없습니다. 먼저 Smelt를 실행하세요.'));
    console.log(chalk.dim('  ') + chalk.cyan('forge smelt') + chalk.dim(' 또는 ') + chalk.cyan('forge assemble'));
    return null;
  }
}

/**
 * architecture.yml을 읽는다.
 * 없으면 사용자 친화적 에러 메시지를 출력하고 null을 반환한다.
 */
export async function loadArchitecture(forgeDir) {
  try {
    return await loadYaml(forgeDir, 'architecture.yml', ArchitectureSchema);
  } catch {
    console.log();
    console.log(chalk.yellow('  architecture.yml이 없습니다. 먼저 Shape를 실행하세요.'));
    console.log(chalk.dim('  ') + chalk.cyan('forge shape'));
    return null;
  }
}

/**
 * contracts.yml을 읽는다 (선택적).
 * 없으면 null을 반환하되 에러 메시지 없음.
 */
export async function loadContracts(forgeDir) {
  try {
    return await loadYaml(forgeDir, 'contracts.yml', ContractsSchema);
  } catch {
    return null;
  }
}

/**
 * test-scenarios.yml을 읽는다 (선택적).
 * 없으면 null을 반환하되 에러 메시지 없음.
 */
export async function loadTestScenarios(forgeDir) {
  try {
    return await loadYaml(forgeDir, 'test-scenarios.yml', TestScenariosSchema);
  } catch {
    return null;
  }
}

/**
 * state.yml을 저장한다.
 * updated_at은 자동 설정된다.
 */
export async function saveState(forgeDir, state) {
  state.updated_at = new Date().toISOString();
  await saveYaml(forgeDir, 'state.yml', state);
}

/**
 * 원자적 파일 쓰기 — .tmp에 먼저 쓴 뒤 rename하여 중간 크래시 시 데이터 손실 방지
 */
export async function atomicWriteFile(filePath, content) {
  const tmp = filePath + '.tmp';
  await writeFile(tmp, content, 'utf-8');
  await rename(tmp, filePath);
}

/**
 * 완료 메시지 출력 공통 포맷
 * @param {string} title - 예: '✅ Build 완료!'
 * @param {Array<{label: string, value: string}>} stats - 요약 항목들
 * @param {string[]} files - 생성된 파일 목록
 * @param {string} [nextCommand] - 다음에 실행할 커맨드 (선택)
 */
export function printDone(title, stats = [], files = [], nextCommand = null) {
  console.log();
  console.log(chalk.green.bold(`  ${title}`));
  if (stats.length > 0) {
    console.log();
    console.log(chalk.bold('  요약:'));
    for (const { label, value } of stats) {
      console.log(`    ${chalk.dim(label + ':')} ${chalk.cyan(value)}`);
    }
  }
  if (files.length > 0) {
    console.log();
    console.log(chalk.bold('  생성된 파일:'));
    for (const f of files) {
      console.log(`    ${chalk.dim('→')} ${chalk.green(f)}`);
    }
  }
  if (nextCommand) {
    console.log();
    console.log(chalk.dim('  다음 단계: ') + chalk.cyan(nextCommand));
  }
  console.log();
}
