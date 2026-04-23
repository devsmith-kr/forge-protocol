/**
 * Forge Protocol — 테스트 시나리오 패턴 테이블 (P1-1)
 *
 * 블럭의 id·name·tech_desc·concerns 를 분석해 상황별 시나리오를 자동 생성한다.
 * 과거 결함: "유효한 입력값 → 정상 처리, 응답 200/201" 동일 템플릿이 18개
 * 전부에 붙어 블럭 고유 위험이 드러나지 않음.
 *
 * 설계 원칙:
 *   - 각 시나리오는 구체 값을 포함 (재고 1개, Hamming 2 등)
 *   - 우선순위: must(반드시) / should(시간 허용 시)
 *   - 패턴 매칭 순서 중요: 특수 패턴 > 일반 CRUD
 *   - concerns 기반 시나리오는 블럭 단위 패턴과 별개로 누적
 */

/**
 * 블럭 id / tech_desc 패턴별 시나리오 규칙.
 * `match(block)` 가 true 면 `scenarios` 배열이 반환 대상에 누적된다.
 */
export const PATTERN_RULES = [
  // ── 인증 ────────────────────────────────────────
  // "register" 단독은 ambiguous (product-register vs user register) 이라 제외.
  // auth / login / signup / user-account / OAuth / JWT 만 매치.
  {
    name: 'auth',
    match: (b) => /\bauth\b|login|signup|user-account|OAuth|JWT/i.test(b.id + ' ' + (b.tech_desc ?? '')),
    scenarios: (b) => [
      { name: '[Auth] 중복 이메일 가입 차단', type: 'unit', priority: 'must',
        given: '이미 가입된 이메일이 DB에 존재한다',
        when: '동일 이메일로 회원가입을 시도한다',
        then: 'DuplicateEmailException 발생, HTTP 409 반환' },
      { name: '[Auth] 잘못된 비밀번호로 로그인 실패', type: 'unit', priority: 'must',
        given: '가입된 계정이 존재한다',
        when: '잘못된 비밀번호로 로그인을 시도한다',
        then: 'InvalidCredentialsException 발생, HTTP 401 반환, 실패 카운트 증분' },
      { name: '[Auth] 만료된 JWT Access Token 거부', type: 'integration', priority: 'must',
        given: '만료된 Access Token 이 있다',
        when: '인증이 필요한 API 를 호출한다',
        then: 'HTTP 401 반환, refresh 엔드포인트 안내' },
    ],
  },

  // ── JWT / 토큰 ──────────────────────────────────
  {
    name: 'jwt-rotation',
    match: (b) => /refresh|rotation|토큰 갱신|재사용/i.test((b.tech_desc ?? '') + ' ' + (b.user_desc ?? '')),
    scenarios: () => [
      { name: '[JWT] Refresh Token 재사용 감지 → 세션 전체 무효화', type: 'unit', priority: 'must',
        given: '같은 Refresh Token 이 한 번 사용 완료된 상태 (Redis CAS 로 삭제됨)',
        when: '동일 Refresh Token 으로 재시도한다',
        then: 'ReuseDetectedException 발생, 해당 유저의 모든 refresh 키 삭제' },
    ],
  },

  // ── 결제 / 환불 ──────────────────────────────────
  {
    name: 'payment',
    match: (b) => /payment|refund|결제|환불/i.test(b.id + ' ' + b.name),
    scenarios: (b) => [
      { name: '[Payment] 금액 서버 재검증 — 클라이언트 변조 차단', type: 'integration', priority: 'must',
        given: '상품 실제 가격 10,000원',
        when: '클라이언트가 1원으로 변조한 요청을 전송한다',
        then: 'AmountMismatchException 발생, 결제 요청 미생성' },
      { name: '[Payment] 동일 주문 중복 결제 방지 (멱등성)', type: 'integration', priority: 'must',
        given: '이미 처리 완료된 주문 ID 가 있다',
        when: '동일 주문 ID 로 결제를 재요청한다',
        then: '이전 결제 결과를 그대로 반환, 이중 청구 없음' },
      { name: '[Payment] PG 웹훅 서명 검증 실패 시 거부', type: 'integration', priority: 'must',
        given: 'HMAC 서명이 잘못된 웹훅 요청',
        when: '웹훅 엔드포인트가 수신한다',
        then: 'HTTP 401 반환, 결제 상태 변경 없음' },
    ],
  },

  // ── 재고 / 동시성 ────────────────────────────────
  {
    name: 'inventory-concurrency',
    match: (b) => /inventory|재고|Optimistic Lock|분산락/i.test(b.id + ' ' + (b.tech_desc ?? '')),
    scenarios: () => [
      { name: '[Concurrency] 재고 1개에 동시 주문 2건 — 1건만 성공', type: 'integration', priority: 'must',
        given: '재고가 정확히 1개인 상품이 있다',
        when: '서로 다른 사용자가 동시에 해당 상품을 주문한다',
        then: '1건만 성공(재고 0), 나머지 1건은 OutOfStockException 발생' },
      { name: '[Concurrency] Optimistic Lock 충돌 → 재시도', type: 'unit', priority: 'must',
        given: '@Version 이 설정된 Stock 엔티티',
        when: '동시에 재고를 수정해 버전 충돌이 발생한다',
        then: 'ObjectOptimisticLockingFailureException → 최대 1회 재시도 후 처리' },
    ],
  },

  // ── 북마크 / N:M 복합키 멱등 ─────────────────────
  {
    name: 'saved-jobs',
    match: (b) => /saved|북마크|bookmark|N:M|복합키/i.test(b.id + ' ' + (b.tech_desc ?? '')),
    scenarios: () => [
      { name: '[Idempotency] 북마크 더블 클릭 — DB 제약으로 멱등', type: 'unit', priority: 'must',
        given: '이미 저장된 (user_id, job_id) 조합',
        when: '동일 토글 요청이 동시에 2번 도착한다',
        then: 'DataIntegrityViolationException 흡수, 응답 동일, 중복 row 없음' },
      { name: '[Concurrency] 10-thread 동시 save → 모두 멱등 종료', type: 'integration', priority: 'should',
        given: 'ExecutorService(10) + CountDownLatch',
        when: '동일 (user, job) 조합을 동시에 save 한다',
        then: '에러 0건, 최종 row 1건' },
    ],
  },

  // ── 크롤러 ──────────────────────────────────────
  {
    name: 'crawler',
    match: (b) => /crawler|크롤|robots|scraper/i.test(b.id + ' ' + (b.tech_desc ?? '')),
    scenarios: () => [
      { name: '[Crawler] robots.txt 차단 URL → fetch 생략', type: 'unit', priority: 'must',
        given: 'robots.txt 에서 /private/* 경로가 Disallow',
        when: '/private/job/1 URL 을 fetch 시도한다',
        then: 'RobotsGuardException 발생 또는 skip, raw 저장 없음' },
      { name: '[Crawler] 레이트리밋(429) → 지수 백오프 재시도', type: 'integration', priority: 'must',
        given: '외부 서버가 429 Too Many Requests 반환',
        when: '크롤러가 fetch 를 시도한다',
        then: '1s, 2s, 4s 백오프 후 재시도 최대 4회, 실패 시 DEAD' },
      { name: '[Crawler] 파싱 실패율 30% 초과 시 소스 PAUSE', type: 'integration', priority: 'should',
        given: 'DOM 구조가 변경되어 파싱 실패율 40%',
        when: '한 배치 종료 후 실패율을 집계한다',
        then: '해당 source crawlable=false 자동 전환 + 운영자 알림' },
    ],
  },

  // ── 중복 제거 / SimHash ──────────────────────────
  {
    name: 'dedupe',
    match: (b) => /dedup|duplicat|SimHash|MinHash|중복/i.test(b.id + ' ' + (b.tech_desc ?? '')),
    scenarios: () => [
      { name: '[Dedupe] 동일 문서 SimHash hamming=0 → 같은 cluster_id', type: 'unit', priority: 'must',
        given: '동일 본문의 두 공고가 이미 한 cluster 에 속함',
        when: '세 번째 동일 공고가 들어온다',
        then: '기존 cluster_id 재사용, 신규 id 생성 없음' },
      { name: '[Dedupe] hamming 경계값 (3 이하) 포함 / (4 이상) 배제', type: 'unit', priority: 'must',
        given: '기존 공고 simhash 와 hamming=3 인 신규 공고',
        when: 'assignCluster 를 실행한다',
        then: '동일 cluster 로 병합. hamming=4 는 별도 cluster 생성' },
      { name: '[Dedupe] 대표 선정 tie-break — source priority', type: 'unit', priority: 'should',
        given: 'cluster 안에 JOBKOREA + SARAMIN 동일 posted_at',
        when: '대표를 선정한다',
        then: 'JOBKOREA(priority=1) 가 대표가 된다' },
    ],
  },

  // ── 검색 / Elasticsearch ─────────────────────────
  {
    name: 'search',
    match: (b) => /search|검색|Elasticsearch|OpenSearch/i.test(b.id + ' ' + (b.tech_desc ?? '')),
    scenarios: () => [
      { name: '[Search] 빈 쿼리 → 빈 결과 (에러 없음)', type: 'unit', priority: 'should',
        given: '검색 인덱스가 준비됐다',
        when: '빈 문자열 또는 공백으로 검색한다',
        then: '빈 결과 반환, 예외 없음, total=0' },
      { name: '[Search] XSS 악성 쿼리 이스케이프', type: 'unit', priority: 'must',
        given: '검색 API 가 노출되어 있다',
        when: '<script>alert(1)</script> 같은 쿼리를 입력한다',
        then: '쿼리 이스케이프, 결과 0건, 응답에 스크립트 미노출' },
      { name: '[Search] 한국어 Nori 분석기 — "백엔드 개발자"', type: 'integration', priority: 'should',
        given: 'nori 분석기가 적용된 jobs 인덱스',
        when: '"백엔드 개발자" 로 검색한다',
        then: '"개발자 백엔드" 순서도 매치됨' },
    ],
  },

  // ── 인덱서 ──────────────────────────────────────
  {
    name: 'indexer',
    match: (b) => /indexer|색인|index/i.test(b.id + ' ' + (b.tech_desc ?? '')),
    scenarios: () => [
      { name: '[Indexer] DB 트랜잭션 롤백 시 ES 오염 없음', type: 'integration', priority: 'must',
        given: 'Normalizer 중 DB 제약 위반 발생',
        when: 'AFTER_COMMIT 이벤트 리스너가 동작해야 할 시점',
        then: '롤백으로 이벤트 미발행, ES 에 부분 반영 없음' },
      { name: '[Indexer] bulk 인덱싱 중 일부 실패 → 실패 항목만 재시도', type: 'integration', priority: 'should',
        given: '100건 bulk 중 3건이 매핑 오류',
        when: 'bulk API 가 응답한다',
        then: '성공 97건 반영, 실패 3건 outbox 저장' },
    ],
  },

  // ── 알림 / 재시도 큐 ─────────────────────────────
  {
    name: 'notification',
    match: (b) => /notification|alert|notify|알림/i.test(b.id + ' ' + b.name),
    scenarios: () => [
      { name: '[Notify] 전송 실패 5회 → FAILED 전이', type: 'unit', priority: 'must',
        given: '알림 큐에 QUEUED 항목 1개',
        when: 'EmailSender 가 5회 연속 SMTPException 을 던진다',
        then: 'attempts=5, status=FAILED, 재시도 중단' },
      { name: '[Notify] SENT 상태는 다시 전송되지 않음', type: 'unit', priority: 'must',
        given: '이미 status=SENT 인 AlertDelivery',
        when: 'drainQueue 가 다시 실행된다',
        then: '해당 항목은 쿼리 결과에 포함되지 않음' },
    ],
  },

  // ── 상태 머신 ────────────────────────────────────
  {
    name: 'state-machine',
    match: (b) => /상태.?머신|state.?machine|FSM/i.test((b.tech_desc ?? '') + ' ' + b.name),
    scenarios: (b) => [
      { name: `[FSM] ${b.name} 허용되지 않는 상태 전이 차단`, type: 'unit', priority: 'must',
        given: '현재 상태 X 에서 허용된 전이는 Y 뿐',
        when: '상태 Z 로의 전이를 시도한다',
        then: 'IllegalStateTransitionException 발생, 상태 변경 없음' },
    ],
  },

  // ── 캐시 / TTL ───────────────────────────────────
  {
    name: 'cache',
    match: (b) => /cache|캐시|TTL|Redis|Caffeine/i.test((b.tech_desc ?? '')),
    scenarios: () => [
      { name: '[Cache] TTL 만료 시 재조회 후 캐시 갱신', type: 'unit', priority: 'should',
        given: '캐시 TTL=60s, 현재 entry 가 65초 경과',
        when: '동일 키로 조회한다',
        then: '원본 소스 재조회, 새 값으로 캐시 갱신' },
    ],
  },
];

