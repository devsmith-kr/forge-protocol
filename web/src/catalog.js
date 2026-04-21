export const worlds = [
  { id: 'all',           title: '전체 보기', icon: '🌐' },
  { id: 'w-seller',     title: '파는 사람',  icon: '🏪', desc: '판매자가 상품을 등록하고 관리하는 영역' },
  { id: 'w-buyer',      title: '사는 사람',  icon: '🛍️', desc: '구매자가 상품을 탐색하고 구매하는 영역' },
  { id: 'w-money',      title: '돈이 흐름', icon: '💰', desc: '결제, 환불, 정산의 영역' },
  { id: 'w-logistics',  title: '물건 이동', icon: '🚚', desc: '물류 입고부터 배송까지' },
  { id: 'w-admin',      title: '관리',      icon: '⚙️', desc: '운영자 플랫폼 관리' },
  { id: 'w-integration',title: '연결',      icon: '🔗', desc: '외부 시스템 연동' },
];

export const bundles = [
  { id: 'b-seller-product',  world_id: 'w-seller',      title: '상품 관리' },
  { id: 'b-seller-inventory',world_id: 'w-seller',      title: '재고 관리' },
  { id: 'b-buyer-auth',      world_id: 'w-buyer',       title: '가입/인증' },
  { id: 'b-buyer-browse',    world_id: 'w-buyer',       title: '상품 탐색' },
  { id: 'b-buyer-purchase',  world_id: 'w-buyer',       title: '구매' },
  { id: 'b-buyer-after',     world_id: 'w-buyer',       title: '주문 이후' },
  { id: 'b-money-payment',   world_id: 'w-money',       title: '결제 처리' },
  { id: 'b-money-refund',    world_id: 'w-money',       title: '환불' },
  { id: 'b-money-settle',    world_id: 'w-money',       title: '정산' },
  { id: 'b-logistics-shipping', world_id: 'w-logistics',title: '배송' },
  { id: 'b-admin-ops',       world_id: 'w-admin',       title: '운영 도구' },
  { id: 'b-intg-notify',     world_id: 'w-integration', title: '알림 시스템' },
  { id: 'b-intg-pay',        world_id: 'w-integration', title: '결제 연동' },
];

