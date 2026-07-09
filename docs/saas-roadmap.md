# Forge Protocol SaaS 전환 실행 플랜

> 목표: 웹에서 로그인해 프로젝트를 열고, API 키 입력 없이 바로 7단계 프로토콜을
> 브라우저에서 끝까지 돌린 뒤, 결과물(멀티모듈 ZIP)을 내려받는 SaaS.
>
> 사업모델: 플랫폼이 API 키 보유 + 구독 티어별 모델 성능 차등
> - 사용자는 키 입력 없이 바로 사용 (진입장벽 0)
> - 무료 티어는 낮은 모델(Haiku), 유료 라이선스에 따라 고성능 모델(Sonnet/Opus) 해금
> - API 원가는 내 리스크. 사용량 미터링, 쿼터, 남용 방어, 유닛 이코노믹스가 핵심

---

## 0. 이 모델의 핵심: 유닛 이코노믹스

BYOK와 달리 API 비용을 내가 부담하므로, 구독료가 사용자당 예상 API 원가보다 커야 함.
Forge 한 번의 풀 실행은 AI 호출 4회(shape, build, temper, inspect). 호출당 입력 약 5K,
출력 약 10K 토큰 가정:

| 티어 | 모델 (ID) | 입력/출력 $/1M | 호출당 원가 | 풀 실행(4회) 원가 |
|------|-----------|---------------|------------|------------------|
| Free | Haiku 4.5 (`claude-haiku-4-5`) | $1 / $5 | 약 $0.055 | 약 $0.22 |
| Pro | Sonnet 5 (`claude-sonnet-5`) | $3 / $15 (인트로 $2/$10) | 약 $0.16 | 약 $0.64 |
| Team/Max | Opus 4.8 (`claude-opus-4-8`) | $5 / $25 | 약 $0.28 | 약 $1.1 |

> 인트로 가격(Sonnet 5 $2/$10)은 2026-08-31까지. 그 이후 $3/$15로 계산해야 함.

함의:
- 무료 티어의 위험은 남용. 무료 유저 1명이 무제한이면 월 원가가 무한대이므로 반드시
  월 실행 횟수나 토큰 캡을 건다 (예: 무료 = 프로젝트 1개 + 월 5회 실행 = 월 원가 약 $1.1 상한).
- Pro 구독료는 원가의 최소 5배에서 10배로. 예: Pro $19/월, 예상 사용 30회 실행 = 원가 약 $4.8
  이면 마진 확보. 헤비유저 방어를 위해 Pro도 소프트 쿼터(월 N회 후 Haiku 강등 또는 초과 과금).
- 모델 티어링은 원가 통제 레버이자 업셀 후크. 무료가 Haiku로 "충분히 되지만 아쉽게" 만들고,
  Sonnet/Opus 품질 차이를 체감시켜 전환 유도.

이 숫자들은 대략치. 실제 프롬프트 토큰을 `count_tokens`로 측정해 재보정할 것 (Phase C).

---

## 1. 목표 아키텍처

```
[ Browser (React + Vite) ]
  - 현재 web/src 거의 그대로 재사용
  - API 키 입력 UI 제거 (BYOK 잔재 삭제)
  - localStorage 에서 서버 DB 동기화로 교체
  - 남은 쿼터 / 현재 티어 / 모델 표시
        |
        |  HTTPS + SSE (세션 JWT)
        v
[ API Service (Node, 상시 프로세스: Railway/Render/Fly) ]
  - bridge.js 진화형: 서버 보유 Anthropic 키로만 프록시
  - Auth 미들웨어 (JWT)
  - [핵심] 티어 to 모델 매핑 (Free=Haiku / Pro=Sonnet / Max=Opus)
  - [핵심] 쿼터 게이트 + 토큰 미터링 (호출 전 잔량 확인, 후 기록)
  - 프로젝트 CRUD, emit(buildMultiModuleFiles) 재사용
  - Stripe webhook
        |
   +----+-----------------+------------------+
   v                      v                  v
[ Postgres (Supabase) ]  [ Anthropic API ]  [ Stripe ]
  users/projects           (내 org 키)        (구독)
  subscriptions/usage
```

BYOK 모델 대비 새로 필수가 된 것: 티어-모델 매핑, 쿼터 게이트, 토큰 미터링.
이 3가지가 없으면 원가가 통제 불능이 된다.

### 왜 이 스택인가
| 선택 | 이유 |
|------|------|
| 프론트: Vercel/Netlify | 현재 Vite 빌드 그대로. |
| API: Railway/Render/Fly (상시 Node) | SSE 스트리밍이 서버리스 타임아웃과 궁합 나쁨. |
| DB+Auth: Supabase | Postgres + 인증 + RLS 한 번에. usage 테이블도 여기. |
| 과금: Stripe | 구독 표준. 티어=Stripe Price, webhook으로 상태 동기화. |
| SDK: `@anthropic-ai/sdk` | bridge의 수동 https 호출을 공식 SDK로 교체 (스트리밍/에러/토큰 usage 표준화). |

---

## 2. 반드시 먼저 풀어야 할 것 (블로커)

