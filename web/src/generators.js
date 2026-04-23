// generators.js — 선택된 블럭 기반 각 Phase 콘텐츠 자동 생성
// 설계 원칙: catalog.yml 메타데이터(worlds/bundles/blocks)를 직접 읽어 도메인 무관 동작
//           catalogData 없을 때만 레거시 커머스 하드코딩 모드로 폴백

import { parseBody, parseResp, reqDtoName, respDtoName, javaType, inferApiStyle, toResourcePath } from '../../shared/index.js'

const PALETTE = ['orange', 'blue', 'emerald', 'violet', 'amber', 'rose']

// ── 공통 추론 헬퍼 ─────────────────────────────────────────

function inferTech(blocks) {
  const src = blocks.map(b => b.tech_desc || '').join(' ')
  const tech = []
  if (/Spring Boot/i.test(src))                    tech.push('Spring Boot 3')
  if (/JPA|QueryDSL/i.test(src))                  tech.push('JPA + QueryDSL')
  if (/Spring Security|JWT/i.test(src))            tech.push('Spring Security 6')
  if (/Redis/i.test(src))                          tech.push('Redis 7')
  if (/Elasticsearch/i.test(src))                  tech.push('Elasticsearch 8')
  if (/OAuth2/i.test(src))                         tech.push('OAuth2')
  if (/S3|MinIO/i.test(src))                       tech.push('AWS S3')
  if (/SQS|SNS/i.test(src))                        tech.push('AWS SQS')
  if (tech.length === 0)                            tech.push('Spring Boot 3', 'JPA + QueryDSL', 'MySQL 8')
  if (!tech.some(t => /Spring Boot/i.test(t)))     tech.unshift('Spring Boot 3')
  return [...new Set(tech)].slice(0, 4)
}

function inferPatterns(blocks) {
  const src = blocks.map(b => b.tech_desc || '').join(' ')
  const out = []
  if (/상태머신|State Machine/i.test(src))         out.push('State Machine')
  if (/낙관적 잠금|Optimistic Lock/i.test(src))   out.push('Optimistic Lock')
  if (/이벤트|Event.Driven/i.test(src))            out.push('Event-Driven')
  if (/CQRS/i.test(src))                           out.push('CQRS')
  if (/RBAC|역할/i.test(src))                      out.push('RBAC')
  if (/Saga/i.test(src))                           out.push('Saga Pattern')
  if (/Webhook|웹훅/i.test(src))                   out.push('Webhook Handler')
  if (/멱등|Idempotency/i.test(src))               out.push('Idempotency Key')
  if (/비동기|Async/i.test(src))                   out.push('Async Processing')
  if (out.length === 0)                             out.push('Layered Architecture', 'Repository Pattern')
  return out.slice(0, 3)
}

function inferInfra(blocks) {
  const src = blocks.map(b => b.tech_desc || '').join(' ')
  const infra = [
    { icon: '🐬', name: 'MySQL 8.0',    desc: '주 데이터베이스',             badge: 'DB' },
    { icon: '🔴', name: 'Redis 7',      desc: '캐시 + 세션',                  badge: 'Cache' },
  ]
  if (/Elasticsearch/i.test(src))            infra.push({ icon: '🔍', name: 'Elasticsearch 8', desc: '전문 검색 엔진',       badge: 'Search' })
  if (/SQS|SNS|비동기 발송|이벤트 큐/i.test(src)) infra.push({ icon: '📨', name: 'AWS SQS',          desc: '비동기 이벤트 큐',     badge: 'Queue' })
  if (/S3|MinIO|파일 저장|스토리지/i.test(src)) infra.push({ icon: '☁️', name: 'AWS S3',           desc: '파일 스토리지',         badge: 'Storage' })
  infra.push({ icon: '🐳', name: 'Docker + ECS', desc: '컨테이너 오케스트레이션', badge: 'Infra' })
  return infra
}