/**
 * concerns 태그별 필수 시나리오 (블럭 패턴과 독립적으로 누적).
 */
export const CONCERN_SCENARIOS = {
  pii: [
    { name: '[PII] 응답/로그에 개인정보 마스킹 적용', type: 'unit', priority: 'must',
      given: '이메일·전화번호를 포함한 사용자 데이터',
      when: 'API 응답 또는 에러 로그가 생성된다',
      then: '이메일·전화번호가 ****@****.*** / 010-****-**** 형식으로 마스킹' },
  ],
  'file-upload': [
    { name: '[Upload] 용량 초과 파일 거부', type: 'unit', priority: 'must',
      given: '최대 업로드 용량 10MB 설정',
      when: '11MB 파일을 업로드한다',
      then: 'PayloadTooLargeException, HTTP 413 반환' },
    { name: '[Upload] 악성 MIME 차단', type: 'unit', priority: 'must',
      given: '허용 MIME: image/jpeg, image/png',
      when: 'text/html 확장자 위조 파일을 업로드한다',
      then: 'UnsupportedMediaTypeException, HTTP 415 반환' },
  ],
  realtime: [
    { name: '[Realtime] 연결 끊김 → 클라이언트 자동 재연결 훅', type: 'integration', priority: 'should',
      given: 'WebSocket 세션이 열려 있다',
      when: '서버가 의도적으로 연결을 종료한다',
      then: '클라이언트 재연결 이벤트 발생, 5초 이내 복구' },
  ],
};