export const blocks = [
  { id: 'product-register',  bundle_id: 'b-seller-product',   icon: '📦', name: '상품 등록',    user_desc: '판매할 물건의 이름, 가격, 사진을 입력하는 기능이에요.', analogy: '마켓 진열대에 물건 올리기', tech_desc: 'Product CRUD API, 이미지 업로드(S3), 카테고리 트리, 상품 상태 머신', priority: 'required', effort_days: 5 },
  { id: 'product-category',  bundle_id: 'b-seller-product',   icon: '🗂️', name: '카테고리 관리', user_desc: '상품을 종류별로 분류하는 기능이에요.',                  analogy: '백화점 층별 안내도',        tech_desc: 'Category Closure Table, 다단계 카테고리, 속성 템플릿',   priority: 'required', effort_days: 3 },
  { id: 'inventory-manage',  bundle_id: 'b-seller-inventory', icon: '📊', name: '재고 관리',    user_desc: '물건이 몇 개 남았는지 관리하는 기능이에요.',              analogy: '창고 재고 장부',            tech_desc: 'Optimistic Lock(@Version), 옵션별 재고, 안전재고 알림',  priority: 'required', effort_days: 4 },
  { id: 'buyer-signup',      bundle_id: 'b-buyer-auth',       icon: '👤', name: '회원가입/로그인', user_desc: '사이트에 가입하고 로그인하는 기능이에요.',              analogy: '회원카드 만들기',           tech_desc: 'JWT, OAuth2(카카오/네이버/구글), bcrypt, 이메일 인증',   priority: 'required', effort_days: 4 },
  { id: 'social-login',      bundle_id: 'b-buyer-auth',       icon: '🔑', name: '소셜 로그인',  user_desc: '카카오, 네이버, 구글 계정으로 간편 로그인해요.',          analogy: '카카오 계정으로 한번에',    tech_desc: 'OAuth2 Authorization Code Flow, Provider 추상화',         priority: 'optional', effort_days: 3 },
  { id: 'product-search',    bundle_id: 'b-buyer-browse',     icon: '🔍', name: '상품 검색',    user_desc: '원하는 물건을 키워드로 빠르게 찾는 기능이에요.',          analogy: '백화점 안내데스크',         tech_desc: 'Elasticsearch Full-text, 자동완성, 오타 보정, 필터/정렬', priority: 'required', effort_days: 5 },
  { id: 'product-detail',    bundle_id: 'b-buyer-browse',     icon: '📋', name: '상품 상세',    user_desc: '상품의 자세한 정보를 보는 페이지예요.',                  analogy: '상품 설명서 읽기',          tech_desc: '옵션 선택, 리뷰 요약, 관련 상품 추천, 최근 본 상품',    priority: 'required', effort_days: 3 },
  { id: 'cart',              bundle_id: 'b-buyer-purchase',   icon: '🛒', name: '장바구니',     user_desc: '사고 싶은 물건을 담아두는 기능이에요.',                  analogy: '마트 쇼핑카트',            tech_desc: 'Redis + DB 이중화, 비회원 장바구니(세션), 품절 알림',    priority: 'required', effort_days: 3 },
  { id: 'coupon',            bundle_id: 'b-buyer-purchase',   icon: '🎟️', name: '쿠폰',         user_desc: '할인쿠폰을 발급받고 사용하는 기능이에요.',                analogy: '할인 쿠폰 오려서 쓰기',    tech_desc: '정액/정률 할인, 사용조건, 중복 사용 방지, 만료 처리',   priority: 'optional', effort_days: 5 },
  { id: 'order',             bundle_id: 'b-buyer-purchase',   icon: '📝', name: '주문',         user_desc: '장바구니에 담은 물건을 실제로 구매하는 기능이에요.',      analogy: '계산대에서 결제하기',       tech_desc: '주문 상태 머신(PENDING→PAID→SHIPPED→DELIVERED), UUID',   priority: 'required', effort_days: 5 },
  { id: 'order-history',     bundle_id: 'b-buyer-after',      icon: '🧾', name: '주문 내역',    user_desc: '지금까지 주문한 내역을 확인하는 기능이에요.',             analogy: '영수증 모아보기',           tech_desc: '주문 목록 API(커서 페이지네이션), 상태 실시간 추적',    priority: 'required', effort_days: 2 },
  { id: 'cancel-return',     bundle_id: 'b-buyer-after',      icon: '↩️', name: '취소/반품',    user_desc: '주문을 취소하거나 받은 물건을 돌려보내는 기능이에요.',    analogy: '백화점 환불 카운터',        tech_desc: '취소/반품 상태 머신, 자동 환불 트리거, 반품 사유 수집', priority: 'required', effort_days: 4 },
  { id: 'review',            bundle_id: 'b-buyer-after',      icon: '⭐', name: '리뷰',         user_desc: '구매한 상품에 대한 후기를 남기는 기능이에요.',            analogy: '맛집 후기 남기기',          tech_desc: '별점 1~5, 사진 리뷰, 구매 확인 후 작성, 리뷰 신고',   priority: 'optional', effort_days: 3 },
  { id: 'payment',           bundle_id: 'b-money-payment',    icon: '💳', name: '결제',         user_desc: '물건값을 카드, 계좌이체, 간편결제로 지불하는 기능이에요.', analogy: '계산대에서 카드 긁기',      tech_desc: 'PG 연동, 결제 상태 머신, 금액 위변조 방지, 재시도',    priority: 'required', effort_days: 5 },
  { id: 'refund',            bundle_id: 'b-money-refund',     icon: '💸', name: '환불',         user_desc: '결제한 금액을 돌려받는 기능이에요.',                     analogy: '영수증 들고 환불받기',      tech_desc: 'PG 환불 API, 부분 환불, 쿠폰 복원 여부, 환불 추적',    priority: 'required', effort_days: 4 },
  { id: 'settlement',        bundle_id: 'b-money-settle',     icon: '💰', name: '정산',         user_desc: '판매자에게 판매 대금을 정산해주는 기능이에요.',           analogy: '월급날 급여 정산',          tech_desc: '정산 주기(D+n), 수수료 계산, 세금계산서, 계좌 관리',   priority: 'required', effort_days: 7 },
  { id: 'shipping',          bundle_id: 'b-logistics-shipping',icon: '🚚', name: '배송 추적',   user_desc: '주문한 물건이 어디쯤 왔는지 확인하는 기능이에요.',        analogy: '택배 조회하기',             tech_desc: '택배사 API(CJ/한진/롯데), 배송 웹훅, 송장 자동 매핑',  priority: 'required', effort_days: 4 },
  { id: 'return-logistics',  bundle_id: 'b-logistics-shipping',icon: '📫', name: '반품 물류',   user_desc: '반품된 물건을 수거하고 처리하는 기능이에요.',             analogy: '반품 택배 보내기',          tech_desc: '반품 수거 요청 API, 재입고/폐기 결정, 반품 배송비 정산',priority: 'optional', effort_days: 4 },
  { id: 'admin-dashboard',   bundle_id: 'b-admin-ops',        icon: '📈', name: '관리자 대시보드', user_desc: '사이트 전체 현황을 한눈에 보는 기능이에요.',          analogy: '자동차 계기판',             tech_desc: '매출/주문/회원 통계, 실시간 모니터링, RBAC 권한',       priority: 'optional', effort_days: 5 },
  { id: 'notification',      bundle_id: 'b-intg-notify',      icon: '🔔', name: '알림',         user_desc: '주문 확인, 배송 출발 소식을 문자/카카오로 알려줘요.',    analogy: '택배 출발 알림 문자',       tech_desc: '이벤트 큐(SQS/Kafka), 이메일/SMS/알림톡/앱푸시',       priority: 'optional', effort_days: 4 },
  { id: 'pg-integration',    bundle_id: 'b-intg-pay',         icon: '🔌', name: 'PG 연동',      user_desc: '실제 결제가 이루어지게 하는 카드사 연결 장치예요.',       analogy: '카드 단말기 설치',          tech_desc: '토스페이먼츠 v2 SDK, 결제 위젯, 웹훅, 테스트/운영 분리',priority: 'required', effort_days: 5 },
];

