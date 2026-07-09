// quota.js - 임시 인메모리 쿼터 (Phase A 안전망)
//
// 인증이 없는 Phase A 에서 익명 유저가 내 Anthropic 크레딧을 무제한으로
// 소모하는 것을 막는 최소 방어선이다.
//
// 한계 (Phase C 에서 사용자별 DB 쿼터 + 토큰 미터링으로 대체):
//   - 인메모리라 서버 재시작 시 초기화되고, 여러 인스턴스 간 공유 안 됨
//   - IP 기반이라 우회 가능
//   - 요청 "횟수"만 세고 토큰량은 안 봄

import { DAILY_LIMIT_PER_IP, DAILY_LIMIT_GLOBAL } from './config.js'

const perIp = new Map() // ip -> { day, count }
let global = { day: null, count: 0 }

function today() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

/**
 * 요청 1건을 예약(카운트 증가)한다. 한도 초과면 예약하지 않고 ok:false 반환.
 * @param {string} ip
 * @returns {{ ok: boolean, reason?: string, remaining?: number }}
 */
export function checkAndReserve(ip) {
  const day = today()

  if (global.day !== day) global = { day, count: 0 }
  if (global.count >= DAILY_LIMIT_GLOBAL) {
    return { ok: false, reason: 'global_daily_limit' }
  }

  let rec = perIp.get(ip)
  if (!rec || rec.day !== day) {
    rec = { day, count: 0 }
    perIp.set(ip, rec)
  }
  if (rec.count >= DAILY_LIMIT_PER_IP) {
    return { ok: false, reason: 'ip_daily_limit' }
  }

  rec.count += 1
  global.count += 1
  return { ok: true, remaining: DAILY_LIMIT_PER_IP - rec.count }
}
