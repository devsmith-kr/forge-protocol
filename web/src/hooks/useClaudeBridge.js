// useClaudeBridge.js - Web UI <-> Forge API 서비스 연결 Hook (Phase A)
//
// api-service(server.js)와 SSE 스트리밍으로 통신한다.
// - API 키를 클라이언트에서 받지 않는다. 서버가 보유한 키로 프록시.
// - 모델은 서버가 티어에 따라 결정한다. 클라이언트는 프롬프트만 보낸다.
// - POST /api/generate 응답을 fetch + ReadableStream 으로 파싱하며,
//   AbortController 로 취소를 지원한다.

import { useReducer, useEffect, useRef, useCallback } from 'react'
import { API_URL, authHeaders } from '../lib/api'

// ── 상태 ──────────────────────────────────────────────

const initialState = {
  // API 서비스 연결 상태
  connected: false,
  tier: null,   // 서버가 알려주는 현재 티어 (free/pro/team/max)
  model: null,  // 티어에 매핑된 모델 ID

  // 생성 진행 상태
  status: 'idle', // idle | generating | done | error
  output: '',
  statusMessage: '',
  error: null,
  usage: null,

  // 진행률 추적
  progress: 0,
  progressStep: '',
}

function reducer(state, action) {
  switch (action.type) {
    case 'STATUS_OK':
      return { ...state, connected: true, tier: action.tier, model: action.model }
    case 'STATUS_FAIL':
      return { ...state, connected: false, tier: null, model: null }
    case 'GENERATE_START':
      return {
        ...state,
        status: 'generating',
        output: '',
        statusMessage: '',
        error: null,
        usage: null,
        progress: 0,
        progressStep: '',
      }
    case 'SSE_STATUS':
      return {
        ...state,
        statusMessage: action.message,
        model: action.model || state.model,
        tier: action.tier || state.tier,
      }
    case 'SSE_CHUNK': {
      const newOutput = state.output + action.text
      // [FORGE:PROGRESS:XX:message] 마커 파싱
      const progressMatch = newOutput.match(/\[FORGE:PROGRESS:(\d+):([^\]]*)\]/g)
      if (progressMatch) {
        const last = progressMatch[progressMatch.length - 1]
        const m = last.match(/\[FORGE:PROGRESS:(\d+):([^\]]*)\]/)
        if (m) return { ...state, output: newOutput, progress: parseInt(m[1], 10), progressStep: m[2] }
      }
      // 파일 생성 패턴으로 진행률 추정
      const fileOps = newOutput.match(/(?:Created?|Writ(?:ing|e|ten)|Generat(?:ing|ed))\s+[^\n]*\.(java|yml|xml|json|properties)/gi)
      if (fileOps && state.progress < 95) {
        const estimated = Math.min(95, fileOps.length * 5)
        if (estimated > state.progress) return { ...state, output: newOutput, progress: estimated }
      }
      return { ...state, output: newOutput }
    }
    case 'SSE_DONE':
      return { ...state, status: 'done', output: action.output, progress: 100, progressStep: '완료' }
    case 'SSE_ERROR':
      return { ...state, status: 'error', error: action.message }
    case 'SSE_USAGE':
      return { ...state, usage: action.usage }
    case 'RESET':
      return {
        ...initialState,
        connected: state.connected,
        tier: state.tier,
        model: state.model,
      }
    default:
      return state
  }
}

// ── SSE 파서 (POST 기반이므로 fetch + ReadableStream 사용) ──

function parseSSELine(line) {
  if (!line || line.startsWith(':')) return null
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return null
  const field = line.slice(0, colonIdx)
  const value = line.slice(colonIdx + 1).trimStart()
  return { field, value }
}

async function consumeSSE(response, dispatch, signal) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = null
  let currentData = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (signal.aborted) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line === '') {
          if (currentEvent && currentData) {
            dispatchSSEEvent(currentEvent, currentData, dispatch)
          }
          currentEvent = null
          currentData = ''
          continue
        }

        const parsed = parseSSELine(line)
        if (!parsed) continue

        if (parsed.field === 'event') {
          currentEvent = parsed.value
        } else if (parsed.field === 'data') {
          currentData += (currentData ? '\n' : '') + parsed.value
        }
      }
    }

    if (currentEvent && currentData) {
      dispatchSSEEvent(currentEvent, currentData, dispatch)
    }
  } finally {
    reader.releaseLock()
  }
}

function dispatchSSEEvent(event, dataStr, dispatch) {
  let data
  try { data = JSON.parse(dataStr) } catch { return }

  switch (event) {
    case 'status':
      dispatch({ type: 'SSE_STATUS', message: data.message, model: data.model, tier: data.tier })
      break
    case 'chunk':
      dispatch({ type: 'SSE_CHUNK', text: data.text })
      break
    case 'done':
      dispatch({ type: 'SSE_DONE', output: data.output })
      break
    case 'error':
      dispatch({ type: 'SSE_ERROR', message: data.message })
      break
    case 'usage':
      dispatch({ type: 'SSE_USAGE', usage: data })
      break
  }
}

// ── Hook ──────────────────────────────────────────────

export default function useClaudeBridge() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef(null)

  // 마운트 시 API 서비스 상태 확인
  useEffect(() => {
    let cancelled = false

    async function checkStatus() {
      try {
        const res = await fetch(`${API_URL}/api/status`)
        const data = await res.json()
        if (!cancelled) {
          dispatch({ type: 'STATUS_OK', tier: data.tier, model: data.model })
        }
      } catch {
        if (!cancelled) dispatch({ type: 'STATUS_FAIL' })
      }
    }

    checkStatus()
    return () => { cancelled = true }
  }, [])

  // 코드 생성 요청 (프롬프트만 전송, 모델/키는 서버가 결정)
  const generate = useCallback(async (prompt) => {
    if (abortRef.current) abortRef.current.abort()

    const controller = new AbortController()
    abortRef.current = controller

    dispatch({ type: 'GENERATE_START' })

    try {
      const res = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        dispatch({ type: 'SSE_ERROR', message: err.error || `요청 실패 (${res.status})` })
        return
      }

      await consumeSSE(res, dispatch, controller.signal)
    } catch (err) {
      if (err.name !== 'AbortError') {
        dispatch({ type: 'SSE_ERROR', message: err.message || '연결 실패' })
      }
    }
  }, [])

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    cancel()
    dispatch({ type: 'RESET' })
  }, [cancel])

  return { ...state, generate, cancel, reset }
}
