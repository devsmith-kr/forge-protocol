/**
 * Forge Protocol — concerns 태그 시스템 (도메인-적응형 프롬프트)
 *
 * 블럭의 `concerns: [payment, crawling, pii, ...]` 태그를 읽어
 * 해당 블럭을 사용하는 프로젝트에서만 관련 프롬프트 섹션을 삽입한다.
 *
 * 과거 결함: Phase 2/4/5 프롬프트에 "결제 보안 필수" 가 하드코딩되어
 * 커머스가 아닌 도메인(채용·SaaS·컨텐츠)에 불필요한 결제 섹션이 섞여 나왔다.
 */

/**
 * 사용 가능한 concerns 태그 (프로젝트 공통 어휘).
 * 미래 태그 추가 시 여기와 concerns 프롬프트 테이블을 함께 업데이트.
 */
export const KNOWN_CONCERNS = Object.freeze([
  'payment',       // 결제 처리 (PG 연동, 금액 검증, 정산)
  'auth',          // 인증/인가 (JWT, OAuth2, Refresh Rotation)
  'concurrency',   // 동시성 (재고, 예약, 분산락)
  'crawling',      // 외부 크롤링 (robots.txt, 레이트리밋, 저작권)
  'search',        // 검색 엔진 (ES/OpenSearch, 형태소 분석)
  'realtime',      // 실시간 (WebSocket/SSE)
  'file-upload',   // 파일 업로드 (S3, CDN)
  'notification',  // 알림 (이메일/푸시/SMS)
  'pii',           // 개인정보 (암호화·마스킹·파기)
]);

/**
 * 커머스 레거시 블럭 id 로부터 concerns 추정.
 * `concerns` 필드가 없는 구형 카탈로그 하위호환용.
 */
const LEGACY_BLOCK_CONCERNS = {
  'payment':          ['payment', 'concurrency'],
  'pg-integration':   ['payment'],
  'refund':           ['payment'],
  'settlement':       ['payment'],
  'buyer-signup':     ['auth', 'pii'],
  'social-login':     ['auth'],
  'product-search':   ['search'],
  'inventory-manage': ['concurrency'],
  'cart':             ['concurrency'],
  'notification':     ['notification', 'realtime'],
  'product-register': ['file-upload'],
  'review':           ['file-upload'],
  'shipping':         ['realtime'],
  'order-status':     ['realtime'],
};

/**
 * 블럭 하나 → concerns 배열. 명시 우선, 없으면 id 휴리스틱.
 */
export function concernsOf(block) {
  if (!block) return [];
  if (Array.isArray(block.concerns) && block.concerns.length) {
    return block.concerns.filter(c => KNOWN_CONCERNS.includes(c));
  }
  return LEGACY_BLOCK_CONCERNS[block.id] ?? [];
}

/**
 * 선택된 블럭 전체에서 concerns 합집합.
 */
export function collectConcerns(blocks) {
  const set = new Set();
  for (const b of blocks || []) {
    for (const c of concernsOf(b)) set.add(c);
  }
  return set;
}

/**
 * Phase 별 concerns → 프롬프트 조각 매핑.
 * 각 조각은 줄바꿈 없는 한 줄 (이모지 없음). 호출자가 `- ` 를 앞에 붙여 bullet 화.
 */
