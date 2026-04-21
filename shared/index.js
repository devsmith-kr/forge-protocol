/**
 * shared/index.js
 *
 * 공용 코드 생성 모듈의 진입점.
 * CLI(`lib/emit`)와 Web(`web/src/codeGenerators`) 양쪽이 여기서 import한다.
 *
 * 파일 구성:
 *   - names.js         : 파싱/이름/타입 추론 유틸
 *   - openapi.js       : OpenAPI 3.1 YAML
 *   - java-api.js      : Controller + Entity + Repository + DTO
 *   - java-service.js  : Service 인터페이스 + ServiceImpl + actionHint
 *   - java-test.js     : JUnit5 테스트 클래스
 *   - project.js       : pom.xml / build.gradle / application.yml / Application.java
 */

export {
  cap,
  camel,
  pascal,
  pkgOf,
  clsOf,
  svcVar,
  parseBody,
  parseResp,
  pathSegs,
  methodName,
  reqDtoName,
  respDtoName,
  javaType,
  isCrudEndpoint,
  inferEntityFields,
} from './names.js';

export { generateOpenApiYaml } from './openapi.js';

export {
  generateController,
  generateEntity,
  generateRepository,
  generateDtos,
} from './java-api.js';

export {
  generateServiceInterface,
  generateServiceImpl,
  actionHint,
} from './java-service.js';

export { generateTestClass } from './java-test.js';

export {
  generatePomXml,
  generateBuildGradle,
  generateSettingsGradle,
  generateApplicationYml,
  generateApplicationJava,
} from './project.js';
