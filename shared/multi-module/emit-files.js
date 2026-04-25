/**
 * shared/multi-module/emit-files.js — 멀티모듈 emit 의 순수 부분.
 *
 * decideLayout 결과 + 도메인 그룹 + 카탈로그 데이터를 받아
 * `[{ path, content }]` 배열을 반환한다. 파일 시스템 의존성 0 — 브라우저에서도 동작.
 *
 *   CLI:  lib/emit/multi-emit.js 가 결과 array 를 mkdir/writeFile 로 기록
 *   Web:  web/src/codeGenerators.js 가 같은 array 를 JSZip 에 push
 *
 * 두 진입점이 1:1 동일한 트리를 출력하도록 단일 소스 of truth 로 둔다.
 */

import {
  generateController,
  generateEntity,
  generateRepository,
  generateDtos,
} from '../java-api.js';
import { generateServiceClassStub } from '../java-service.js';
import { generateTestClass } from '../java-test.js';
import {
  generateApplicationYml,
  generateApplicationJava,
} from '../project.js';
import { generateOpenApiYaml } from '../openapi.js';
import { classNameOf, clsOf } from '../names.js';
import {
  generateRootBuildGradle,
  generateRootSettingsGradle,
  generateCoreBuildGradle,
  generateDomainBuildGradle,
  generateAppBuildGradle,
} from './gradle.js';
import { coreFiles } from './core-sources.js';
import { domainBoundaryTestFile } from './archunit.js';
import { normalizeSlug, slugifyDomain } from './layout.js';

/**
 * @param {object} args
 * @param {object} args.layout            decideLayout 결과 (kind === 'multi-module')
 * @param {Array}  args.groups            { service, slug?, endpoints[] } 배열
 * @param {object} [args.catalog]         catalog.yml — name/worlds/bundles 사용
 * @param {object} [args.contracts]       contracts.yml — apis 카운트만 사용
 * @param {object} [args.scenarios]       test-scenarios.yml — blocks[].scenarios 추출
 * @param {Map}    [args.blockMap]        block_id → block 객체 (catalog 의 buildBlockMap)
 * @param {string} [args.basePackage='com.forge.app']
 * @param {string} [args.artifactId='forge-app']
 * @param {'backend'|'tests'|'all'} [args.target='all']
 * @returns {Array<{path:string, content:string}>}
 */
export function buildMultiModuleFiles(args) {
  const {
    layout,
    groups = [],
    catalog,
    contracts,
    scenarios,
    blockMap,
    basePackage = 'com.forge.app',
    artifactId = 'forge-app',
    target = 'all',
  } = args;

  if (!layout || layout.kind !== 'multi-module') {
    throw new Error(
      `buildMultiModuleFiles 는 layout.kind === 'multi-module' 만 받습니다 (받은 값: ${layout?.kind})`,
    );
  }

  const opts = { basePackage, artifactId };
  const baseDir = basePackage.replace(/\./g, '/');
  const out = [];
  const push = (path, content) => out.push({ path, content });

  // group → layout domain 모듈 매칭 + packageSegment enrich
  const moduleBySlug = new Map();
  for (const m of layout.modules) {
    if (m.kind === 'domain') moduleBySlug.set(m.slug, m);
  }
  const enrichedGroups = groups.map((g) => enrichGroup(g, moduleBySlug));

  // ── 1. 루트 ──────────────────────────────────────────
  if (target === 'backend' || target === 'all') {
    push('build.gradle', generateRootBuildGradle(layout.modules, opts));
    push('settings.gradle', generateRootSettingsGradle(layout.modules, opts));
  }

  // ── 2. :core ─────────────────────────────────────────
  if (target === 'backend' || target === 'all') {
    push('core/build.gradle', generateCoreBuildGradle(opts));
    for (const f of coreFiles(basePackage)) {
      push(`core/${f.relPath}`, f.content);
    }
  }

  // ── 3. :app ──────────────────────────────────────────
  if (target === 'backend' || target === 'all') {
    push('app/build.gradle', generateAppBuildGradle(layout.modules, opts));
    push('app/src/main/resources/application.yml', generateApplicationYml(artifactId));
    push(
      `app/src/main/java/${baseDir}/Application.java`,
      patchApplicationScan(generateApplicationJava(basePackage), basePackage),
    );
    push('openapi.yml', generateOpenApiYaml(enrichedGroups, catalog?.name || 'Forge'));
    push(
      `app/src/test/java/${baseDir}/ApplicationContextTest.java`,
      generateContextTest(basePackage),
    );
  }

  // ── 4. :domain-* ─────────────────────────────────────
  const domainModules = layout.modules.filter((m) => m.kind === 'domain');
  if (target === 'backend' || target === 'all') {
    for (const grp of enrichedGroups) {
      const mod = grp._module;
      if (!mod) continue;
      const cls = classNameOf(grp);
      const segDir = mod.packageSegment;
      const src = `${mod.sourceRoot}/src/main/java/${baseDir}/${segDir}`;

      push(`${mod.sourceRoot}/build.gradle`, generateDomainBuildGradle(mod, opts));
      push(
        `${src}/entity/${cls}.java`,
        generateEntity(grp, basePackage, { extendsBaseEntity: true }),
      );
      push(
        `${src}/repository/${cls}Repository.java`,
        generateRepository(grp, basePackage),
      );
      push(
        `${src}/controller/${cls}Controller.java`,
        generateController(grp, basePackage),
      );
      // Service 는 단일 @Service 클래스 stub (interface 없음).
      // 모든 메서드 throw UnsupportedOperationException — Spring 컨텍스트 부트 통과 +
      // 사용자가 메서드 본문을 직접 채우는 흐름. v0.4 single 의 interface + impl 패턴은
      // ServiceImpl 의 toResponse() Object 반환이 record 와 호환 안 되는 결함이 있어
      // 멀티모듈에선 단순 stub 클래스로 우회한다.
      push(
        `${src}/service/${cls}Service.java`,
        generateServiceClassStub(grp, basePackage),
      );
      for (const dto of generateDtos(grp, basePackage)) {
        push(`${src}/dto/${dto.name}.java`, dto.content);
      }

      // ArchUnit 도메인 경계
      const archFile = domainBoundaryTestFile(mod, domainModules, basePackage);
      push(`${mod.sourceRoot}/${archFile.relPath}`, archFile.content);
    }
  }

  // ── 5. block-level GWT 테스트 ────────────────────────
  if ((target === 'tests' || target === 'all') && scenarios?.blocks?.length) {
    const slugByWorldId = buildWorldSlugLookup(catalog);
    const worldIdByBundleId = new Map(
      (catalog?.bundles || []).map((b) => [b.id, b.world_id]),
    );

    for (const sc of scenarios.blocks) {
      const tests = (sc.scenarios || sc.test_cases || []).map((s) => ({
        name: s.name,
        given: s.given,
        when: s.when,
        then: s.then,
        type: s.type,
      }));
      if (!tests.length) continue;

      const block = blockMap?.get?.(sc.block_id);
      const worldId = block ? worldIdByBundleId.get(block.bundle_id) : null;
      const worldSlug = worldId ? slugByWorldId.get(worldId) : null;
      const mod = worldSlug ? moduleBySlug.get(worldSlug) : null;
      const moduleRoot = mod?.sourceRoot ?? 'app';

      const scenarioForGen = {
        blockId: sc.block_id,
        block: sc.block_name,
        tests,
      };
      const className = clsOf(scenarioForGen.blockId || scenarioForGen.block || 'block') + 'Test';
      push(
        `${moduleRoot}/src/test/java/${baseDir}/${className}.java`,
        generateTestClass(scenarioForGen, basePackage),
      );
    }
  }

  // ── 6. README ────────────────────────────────────────
  if (target === 'backend' || target === 'all') {
    push(
      'README.md',
      buildMultiReadme({
        catalogName: catalog?.name,
        layout,
        groupCount: enrichedGroups.filter((g) => g._module).length,
        blockCount: contracts?.apis?.length ?? 0,
      }),
    );
  }

  return out;
}