/**
 * 블럭에서 시나리오 배열 생성.
 *
 * @param {Object} block - { id, name, tech_desc, user_desc, ... }
 * @param {Object} [options]
 * @param {string[]} [options.concerns] - 블럭에 연결된 concerns (없으면 block.concerns)
 * @returns {Array} 시나리오 배열 (Happy Path + 패턴 + concerns)
 */
export function buildScenariosForBlock(block, options = {}) {
  const out = [];
  const concerns = options.concerns ?? block.concerns ?? [];

  // 0. Happy Path — 구체화된 버전
  out.push({
    name: `[Happy Path] ${block.name} 정상 동작`,
    type: 'unit',
    priority: 'must',
    given: `${block.name} 서비스 의존성이 준비된 상태 (Mock Repository + 유효 입력)`,
    when: `핵심 public 메서드를 호출한다`,
    then: `기대 상태로 전이 + 저장소/캐시/인덱스 호출 검증`,
  });

  // 1. 블럭 id·tech_desc 패턴 매칭
  for (const rule of PATTERN_RULES) {
    if (rule.match(block)) {
      const s = typeof rule.scenarios === 'function' ? rule.scenarios(block) : rule.scenarios;
      out.push(...s);
    }
  }

  // 2. concerns 태그 기반 필수 시나리오
  for (const c of concerns) {
    const s = CONCERN_SCENARIOS[c];
    if (s) out.push(...s);
  }

  // 3. 공통: 필수값 누락 검증
  out.push({
    name: `[Validation] ${block.name} 필수값 누락 요청 거부`,
    type: 'unit',
    priority: 'must',
    given: `${block.name} API 가 준비됐다`,
    when: '필수 필드가 누락된 요청을 전송한다',
    then: 'HTTP 400 반환, 누락된 필드명 명시, DB 변경 없음',
  });

  // 과다 생성 방지: 최대 6개 (Happy + 검증 + 패턴/concerns 4개)
  const MAX_CASES = 6;
  if (out.length > MAX_CASES) {
    // 중요도 보존: Happy Path / 필수값 유지, 패턴 must 우선, should 는 뒤로
    const head = out[0];
    const tail = out[out.length - 1];
    const middle = out.slice(1, -1).sort((a, b) => {
      if (a.priority === 'must' && b.priority !== 'must') return -1;
      if (a.priority !== 'must' && b.priority === 'must') return 1;
      return 0;
    }).slice(0, MAX_CASES - 2);
    return [head, ...middle, tail];
  }
  return out;
}
