/**
 * lib/emit/generators.js
 *
 * CLI `forge emit`용 코드 생성기 re-export.
 * 실제 구현은 `shared/`에 있고, CLI/Web 양쪽이 여기에서 import한다.
 * 이 파일 자체는 DOM/JSZip 의존성이 없는 순수 문자열 생성기만 노출한다.
 */

export {
  generateOpenApiYaml,
  generateController,
  generateEntity,
  generateRepository,
  generateServiceInterface,
  generateServiceImpl,
  generateDtos,
  generateTestClass,
  generatePomXml,
  generateBuildGradle,
  generateSettingsGradle,
  generateApplicationYml,
  generateApplicationJava,
  actionHint,
} from '../../shared/index.js';
