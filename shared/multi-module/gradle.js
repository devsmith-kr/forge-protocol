/**
 * shared/multi-module/gradle.js — v0.5.0 멀티모듈 Gradle 빌드 파일 생성기
 *
 * decideLayout 결과(LayoutResult.modules)를 받아 5종 build/settings 파일을 만든다.
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ Root build.gradle                                       │
 *   │   - subprojects 공통 plugin/repo/lombok/test 설정       │
 *   │   - org.springframework.boot 는 'apply false' (BOM 만)  │
 *   │ Root settings.gradle                                    │
 *   │   - include ':core' / ':domain-*' / ':app'              │
 *   │ :core build.gradle                                      │
 *   │   - api spring-boot-starter-web/data-jpa (도메인 노출)  │
 *   │ :domain-* build.gradle                                  │
 *   │   - implementation project(':core') ONLY                │
 *   │   - 다른 domain 모듈은 절대 import 불가                  │
 *   │ :app build.gradle                                       │
 *   │   - org.springframework.boot plugin 적용 (단일 부트 jar)│
 *   │   - core + 모든 domain 모듈 implementation               │
 *   └─────────────────────────────────────────────────────────┘
 *
 * 의존성 방향:  :domain-X → :core  (한 방향). :app 은 모두를 합친다.
 */

const SPRING_BOOT_VERSION = '3.3.0';
const SPRING_DEP_MGMT_VERSION = '1.1.5';
const ARCHUNIT_VERSION = '1.3.0';
const SPRINGDOC_VERSION = '2.5.0';

const DEFAULT_OPTS = Object.freeze({
  basePackage: 'com.forge.app',
  artifactId: 'forge-app',
  javaVersion: '17',
});

function resolveOpts(opts = {}) {
  return { ...DEFAULT_OPTS, ...opts };
}

function groupIdOf(basePackage) {
  return basePackage.replace(/\.[^.]+$/, '') || 'com.forge';
}

/**
 * Root build.gradle — 모든 subproject 가 공유하는 plugin/dep/lombok 설정.
 * 부트 plugin 은 'apply false' 로 BOM 만 가져오고, 실제 적용은 :app 모듈에서.
 */
export function generateRootBuildGradle(modules, opts = {}) {
  const { basePackage, javaVersion } = resolveOpts(opts);
  const groupId = groupIdOf(basePackage);
  return `plugins {
    id 'java'
    id 'org.springframework.boot' version '${SPRING_BOOT_VERSION}' apply false
    id 'io.spring.dependency-management' version '${SPRING_DEP_MGMT_VERSION}' apply false
}

allprojects {
    group = '${groupId}'
    version = '0.1.0-SNAPSHOT'

    repositories {
        mavenCentral()
    }
}

subprojects {
    apply plugin: 'java-library'
    apply plugin: 'io.spring.dependency-management'

    java {
        sourceCompatibility = JavaVersion.VERSION_${javaVersion}
        targetCompatibility = JavaVersion.VERSION_${javaVersion}
    }

    // 한글 주석/문자열을 UTF-8 로 강제 — Windows JDK 기본 인코딩(CP949) 컴파일 실패 방지
    tasks.withType(JavaCompile).configureEach {
        options.encoding = 'UTF-8'
    }
    tasks.withType(Test).configureEach {
        systemProperty 'file.encoding', 'UTF-8'
    }

    dependencyManagement {
        imports {
            mavenBom "org.springframework.boot:spring-boot-dependencies:${SPRING_BOOT_VERSION}"
        }
    }

    dependencies {
        compileOnly 'org.projectlombok:lombok'
        annotationProcessor 'org.projectlombok:lombok'
        testCompileOnly 'org.projectlombok:lombok'
        testAnnotationProcessor 'org.projectlombok:lombok'
        testImplementation 'org.springframework.boot:spring-boot-starter-test'
    }

    tasks.named('test') {
        useJUnitPlatform()
    }
}

// 빌드: ./gradlew build
// 실행: ./gradlew :app:bootRun
`;
}

