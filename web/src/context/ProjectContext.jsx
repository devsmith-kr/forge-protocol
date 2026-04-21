import { createContext, useContext, useMemo } from 'react'
import { resolveDeps as defaultResolveDeps } from '../catalog'

/**
 * ProjectContext — Phase 간에 공유되는 프로젝트 상태.
 *
 * 포함 필드:
 *   - activeCatalog         : 현재 사용 중인 카탈로그 (builtin/upload/AI)
 *   - metaResult            : meta-smelt 결과 (AI 추천 이유, confidence, summary)
 *   - selectedIds           : 사용자가 선택한 블럭 Set
 *   - setSelectedIds        : 선택 변경 setter
 *   - allSelected/autoAdded/totalDays/reasons : resolveDeps() 결과
 *
 * 네비게이션(onNext/onPrev)은 phase index에 의존하므로 props로 유지.
 */
const ProjectContext = createContext(null)

export function ProjectProvider({
  activeCatalog,
  metaResult,
  selectedIds,
  setSelectedIds,
  children,
}) {
  const resolveDepsFn = activeCatalog?.resolveDeps || defaultResolveDeps
  const resolution = useMemo(
    () => resolveDepsFn(selectedIds),
    [selectedIds, resolveDepsFn],
  )

  const value = useMemo(
    () => ({
      activeCatalog,
      metaResult,
      selectedIds,
      setSelectedIds,
      ...resolution,
    }),
    [activeCatalog, metaResult, selectedIds, setSelectedIds, resolution],
  )

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  )
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new Error('useProject must be used within <ProjectProvider>')
  }
  return ctx
}
