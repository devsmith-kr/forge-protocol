import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import yaml from 'js-yaml';
import { ForgeError } from './errors.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6-20250603';
const MAX_TOKENS = 16384;

async function loadForgeConfig() {
  try {
    const configPath = join(process.cwd(), '.forge', 'config.yml');
    return yaml.load(await readFile(configPath, 'utf-8')) ?? {};
  } catch {
    return {};
  }
}

async function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const config = await loadForgeConfig();
  return config.api_key ?? null;
}

async function getConfigModel() {
  const config = await loadForgeConfig();
  return config.model ?? null;
}

function createClient(apiKey) {
  return new Anthropic({ apiKey });
}

/**
 * Forge 프롬프트를 system / user 메시지로 분리.
 * 구조: [header] --- [## System Prompt ...] --- [user content...]
 */
export function parseForgePrompt(promptText) {
  const parts = promptText.split(/\n---\n/);

  if (parts.length < 3) {
    return { system: '', user: promptText };
  }

  let system = parts[1].trim();
  if (system.startsWith('## System Prompt')) {
    system = system.replace(/^## System Prompt\s*\n+/, '').trim();
  }

  const user = parts
    .slice(2)
    .join('\n---\n')
    .trim()
    .replace(/^## User Message\s*\n+/, '');

  return { system, user };
}

/**
 * 프롬프트를 Claude API로 전송하고, 스트리밍 진행 표시 후 응답을 파일로 저장.
 *
 * @param {object} opts
 * @param {string} opts.promptText - forge 프롬프트 전문 (system/user 자동 분리)
 * @param {string} opts.outputPath - AI 응답 저장 경로
 * @param {string} opts.phaseName  - 표시용 Phase 이름
 * @param {string} [opts.model]    - 모델 ID (기본: claude-sonnet-4-20250514)
 * @returns {Promise<{content: string, usage: object}>}
 */
export async function runAiPrompt({ promptText, outputPath, phaseName, model }) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new ForgeError('Claude API 키가 설정되지 않았습니다.', {
      code: 'MISSING_API_KEY',
      hint: 'forge config 으로 API 키를 등록하거나, ANTHROPIC_API_KEY 환경변수를 설정하세요.',
    });
  }

  const client = createClient(apiKey);
  const { system, user } = parseForgePrompt(promptText);
  const configModel = await getConfigModel();
  const modelId = model || process.env.FORGE_MODEL || configModel || DEFAULT_MODEL;

  console.log();
  console.log(chalk.bold.blue(`  Claude API 호출 (${phaseName})`));
  console.log(chalk.dim(`  모델: ${modelId}`));
  console.log();

  const spinner = ora('응답 대기 중...').start();
  let fullResponse = '';
  let tokenCount = 0;

  const stream = client.messages.stream({
    model: modelId,
    max_tokens: MAX_TOKENS,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: user }],
  });

  stream.on('text', (text) => {
    fullResponse += text;
    tokenCount += text.length;
    spinner.text = `응답 수신 중... (${Math.round(tokenCount / 4)} tokens 추정)`;
  });

  let finalMessage;
  try {
    finalMessage = await stream.finalMessage();
  } catch (e) {
    spinner.fail('Claude API 호출 실패');
    throw new ForgeError(`Claude API 오류: ${e.message}`, {
      code: 'API_ERROR',
      hint: 'API 키와 네트워크 연결을 확인하세요.',
      cause: e,
    });
  }

  spinner.succeed('AI 응답 수신 완료');

  await writeFile(outputPath, fullResponse, 'utf-8');

  const usage = finalMessage.usage ?? {};
  console.log();
  console.log(chalk.green('  ✅ AI 응답 저장 완료'));
  console.log(chalk.dim(`  파일: ${outputPath}`));
  if (usage.input_tokens) {
    console.log(
      chalk.dim(`  토큰: 입력 ${usage.input_tokens.toLocaleString()} / 출력 ${usage.output_tokens.toLocaleString()}`),
    );
  }
  console.log();

  return { content: fullResponse, usage };
}