### 2-1. 서버 키 단일화 + 클라이언트에서 키 완전 제거
기존 bridge는 요청 바디의 apiKey를 썼다. SaaS에서는 서버 환경변수의 내 org 키만 사용하고,
클라이언트가 키를 보내는 경로를 삭제한다. Claude Code CLI 모드도 클라우드 불가이므로 제거.

### 2-2. 티어에서 모델 매핑 (서버에서 강제)
클라이언트가 모델을 고르게 두면 안 됨(무료 유저가 Opus 요청하면 원가 폭발). 서버가 유저의
구독 상태를 보고 모델을 결정한다:

```js
const MODEL_BY_TIER = {
  free: 'claude-haiku-4-5',
  pro:  'claude-sonnet-5',
  team: 'claude-opus-4-8',
  max:  'claude-opus-4-8',
}
// 요청의 model 필드는 무시. subscription.tier 로만 결정.
```

### 2-3. 쿼터 게이트 + 미터링
호출 전: 이번 달 사용량이 티어 한도 내인지 확인, 초과 시 402/429 반환.
호출 후: 응답 usage(input/output 토큰)를 usage 테이블에 기록. 월별 집계로 쿼터 판단 + 대시보드.

### 2-4. 하드코딩된 로컬 주소 제거
`useClaudeBridge.js`의 `BRIDGE_URL='http://localhost:3001'`을 `import.meta.env.VITE_API_URL`로.

---

## 3. 단계별 로드맵

> BYOK와 달리 과금/미터링(Phase C)을 앞당긴다. 인증 없이 무료로 열면 내 키로 원가가 새기 때문.
> 최소한의 쿼터 없이는 공개 배포하면 안 됨.

### Phase A: 서버 키로 클라우드에서 돌아가게 (1주)
- [x] bridge를 `api-service/`로 분리, CLI 모드 제거, apiKey 수신 경로 제거
- [x] 서버 env `ANTHROPIC_API_KEY`로 프록시 (공식 `@anthropic-ai/sdk` 사용)
- [x] 클라이언트 API 키 입력 UI/상태 삭제 (ClaudeBridgePanel, useClaudeBridge)
- [x] `VITE_API_URL` 환경변수화, CORS 화이트리스트화
- [x] 티어에서 모델 매핑 서버 강제 (tiers.js), 미터링 스켈레톤 (meter.js)
- [x] 임시 전역 쿼터(IP + 전체 일일 상한, quota.js)로 무방비 노출 방지
- [ ] 프론트 Vercel / API Railway 배포 (사용자 작업, 계정/키 필요)

완료 기준: URL 열고, 키 없이, 전 Phase 진행, ZIP. 단 아직 익명/무제한이라 오래 열어두지 말 것.

> 로컬 검증 완료 (2026-07-09): 프론트 빌드 통과, api-service 부팅 + /api/status 티어/모델
> 반환 확인, 키/프롬프트 누락 시 정상 에러. 실제 Anthropic 호출은 키 필요로 미검증.
> 남은 것은 배포뿐. 정식 쿼터/미터링은 Phase C.

### Phase B: 계정 + 프로젝트 영속화 (1.5주)
- [x] Supabase Auth(이메일/비밀번호): AuthContext + AuthModal
- [x] 스키마: auth.users + projects(state JSONB). project_states 분리는 이후(버전 히스토리용)
- [x] 상태를 Supabase에 디바운스 동기화 (App.jsx), localStorage는 오프라인 캐시 병행
- [x] API에 JWT 검증(auth.js, Supabase /auth/v1/user 위임) + RLS(schema.sql, 유저는 자기 것만)
- [x] "내 프로젝트" 목록/생성/삭제 (ProjectMenu)
- [ ] 실제 Supabase 프로젝트 생성 + schema.sql 실행 + env 채우기 (사용자 작업)

완료 기준: 로그아웃 후 다른 기기 로그인 시 프로젝트 그대로.

> 로컬 검증 완료 (2026-07-09): 프론트 빌드 통과(supabase-js 2.110), api-service 인증
> on/off 양쪽 확인(off=익명 허용, on=토큰 없으면 401). Supabase 미설정 시 기존 localStorage
> 익명 모드로 graceful degrade. 실제 Supabase 붙인 e2e(로그인->프로젝트 저장->재조회)는
> 프로젝트 생성/env 필요로 미검증. 기존 vitest 일부는 로컬 환경의 localStorage.clear 이슈로
> 실패하나 HEAD에서도 동일한 선존재 문제(내 변경과 무관).

### Phase C: 과금 + 미터링 + 티어링 (1.5주) [이 모델의 심장]
- [x] subscriptions + usage_events 테이블 + RLS (schema.sql, 쓰기는 service_role만)
- [x] 티어에서 모델 매핑 서버 강제: resolveTier가 구독 조회 후 결정 (server.js, db.js)
- [x] 쿼터 게이트: 로그인 유저는 월 run 한도(402), 익명은 IP 한도(429) (tiers.js TIER_LIMITS)
- [x] 미터링: 매 호출 usage_events 기록 + 로그 (meter.js, db.js)
- [x] Stripe Checkout + Customer Portal + webhook (billing.js, server.js)
- [x] `count_tokens` 측정 스크립트 (scripts/measure-tokens.mjs) - 실제 재보정은 키 필요
- [x] UI에 티어/사용량/모델 + 업그레이드/구독관리 (AccountBar, useAccount)
- [ ] 실제 Stripe/Supabase 연동 + Price 생성 + 구독가 확정 (사용자 작업)