function buildDecisions(services, allBlocks) {
  const src = allBlocks.map(b => b.tech_desc || '').join(' ')
  const decisions = [
    { title: '아키텍처 스타일', choice: services.length >= 4 ? 'MSA (서비스 분리)' : '모듈러 모놀리스', reason: '초기 운영 복잡도 최소화 → 점진적 분리', adr: 'ADR-001' },
    { title: 'API 스타일',     choice: 'REST + OpenAPI 3.1',                      reason: '생태계 호환성, Swagger 문서 자동화',            adr: 'ADR-002' },
    { title: '인증 방식',       choice: 'JWT (RS256) + Refresh Token Rotation',    reason: '무상태 서버, 보안 강화',                        adr: 'ADR-003' },
  ]
  if (/Saga/i.test(src))                    decisions.push({ title: '분산 트랜잭션', choice: 'Saga (Choreography)',                          reason: '서비스간 결합도 최소화, 장애 격리',              adr: 'ADR-004' })
  if (/멱등|Idempotency/i.test(src))        decisions.push({ title: '멱등성 보장',  choice: 'Idempotency-Key 헤더 + DB Unique 제약',         reason: '네트워크 재시도로 인한 중복 처리 방지',          adr: 'ADR-005' })
  if (/Elasticsearch/i.test(src))           decisions.push({ title: '검색 엔진',    choice: 'Elasticsearch (DB 동기화)',                      reason: '자동완성·오타보정·필터 고성능 처리',             adr: 'ADR-006' })
  if (/상태머신|State Machine/i.test(src)) decisions.push({ title: '상태 관리',    choice: 'FSM (Finite State Machine)',                     reason: '복잡한 비즈니스 상태 전이의 명시적 제어',        adr: 'ADR-007' })
  return decisions
}

// ── catalog 기반 아키텍처 생성 ──────────────────────────────

function buildArchFromCatalog(ids, catalog) {
  const selectedBlocks = ids.map(id => catalog.blockMap?.[id]).filter(Boolean)

  // World 단위로 그룹핑 (World = Bounded Context)
  const worldBlockMap = {}
  for (const block of selectedBlocks) {
    const bundle = catalog.bundleMap?.[block.bundle_id]
    if (!bundle) continue
    const worldId = bundle.world_id
    if (!worldBlockMap[worldId]) worldBlockMap[worldId] = []
    worldBlockMap[worldId].push(block)
  }

  const services = (catalog.worlds || [])
    .filter(w => worldBlockMap[w.id]?.length)
    .map((world, i) => {
      const blocks = worldBlockMap[world.id]
      return {
        id: world.id,
        name: world.title,
        icon: world.icon || '⚙️',
        color: PALETTE[i % PALETTE.length],
        responsibilities: blocks.map(b => b.name),
        tech: inferTech(blocks),
        patterns: inferPatterns(blocks),
      }
    })

  const infra = inferInfra(selectedBlocks)
  const decisions = buildDecisions(services, selectedBlocks)

  const layers = [
    { id: 'client',  name: 'Client Layer',         icon: '🖥️',  color: '#818cf8', items: ['React 18 + Vite', 'React Query', 'TypeScript', 'Tailwind CSS'] },
    { id: 'gateway', name: 'API Gateway',           icon: '🔀',  color: '#f97316', items: ['Spring Cloud Gateway', 'JWT 검증 필터', 'Rate Limiting (Bucket4j)', 'CORS 설정'] },
    { id: 'app',     name: 'Application Services',  icon: '⚙️',  color: '#10b981', items: services.map(s => `${s.icon} ${s.name}`) },
    { id: 'db',      name: 'Data & Infrastructure', icon: '🗄️',  color: '#f59e0b', items: infra.map(i => `${i.name} — ${i.desc}`) },
  ]

  return { services, decisions, layers, infra, serviceCount: services.length }
}

// ── catalog 기반 계약 생성 ──────────────────────────────────

