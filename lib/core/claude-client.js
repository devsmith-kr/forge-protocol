import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import yaml from 'js-yaml';
import { ForgeError } from './errors.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 65536;

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
 * AI 응답(마크다운)에서 코드 블럭을 추출하여 실제 파일로 저장.
 *
 * 인식 패턴:
 *   1. ```java 바로 위에 파일명 힌트 (### Foo.java, **`Foo.java`**, // Foo.java 등)
 *   2. 코드 블럭 첫 줄의 package 선언 + 클래스명으로 경로 추론
 *
 * @param {string} content - AI 마크다운 응답
 * @param {string} outputDir - 소스 파일 저장 디렉토리
 * @returns {Promise<string[]>} 저장된 파일 경로 목록
 */
export async function extractCodeFiles(content, outputDir) {
  const saved = [];

  // 파일명 힌트 + 코드 블럭 패턴
  const regex =
    /(?:^|\n)(?:#{1,4}\s+|[*_`]*)?(\S+\.(?:java|kt|xml|yml|yaml|gradle|kts|properties))[*_`]*[^\n]*\n\s*```(?:java|kotlin|xml|yaml|yml|groovy|gradle|properties)\n([\s\S]*?)```/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const fileName = match[1].replace(/^[`*_]+|[`*_]+$/g, '');
    const code = match[2];

    // package 선언에서 디렉토리 경로 추론
    const pkgMatch = code.match(/^package\s+([\w.]+);?\s*$/m);
    let filePath;
    if (pkgMatch) {
      const pkgDir = pkgMatch[1].replace(/\./g, '/');
      const isTest = fileName.toLowerCase().includes('test');
      const base = isTest ? 'src/test/java' : 'src/main/java';
      filePath = join(outputDir, base, pkgDir, fileName);
    } else if (fileName.endsWith('.yml') || fileName.endsWith('.yaml') || fileName.endsWith('.properties')) {
      filePath = join(outputDir, 'src/main/resources', fileName);
    } else if (fileName.endsWith('.gradle') || fileName.endsWith('.gradle.kts')) {
      filePath = join(outputDir, fileName);
    } else {
      filePath = join(outputDir, fileName);
    }

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, code, 'utf-8');
    saved.push(filePath);
  }

  // 힌트 없이 package + class 선언만 있는 코드 블럭도 처리
  if (saved.length === 0) {
    const fallbackRegex = /```(?:java|kotlin)\n([\s\S]*?)```/g;
    let fb;
    while ((fb = fallbackRegex.exec(content)) !== null) {
      const code = fb[1];
      const pkgMatch = code.match(/^package\s+([\w.]+);?\s*$/m);
      const classMatch = code.match(
        /(?:public\s+)?(?:class|interface|enum|record|abstract\s+class)\s+(\w+)/,
      );
      if (pkgMatch && classMatch) {
        const pkgDir = pkgMatch[1].replace(/\./g, '/');
        const className = classMatch[1];
        const isTest = className.endsWith('Test') || className.endsWith('Tests');
        const base = isTest ? 'src/test/java' : 'src/main/java';
        const filePath = join(outputDir, base, pkgDir, `${className}.java`);

        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, code, 'utf-8');
        saved.push(filePath);
      }
    }
  }

  return saved;
}

/**
 * 프롬프트를 Claude API로 전송하고, 스트리밍 진행 표시 후 응답을 저장.
 *
 * @param {object} opts
 * @param {string} opts.promptText  - forge 프롬프트 전문 (system/user 자동 분리)
 * @param {string} opts.outputPath  - AI 응답 저장 경로 (.md)
 * @param {string} opts.phaseName   - 표시용 Phase 이름
 * @param {string} [opts.model]     - 모델 ID
 * @param {string} [opts.codeOutputDir] - 코드 추출 저장 디렉토리 (지정 시 소스 파일 추출)
 * @returns {Promise<{content: string, usage: object, extractedFiles: string[]}>}
 */
export async function runAiPrompt({ promptText, outputPath, phaseName, model, codeOutputDir }) {
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
  let charCount = 0;

  const stream = client.messages.stream({
    model: modelId,
    max_tokens: MAX_TOKENS,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: user }],
  });

  stream.on('text', (text) => {
    fullResponse += text;
    charCount += text.length;
    spinner.text = `응답 수신 중... (${charCount.toLocaleString()} chars)`;
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

  // 원본 마크다운 저장 (참고용)
  await writeFile(outputPath, fullResponse, 'utf-8');

  const usage = finalMessage.usage ?? {};
  console.log();
  console.log(chalk.dim(`  참고 파일: ${outputPath}`));
  if (usage.input_tokens) {
    console.log(
      chalk.dim(`  토큰: 입력 ${usage.input_tokens.toLocaleString()} / 출력 ${usage.output_tokens.toLocaleString()}`),
    );
  }

  // 코드 블럭 추출
  let extractedFiles = [];
  if (codeOutputDir) {
    const extractSpinner = ora('코드 블럭 추출 중...').start();
    extractedFiles = await extractCodeFiles(fullResponse, codeOutputDir);
    if (extractedFiles.length > 0) {
      extractSpinner.succeed(`${extractedFiles.length}개 소스 파일 추출 완료`);
      console.log();
      for (const f of extractedFiles.slice(0, 10)) {
        console.log(chalk.dim(`    ${f}`));
      }
      if (extractedFiles.length > 10) {
        console.log(chalk.dim(`    ... 외 ${extractedFiles.length - 10}개`));
      }
    } else {
      extractSpinner.warn('코드 블럭을 찾지 못했습니다. 응답 파일(.md)을 직접 확인하세요.');
    }
  } else {
    console.log(chalk.green('  ✅ AI 응답 저장 완료'));
  }
  console.log();

  return { content: fullResponse, usage, extractedFiles };
}
