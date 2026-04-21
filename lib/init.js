import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { saveYaml } from './core/project.js';

/**
 * forge init
 * .forge/ 디렉토리 구조를 생성하고 state.yml을 초기화한다.
 * 카탈로그 설정은 forge meta-smelt 에서 수행한다.
 */
export async function initProject() {
  const projectDir = process.cwd();
  const forgeDir = join(projectDir, '.forge');

  const spinner = ora('Forge 프로젝트 초기화 중...').start();

  try {
    // .forge/ 디렉토리 구조 생성
    await mkdir(join(forgeDir, 'catalog'), { recursive: true });
    await mkdir(join(forgeDir, 'project'), { recursive: true });
    await mkdir(join(forgeDir, 'generated', 'src'), { recursive: true });
    await mkdir(join(forgeDir, 'generated', 'test'), { recursive: true });

    // 초기 상태 파일 생성
    const state = {
      phase: 'init',
      created_at: new Date().toISOString(),
    };
    await saveYaml(forgeDir, 'state.yml', state);

    spinner.succeed(chalk.green('Forge 프로젝트 초기화 완료!'));
    console.log();
    console.log(chalk.bold('  Dir:'), '.forge/');
    console.log();
    console.log(chalk.dim('  다음 단계: ') + chalk.cyan('forge meta-smelt') + chalk.dim(' — 카탈로그를 설정하세요.'));
    console.log();
  } catch (err) {
    spinner.fail(chalk.red('초기화 실패'));
    console.error(chalk.red(`  ${err.message}`));
    process.exit(1);
  }
}