function inferEndpoints(block) {
  const id = block.id
  const name = block.name
  const tech = block.tech_desc || ''
  const style = inferApiStyle(block)

  // api_style=internal: REST 엔드포인트 없음 (스케줄러/정규화기/인덱서 등)
  if (style === 'internal') return []

  // 경로: pluralize 라이브러리 기반 정확한 복수형 처리
  // saved-jobs → /api/v1/saved-jobs (이미 복수, 중복 s 안 붙음)
  // search-history → /api/v1/search-histories
  const basePath = `/api/v1${toResourcePath(id)}`

  // 시맨틱 패턴 감지 (우선순위: 특수 패턴 → style → CRUD)
  const is = (pat) => pat.test(id + ' ' + name + ' ' + tech)

  if (is(/auth|login|signup|register/i)) return [
    { method: 'POST',   path: '/api/v1/auth/login',    summary: '로그인',    body: '{ email, password }',  response: '200 { accessToken, refreshToken }' },
    { method: 'POST',   path: '/api/v1/auth/signup',   summary: '회원가입',  body: '{ email, password, name }', response: '201 { userId }' },
    { method: 'POST',   path: '/api/v1/auth/refresh',  summary: '토큰 갱신', body: '{ refreshToken }',     response: '200 { accessToken }' },
    { method: 'DELETE', path: '/api/v1/auth/logout',   summary: '로그아웃',  body: '—',                    response: '204 No Content' },
  ]

  if (is(/upload|attach|첨부/i)) return [
    { method: 'POST', path: `${basePath}/upload`, summary: `${name} 파일 업로드`, body: 'multipart/form-data',      response: '201 { fileUrl, fileId }' },
    { method: 'GET',  path: `${basePath}/{id}`,   summary: `${name} 조회`,         body: '—',                        response: '200 FileMetadata' },
  ]

  if (is(/approval|승인/i)) return [
    { method: 'GET',  path: basePath,                    summary: `${name} 대기 목록`,  body: '?status=PENDING&page=',    response: '200 { items[], total }' },
    { method: 'POST', path: `${basePath}/{id}/approve`,  summary: '승인 처리',          body: '{ action, reason? }',      response: '200 { status }' },
    { method: 'POST', path: `${basePath}/{id}/reject`,   summary: '거절 처리',          body: '{ reason }',               response: '200 { status }' },
  ]

  if (is(/decision|결정/i)) return [
    { method: 'GET',  path: `${basePath}/{id}`,          summary: `${name} 조회`,       body: '—',                        response: '200 Decision' },
    { method: 'POST', path: `${basePath}/{id}/decide`,   summary: '심사 결정 저장',     body: '{ result, reason, score? }', response: '200 Decision' },
    { method: 'PUT',  path: `${basePath}/{id}`,          summary: '결정 수정',          body: '{ result, reason }',       response: '200 Decision' },
  ]

  if (is(/queue|큐/i)) return [
    { method: 'GET',   path: basePath,                   summary: `${name} 목록`,       body: '?status=&page=&size=20',   response: '200 { items[], total }' },
    { method: 'PATCH', path: `${basePath}/{id}/status`,  summary: '심사 상태 변경',     body: '{ status }',               response: '200' },
  ]

  if (is(/form|submit|제출|작성/i)) return [
    { method: 'POST', path: basePath,          summary: `${name} 제출`,  body: '{ ...fields }', response: '201 { id }' },
    { method: 'PUT',  path: `${basePath}/{id}`, summary: '임시저장',     body: '{ ...fields }', response: '200' },
    { method: 'GET',  path: `${basePath}/{id}`, summary: '작성 내용 조회', body: '—',           response: '200 Form' },
  ]

  // api_style=query: 읽기만 (검색·대시보드·이력·모니터링)
  if (style === 'query') {
    if (is(/search|검색/i)) return [
      { method: 'GET', path: basePath, summary: `${name}`, body: '?q=&filters=&sort=&page=', response: '200 { items[], total, facets }' },
    ]
    return [
      { method: 'GET', path: basePath,           summary: `${name}`,       body: '?page=&size=20&sort=', response: '200 { items[], total }' },
      { method: 'GET', path: `${basePath}/{id}`, summary: `${name} 상세`,  body: '—',                    response: '200 Entity' },
    ]
  }

  // api_style=resource: CRUD
  return [
    { method: 'GET',  path: basePath,           summary: `${name} 목록`, body: '?page=&size=20', response: '200 { items[], total }' },
    { method: 'POST', path: basePath,           summary: `${name} 생성`, body: '{ ...fields }',  response: '201 { id }' },
    { method: 'GET',  path: `${basePath}/{id}`, summary: `${name} 상세`, body: '—',              response: '200 Entity' },
    { method: 'PUT',  path: `${basePath}/{id}`, summary: `${name} 수정`, body: '{ ...fields }',  response: '200 Entity' },
    { method: 'DELETE',path:`${basePath}/{id}`, summary: `${name} 삭제`, body: '—',              response: '204 No Content' },
  ]
}

