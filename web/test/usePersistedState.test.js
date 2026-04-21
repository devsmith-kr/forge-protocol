import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadSession, saveSession, clearSession } from '../src/hooks/usePersistedState.js'

const BUILTIN = {
  name: '빌트인',
  domain: 'commerce',
  worlds: [],
  bundles: [],
  blocks: [],
  blockMap: {},
  bundleMap: {},
  resolveDeps: () => ({ allSelected: new Set(), autoAdded: new Set(), totalDays: 0, reasons: {} }),
}

describe('usePersistedState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('저장된 세션이 없으면 loadSession은 null을 반환한다', () => {
    expect(loadSession(BUILTIN)).toBeNull()
  })

  it('saveSession → loadSession 라운드트립이 phase를 유지한다', () => {
    saveSession({
      phase: 'smelt',
      maxUnlocked: 2,
      selectedIds: new Set(['a', 'b']),
      metaResult: null,
      activeCatalog: BUILTIN,
    })
    const loaded = loadSession(BUILTIN, { commerce: BUILTIN })
    expect(loaded.phase).toBe('smelt')
    expect(loaded.maxUnlocked).toBe(2)
    expect(loaded.selectedIds).toBeInstanceOf(Set)
    expect(loaded.selectedIds.has('a')).toBe(true)
    expect(loaded.selectedIds.has('b')).toBe(true)
  })

  it('clearSession이 저장을 제거한다', () => {
    saveSession({
      phase: 'smelt',
      maxUnlocked: 1,
      selectedIds: new Set(),
      metaResult: null,
      activeCatalog: BUILTIN,
    })
    clearSession()
    expect(loadSession(BUILTIN)).toBeNull()
  })

  it('커스텀 카탈로그는 전체 직렬화된다', () => {
    const custom = {
      name: '커스텀',
      domain: 'finance',
      worlds: [{ id: 'w1', title: 'W1' }],
      bundles: [{ id: 'b1', world_id: 'w1' }],
      blocks: [{ id: 'x', bundle_id: 'b1' }],
      deps: [],
    }
    saveSession({
      phase: 'meta-smelt',
      maxUnlocked: 0,
      selectedIds: new Set(),
      metaResult: null,
      activeCatalog: custom,
    })
    const loaded = loadSession(BUILTIN, {})
    expect(loaded.activeCatalog.domain).toBe('finance')
    expect(loaded.activeCatalog.blocks).toEqual([{ id: 'x', bundle_id: 'b1' }])
  })

  it('잘못된 JSON은 corrupt 이벤트를 브로드캐스트하고 null로 폴백한다', () => {
    localStorage.setItem('forge-protocol-session', '{ not-json')
    const handler = vi.fn()
    window.addEventListener('forge:storage-error', handler)

    expect(loadSession(BUILTIN)).toBeNull()

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail.reason).toBe('corrupt')
    // 깨진 데이터는 즉시 제거되어야 함
    expect(localStorage.getItem('forge-protocol-session')).toBeNull()
    window.removeEventListener('forge:storage-error', handler)
  })

  function mockSetItem(impl) {
    // happy-dom의 Storage.setItem은 prototype 속성이라 defineProperty로만 덮어쓸 수 있다.
    const proto = Object.getPrototypeOf(window.localStorage)
    const original = Object.getOwnPropertyDescriptor(proto, 'setItem')
    Object.defineProperty(window.localStorage, 'setItem', {
      value: impl,
      configurable: true,
      writable: true,
    })
    return () => {
      // 인스턴스에 올린 속성을 덮어써 prototype 메서드가 다시 보이게 복원
      Object.defineProperty(window.localStorage, 'setItem', { ...original })
    }
  }

  it('localStorage quota 초과 시 quota-exceeded 이벤트를 브로드캐스트한다', () => {
    const restore = mockSetItem(() => {
      const err = new Error('quota')
      err.name = 'QuotaExceededError'
      throw err
    })
    const handler = vi.fn()
    window.addEventListener('forge:storage-error', handler)

    saveSession({
      phase: 'smelt',
      maxUnlocked: 0,
      selectedIds: new Set(),
      metaResult: null,
      activeCatalog: BUILTIN,
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail.reason).toBe('quota-exceeded')

    window.removeEventListener('forge:storage-error', handler)
    restore()
  })

  it('기타 쓰기 에러는 write-failed 이벤트를 브로드캐스트한다', () => {
    const restore = mockSetItem(() => { throw new Error('random IO') })
    const handler = vi.fn()
    window.addEventListener('forge:storage-error', handler)

    saveSession({
      phase: 'smelt',
      maxUnlocked: 0,
      selectedIds: new Set(),
      metaResult: null,
      activeCatalog: BUILTIN,
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail.reason).toBe('write-failed')

    window.removeEventListener('forge:storage-error', handler)
    restore()
  })
})
