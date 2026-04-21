import { createContext, useContext, useMemo, useState } from 'react'
import ko from '../locales/ko.json'
import en from '../locales/en.json'

const CATALOGS = { ko, en }
const DEFAULT_LOCALE = 'ko'
const LOCALE_STORAGE_KEY = 'forge-locale'

/**
 * 경로 표기 "a.b.c" 로 중첩된 JSON을 읽는다.
 * 값이 없으면 키 자체를 반환(번역 누락을 시각적으로 드러냄).
 */
function lookup(dict, path) {
  const parts = path.split('.')
  let cur = dict
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p]
    else return null
  }
  return typeof cur === 'string' ? cur : null
}

/**
 * {name} 스타일의 단순 보간.
 * 값이 없으면 원문을 유지.
 */
function interpolate(tmpl, params) {
  if (!params) return tmpl
  return tmpl.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`))
}

const I18nContext = createContext(null)

export function I18nProvider({ initialLocale, children }) {
  const [locale, setLocale] = useState(() => {
    if (initialLocale) return initialLocale
    try {
      return localStorage.getItem(LOCALE_STORAGE_KEY) || DEFAULT_LOCALE
    } catch {
      return DEFAULT_LOCALE
    }
  })

  const value = useMemo(() => {
    const dict = CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE]
    const fallback = CATALOGS[DEFAULT_LOCALE]
    const t = (key, params) => {
      const raw = lookup(dict, key) ?? lookup(fallback, key) ?? key
      return interpolate(raw, params)
    }
    return {
      locale,
      setLocale: (next) => {
        if (!CATALOGS[next]) return
        setLocale(next)
        try {
          localStorage.setItem(LOCALE_STORAGE_KEY, next)
        } catch {
          /* quota/private 모드 — 언어 전환은 세션 내 유지 */
        }
      },
      t,
      available: Object.keys(CATALOGS),
    }
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Provider가 없을 때도 최소한 돌아가도록 fallback 제공 (테스트 편의)
    const dict = CATALOGS[DEFAULT_LOCALE]
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, params) => interpolate(lookup(dict, key) ?? key, params),
      available: Object.keys(CATALOGS),
    }
  }
  return ctx
}