// ── 헬퍼 (multi-emit.js 와 공유) ─────────────────────────

function enrichGroup(group, moduleBySlug) {
  const slug =
    normalizeSlug(group?.slug || '') ||
    slugifyDomain(group?.service);
  const mod = slug ? moduleBySlug.get(slug) : null;
  if (!mod) return { ...group };
  return {
    ...group,
    slug: mod.slug,
    packageSegment: mod.packageSegment,
    _module: mod,
  };
}

function buildWorldSlugLookup(catalog) {
  const map = new Map();
  for (const w of catalog?.worlds || []) {
    const slug = normalizeSlug(w.slug || '') || slugifyDomain(w.title || '');
    if (slug) map.set(w.id, slug);
  }
  return map;
}

function patchApplicationScan(content, basePackage) {
  return content.replace(
    '@SpringBootApplication',
    `@SpringBootApplication(scanBasePackages = "${basePackage}")`,
  );
}

function generateContextTest(basePackage) {
  return `package ${basePackage};

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Spring 컨텍스트가 정상적으로 로드되는지 확인하는 smoke 테스트.
 * 모든 도메인 모듈의 @Component / @Repository / @Configuration 이
 * scanBasePackages 안에서 발견되어야 통과한다.
 */
@SpringBootTest
class ApplicationContextTest {

    @Test
    void contextLoads() {
    }
}
`;
}

function buildMultiReadme({ catalogName, layout, groupCount, blockCount }) {
  const domains = layout.modules
    .filter((m) => m.kind === 'domain')
    .map((m) => `- \`${m.gradlePath}\` — ${m.service ?? m.slug}`)
    .join('\n');

  return `# ${catalogName ?? 'Forge'} — Generated Multi-Module Backend

Forge Protocol \`forge emit --layout multi-module\` (또는 Web UI 의 멀티모듈 ZIP) 가
자동 생성한 Spring Boot 멀티모듈 백엔드입니다.

## 모듈 구성

\`:core\` (공통) → \`:domain-*\` (각 도메인) → \`:app\` (부트 진입점)

${domains}

- 도메인 그룹: ${groupCount}개
- 블럭 수:    ${blockCount}개

## 의존성 방향

\`\`\`
:domain-A ─┐
:domain-B ─┼─→ :core      (한 방향. 도메인 간 직접 의존 금지)
:domain-C ─┘

:app ──→ :core, :domain-A, :domain-B, :domain-C   (모든 도메인 통합)
\`\`\`

다른 도메인 패키지를 import 하려고 하면 컴파일이 실패합니다.

## 실행

\`\`\`bash
cd .forge/generated/backend
./gradlew :app:bootRun
\`\`\`

기본 프로파일은 H2 파일 DB(\`./data/forge-app\`) 를 사용합니다.

- Swagger UI:  http://localhost:8080/swagger-ui.html
- H2 콘솔:     http://localhost:8080/h2-console

## 도메인 경계 검증

각 도메인 모듈에는 ArchUnit 기반 \`*ArchitectureTest\` 가 자동 생성됩니다.
다른 도메인 패키지를 import 하면 빌드가 실패합니다.

\`\`\`bash
./gradlew :domain-marketplace:test
\`\`\`

## 주의

생성된 ServiceImpl 메서드는 대부분 \`// TODO\` 힌트만 포함합니다.
비즈니스 로직 본체와 Entity 의 도메인 필드는 직접 작성해야 합니다.
`;
}
