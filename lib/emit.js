/**
 * lib/emit.js
 *
 * `forge emit [--target <backend|tests|all>]`
 *
 * Phase 3+ 산출물(contracts.yml, 선택적으로 test-scenarios.yml)을 읽어
 * 실제 Spring Boot 백엔드 스켈레톤 및 JUnit5 테스트 코드를 생성해
 * `.forge/generated/backend/`에 기록한다.
 *
 * 웹 UI의 다운로드 버튼 로직을 CLI로 이식해 로컬 파일 시스템에서 직접 코드 생성이
 * 가능하도록 했다.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import inquirer from 'inquirer';
import ora from 'ora';
import { loadProjectCatalog, buildBlockMap } from './catalog.js';
import {
  loadState,
  loadContracts,
  loadTestScenarios,
} from './core/project.js';
import { commandHeader, log } from './core/ui.js';
import {
  generateOpenApiYaml,
  generateController,
  generateEntity,
  generateRepository,
  generateServiceInterface,
  generateDtos,
  generateTestClass,
  generatePomXml,
  generateBuildGradle,
  generateSettingsGradle,
  generateApplicationYml,
  generateApplicationJava,
} from './emit/generators.js';

const BASE_PACKAGE = 'com.forge.app';
const ARTIFACT_ID = 'forge-app';

/**
 * CLI contracts.yml 엔드포인트(method/path/description)는 body/response 필드가 없으므로
 * 메서드와 경로 형태로부터 합리적인 기본 body/response 문자열을 유추한다.
 * 웹 UI의 풍부한 추론기(generators.js)만큼 정교하진 않지만 스켈레톤 생성엔 충분하다.
 */
function enrichEndpoint(ep, blockName) {
  const hasId = ep.path.includes('{id}');
  const m = ep.method.toUpperCase();

  let body = '—';
  let response = `200 { id, name }`;

  if (m === 'GET' && !hasId) {
    body = '—';
    response = `200 { items, total, page }`;
  } else if (m === 'GET' && hasId) {
    body = '—';
    response = `200 { id, name, createdAt, updatedAt }`;
  } else if (m === 'POST') {
    body = `{ name }`;
    response = `201 { id, name }`;
  } else if (m === 'PUT' || m === 'PATCH') {
    body = `{ name }`;
    response = `200 { id, name, updatedAt }`;
  } else if (m === 'DELETE') {
    body = '—';
    response = `204 No Content`;
  }

  return {
    method: ep.method,
    path: ep.path.startsWith('/api/v1') ? ep.path : `/api/v1${ep.path}`,
    summary: ep.description || `${blockName} ${ep.method}`,
    body,
    response,
  };
}

/**
 * CLI contracts.yml의 { apis: [{ block_id, block_name, base_path, endpoints }] }를
 * 웹 UI 생성기가 기대하는 { service, endpoints[] } 그룹 배열로 변환한다.
 * 같은 World에 속한 블럭은 하나의 service group으로 합친다.
 */
function buildGroupsFromContracts(contracts, catalog, blockMap) {
  const worldById = new Map((catalog.worlds || []).map((w) => [w.id, w]));
  const bundleById = new Map((catalog.bundles || []).map((b) => [b.id, b]));
  const byService = new Map();

  for (const api of contracts.apis || []) {
    const block = blockMap.get(api.block_id);
    const bundle = block ? bundleById.get(block.bundle_id) : null;
    const world = bundle ? worldById.get(bundle.world_id) : null;
    const serviceName = world?.title || api.block_name || api.block_id;

    const enriched = (api.endpoints || []).map((ep) => {
      const fullPath = ep.path ? `${api.base_path}${ep.path}` : api.base_path;
      return enrichEndpoint({ ...ep, path: fullPath }, api.block_name);
    });

    if (!byService.has(serviceName)) {
      byService.set(serviceName, { service: serviceName, endpoints: [] });
    }
    byService.get(serviceName).endpoints.push(...enriched);
  }

  return [...byService.values()].filter((g) => g.endpoints.length);
}

