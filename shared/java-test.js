/**
 * shared/java-test.js
 *
 * JUnit5 + MockMvc 테스트 클래스 생성기.
 * Temper phase의 시나리오(블럭 단위 GWT)를 @Test 메서드로 변환한다.
 */

import { pascal } from './names.js';

const PREFIX = {
  'happy-path': 'happyPath',
  security: 'security',
  'edge-case': 'edgeCase',
  concurrency: 'concurrent',
  idempotency: 'idempotent',
};

/**
 * @param {object} scenario — { block, blockId?/block_id?, tests?/scenarios? }
 * @param {string} basePackage
 */
export function generateTestClass(scenario, basePackage) {
  // blockId (영문) 없으면 한국어 이름에서 ASCII 추출 시도
  const rawId =
    scenario.block_id ||
    scenario.blockId ||
    (scenario.block || '')
      .replace(/[\u3131-\uD79D\s]+/g, '-')
      .replace(/^-|-$/g, '')
      .trim() ||
    'Block';
  const cls = pascal(rawId.replace(/-/g, '-')) + 'Test';

  const tests = scenario.tests || scenario.scenarios || [];
  const counters = {};

  const testMethods = tests
    .map((test) => {
      const prefix = PREFIX[test.type] || 'test';
      counters[prefix] = (counters[prefix] || 0) + 1;
      const mName = `${prefix}${counters[prefix]}`;

      return (
        `    @Test\n` +
        `    @DisplayName("${test.name}")\n` +
        `    void ${mName}() throws Exception {\n` +
        `        // Given: ${test.given}\n\n` +
        `        // When: ${test.when}\n\n` +
        `        // Then: ${test.then}\n\n` +
        `        // TODO: implement\n` +
        `    }`
      );
    })
    .join('\n\n');

  return (
    `package ${basePackage};\n\n` +
    `import org.junit.jupiter.api.DisplayName;\n` +
    `import org.junit.jupiter.api.Test;\n` +
    `import org.springframework.beans.factory.annotation.Autowired;\n` +
    `import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;\n` +
    `import org.springframework.boot.test.context.SpringBootTest;\n` +
    `import org.springframework.test.web.servlet.MockMvc;\n\n` +
    `@SpringBootTest\n` +
    `@AutoConfigureMockMvc\n` +
    `@DisplayName("[${scenario.block}] 테스트")\n` +
    `class ${cls} {\n\n` +
    `    @Autowired MockMvc mockMvc;\n\n` +
    `${testMethods}\n` +
    `}\n`
  );
}