/**
 * Root settings.gradle — 모든 모듈 include 선언.
 * core → domain-* → app 순서로 출력 (의존 그래프 가독성).
 */
export function generateRootSettingsGradle(modules, opts = {}) {
  const { artifactId } = resolveOpts(opts);
  const includes = (modules || [])
    .map((m) => `include '${m.gradlePath}'`)
    .join('\n');
  return `rootProject.name = '${artifactId}'

${includes}
`;
}

/**
 * :core build.gradle — 모든 도메인이 의존하는 공통 라이브러리.
 *
 * spring-boot-starter-web/data-jpa 를 'api' 로 노출해 도메인 모듈이
 * Controller/Repository 어노테이션을 별도 의존성 선언 없이 쓸 수 있게 한다.
 */
export function generateCoreBuildGradle(opts = {}) {
  return `// :core — 공통 컴포넌트 (BaseEntity, CommonResponse, GlobalExceptionHandler ...)
// 모든 :domain-* 모듈이 이 모듈에 의존한다. 부트 jar 만들지 않는다.
//
// Spring 의존성을 'api' 로 노출해 도메인 모듈이 Controller/Repository 어노테이션을
// 별도 선언 없이 사용하게 한다. springdoc 도 동일 — Controller 가 @Tag/@Operation 사용.

dependencies {
    api 'org.springframework.boot:spring-boot-starter-web'
    api 'org.springframework.boot:spring-boot-starter-data-jpa'
    api 'org.springframework.boot:spring-boot-starter-validation'
    api 'org.springdoc:springdoc-openapi-starter-webmvc-ui:${SPRINGDOC_VERSION}'
}
`;
}

/**
 * :domain-* build.gradle — 단일 도메인 모듈.
 *
 * **핵심 불변식**: 다른 domain 모듈을 절대 implementation 하지 않는다.
 * 컴파일 시점에 다른 도메인 패키지를 import 하면 "package does not exist" 가 난다.
 *
 * @param {object} domainModule  decideLayout 의 domain kind 모듈 entry
 * @param {object} [opts]
 */
export function generateDomainBuildGradle(domainModule, opts = {}) {
  if (!domainModule || domainModule.kind !== 'domain') {
    throw new Error(
      `generateDomainBuildGradle: domain kind 모듈이 필요합니다 (받은 kind: ${domainModule?.kind ?? 'undefined'})`,
    );
  }
  return `// :${domainModule.name} — ${domainModule.service ?? domainModule.slug} 도메인
// 다른 domain 모듈을 절대 implementation 하지 말 것 (경계 위반).

dependencies {
    implementation project(':core')

    runtimeOnly 'com.h2database:h2'

    // ArchUnit — 도메인 경계 자동 검증 (Step 7 에서 테스트 클래스 생성)
    testImplementation 'com.tngtech.archunit:archunit-junit5:${ARCHUNIT_VERSION}'
}
`;
}

/**
 * :app build.gradle — 단일 부트 jar 진입점.
 *
 * core + 모든 domain 모듈을 implementation 으로 모은다. 부트 plugin 은 여기서만 적용.
 *
 * @param {Array<object>} modules  decideLayout().modules 전체
 * @param {object} [opts]
 */
export function generateAppBuildGradle(modules, opts = {}) {
  const { basePackage, artifactId } = resolveOpts(opts);
  const projectDeps = (modules || [])
    .filter((m) => m.kind === 'shared' || m.kind === 'domain')
    .map((m) => `    implementation project('${m.gradlePath}')`)
    .join('\n');

  return `// :app — Spring Boot 부트 진입점. core + 모든 domain 모듈을 통합한다.

plugins {
    id 'org.springframework.boot'
}

dependencies {
${projectDeps}

    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-validation'
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:${SPRINGDOC_VERSION}'

    runtimeOnly 'com.h2database:h2'
}

bootJar {
    archiveBaseName = '${artifactId}'
    mainClass = '${basePackage}.Application'
}

springBoot {
    mainClass = '${basePackage}.Application'
}
`;
}
