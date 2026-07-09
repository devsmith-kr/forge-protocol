// anthropic.js - 공식 SDK 클라이언트 + 스트리밍 헬퍼
//
// 서버가 보유한 ANTHROPIC_API_KEY 로만 호출한다 (클라이언트 키 절대 안 받음).
// 모델은 호출부(server.js)가 티어에서 결정해 넘긴다.

import Anthropic from '@anthropic-ai/sdk'
import { MAX_TOKENS } from './config.js'

let client

export function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY 환경변수가 없습니다. api-service/.env 를 설정하세요.',
      )
    }
    client = new Anthropic() // ANTHROPIC_API_KEY 를 환경에서 자동으로 읽음
  }
  return client
}

/**
 * 메시지 스트림을 시작한다. thinking 파라미터는 생략한다:
 * Haiku/Sonnet/Opus 전 티어에서 안전하게 동작하며(생략 시 400 없음),
 * 이 프롬프트-응답 작업엔 별도 사고(thinking)가 필수는 아니다.
 *
 * @param {{ prompt: string, model: string }} args
 * @returns SDK MessageStream (.on('text'), .finalMessage(), .abort())
 */
export function startStream({ prompt, model }) {
  return getClient().messages.stream({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })
}
