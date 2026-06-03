import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import inquirer from 'inquirer';

const CONFIG_PATH = join(process.cwd(), '.forge', 'config.yml');

async function loadConfig() {
  try {
    return yaml.load(await readFile(CONFIG_PATH, 'utf-8')) ?? {};
  } catch {
    return {};
  }
}

async function saveConfig(config) {
  await mkdir(join(process.cwd(), '.forge'), { recursive: true });
  await writeFile(CONFIG_PATH, yaml.dump(config, { lineWidth: 120 }), 'utf-8');
}

function maskKey(key) {
  if (!key || key.length < 20) return '(없음)';
  return key.substring(0, 12) + '...' + key.substring(key.length - 4);
}

export async function runConfig(options = {}) {
  const config = await loadConfig();

  // forge config set api-key
  if (options.setApiKey) {
    config.api_key = options.setApiKey;
    await saveConfig(config);
    console.log();
    console.log(chalk.green('  ✅ API 키 저장 완료'));
    console.log(chalk.dim(`  파일: .forge/config.yml`));
    console.log(chalk.dim(`  키:   ${maskKey(config.api_key)}`));
    console.log();
    return;
  }

  // forge config set model
  if (options.setModel) {
    config.model = options.setModel;
    await saveConfig(config);
    console.log();
    console.log(chalk.green(`  ✅ 기본 모델 설정: ${config.model}`));
    console.log();
    return;
  }

  // 인터랙티브 모드
  const hasKey = !!config.api_key;

  console.log();
  console.log(chalk.bold('  ⚙  Forge 설정'));
  console.log();
  console.log(`  API 키:    ${hasKey ? chalk.green(maskKey(config.api_key)) : chalk.yellow('미설정')}`);
  console.log(`  모델:      ${chalk.cyan(config.model || '(기본: claude-sonnet-4-20250514)')}`);
  console.log(`  파일 위치: ${chalk.dim('.forge/config.yml')}`);
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '무엇을 변경할까요?',
      choices: [
        { name: `API 키 ${hasKey ? '변경' : '등록'}`, value: 'api-key' },
        { name: '기본 모델 변경', value: 'model' },
        { name: '현재 설정 확인만', value: 'show' },
      ],
    },
  ]);

  if (action === 'api-key') {
    const { key } = await inquirer.prompt([
      {
        type: 'password',
        name: 'key',
        message: 'Anthropic API 키를 입력하세요:',
        mask: '*',
        validate: (v) => (v.startsWith('sk-ant-') ? true : 'sk-ant- 로 시작하는 유효한 키를 입력하세요.'),
      },
    ]);
    config.api_key = key;
    await saveConfig(config);
    console.log();
    console.log(chalk.green('  ✅ API 키 저장 완료'));
    console.log(chalk.dim(`  키: ${maskKey(key)}`));
    console.log();
  } else if (action === 'model') {
    const { model } = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: '기본 모델을 선택하세요:',
        choices: [
          { name: 'Claude Sonnet 4.6 (빠르고 경제적, 권장)', value: 'claude-sonnet-4-6' },
          { name: 'Claude Opus 4.6 (최고 품질, 비용 높음)', value: 'claude-opus-4-6' },
          { name: 'Claude Haiku 4.5 (가장 빠르고 저렴)', value: 'claude-haiku-4-5-20251001' },
        ],
      },
    ]);
    config.model = model;
    await saveConfig(config);
    console.log();
    console.log(chalk.green(`  ✅ 기본 모델 설정: ${model}`));
    console.log();
  }
}
