import { describe, it, expect } from 'vitest'
import { parseCatalogYml, validateCatalog } from '../src/parseCatalog.js'

const SAMPLE_YAML = `
name: 테스트 카탈로그
domain: test
worlds:
  - id: world1
    title: 월드 1
bundles:
  - id: bundle1
    world_id: world1
    title: 번들 1
blocks:
  - id: block-a
    bundle_id: bundle1
    name: 블럭 A
    effort_days: 3
  - id: block-b
    bundle_id: bundle1
    name: 블럭 B
    effort_days: 2
dependencies:
  - type: requires
    source: block-a
    target: block-b
    reason: A는 B가 필요
`

describe('parseCatalogYml', () => {
  it('유효한 YAML을 파싱한다', () => {
    const catalog = parseCatalogYml(SAMPLE_YAML)
    expect(catalog.name).toBe('테스트 카탈로그')
    expect(catalog.blocks).toHaveLength(2)
    expect(catalog.blockMap['block-a'].name).toBe('블럭 A')
  })

  it("worlds에 'all'이 없으면 자동 삽입한다", () => {
    const catalog = parseCatalogYml(SAMPLE_YAML)
    expect(catalog.worlds[0].id).toBe('all')
  })

  it('resolveDeps는 requires를 재귀 해결한다', () => {
    const catalog = parseCatalogYml(SAMPLE_YAML)
    const result = catalog.resolveDeps(new Set(['block-a']))
    expect(result.allSelected.has('block-a')).toBe(true)
    expect(result.allSelected.has('block-b')).toBe(true)
    expect(result.autoAdded.has('block-b')).toBe(true)
    expect(result.totalDays).toBe(5)
  })

  it('직접 선택된 블럭은 autoAdded에 포함되지 않는다', () => {
    const catalog = parseCatalogYml(SAMPLE_YAML)
    const result = catalog.resolveDeps(new Set(['block-a', 'block-b']))
    expect(result.autoAdded.has('block-b')).toBe(false)
  })
})

describe('validateCatalog', () => {
  it('유효한 카탈로그는 에러 배열이 비어있다', () => {
    const catalog = parseCatalogYml(SAMPLE_YAML)
    expect(validateCatalog(catalog)).toEqual([])
  })

  it('blocks/bundles 부재를 감지한다', () => {
    const errors = validateCatalog({ blocks: [], bundles: [] })
    expect(errors.length).toBeGreaterThanOrEqual(2)
  })

  it('bundle_id 누락을 감지한다', () => {
    const errors = validateCatalog({
      blocks: [{ id: 'orphan' }],
      bundles: [{ id: 'b1' }],
    })
    expect(errors.some((e) => e.includes('bundle_id'))).toBe(true)
  })
})