function buildReadme(catalogName, serviceCount, blockCount, buildTool) {
  const runCmd = buildTool === 'maven' ? 'mvn spring-boot:run' : './gradlew bootRun';
  return `# ${catalogName} — Generated Backend

Forge Protocol \`forge emit\`이 자동 생성한 Spring Boot 백엔드 스켈레톤입니다.

- 서비스: ${serviceCount}개
- 블럭:  ${blockCount}개
- 빌드:  ${buildTool === 'maven' ? 'Maven (pom.xml)' : 'Gradle (build.gradle)'}

## 실행

\`\`\`bash
cd .forge/generated/backend
${runCmd}
\`\`\`

기본 프로파일은 H2 파일 DB(\`./data/${ARTIFACT_ID}\`)를 사용합니다. 앱 첫 실행 시 스키마가 자동 생성됩니다.

- Swagger UI:  http://localhost:8080/swagger-ui.html
- OpenAPI:     http://localhost:8080/v3/api-docs
- H2 콘솔:     http://localhost:8080/h2-console

## 운영 프로파일

MySQL/PostgreSQL/Oracle 등으로 교체하려면 \`application-prod.yml\`을 만들고
\`--spring.profiles.active=prod\` 로 실행하세요.

## 주의

생성된 ServiceImpl 메서드는 대부분 \`// TODO: implement\` 힌트만 포함합니다.
비즈니스 로직은 직접 구현해야 하며, Entity 필드도 도메인에 맞게 조정이 필요합니다.
`;
}

