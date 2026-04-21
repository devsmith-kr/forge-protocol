// parseCatalog.js — 사용자 업로드 catalog.yml 파싱 + resolveDeps 빌드
import yaml from 'js-yaml'

// 공통 들여쓰기 제거 (붙여넣기 시 앞 공백이 섞이는 경우 자동 처리)
function dedent(text) {
  const lines = text.split('\n')
  const nonEmpty = lines.filter(l => l.trim().length > 0)
  if (!nonEmpty.length) return text
  const minIndent = Math.min(...nonEmpty.map(l => (l.match(/^(\s*)/)?.[1] ?? '').length))
  if (minIndent === 0) return text
  return lines.map(l => l.slice(minIndent)).join('\n')
}

function buildResolveDeps(blocks, dependencies) {
  const blockMap = Object.fromEntries(blocks.map(b => [b.id, b]))

  const requiresMap = {}
  for (const dep of (dependencies || [])) {
    if (dep.type === 'requires') {
      if (!requiresMap[dep.source]) requiresMap[dep.source] = []
      requiresMap[dep.source].push({ id: dep.target, reason: dep.reason })
    }
  }

  return function resolveDeps(selectedIds) {
    const directSelected = new Set(selectedIds)
    const resolved       = new Set(selectedIds)
    const autoAdded      = new Set()
    const reasons        = {}

    function resolve(id) {
      const reqs = requiresMap[id] || []
      for (const { id: reqId, reason } of reqs) {
        if (!resolved.has(reqId)) {
          resolved.add(reqId)
          if (!directSelected.has(reqId)) {
            autoAdded.add(reqId)
            if (!reasons[reqId]) reasons[reqId] = `${blockMap[id]?.name || id}에 필요`
          }
          resolve(reqId)
        }
      }
    }

    for (const id of directSelected) resolve(id)
    for (const id of directSelected) autoAdded.delete(id)

    const totalDays = [...resolved].reduce((s, id) => s + (blockMap[id]?.effort_days || 0), 0)
    return { allSelected: resolved, autoAdded, totalDays, reasons }
  }
}

export function parseCatalogYml(yamlText) {
  const data = yaml.load(dedent(yamlText))

  const rawBlocks  = data.blocks       || []
  const rawBundles = data.bundles      || []
  const rawWorlds  = data.worlds       || []
  const rawDeps    = data.dependencies || []

  const blockMap  = Object.fromEntries(rawBlocks.map(b => [b.id, b]))
  const bundleMap = Object.fromEntries(rawBundles.map(b => [b.id, b]))

  // 'all' 월드가 없으면 자동 추가
  const worlds = rawWorlds.some(w => w.id === 'all')
    ? rawWorlds
    : [{ id: 'all', title: '전체 보기', icon: '🌐' }, ...rawWorlds]

  return {
    name:       data.name       || '커스텀 카탈로그',
    domain:     data.domain     || 'custom',
    worlds,
    bundles:    rawBundles,
    blocks:     rawBlocks,
    blockMap,
    bundleMap,
    dependencies: rawDeps,
    resolveDeps: buildResolveDeps(rawBlocks, rawDeps),
  }
}

export function validateCatalog(catalog) {
  const errors = []
  if (!catalog.blocks?.length)  errors.push('blocks 배열이 비어 있습니다')
  if (!catalog.bundles?.length) errors.push('bundles 배열이 비어 있습니다')
  for (const b of (catalog.blocks || [])) {
    if (!b.id)        errors.push(`블럭에 id가 없습니다: ${JSON.stringify(b)}`)
    if (!b.bundle_id) errors.push(`블럭 ${b.id}에 bundle_id가 없습니다`)
  }
  return errors
}
