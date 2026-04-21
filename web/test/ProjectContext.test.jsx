import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useState } from 'react'
import { ProjectProvider, useProject } from '../src/context/ProjectContext'

function makeCatalog() {
  return {
    name: 'TestCatalog',
    blockMap: new Map([
      ['a', { id: 'a', name: 'A', effort_days: 2 }],
      ['b', { id: 'b', name: 'B', effort_days: 3 }],
    ]),
    resolveDeps: (selectedIds) => {
      const blocks = Array.from(selectedIds)
      const totalDays = blocks.length * 5
      return {
        allSelected: new Set(blocks),
        autoAdded: new Set(),
        totalDays,
        reasons: new Map(),
      }
    },
  }
}

function Probe() {
  const { allSelected, totalDays, activeCatalog } = useProject()
  return (
    <div>
      <span data-testid="count">{allSelected.size}</span>
      <span data-testid="days">{totalDays}</span>
      <span data-testid="catalog">{activeCatalog?.name ?? 'none'}</span>
    </div>
  )
}

describe('ProjectContext', () => {
  it('provider로 감싸면 useProject가 resolution 결과를 반환', () => {
    const catalog = makeCatalog()
    render(
      <ProjectProvider
        activeCatalog={catalog}
        metaResult={null}
        selectedIds={new Set(['a', 'b'])}
        setSelectedIds={() => {}}
      >
        <Probe />
      </ProjectProvider>,
    )

    expect(screen.getByTestId('count').textContent).toBe('2')
    expect(screen.getByTestId('days').textContent).toBe('10')
    expect(screen.getByTestId('catalog').textContent).toBe('TestCatalog')
  })

  it('selectedIds 변경 시 resolution이 업데이트', () => {
    const catalog = makeCatalog()
    let setter

    function Host() {
      const [ids, setIds] = useState(new Set(['a']))
      setter = setIds
      return (
        <ProjectProvider
          activeCatalog={catalog}
          metaResult={null}
          selectedIds={ids}
          setSelectedIds={setIds}
        >
          <Probe />
        </ProjectProvider>
      )
    }

    render(<Host />)
    expect(screen.getByTestId('count').textContent).toBe('1')
    expect(screen.getByTestId('days').textContent).toBe('5')

    act(() => setter(new Set(['a', 'b'])))
    expect(screen.getByTestId('count').textContent).toBe('2')
    expect(screen.getByTestId('days').textContent).toBe('10')
  })

  it('Provider 밖에서 useProject 호출 시 에러', () => {
    // 에러 로깅 억제
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/useProject must be used within/)
    spy.mockRestore()
  })
})
