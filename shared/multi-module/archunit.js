/**
 * shared/multi-module/archunit.js — 도메인 경계 ArchUnit 테스트 생성기
 *
 * Gradle 의존성 미선언만으로도 1차 경계가 강제되지만, 다음 시나리오에선
 * Gradle 만으로 부족하다:
 *   - 누군가가 :app 모듈에서 두 도메인 클래스를 직접 조립하려는 경우
 *   - 누군가가 임시로 build.gradle 에 다른 :domain 의존성을 추가했다가 PR 까먹는 경우
 *
 * ArchUnit 은 컴파일된 클래스를 분석해 "도메인 A 의 클래스가 도메인 B 패키지를
 * 참조하면 빌드 실패" 를 자동화한다. JUnit5 와 통합되어 있어 별도 러너 불필요.
 *
 * 출력 위치: domain-{slug}/src/test/java/{basePkg}/{packageSegment}/architecture/{Class}ArchitectureTest.java
 */

import { classNameOf } from '../names.js';

/**
 * 한 도메인 모듈의 경계 검증 테스트 파일 한 개를 생성한다.
 *
 * @param {object} currentDomain        layout.modules 중 하나 ({slug, packageSegment, service})
 * @param {Array<object>} otherDomains  같은 layout 의 다른 domain 모듈들
 * @param {string} basePackage          예: 'com.forge.app'
 * @returns {{relPath: string, content: string}}  domain 모듈 sourceRoot 기준 상대 경로
 */
export function domainBoundaryTestFile(currentDomain, otherDomains, basePackage = 'com.forge.app') {
  if (!currentDomain || currentDomain.kind !== 'domain') {
    throw new Error(
      `domainBoundaryTestFile: domain kind 모듈이 필요합니다 (받은 kind: ${currentDomain?.kind ?? 'undefined'})`,
    );
  }

  // currentDomain 자체가 group 형태가 아니므로 layout 모듈을 group-like 객체로 변환
  const className = `${classNameOf({ service: currentDomain.service, slug: currentDomain.slug, packageSegment: currentDomain.packageSegment })}ArchitectureTest`;
  const baseDir = basePackage.replace(/\./g, '/');
  const segDir = currentDomain.packageSegment;
  const relPath = `src/test/java/${baseDir}/${segDir}/architecture/${className}.java`;
  return {
    relPath,
    content: domainBoundaryTestSource({
      className,
      basePackage,
      currentSlug: currentDomain.slug,
      currentSegment: currentDomain.packageSegment,
      otherSegments: otherDomains
        .filter((m) => m.kind === 'domain' && m.slug !== currentDomain.slug)
        .map((m) => m.packageSegment)
        .filter(Boolean),
    }),
  };
}

function domainBoundaryTestSource({ className, basePackage, currentSlug, currentSegment, otherSegments }) {
  const pkg = `${basePackage}.${currentSegment}.architecture`;
  const ownPackage = `${basePackage}.${currentSegment}..`;

  // 다른 도메인이 1개라도 있을 때만 의미 있는 룰 — 없으면 룰을 빈 항목으로 두지 말고
  // "도메인 1개" 시나리오용 sentinel 룰만 둔다 (테스트가 통과하되 의도는 분명).
  const hasOthers = otherSegments.length > 0;
  const otherPackagesArg = hasOthers
    ? otherSegments.map((s) => `\n            "${basePackage}.${s}.."`).join(',') + '\n        '
    : '';

  const ruleBody = hasOthers
    ? `
    /**
     * 이 도메인 모듈의 어떤 클래스도 다른 도메인 패키지를 참조해선 안 된다.
     * 위반 시 빌드 실패 — Gradle 의존성 차단을 보강하는 이중 안전망이다.
     */
    @ArchTest
    static final ArchRule no_dependency_on_other_domains =
        ArchRuleDefinition.noClasses()
            .that().resideInAPackage("${ownPackage}")
            .should().dependOnClassesThat().resideInAnyPackage(${otherPackagesArg})
            .because("도메인 모듈은 다른 도메인의 클래스에 직접 의존할 수 없습니다 (멀티모듈 경계)");`
    : `
    /**
     * 도메인이 1개뿐이라 도메인-간 경계 룰은 trivially 만족.
     * 도메인이 추가되면 forge emit 재실행 시 자동으로 다른 도메인 룰이 채워진다.
     */
    @ArchTest
    static final ArchRule classes_reside_in_own_package =
        ArchRuleDefinition.classes()
            .that().resideInAPackage("${ownPackage}")
            .should().resideInAPackage("${ownPackage}")
            .because("이 모듈의 클래스는 자기 패키지 안에 있어야 합니다");`;

  return `package ${pkg};

import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition;

/**
 * ${currentSegment} 도메인의 ArchUnit 경계 검증 테스트.
 * Forge Protocol \`forge emit --layout multi-module\` 가 자동 생성합니다.
 *
 * 룰:
 *   1) 다른 도메인 패키지를 import 하면 빌드 실패
 *
 * 실행: \`./gradlew :domain-${currentSlug}:test\`
 *      (또는 ./gradlew test 로 전체 모듈 일괄 검증)
 */
@AnalyzeClasses(packages = "${basePackage}.${currentSegment}")
class ${className} {
${ruleBody}
}
`;
}
