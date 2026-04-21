#!/usr/bin/env node
// bridge.js — Web UI ↔ Claude Code / Claude API 브릿지 서버
// 사용: node server/bridge.js [--port 3001] [--project-dir /path/to/project]
//
// 모드 1: Claude Code CLI 호출 (구독자용, 토큰 무제한급)
// 모드 2: Claude API 프록시   (API 키, 토큰 과금)
//
// Web UI에서 프롬프트를 보내면 SSE(Server-Sent Events)로 실시간 스트리밍한다.

import http from 'node:http'
import https from 'node:https'
import { spawn, execSync } from 'node:child_process'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    port:          { type: 'string', default: '3001' },
    'project-dir': { type: 'string', default: process.cwd() },
  },
})

const PORT = parseInt(args.port, 10)
const PROJECT_DIR = args['project-dir']

// ── Claude CLI 존재 확인 ──────────────────────────────────
function checkClaude() {
  try {
    const version = execSync('claude --version', { encoding: 'utf-8', timeout: 5000 }).trim()
    return { available: true, version }
  } catch {
    return { available: false, version: null }
  }
}

// ── CORS 헤더 ─────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

// ── 요청 바디 파싱 ────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
      catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

// ── SSE 헬퍼 ──────────────────────────────────────────────
function sseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// ═══════════════════════════════════════════════════════════
// 모드 1: Claude Code CLI 실행
// ═══════════════════════════════════════════════════════════

function runClaudeCode(prompt, projectDir, req, res) {
  sseHeaders(res)
  sseSend(res, 'status', { message: 'Claude Code 실행 중...', mode: 'claude-code' })

  const claude = spawn('claude', ['-p', '--output-format', 'text'], {
    cwd: projectDir,
    shell: true,
    env: { ...process.env },
  })

  let output = ''
  let chunkCount = 0

  claude.stdout.on('data', (data) => {
    const text = data.toString()
    output += text
    chunkCount++
    if (chunkCount <= 3 || chunkCount % 5 === 0) {
      sseSend(res, 'chunk', { text, totalLength: output.length })
    }
  })

  claude.stderr.on('data', (data) => {
    sseSend(res, 'log', { text: data.toString() })
  })

  claude.on('close', (code) => {
    if (code === 0) {
      sseSend(res, 'done', { output, length: output.length })
    } else {
      sseSend(res, 'error', { message: `Claude Code 종료 코드: ${code}`, output })
    }
    res.end()
  })

  claude.on('error', (err) => {
    sseSend(res, 'error', { message: err.message })
    res.end()
  })

  claude.stdin.write(prompt)
  claude.stdin.end()

  req.on('close', () => {
    if (!claude.killed) claude.kill('SIGTERM')
  })
}

// ═══════════════════════════════════════════════════════════
// 모드 2: Claude API 프록시 (SSE 스트리밍)
// ═══════════════════════════════════════════════════════════

function runClaudeApi(prompt, apiKey, model, req, res) {
  sseHeaders(res)
  sseSend(res, 'status', { message: `Claude API (${model}) 호출 중...`, mode: 'api' })

  const requestBody = JSON.stringify({
    model,
    max_tokens: 16384,
    stream: true,
    messages: [{ role: 'user', content: prompt }],
  })

  const apiReq = https.request({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  }, (apiRes) => {
    if (apiRes.statusCode !== 200) {
      let errBody = ''
      apiRes.on('data', d => errBody += d.toString())
      apiRes.on('end', () => {
        let msg = `API 오류 (${apiRes.statusCode})`
        try { msg = JSON.parse(errBody).error?.message || msg } catch {}
        sseSend(res, 'error', { message: msg })
        res.end()
      })
      return
    }

    let output = ''
    let buffer = ''

    apiRes.on('data', (data) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') continue

        try {
          const evt = JSON.parse(payload)

          if (evt.type === 'content_block_delta' && evt.delta?.text) {
            output += evt.delta.text
            sseSend(res, 'chunk', { text: evt.delta.text, totalLength: output.length })
          }

          if (evt.type === 'message_stop') {
            sseSend(res, 'done', { output, length: output.length })
          }

          if (evt.type === 'message_delta' && evt.usage) {
            sseSend(res, 'usage', {
              inputTokens: evt.usage.input_tokens,
              outputTokens: evt.usage.output_tokens,
            })
          }
        } catch {
          // JSON 파싱 실패 무시
        }
      }
    })

    apiRes.on('end', () => {
      if (output && !res.writableEnded) {
        sseSend(res, 'done', { output, length: output.length })
      }
      if (!res.writableEnded) res.end()
    })

    apiRes.on('error', (err) => {
      sseSend(res, 'error', { message: err.message })
      if (!res.writableEnded) res.end()
    })
  })

  apiReq.on('error', (err) => {
    sseSend(res, 'error', { message: `API 연결 실패: ${err.message}` })
    if (!res.writableEnded) res.end()
  })

  apiReq.write(requestBody)
  apiReq.end()

  req.on('close', () => apiReq.destroy())
}

// ═══════════════════════════════════════════════════════════
// HTTP 서버
// ═══════════════════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  // ── GET /api/status ─────────────────────────────────────
  if (url.pathname === '/api/status' && req.method === 'GET') {
    const claude = checkClaude()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({
      bridge: true,
      claude,
      apiProxy: true,
      projectDir: PROJECT_DIR,
    }))
  }

  // ── POST /api/generate ─────────────────────────────────
  // body: { prompt, mode?: 'claude-code'|'api', apiKey?, model?, projectDir? }
  if (url.pathname === '/api/generate' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const { prompt, mode, apiKey, model, projectDir } = body

      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'prompt 필드가 필요합니다.' }))
      }

      // API 모드
      if (mode === 'api') {
        if (!apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'API 키가 필요합니다.' }))
        }
        runClaudeApi(prompt, apiKey, model || 'claude-sonnet-4-20250514', req, res)
        return
      }

      // Claude Code 모드 (기본)
      const claude = checkClaude()
      if (!claude.available) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({
          error: 'Claude Code CLI를 찾을 수 없습니다. `npm install -g @anthropic-ai/claude-code` 로 설치하세요.',
        }))
      }

      runClaudeCode(prompt, projectDir || PROJECT_DIR, req, res)
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
      }
      if (!res.writableEnded) {
        res.end(JSON.stringify({ error: err.message }))
      }
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  const claude = checkClaude()
  console.log(``)
  console.log(`  Forge Bridge Server`)
  console.log(`  ────────────────────────────────`)
  console.log(`  URL:          http://localhost:${PORT}`)
  console.log(`  Project:      ${PROJECT_DIR}`)
  console.log(`  Claude Code:  ${claude.available ? `✓ ${claude.version}` : '✗ 미설치'}`)
  console.log(`  API Proxy:    ✓ (API 키 필요)`)
  console.log(`  ────────────────────────────────`)
  console.log(``)
  console.log(`  API:`)
  console.log(`    GET  /api/status    — 상태 확인`)
  console.log(`    POST /api/generate  — 코드 생성 (SSE)`)
  console.log(`      mode: 'claude-code' → CLI 실행`)
  console.log(`      mode: 'api'         → API 프록시`)
  console.log(``)
})