export async function runEmit(options = {}) {
  const projectDir = process.cwd();
  const forgeDir = join(projectDir, '.forge');

  const state = await loadState(forgeDir);
  if (!state) return;

  const contracts = await loadContracts(forgeDir);
  if (!contracts) {
    log.blank();
    log.warn('contracts.yml이 없습니다. 먼저 Build를 실행하세요.');
    log.dim('forge build');
    log.blank();
    return;
  }

  const scenarios = await loadTestScenarios(forgeDir);
  const catalog = await loadProjectCatalog(projectDir);
  const blockMap = buildBlockMap(catalog);

  log.blank();
  console.log(commandHeader(state, 'Emit (코드 생성)'));
  log.dim(`${contracts.apis?.length ?? 0}개 블럭 → Spring Boot 스켈레톤`);

  // 대상 결정: CLI 옵션 우선, 없으면 인터랙티브
  let target = options.target;
  if (!target) {
    const ans = await inquirer.prompt([
      {
        type: 'list',
        name: 'target',
        message: '무엇을 생성할까요?',
        choices: [
          { name: '전체 (backend 스켈레톤 + JUnit5 테스트)', value: 'all' },
          { name: 'backend — Controller/Service/Repository/Entity/DTO', value: 'backend' },
          { name: 'tests — JUnit5 테스트 클래스만', value: 'tests' },
        ],
      },
    ]);
    target = ans.target;
  }

  // 빌드 도구: --build 플래그, 없으면 gradle 기본
  const buildTool = (options.build || 'gradle').toLowerCase();
  if (!['gradle', 'maven'].includes(buildTool)) {
    log.warn(`알 수 없는 빌드 도구: ${buildTool} (gradle | maven 중 선택)`);
    return;
  }

  const groups = buildGroupsFromContracts(contracts, catalog, blockMap);
  if (!groups.length && target !== 'tests') {
    log.warn('contracts.yml에서 엔드포인트 그룹을 만들지 못했습니다. catalog.yml의 world/bundle 매핑을 확인하세요.');
    return;
  }

  const outDir = join(forgeDir, 'generated', 'backend');
  const baseDir = BASE_PACKAGE.replace(/\./g, '/');

  const spinner = ora('코드 생성 중...').start();

  try {
    await mkdir(outDir, { recursive: true });

    const emitted = [];

    async function emit(relPath, content) {
      const abs = join(outDir, relPath);
      await mkdir(join(abs, '..'), { recursive: true });
      await writeFile(abs, content, 'utf-8');
      emitted.push(relPath);
    }

    if (target === 'backend' || target === 'all') {
      // 프로젝트 뼈대
      if (buildTool === 'maven') {
        await emit('pom.xml', generatePomXml(BASE_PACKAGE, ARTIFACT_ID));
      } else {
        await emit('build.gradle', generateBuildGradle(BASE_PACKAGE, ARTIFACT_ID));
        await emit('settings.gradle', generateSettingsGradle(ARTIFACT_ID));
      }
      await emit('src/main/resources/application.yml', generateApplicationYml(ARTIFACT_ID));
      await emit(`src/main/java/${baseDir}/Application.java`, generateApplicationJava(BASE_PACKAGE));
      await emit('openapi.yml', generateOpenApiYaml(groups, catalog.name || 'Forge'));

      // 서비스별 생성물
      for (const grp of groups) {
        const pkg = grp.service
          .toLowerCase()
          .replace(/\s*service$/i, '')
          .replace(/[\s-]+/g, '')
          .trim() || 'app';
        const cls = pascalForService(grp.service);
        const src = `src/main/java/${baseDir}/${pkg}`;

        await emit(`${src}/entity/${cls}.java`, generateEntity(grp, BASE_PACKAGE));
        await emit(`${src}/repository/${cls}Repository.java`, generateRepository(grp, BASE_PACKAGE));
        await emit(`${src}/controller/${cls}Controller.java`, generateController(grp, BASE_PACKAGE));
        await emit(`${src}/service/${cls}Service.java`, generateServiceInterface(grp, BASE_PACKAGE));

        for (const dto of generateDtos(grp, BASE_PACKAGE)) {
          await emit(`${src}/dto/${dto.name}.java`, dto.content);
        }
      }

      await emit('README.md', buildReadme(catalog.name || 'Forge', groups.length, (contracts.apis || []).length, buildTool));
    }

    if ((target === 'tests' || target === 'all') && scenarios?.blocks?.length) {
      const testDir = `src/test/java/${baseDir}`;
      for (const sc of scenarios.blocks) {
        // test-scenarios.yml은 CLI 스키마로 저장됨: { block_id, block_name, scenarios: [...] }
        const scenario = {
          blockId: sc.block_id,
          block: sc.block_name,
          tests: (sc.scenarios || []).map((s) => ({
            name: s.name,
            given: s.given,
            when: s.when,
            then: s.then,
            type: s.type,
          })),
        };
        if (!scenario.tests.length) continue;
        const className =
          pascalForService(scenario.blockId || scenario.block) + 'Test';
        await emit(`${testDir}/${className}.java`, generateTestClass(scenario, BASE_PACKAGE));
      }
    }

    spinner.succeed('생성 완료');

    log.section('생성 요약', '📦');
    log.kv('대상', target);
    log.kv('빌드', buildTool);
    log.kv('서비스', `${groups.length}개`);
    log.kv('파일', `${emitted.length}개`);
    log.kv('출력', outDir);

    const runCmd = buildTool === 'maven' ? 'mvn spring-boot:run' : './gradlew bootRun';
    log.section('다음 단계', '🚀');
    log.item(`cd .forge/generated/backend && ${runCmd}`, { color: 'cyan' });
    log.item('Swagger UI: http://localhost:8080/swagger-ui.html', { color: 'cyan' });
    log.blank();
  } catch (e) {
    spinner.fail('생성 실패');
    throw e;
  }
}

function pascalForService(s) {
  const camel = (x) => x.replace(/[-_\s]+([a-zA-Z])/g, (_, c) => c.toUpperCase());
  const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : '');
  return cap(camel((s || 'resource').replace(/\s*service$/i, '').replace(/\s+/g, '-')));
}
