// codeGenerators.js — Web UI 출력물 → 실제 소스 코드 생성 엔진
//
// 순수 문자열 생성기는 `/shared/`에 있고 CLI(`forge emit`)와 공유한다.
// 이 파일은 브라우저 전용 다운로드 래퍼(JSZip + Blob/URL)만 담는다.

import JSZip from 'jszip'
import {
  pascal,
  pkgOf,
  clsOf,
  generateOpenApiYaml,
  generateController,
  generateEntity,
  generateRepository,
  generateServiceInterface,
  generateServiceImpl,
  generateDtos,
  generateTestClass,
} from '../../shared/index.js'

export { generateOpenApiYaml }

// ═══════════════════════════════════════════════════════════
// 다운로드 유틸
// ═══════════════════════════════════════════════════════════

function downloadBlob(filename, content, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** World ID → 영문 서비스명 변환 (w-buyer → Buyer Service) */
function worldIdToServiceName(id) {
  const name = (id || 'app').replace(/^w-/, '')
  return pascal(name) + ' Service'
}

/** grp.id가 있으면 service 이름을 영문으로 치환한 복사본 반환 */
function normalizeGroup(grp) {
  if (!grp.id) return grp
  return { ...grp, service: worldIdToServiceName(grp.id) }
}

function addBackendSources(zip, groups, basePackage) {
  const baseDir = basePackage.replace(/\./g, '/')
  for (const rawGrp of groups) {
    const grp = normalizeGroup(rawGrp)
    const pkg = pkgOf(grp.service)
    const cls = clsOf(grp.service)
    const src = `src/main/java/${baseDir}/${pkg}`

    zip.file(`${src}/entity/${cls}.java`,               generateEntity(grp, basePackage))
    zip.file(`${src}/repository/${cls}Repository.java`, generateRepository(grp, basePackage))
    zip.file(`${src}/controller/${cls}Controller.java`, generateController(grp, basePackage))
    zip.file(`${src}/service/${cls}Service.java`,       generateServiceInterface(grp, basePackage))
    zip.file(`${src}/service/${cls}ServiceImpl.java`,   generateServiceImpl(grp, basePackage))

    for (const dto of generateDtos(grp, basePackage)) {
      zip.file(`${src}/dto/${dto.name}.java`, dto.content)
    }
  }
}

function addTestSources(zip, scenarios, basePackage) {
  const testDir = `src/test/java/${basePackage.replace(/\./g, '/')}`
  for (const sc of scenarios) {
    const rawId = sc.blockId
      || sc.block.replace(/[\u3131-\uD79D\s]+/g, '-').replace(/^-|-$/g, '').trim()
      || 'Block'
    const cls = pascal(rawId.replace(/-/g, '-')) + 'Test'
    zip.file(`${testDir}/${cls}.java`, generateTestClass(sc, basePackage))
  }
}

// ═══════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════

/** Phase 3: openapi.yml 단일 파일 다운로드 */
export function downloadOpenApi(groups, catalogName = 'Forge') {
  const yaml = generateOpenApiYaml(groups, catalogName)
  downloadBlob('openapi.yml', yaml, 'application/yaml')
}

/** Phase 3: 스켈레톤 코드 ZIP (openapi.yml + Entity + Repository + Controller + Service + DTO) */
export async function downloadSkeletonZip(groups, catalogName = 'forge') {
  const zip         = new JSZip()
  const basePackage = 'com.forge.app'

  zip.file('openapi.yml', generateOpenApiYaml(groups, catalogName))
  addBackendSources(zip, groups, basePackage)

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(`${catalogName.toLowerCase()}-skeleton.zip`, blob, 'application/zip')
}

/** Phase 4: JUnit5 테스트 코드 ZIP */
export async function downloadTestZip(scenarios, catalogName = 'forge') {
  const zip         = new JSZip()
  const basePackage = 'com.forge.app'

  addTestSources(zip, scenarios, basePackage)

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(`${catalogName.toLowerCase()}-tests.zip`, blob, 'application/zip')
}

/** Phase 5: 전체 패키지 ZIP (openapi + 스켈레톤 + 테스트) */
export async function downloadFullPackage(groups, scenarios, catalogName = 'forge') {
  const zip         = new JSZip()
  const basePackage = 'com.forge.app'

  zip.file('openapi.yml', generateOpenApiYaml(groups, catalogName))
  addBackendSources(zip, groups, basePackage)
  addTestSources(zip, scenarios, basePackage)

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(`${catalogName.toLowerCase()}-full.zip`, blob, 'application/zip')
}
