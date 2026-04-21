/**
 * Forge Protocol — 공유 상수 및 패턴 정의
 *
 * shape.js, temper.js, inspect.js 등 여러 모듈에서 사용하는
 * 블럭 패턴 감지기와 매직 넘버를 중앙 관리한다.
 */

// ── 블럭 ID 기반 기술 특성 감지기 ───────────────────────
export const FEATURE_DETECTORS = [
  {
    id: 'payment',
    label: '결제',
    blockIds: ['payment', 'pg-integration', 'refund', 'settlement'],
    note: 'PG 연동, 결제 보안, 멱등성 처리 필요',
  },
  {
    id: 'realtime',
    label: '실시간',
    blockIds: ['notification', 'order-status', 'delivery-tracking', 'shipping'],
    note: 'WebSocket 또는 SSE, 이벤트 드리븐 아키텍처 고려',
  },
  {
    id: 'file-upload',
    label: '파일 업로드',
    blockIds: ['product-register', 'review', 'profile'],
    note: 'S3 또는 오브젝트 스토리지, CDN 필요',
  },
  {
    id: 'search',
    label: '검색',
    blockIds: ['product-search', 'search'],
    note: 'Elasticsearch 또는 DB Full-text search 선택 필요',
  },
  {
    id: 'auth',
    label: '인증',
    blockIds: ['buyer-signup', 'social-login', 'auth'],
    note: 'JWT + OAuth2, 토큰 갱신 전략 필요',
  },
  {
    id: 'concurrency',
    label: '동시성',
    blockIds: ['inventory-manage', 'cart', 'reservation', 'timeslot'],
    note: 'Optimistic Lock 또는 분산 락 고려',
  },
  {
    id: 'scheduling',
    label: '배치/스케줄링',
    blockIds: ['settlement', 'notification', 'coupon'],
    note: '정기 배치 처리 (Spring Batch / Cron Job)',
  },
];

/**
 * 블럭 ID Set에서 감지된 기술 특성 목록을 반환한다.
 * @param {Set<string>} blockIds
 * @returns {Array<{id: string, label: string, blockIds: string[], note: string}>}
 */
export function detectFeatures(blockIds) {
  return FEATURE_DETECTORS.filter(f =>
    f.blockIds.some(id => blockIds.has(id))
  );
}

// ── 리스크 블럭 판별 ────────────────────────────────────

const RISK_BLOCK_MAP = {
  payment:     ['payment', 'refund', 'settlement', 'pg-integration'],
  concurrency: ['inventory-manage', 'cart', 'reservation', 'timeslot'],
  auth:        ['buyer-signup', 'social-login', 'auth'],
  realtime:    ['notification', 'order-status'],
};

/**
 * 감지된 feature set에서 해당하는 리스크 블럭 ID 목록을 반환한다.
 * @param {Set<string>} detectedFeatures
 * @returns {string[]}
 */
export function getRiskBlockIds(detectedFeatures) {
  const ids = [];
  for (const [feature, blockIds] of Object.entries(RISK_BLOCK_MAP)) {
    if (detectedFeatures.has(feature)) ids.push(...blockIds);
  }
  return ids;
}

const RISK_KEYWORDS = ['payment', 'refund', 'auth', 'signup', 'inventory', 'order', 'cart'];

/**
 * 개별 블럭 ID가 리스크 블럭인지 키워드 기반으로 판별한다.
 * @param {string} blockId
 * @returns {boolean}
 */
export function isRiskBlock(blockId) {
  return RISK_KEYWORDS.some(k => blockId.includes(k));
}

// ── 블럭 매칭 점수 임계값 ───────────────────────────────
export const MATCH_SCORES = {
  EXACT: 100,
  NAME_INCLUDES: 80,
  ANALOGY: 60,
  DESC_MULTI_KEYWORD: 50,
  DESC_SINGLE_KEYWORD: 30,
  THRESHOLD: 30,
};