export const dependencies = [
  { source: 'order',          target: 'cart',           type: 'requires', reason: '주문 생성 시 장바구니 데이터 참조' },
  { source: 'order',          target: 'payment',        type: 'requires', reason: '주문 완료를 위해 결제 필수' },
  { source: 'order',          target: 'buyer-signup',   type: 'requires', reason: '주문하려면 회원 인증 필요' },
  { source: 'payment',        target: 'pg-integration', type: 'requires', reason: '실제 결제를 위해 PG사 연동 필수' },
  { source: 'refund',         target: 'payment',        type: 'requires', reason: '환불하려면 결제 내역 필요' },
  { source: 'refund',         target: 'cancel-return',  type: 'requires', reason: '환불은 취소/반품에서 트리거' },
  { source: 'settlement',     target: 'payment',        type: 'requires', reason: '정산은 결제 내역 기반' },
  { source: 'shipping',       target: 'order',          type: 'requires', reason: '배송할 주문이 있어야 함' },
  { source: 'return-logistics',target: 'cancel-return', type: 'requires', reason: '반품 요청이 있어야 물류 처리 가능' },
  { source: 'cancel-return',  target: 'order',          type: 'requires', reason: '취소/반품할 주문이 있어야 함' },
  { source: 'review',         target: 'order',          type: 'requires', reason: '구매 확인 후에만 리뷰 가능' },
  { source: 'product-search', target: 'product-register',type: 'requires',reason: '검색할 상품이 등록되어 있어야 함' },
  { source: 'product-detail', target: 'product-register',type: 'requires',reason: '상세 페이지에 표시할 상품 데이터 필요' },
  { source: 'cart',           target: 'product-detail', type: 'requires', reason: '장바구니에 담을 상품 정보 필요' },
  { source: 'order-history',  target: 'order',          type: 'requires', reason: '조회할 주문이 있어야 함' },
  { source: 'coupon',         target: 'payment',        type: 'affects',  reason: '쿠폰 할인 금액이 결제 금액에서 차감' },
];

// Build lookup maps
export const blockMap = Object.fromEntries(blocks.map(b => [b.id, b]));
export const bundleMap = Object.fromEntries(bundles.map(b => [b.id, b]));

// Build requires map: blockId → [required block ids]
export const requiresMap = {};
for (const dep of dependencies) {
  if (dep.type === 'requires') {
    if (!requiresMap[dep.source]) requiresMap[dep.source] = [];
    requiresMap[dep.source].push({ id: dep.target, reason: dep.reason });
  }
}

// Who requires this block? (reverse map)
export const requiredByMap = {};
for (const dep of dependencies) {
  if (dep.type === 'requires') {
    if (!requiredByMap[dep.target]) requiredByMap[dep.target] = [];
    requiredByMap[dep.target].push({ id: dep.source, reason: dep.reason });
  }
}

export function resolveDeps(selectedIds) {
  const directSelected = new Set(selectedIds);
  const resolved = new Set(selectedIds);
  const autoAdded = new Set();
  const reasons = {}; // blockId → reason string

  function resolve(id) {
    const reqs = requiresMap[id] || [];
    for (const { id: reqId, reason } of reqs) {
      if (!resolved.has(reqId)) {
        resolved.add(reqId);
        if (!directSelected.has(reqId)) {
          autoAdded.add(reqId);
          if (!reasons[reqId]) reasons[reqId] = `${blockMap[id]?.name || id}에 필요`;
        }
        resolve(reqId);
      }
    }
  }

  for (const id of directSelected) resolve(id);

  // Re-check: if user selected something that was auto-added, remove from autoAdded
  for (const id of directSelected) autoAdded.delete(id);

  const totalDays = [...resolved].reduce((s, id) => s + (blockMap[id]?.effort_days || 0), 0);
  return { allSelected: resolved, autoAdded, totalDays, reasons };
}


export const BUILTIN_CATALOG = {
  name: 'Commerce',
  domain: 'commerce',
  worlds,
  bundles,
  blocks,
  blockMap,
  bundleMap,
  resolveDeps,
}
