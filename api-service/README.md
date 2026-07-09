# Forge API Service (Phase A-C)

Forge Protocol SaaS 전환의 백엔드 API 서비스. 기존 `web/server/bridge.js` 를 대체한다.

기존 Bridge 와의 차이:

- Claude Code CLI 모드 제거 (클라우드에서 실행 불가)
- 클라이언트가 보내는 API 키 수신 제거. 서버가 보유한 키로만 프록시
- 구독 티어에 따라 모델을 서버에서 강제 결정 (free=Haiku, pro=Sonnet, team/max=Opus)
- Supabase JWT 인증, 사용자별 월 쿼터, DB 미터링, Stripe 구독 결제

## 실행

```bash
cd api-service
npm install
# 아래 환경변수를 .env 에 채운다 (.env 는 gitignore 됨)
npm run dev               # 또는 npm start
```

기본 포트 3001. `ANTHROPIC_API_KEY` 가 없으면 생성 요청 시 에러를 스트림한다.

## 환경변수

`.env.example` 은 저장소의 `.gitignore`(`.env.*`) 정책상 커밋되지 않으므로 여기에 정리한다.
필요한 것만 설정하면 되고, 미설정 항목은 안전하게 비활성(graceful degrade)된다.

| 변수 | 필수 | 설명 |
|------|------|------|
| `ANTHROPIC_API_KEY` | 예 | 서버 보유 Anthropic 키. 모든 사용자 요청을 이 키로 프록시 |
| `PORT` | 아니오 | 기본 3001 |
| `MAX_TOKENS` | 아니오 | 응답 최대 토큰. 기본 32000 (스트리밍이라 크게 잡아도 안전) |
| `DEFAULT_TIER` | 아니오 | 인증/DB 미설정 시 적용 티어. 기본 free |
| `ALLOWED_ORIGINS` | 아니오 | CORS 허용 오리진(쉼표 구분). 기본 localhost:5173,4173 |
| `DAILY_LIMIT_PER_IP` | 아니오 | 익명(비인증) IP당 일일 한도. 기본 20 |
| `DAILY_LIMIT_GLOBAL` | 아니오 | 익명 전체 일일 한도. 기본 500 |
| `SUPABASE_URL` | 인증 시 | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | 인증 시 | URL 과 함께 설정 시 /api/generate 로그인 요구. 미설정=익명 허용 |
| `SUPABASE_SERVICE_ROLE_KEY` | 구독/쿼터 시 | 구독/사용량 테이블 읽기/쓰기용. 클라이언트 노출 절대 금지 |
| `STRIPE_SECRET_KEY` | 결제 시 | 설정 시 billing 엔드포인트 활성 |
| `STRIPE_WEBHOOK_SECRET` | 결제 시 | webhook 서명 검증 |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAM` | 결제 시 | 티어별 Stripe Price id |
| `APP_URL` | 결제 시 | 결제 성공/취소 후 돌아올 프론트 주소. 기본 localhost:5173 |

동작 요약:
- Supabase(URL+ANON) 미설정: 익명 허용, 티어=`DEFAULT_TIER`, 쿼터=IP 기반, 미터링=로그
- SERVICE_ROLE 미설정: 티어=`DEFAULT_TIER`, 쿼터=IP, 미터링=로그 (구독/월쿼터 비활성)
- STRIPE 미설정: billing 엔드포인트 501

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/status` | 상태(tier/model/authRequired/billingEnabled) |
| GET | `/api/me` | 현재 티어/사용량/모델 (인증) |
| POST | `/api/generate` | 코드 생성 (SSE, body: `{ prompt }`) |
| POST | `/api/billing/checkout` | 구독 결제 세션 생성 (인증, body: `{ tier }`) |
| POST | `/api/billing/portal` | 구독 관리 포털 (인증) |
| POST | `/api/webhooks/stripe` | Stripe webhook (서명 검증) |

`/api/generate` SSE 이벤트: `status` / `chunk` / `usage` / `done` / `error`.

## 원가 재보정

`scripts/measure-tokens.mjs` 로 실제 Forge 프롬프트의 티어별 입력 토큰과 원가를 실측한다:

```bash
ANTHROPIC_API_KEY=sk-ant-... node scripts/measure-tokens.mjs path/to/prompt.txt
```

## 교체 지점 (다음 단계)

- `resolveTier()` (server.js): 구독 조회 로직. 현재 subscriptions 테이블 기반
- `src/quota.js`: 익명 IP 쿼터(인메모리). 로그인 유저는 DB 월 쿼터 사용
- `src/db.js`: PostgREST 직접 호출. service_role 로 RLS 우회

## 배포

상시 프로세스 호스팅(Railway/Render/Fly)에 올린다. SSE 스트리밍 때문에 서버리스
함수(짧은 타임아웃)는 부적합하다.