const FRAGMENTS = {
  // ── Phase 2: 아키텍처 설계 ───────────────────
  shape: {
    payment:       '결제 보안: 금액 서버 재검증, PG 웹훅 HMAC 서명, 주문번호 기반 멱등키 설계',
    auth:          '인증: JWT + Refresh Token Rotation, 재사용 탐지(reuse detection), 토큰 무효화 경로',
    concurrency:   '동시성: 핵심 리소스에 낙관적 락(@Version) 또는 분산락(Redisson), 멱등 INSERT 전략',
    crawling:      '외부 크롤링: robots.txt 자동 준수, 지수 백오프 재시도, 원본 URL 보존 + 발췌 저장(저작권)',
    search:        '검색: 인덱스 매핑(한국어 분석기 nori), DB↔ES 동기화(AFTER_COMMIT 이벤트), alias swap 재색인',
    realtime:      '실시간: WebSocket 또는 SSE 선택 기준, 연결 수 상한, 하트비트/재연결 전략',
    'file-upload': '파일 업로드: S3 presigned URL, 용량·확장자 제한, 바이러스 스캔(ClamAV)',
    notification:  '알림: 채널 추상화(Email/Push), 전송 실패 재시도 큐, DLQ 분리',
    pii:           '개인정보: 필드 암호화(AES-GCM), 로그 마스킹, 법정 파기 주기(회원탈퇴 D+30)',
  },
  // ── Phase 4: 테스트 시나리오 ─────────────────
  temper: {
    payment:       '결제 테스트는 PG 웹훅 Mock 서버(WireMock/MockWebServer) 포함, 이중 결제·금액 변조 시나리오',
    auth:          'JWT 만료/위조/재사용 탐지 시나리오, 소셜 로그인 콜백 경계 케이스',
    concurrency:   '동시성 테스트는 `ExecutorService` 로 N-thread 경합 시뮬레이션 (재고 차감, 북마크 중복 클릭)',
    crawling:      '크롤러 테스트는 외부 HTTP Mock + 레이트리밋(429) 반응 + 파싱 실패율 임계치',
    search:        '검색 테스트는 빈 결과, 특수문자, 한글/영어 혼합, 오타 보정 케이스',
    realtime:      'WebSocket/SSE 연결 끊김·재연결, 백프레셔 시나리오',
    'file-upload': '업로드 용량 초과·악성 MIME·중복 업로드 멱등성',
    notification:  '알림 전송 실패→재시도→DLQ 전이, 중복 발송 방지',
    pii:           '개인정보 마스킹이 로그/응답/에러 메시지에 누락 없는지 검증',
  },
  // ── Phase 5: 검수 (보안/성능/운영/확장성) ────
  inspect: {
    payment:       '결제 보안: 금액 서버 재검증, PG 웹훅 서명 검증, 멱등성, 이중 청구 방지를 반드시 다루세요',
    auth:          'OAuth2 + JWT 취약점 (토큰 탈취, CSRF, XSS) 을 OWASP 기준으로 점검하세요',
    concurrency:   '동시성 장애 시나리오 (분산락 홀더 죽음, 교착 상태) 와 복구 전략을 점검하세요',
    crawling:      '외부 크롤링의 법·윤리 리스크 (robots.txt 위반, 저작권 침해, ToS 위반) 를 평가하세요',
    search:        'Elasticsearch 인덱스 설계, 샤드 전략, 재색인 무중단 방식을 검토하세요',
    realtime:      '실시간 연결의 스케일 한계와 백프레셔 대응을 분석하세요',
    'file-upload': '업로드 취약점 (경로 순회, 악성 파일, 무제한 크기) 과 CDN 무결성을 점검하세요',
    notification:  '알림 채널의 실패 복구, 중복 발송, 스팸 필터 회피 전략을 검토하세요',
    pii:           '개인정보보호법/GDPR 관점의 암호화·로그·파기 컴플라이언스를 평가하세요',
  },
};

/**
 * Phase 에 해당하는 concerns 프롬프트 조각 배열을 반환.
 * 호출자가 `- ${fragment}` 형태로 bullet 리스트 구성.
 *
 * @param {Set<string>|string[]} concerns - 선택된 블럭 집합의 concerns 합집합
 * @param {'shape'|'temper'|'inspect'} phase
 * @returns {string[]}
 */
export function buildConcernFragments(concerns, phase) {
  const set = concerns instanceof Set ? concerns : new Set(concerns || []);
  const table = FRAGMENTS[phase] ?? {};
  const out = [];
  for (const concern of KNOWN_CONCERNS) {   // KNOWN_CONCERNS 순서를 유지해 결정적
    if (set.has(concern) && table[concern]) out.push(table[concern]);
  }
  return out;
}
