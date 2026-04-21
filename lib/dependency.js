/**
 * Forge Protocol — 의존성 해결 엔진
 *
 * 블럭 간 requires/affects 관계를 재귀적으로 탐색하고,
 * 캐스케이드 규칙과 World 0 준비물을 수집한다.
 */

/**
 * 재귀적으로 직접+간접 의존성(requires)을 탐색한다.
 * 순환 참조를 방지한다.
 */
function resolveRequired(blockId, deps, visited = new Set()) {
  if (visited.has(blockId)) return [];
  visited.add(blockId);

  const directDeps = deps.filter(d => d.source === blockId && d.type === 'requires');
  const result = [];

  for (const dep of directDeps) {
    result.push(dep.target);
    result.push(...resolveRequired(dep.target, deps, visited));
  }

  return [...new Set(result)];
}

/**
 * 영향받는(affects) 블럭을 탐색한다.
 */
function resolveAffected(blockId, deps) {
  return deps
    .filter(d => d.source === blockId && d.type === 'affects')
    .map(d => d.target);
}

/**
 * 선택된 블럭 목록에 대해 전체 의존성을 해결한다.
 *
 * 반환: {
 *   allBlocks      - 최종 블럭 ID 목록 (선택 + 자동 추가)
 *   autoAdded      - 자동 추가된 블럭 ID 목록
 *   affected       - 영향받는 블럭 ID 목록
 *   prerequisites  - 필요한 World 0 준비물
 *   decisions      - 사용자 결정 필요 항목
 * }
 */
export function resolveAll(selectedBlockIds, catalog) {
  const deps = catalog.dependencies || [];
  const cascades = catalog.cascades || [];
  const prereqs = catalog.prerequisites || [];

  // 1. 모든 선택 블럭의 requires 의존성 해결
  const requiredSet = new Set(selectedBlockIds);
  for (const blockId of selectedBlockIds) {
    for (const reqId of resolveRequired(blockId, deps)) {
      requiredSet.add(reqId);
    }
  }

  const allBlocks = [...requiredSet];
  const autoAdded = allBlocks.filter(id => !selectedBlockIds.includes(id));

  // 2. 영향받는 블럭 수집
  const affectedSet = new Set();
  for (const blockId of allBlocks) {
    for (const affId of resolveAffected(blockId, deps)) {
      if (!requiredSet.has(affId)) {
        affectedSet.add(affId);
      }
    }
  }

  // 3. World 0 준비물 수집
  const neededPrereqs = prereqs.filter(p =>
    p.enables && p.enables.some(blockId => requiredSet.has(blockId))
  );

  // 4. 사용자 결정 수집
  const decisions = collectDecisions(allBlocks, catalog);

  return {
    allBlocks,
    autoAdded,
    affected: [...affectedSet],
    prerequisites: neededPrereqs,
    decisions,
  };
}

/**
 * 선택된 블럭에 대한 캐스케이드 결정사항을 수집한다.
 */
function collectDecisions(selectedBlockIds, catalog) {
  const cascades = catalog.cascades || [];
  const decisions = [];

  for (const cascade of cascades) {
    if (selectedBlockIds.includes(cascade.trigger)) {
      for (const q of (cascade.ask_questions || [])) {
        decisions.push({
          trigger: cascade.trigger,
          question: q.question,
          options: q.options,
          cascade_effects: q.cascade_effects,
        });
      }
    }
  }

  return decisions;
}
