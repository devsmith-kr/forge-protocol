/**
 * lib/decisions.js
 * 사용자 결정(cascade decisions)을 질문하고 intent에 저장할 포맷으로 변환.
 *
 * smelt.js의 Step 3(결정 질문) 로직을 추출하여:
 *   - 순수 함수로 단위 테스트 가능
 *   - 향후 Web UI/assemble.js에서도 재사용 가능
 */

import chalk from 'chalk';
import inquirer from 'inquirer';

/**
 * 하나의 결정에 대해 intent.yml에 저장할 사용자 답변 객체를 만든다.
 * 순수 함수 — 단위 테스트 용이.
 */
export function formatDecisionAnswer(decision, answer) {
  return {
    trigger: decision.trigger,
    question: decision.question,
    answer,
    cascade_effects: decision.cascade_effects,
  };
}

/**
 * 결정 목록을 대화형으로 질문하고 답변을 누적 반환한다.
 * decisions가 비어 있으면 빈 배열을 즉시 반환한다.
 *
 * @param {Array} decisions - dependency.js의 resolveAll().decisions
 * @param {Map<string, object>} blockMap - 블럭 ID → 블럭 객체
 * @param {object} [options]
 * @param {typeof inquirer.prompt} [options.prompt] - 주입용 (테스트에서 mock)
 * @param {(msg: string) => void} [options.log] - 주입용 (테스트에서 silence)
 * @returns {Promise<Array>} userDecisions — intent.yml의 decisions 필드
 */
export async function promptDecisions(decisions, blockMap, options = {}) {
  const prompt = options.prompt ?? inquirer.prompt.bind(inquirer);
  const log = options.log ?? ((m) => console.log(m));

  const userDecisions = [];
  if (!decisions || decisions.length === 0) return userDecisions;

  log('');
  log(chalk.bold('  🤔 결정이 필요한 사항들:'));
  log(chalk.dim('  선택한 블럭의 조합에 따라 결정해야 할 것들이 있습니다.'));
  log('');

  for (const decision of decisions) {
    const triggerBlock = blockMap.get(decision.trigger);
    log(chalk.dim(`  [${triggerBlock?.name || decision.trigger}]`));

    const { answer } = await prompt([
      {
        type: 'list',
        name: 'answer',
        message: decision.question,
        choices: decision.options,
      },
    ]);

    userDecisions.push(formatDecisionAnswer(decision, answer));
    log('');
  }

  return userDecisions;
}
