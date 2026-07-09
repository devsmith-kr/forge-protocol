// measure-tokens.mjs - 프롬프트의 실제 토큰 수 + 티어별 원가 추정 (Phase C 재보정용)
//
// 로드맵 섹션 0 유닛 이코노믹스의 "약 5K/10K 토큰" 가정을 실제 값으로 교정하기 위한 도구.
// 실제 Forge 프롬프트를 넣어 티어별 입력 토큰과 예상 원가를 확인한다.
//
// 사용:
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/measure-tokens.mjs path/to/prompt.txt
//   echo "프롬프트" | ANTHROPIC_API_KEY=... node scripts/measure-tokens.mjs
//
// 출력은 입력 토큰만 측정한다. 출력 토큰은 실제 생성 결과로 별도 관측 필요.

import fs from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'

// 티어별 모델 + 가격 ($ per 1M) - tiers.js 및 로드맵과 동기화할 것
const TIERS = [
  { tier: 'free', model: 'claude-haiku-4-5', inPrice: 1, outPrice: 5 },
  { tier: 'pro', model: 'claude-sonnet-5', inPrice: 3, outPrice: 15 },
  { tier: 'team', model: 'claude-opus-4-8', inPrice: 5, outPrice: 25 },
]

// 원가 추정 시 가정할 출력 토큰 수 (실측으로 대체 권장)
const ASSUMED_OUTPUT_TOKENS = 10000

async function main() {
  const arg = process.argv[2]
  const prompt = arg ? fs.readFileSync(arg, 'utf-8') : fs.readFileSync(0, 'utf-8')
  if (!prompt.trim()) {
    console.error('프롬프트가 비어 있습니다. 파일 경로나 stdin 으로 넣으세요.')
    process.exit(1)
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY 가 필요합니다.')
    process.exit(1)
  }

  const client = new Anthropic()
  console.log(`프롬프트 길이: ${prompt.length} 자\n`)
  console.log('티어      모델                 입력토큰   입력$      +출력(가정)$   호출당$')
  console.log('-------------------------------------------------------------------------------')

  for (const { tier, model, inPrice, outPrice } of TIERS) {
    const r = await client.messages.countTokens({
      model,
      messages: [{ role: 'user', content: prompt }],
    })
    const inTok = r.input_tokens
    const inCost = (inTok / 1e6) * inPrice
    const outCost = (ASSUMED_OUTPUT_TOKENS / 1e6) * outPrice
    const total = inCost + outCost
    console.log(
      `${tier.padEnd(9)} ${model.padEnd(20)} ${String(inTok).padStart(8)}   ` +
        `$${inCost.toFixed(4)}   $${(inCost + outCost).toFixed(4)}       $${total.toFixed(4)}`,
    )
  }
  console.log(`\n(출력 토큰은 ${ASSUMED_OUTPUT_TOKENS} 가정. 실제 생성 결과로 교정하세요.)`)
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