/** 엔드포인트 목록 → DTO 정보 추론 (이름 + 필드 + Java 타입) */
function inferDtosFromEndpoints(endpoints) {
  const seen = {}
  for (const ep of endpoints) {
    const body = parseBody(ep.body)
    const resp = parseResp(ep.response)
    if (body.kind === 'json' && body.fields.length) {
      const name = reqDtoName(ep.method, ep.path)
      if (!seen[name]) seen[name] = { name, kind: 'request', fields: body.fields }
    }
    if (resp.kind === 'json' && resp.fields.length) {
      const name = respDtoName(ep.method, ep.path)
      if (!seen[name]) seen[name] = { name, kind: 'response', fields: resp.fields }
    }
  }
  return Object.values(seen).map(dto => ({
    ...dto,
    typedFields: dto.fields.map(f => ({ name: f, type: javaType(f) })),
  }))
}

function buildContractsFromCatalog(ids, catalog) {
  const selectedBlocks = ids.map(id => catalog.blockMap?.[id]).filter(Boolean)

  // World 단위 그룹핑 → service group
  const worldGroups = {}
  for (const block of selectedBlocks) {
    const bundle = catalog.bundleMap?.[block.bundle_id]
    if (!bundle) continue
    const world = (catalog.worlds || []).find(w => w.id === bundle.world_id)
    if (!world) continue
    if (!worldGroups[world.id]) worldGroups[world.id] = { world, blocks: [] }
    worldGroups[world.id].blocks.push(block)
  }

  return Object.values(worldGroups)
    .map(({ world, blocks }, i) => {
      const endpoints = blocks.flatMap(b => inferEndpoints(b))
      if (!endpoints.length) return null
      const dtos = inferDtosFromEndpoints(endpoints)
      return {
        id:      world.id,
        service: world.title,
        color:   PALETTE[i % PALETTE.length],
        icon:    world.icon || '⚙️',
        endpoints,
        dtos,
      }
    })
    .filter(Boolean)
}

// ── catalog 기반 테스트 시나리오 생성 ──────────────────────

function inferTests(block) {
  const src = (block.tech_desc || '') + ' ' + (block.name || '')
  const tests = []

  const is = (pat) => pat.test(src)

  // Happy path — 항상 포함
  tests.push({
    name: `${block.name} — 정상 처리`,
    given: '유효한 입력값과 적절한 권한을 가진 사용자',
    when:  `${block.name} 기능 실행`,
    then:  '정상 처리, 기대 상태로 전이, 응답 200/201',
    type:  'happy-path',
  })

  // 보안 — 인증/권한 블럭
  if (is(/JWT|OAuth|login|auth|signup/i)) {
    tests.push({
      name: '비밀번호 반복 실패 → 계정 잠금',
      given: '잘못된 비밀번호를 5회 연속 입력',
      when:  'POST /auth/login 반복 요청',
      then:  '6번째부터 423 Locked, 일정 시간 접근 차단',
      type:  'security',
    })
  }

  // 보안 — RBAC
  if (is(/RBAC|역할|권한/i)) {
    tests.push({
      name: '권한 없는 접근 차단',
      given: '해당 기능에 권한이 없는 역할의 사용자',
      when:  '해당 API 호출',
      then:  '403 Forbidden, 처리 없음',
      type:  'security',
    })
  }

  // 파일 업로드 보안
  if (is(/S3|MinIO|Multipart|upload|첨부/i)) {
    tests.push({
      name: '허용되지 않은 파일 형식 업로드 차단',
      given: '.exe 또는 .php 등 금지 확장자 파일',
      when:  '파일 업로드 API 호출',
      then:  '400 Bad Request, 파일 저장 없음',
      type:  'security',
    })
  }

  // 동시성 — 낙관적 잠금
  if (is(/낙관적 잠금|Optimistic Lock/i)) {
    tests.push({
      name: '동시 수정 충돌 방지',
      given: '동일 데이터에 2개의 동시 요청 (version 동일)',
      when:  '동시에 수정 요청 2건 발송',
      then:  '1건 성공, 1건 409 Conflict (Optimistic Lock)',
      type:  'concurrency',
    })
  }

  // 멱등성
  if (is(/멱등|Idempotency|UNIQUE 제약|unique/i)) {
    tests.push({
      name: '중복 요청 방지 (멱등성)',
      given: 'Idempotency-Key 동일한 요청 2회',
      when:  '동일한 API를 재시도',
      then:  '2번째는 캐시된 응답 반환, 실제 처리 없음',
      type:  'idempotency',
    })
  }

  // 이벤트 발행
  if (is(/이벤트 발행|Event|event/i)) {
    tests.push({
      name: '처리 완료 후 이벤트 발행 확인',
      given: '정상 처리 완료 상태',
      when:  '관련 도메인 이벤트 발행',
      then:  '구독자 서비스가 이벤트 수신, 후속 처리 실행',
      type:  'happy-path',
    })
  }

  // 승인 워크플로우
  if (is(/승인|approval|2-step/i)) {
    tests.push({
      name: '승인 없이 상태 전이 불가',
      given: '심사 완료 상태이지만 어드민 미승인',
      when:  '지원자에게 결과 알림 발송 시도',
      then:  '알림 발송 차단, 승인 대기 상태 유지',
      type:  'edge-case',
    })
  }

  return tests
}

