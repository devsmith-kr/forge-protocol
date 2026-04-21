import { useState, useEffect } from 'react'

const STORAGE_KEY = 'forge-protocol-session'
const BUILTIN_DOMAINS = ['commerce']

/**
 * 저장소 오류를 앱 레벨에서 구독할 수 있도록 CustomEvent로 브로드캐스트.
 *
 * 소비자 예:
 *   window.addEventListener('forge:storage-error', (e) => toast(e.detail.reason))
 */
function broadcastError(reason, detail) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent('forge:storage-error', {
        detail: { reason, ...detail },
      }),
    )
  } catch {
    // CustomEvent 미지원 브라우저 — 조용히 포기
  }
}

function isQuotaError(err) {
  if (!err) return false
  // 브라우저별 코드/이름 편차 흡수
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  )
}

function serialize(state) {
  const isBuiltin = BUILTIN_DOMAINS.includes(state.activeCatalog?.domain)
  return JSON.stringify({
    phase: state.phase,
    maxUnlocked: state.maxUnlocked,
    selectedIds: [...state.selectedIds],
    metaResult: state.metaResult,
    activeCatalogMeta: state.activeCatalog ? {
      name: state.activeCatalog.name,
      domain: state.activeCatalog.domain,
      isBuiltin,
      // 커스텀 카탈로그는 전체 직렬화 (builtin은 재구성)
      worlds:  !isBuiltin ? state.activeCatalog.worlds  : undefined,
      bundles: !isBuiltin ? state.activeCatalog.bundles : undefined,
      blocks:  !isBuiltin ? state.activeCatalog.blocks  : undefined,
      deps:    !isBuiltin ? state.activeCatalog.deps    : undefined,
    } : null,
  })
}

export function loadSession(BUILTIN_CATALOG, CATALOGS = {}) {
  let raw
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch (err) {
    // localStorage 자체가 비활성화(프라이빗 모드 등)
    broadcastError('read-failed', { error: err?.message })
    return null
  }
  if (!raw) return null

  let data
  try {
    data = JSON.parse(raw)
  } catch (err) {
    // 저장된 JSON이 깨진 경우 — 삭제 후 새로 시작
    broadcastError('corrupt', { error: err?.message })
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* 무시 */ }
    return null
  }

  try {
    let activeCatalog = BUILTIN_CATALOG
    if (data.activeCatalogMeta) {
      if (data.activeCatalogMeta.isBuiltin) {
        // builtin 카탈로그는 domain으로 재구성
        activeCatalog = CATALOGS[data.activeCatalogMeta.domain] ?? BUILTIN_CATALOG
      } else {
        // 커스텀 카탈로그는 저장된 데이터로 재구성
        activeCatalog = {
          name: data.activeCatalogMeta.name,
          domain: data.activeCatalogMeta.domain,
          worlds: data.activeCatalogMeta.worlds,
          bundles: data.activeCatalogMeta.bundles,
          blocks: data.activeCatalogMeta.blocks,
          blockMap: Object.fromEntries((data.activeCatalogMeta.blocks || []).map(b => [b.id, b])),
          bundleMap: Object.fromEntries((data.activeCatalogMeta.bundles || []).map(b => [b.id, b])),
          resolveDeps: BUILTIN_CATALOG.resolveDeps,
        }
      }
    }
    return {
      phase: data.phase || 'meta-smelt',
      maxUnlocked: data.maxUnlocked ?? 0,
      selectedIds: new Set(data.selectedIds || []),
      metaResult: data.metaResult || null,
      activeCatalog,
    }
  } catch (err) {
    // 스키마 변경 등으로 재구성 실패
    broadcastError('schema-mismatch', { error: err?.message })
    return null
  }
}

export function saveSession(state) {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state))
  } catch (err) {
    if (isQuotaError(err)) {
      broadcastError('quota-exceeded', { error: err?.message })
    } else {
      broadcastError('write-failed', { error: err?.message })
    }
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    broadcastError('clear-failed', { error: err?.message })
  }
}