완료 기준: 무료는 Haiku + 월 N회 상한, 결제 시 즉시 Sonnet/Opus + 상향 쿼터. 원가 통제됨.

> 로컬 검증 완료 (2026-07-09): 프론트 빌드 통과, api-service 부팅 + 전 구성(db/billing on/off)
> graceful degrade 확인. /api/status billingEnabled 토글, /api/me 티어/사용량 반환, billing
> 미설정 시 checkout/webhook 501. 미설정이면 티어=DEFAULT_TIER, 쿼터=IP, 미터링=로그(A/B 동작).
> 실제 Stripe 결제 e2e + DB 쿼터/구독 반영은 실연동(키/Price/webhook) 필요로 미검증.
> 서버 DB 접근은 service_role 키로 PostgREST 직접 호출(@supabase 의존성 없음).

### Phase D: 팀 협업 (1.5주)
- [ ] teams, team_members, project.team_id, 초대 + 역할(owner/editor/viewer)
- [ ] 쿼터를 팀 단위 풀로 (팀 플랜)
- [ ] 동시 편집: 낙관적 잠금(버전 컬럼) 또는 마지막-쓰기-승리 + 경고
- [ ] RLS 팀 멤버십 기반 확장

### Phase E: 운영 및 남용 방어 강화 (1주)
- [ ] 남용 방어: 레이트리밋, 신규계정 무료 쿼터 제한, 이상 사용 알림
- [ ] Sentry, 비용 대시보드(모델별 원가 대 구독 수익)
- [ ] 프롬프트 캐싱 도입 검토: Forge 프롬프트의 공통 prefix(시스템 지침)를 캐시해 입력 원가 절감
- [ ] 개인정보/약관, 데이터 삭제 요청 처리, 온보딩(현 OnboardingModal 재활용)

---

## 4. 코드 관점: 재사용 대 신규

| 모듈 | SaaS에서 |
|------|----------|
| `shared/**` (생성기 전부) | 그대로 (순수 함수, fs 무관) |
| `web/src` UI 대부분 | 거의 그대로 (키 입력 UI만 제거) |
| `web/server/bridge.js` | api-service로 대체 (CLI/apiKey 제거, 서버 키 + 티어/쿼터) |
| `useClaudeBridge.js` | URL 환경변수화, apiKey 제거, usage 표시 연동 (완료) |
| `usePersistedState.js` | localStorage에서 서버 동기화 (Phase B) |
| Auth/DB/Billing/미터링/쿼터/티어링 | 전부 신규 |

핵심 통찰: 생성 로직(`shared/`)이 이미 fs-free라 SaaS 전환의 최대 난관은 풀려 있음.
BYOK 모델 대비 추가로 필요한 신규 작업은 미터링/쿼터/티어링. 원가가 내 리스크이기 때문.

---

## 5. 리스크 및 주의

- 원가 폭주가 최대 리스크. 쿼터 없이 배포 금지. Phase A의 임시 전역 상한에서 C의 정식 쿼터로.
- 모델 선택은 절대 클라이언트를 믿지 말 것. 서버가 구독 상태로만 결정 (섹션 2-2).
- 키 유출은 조직 전체 크레딧 노출. 서버 env에만, 로그 금지, 클라이언트 절대 전달 금지.
- 인트로 가격 만료(2026-08-31) 후 Sonnet 원가 상승. 구독가에 미리 반영.
- 프롬프트 캐싱으로 마진 개선 가능. 공통 시스템 prefix 캐시 시 입력 원가 약 0.1배 (Phase E).
- 무료 티어 품질: Haiku가 Forge 프롬프트에서 합리적 결과를 내는지 Phase C 전 검증.
  안 되면 무료를 "프롬프트 복사 모드"(원가 0)로 두고 실행은 유료로 미는 대안도.
- CLI/OSS 노선 유지: 세계 표준 목표에 중요. `shared/` 단일 소스 원칙 계속.

---

## 6. 다음 액션 (권장 순서)

1. Phase A는 코드/로컬 검증 완료. 남은 것은 배포(Vercel + Railway). 단 배포 전 Phase C의
   최소 쿼터가 필요. A의 임시 쿼터는 안전망일 뿐 익명 남용을 완전히 막지 못함.
2. A(서버키 작동)에서 B(계정), C(과금/미터링/티어링 완성), D(팀), E(방어 강화) 순.
3. Phase C 착수 전 `count_tokens`로 실제 원가 측정, 섹션 0 표 재보정, 구독가 확정.

> 예상 총 기간: Phase A부터 E까지 약 6.5주 (1인 풀타임). 이 모델은 A 단독 공개가 위험하므로
> "웹 오픈" 최소 실전 배포 시점은 A + C 최소 쿼터 = 약 3주 지점.