function buildTestScenariosFromCatalog(ids, catalog) {
  const selectedBlocks = ids.map(id => catalog.blockMap?.[id]).filter(Boolean)

  return selectedBlocks
    .map((block, i) => ({
      blockId: block.id,          // Java 클래스 이름 생성용 영문 ID
      block: block.name,
      icon:  block.icon || '🔧',
      color: PALETTE[i % PALETTE.length],
      tests: inferTests(block),
    }))
    .filter(s => s.tests.length > 0)
}

// ── catalog 기반 Inspect 리포트 생성 ───────────────────────

function buildInspectFromCatalog(ids, catalog) {
  const allBlocks = ids.map(id => catalog.blockMap?.[id]).filter(Boolean)
  const src = allBlocks.map(b => b.tech_desc || '').join(' ')

  const has = (pat) => pat.test(src)

  const perspectives = [
    {
      id: 'security', label: 'Security', icon: '🔐', color: 'red',
      score: has(/JWT.*RBAC|RBAC.*JWT/i) ? 82 : has(/JWT/i) ? 74 : 65,
      findings: [
        ...(has(/JWT|Spring Security/i) ? [
          { severity: 'high',   title: 'JWT Secret 환경변수 분리 필수',     desc: 'application.yml 하드코딩 금지. AWS Secrets Manager 또는 Vault 사용 권장.' },
          { severity: 'medium', title: 'Refresh Token Rotation 구현',       desc: '1회성 Refresh Token으로 탈취 피해 최소화.' },
        ] : []),
        ...(has(/RBAC|역할/i) ? [
          { severity: 'medium', title: 'RBAC 권한 체계 중앙화',             desc: '역할별 접근 정책을 DB 또는 설정 파일로 단일 관리.' },
        ] : []),
        ...(has(/S3|MinIO|Multipart|파일/i) ? [
          { severity: 'high',   title: '파일 업로드 보안 검증',             desc: '확장자 화이트리스트, 파일 크기 제한, 바이러스 스캔(ClamAV) 적용.' },
        ] : []),
        ...(has(/PG|결제|payment/i) ? [
          { severity: 'critical', title: '결제 금액 서버사이드 검증 필수',  desc: 'PG 승인 전 DB 주문금액과 amount 파라미터 대조 필수.' },
          { severity: 'high',     title: '웹훅 HMAC 서명 검증',             desc: 'PG 웹훅 Signature 헤더 반드시 검증.' },
        ] : []),
        { severity: 'medium', title: 'SQL Injection — QueryDSL 파라미터 바인딩', desc: '문자열 포맷팅 대신 setParameter() 패턴 일관 적용.' },
        { severity: 'info',   title: 'CORS 화이트리스트 정책',              desc: '와일드카드(*) 허용 제거, 허용 도메인 명시.' },
      ],
    },
    {
      id: 'performance', label: 'Performance', icon: '⚡', color: 'yellow',
      score: has(/Elasticsearch/i) ? 78 : has(/Redis/i) ? 72 : 64,
      findings: [
        ...(has(/Elasticsearch/i) ? [
          { severity: 'high',   title: 'Elasticsearch 인덱스 설계',         desc: 'Analyzer 설정(한국어 Nori), 필드 mapping 최적화.' },
        ] : []),
        ...(has(/Redis/i) ? [
          { severity: 'medium', title: 'Redis 캐싱 전략',                   desc: '조회 빈도 높은 엔드포인트 캐시 레이어 + TTL 설정.' },
        ] : []),
        ...(has(/낙관적 잠금|Optimistic Lock/i) ? [
          { severity: 'medium', title: '낙관적 잠금 충돌 재시도 전략',      desc: 'OptimisticLockingFailureException — 최대 3회 + exponential backoff.' },
        ] : []),
        { severity: 'medium', title: '커서 기반 페이지네이션',              desc: 'OFFSET 방식 대용량 풀스캔 위험, cursor 방식 전환 권장.' },
        { severity: 'info',   title: 'N+1 쿼리 감지',                       desc: 'p6spy 또는 Hibernate Statistics로 모니터링, Batch Fetch Size 설정.' },
        { severity: 'info',   title: 'HikariCP 커넥션 풀 튜닝',             desc: '최대 풀 사이즈 = CPU코어 × 2 + 1 공식 적용.' },
      ],
    },
    {
      id: 'operations', label: 'Operations', icon: '🔧', color: 'blue',
      score: 70,
      findings: [
        { severity: 'high',   title: '분산 추적 — Sleuth + Zipkin',         desc: 'MSA 환경 요청 흐름 추적을 위한 Trace ID 전파 필수.' },
        { severity: 'medium', title: '구조화 로깅 (JSON Lines)',             desc: 'ECS(Elastic Common Schema) 형식으로 로그 표준화.' },
        { severity: 'medium', title: '헬스체크 엔드포인트 구성',            desc: 'Spring Actuator /health, /info, /metrics 노출 설정.' },
        ...(has(/이벤트|Event|SQS/i) ? [
          { severity: 'high', title: '이벤트 발행 실패 알림',               desc: '도메인 이벤트 발행 실패 시 DLQ + Slack 알림 구성.' },
        ] : []),
        ...(has(/2-step|승인 워크플로우/i) ? [
          { severity: 'medium', title: '워크플로우 상태 감사',              desc: '승인/거절 이력 불변 로그 보존 (최소 1년).' },
        ] : []),
        { severity: 'info',   title: 'Graceful Shutdown',                   desc: 'server.shutdown=graceful, 진행 중 요청 완료 후 종료.' },
      ],
    },
    {
      id: 'scalability', label: 'Scalability', icon: '📈', color: 'emerald',
      score: has(/Elasticsearch/i) ? 75 : 67,
      findings: [
        { severity: 'medium', title: '수평 확장 — Stateless 아키텍처 검증', desc: '세션 상태 Redis 위임 확인, 인스턴스 간 상태 공유 제거.' },
        ...(has(/Elasticsearch/i) ? [
          { severity: 'medium', title: 'Elasticsearch 샤드 설계',           desc: '초기 5 primary 샤드, 데이터 증가 시 Hot-Warm 아키텍처 전환.' },
        ] : []),
        ...(has(/SQS|SNS|이벤트 큐/i) ? [
          { severity: 'medium', title: 'SQS 컨슈머 자동 스케일링',          desc: '메시지 적체량 기반 Auto Scaling, 가시성 타임아웃 적정값 설정.' },
        ] : []),
        { severity: 'info',   title: 'CDN 정적 자산 분리',                  desc: '파일·이미지 CloudFront 분산, 오리진 서버 부하 감소.' },
        { severity: 'info',   title: '읽기 전용 DB 레플리카',               desc: '조회 트래픽 Replica 분산, 마스터 부하 절감.' },
      ],
    },
  ]

  const totalScore = Math.round(perspectives.reduce((s, p) => s + p.score, 0) / perspectives.length)
  return { perspectives, totalScore, blockCount: ids.length }
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

export function generateArchitecture(allSelected, catalogData) {
  const ids = [...allSelected]
  if (catalogData?.blockMap) return buildArchFromCatalog(ids, catalogData)
  return { services: [], decisions: [], layers: [], infra: [], serviceCount: 0 }
}

export function generateContracts(allSelected, catalogData) {
  const ids = [...allSelected]
  if (catalogData?.blockMap) return buildContractsFromCatalog(ids, catalogData)
  return []
}

export function generateTestScenarios(allSelected, catalogData) {
  const ids = [...allSelected]
  if (catalogData?.blockMap) return buildTestScenariosFromCatalog(ids, catalogData)
  return []
}

export function generateInspectReport(allSelected, catalogData) {
  const ids = [...allSelected]
  if (catalogData?.blockMap) return buildInspectFromCatalog(ids, catalogData)
  return { perspectives: [], totalScore: 0, blockCount: ids.length }
}
