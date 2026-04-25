/**
 * 도메인별 맞춤 설문 모듈
 *
 * 각 도메인은 3가지 카테고리의 질문을 정의:
 * 1. deepDive     — 도메인 고유의 사업 구조 질문 (선택형)
 * 2. workflows    — 역할별 핵심 워크플로우 질문 (입력형)
 * 3. constraints  — 법적/현실적 제약사항 확인 (체크박스)
 *
 * 모든 질문은 일반인이 이해할 수 있는 언어로 작성.
 */

// ─── 역할 옵션 (공통) ───
export const ROLE_OPTIONS = [
  { name: '구매자/소비자 — 서비스를 이용하는 사람', value: 'buyer' },
  { name: '판매자/공급자 — 상품이나 서비스를 제공하는 사람', value: 'seller' },
  { name: '관리자/운영자 — 플랫폼을 관리하는 사람', value: 'admin' },
  { name: '배송/기사 — 물건을 전달하는 사람', value: 'delivery' },
  { name: '강사/전문가 — 지식이나 기술을 제공하는 사람', value: 'instructor' },
  { name: '파트너/제휴사 — 외부 협력 업체', value: 'partner' },
  { name: '예약자/방문자 — 예약하고 방문하는 사람', value: 'visitor' },
  { name: '학생/수강생 — 교육을 받는 사람', value: 'student' },
  { name: '콘텐츠 창작자 — 글, 영상 등을 만드는 사람', value: 'creator' },
];

// ─── 역할별 워크플로우 질문 ───
const ROLE_WORKFLOW_QUESTIONS = {
  buyer: '구매자가 서비스에서 하는 핵심 행동을 순서대로 알려주세요 (예: 검색→비교→구매→후기)',
  seller: '판매자/공급자가 하는 핵심 행동을 순서대로 알려주세요 (예: 등록→주문확인→발송→정산)',
  admin: '관리자가 주로 해야 하는 일을 알려주세요 (예: 회원관리, 분쟁처리, 통계확인)',
  delivery: '배송/기사가 하는 핵심 행동을 순서대로 알려주세요 (예: 배차→픽업→배달→완료)',
  instructor: '강사/전문가가 하는 핵심 행동을 순서대로 알려주세요 (예: 강의등록→수업→평가→정산)',
  partner: '파트너/제휴사가 하는 핵심 행동을 알려주세요 (예: 계약→서비스제공→정산)',
  visitor: '예약자가 하는 핵심 행동을 순서대로 알려주세요 (예: 탐색→예약→방문→후기)',
  student: '학생/수강생이 하는 핵심 행동을 순서대로 알려주세요 (예: 수강신청→학습→과제→수료)',
  creator: '콘텐츠 창작자가 하는 핵심 행동을 순서대로 알려주세요 (예: 작성→발행→수익화→분석)',
};

// ─── 도메인별 설문 정의 ───

const COMMERCE_SURVEY = {
  // 도메인 선택 시 추천 역할 (기본 체크)
  suggestedRoles: ['buyer', 'seller', 'admin'],

  deepDive: [
    {
      type: 'list',
      name: 'commerceType',
      message: '어떤 형태의 커머스인가요?',
      choices: [
        { name: '자사몰 — 내 브랜드 상품만 판매', value: 'own-brand' },
        { name: '마켓플레이스 — 여러 판매자가 입점', value: 'marketplace' },
        { name: '구독 커머스 — 정기 배송/구독', value: 'subscription' },
        { name: '중고거래 — 개인 간 거래 (C2C)', value: 'c2c' },
        { name: '도매/B2B — 사업자 간 거래', value: 'b2b' },
      ],
    },
    {
      type: 'list',
      name: 'productType',
      message: '주로 어떤 상품을 다루나요?',
      choices: [
        { name: '실물 상품 (택배 배송)', value: 'physical' },
        { name: '디지털 상품 (다운로드/이메일)', value: 'digital' },
        { name: '식품 (신선식품, 가공식품)', value: 'food' },
        { name: '혼합 (실물 + 디지털)', value: 'mixed' },
      ],
    },
    {
      type: 'list',
      name: 'paymentModel',
      message: '결제 방식은 어떻게 할 예정인가요?',
      choices: [
        { name: '건별 결제 — 살 때마다 결제', value: 'per-purchase' },
        { name: '정기 구독 — 매월 자동 결제', value: 'subscription' },
        { name: '둘 다 지원', value: 'both' },
      ],
    },
  ],

  constraints: [
    { name: '식품을 판매할 예정 (영업신고 필요)', value: 'food-license', checked: false },
    { name: '해외 배송이 필요함 (관세/통관)', value: 'international', checked: false },
    { name: '주류를 판매할 예정 (전통주만 온라인 가능)', value: 'alcohol', checked: false },
    { name: '화장품을 판매할 예정 (책임판매업 등록)', value: 'cosmetics', checked: false },
    { name: '건강기능식품 판매 (별도 등록 필요)', value: 'health-supplement', checked: false },
    { name: '청소년 대상 판매 제한 상품 있음', value: 'age-restriction', checked: false },
  ],
};

const RESERVATION_SURVEY = {
  suggestedRoles: ['visitor', 'seller', 'admin'],

  deepDive: [
    {
      type: 'list',
      name: 'reservationType',
      message: '어떤 유형의 예약 서비스인가요?',
      choices: [
        { name: '공간 예약 — 숙박, 회의실, 캠핑장 등', value: 'space' },
        { name: '시간 예약 — 병원, 미용실, 상담 등', value: 'timeslot' },
        { name: '체험/활동 — 키즈카페, 클래스, 투어 등', value: 'activity' },
        { name: '음식점 — 레스토랑, 카페 예약', value: 'restaurant' },
        { name: '혼합 (공간+시간+체험)', value: 'mixed' },
      ],
    },
    {
      type: 'list',
      name: 'capacityModel',
      message: '동시 수용 방식은 어떤가요?',
      choices: [
        { name: '1건 독점 — 한 시간에 한 팀만 (예: 미용실 좌석)', value: 'exclusive' },
        { name: '정원제 — 최대 인원까지 동시 예약 (예: 클래스 20명)', value: 'capacity' },
        { name: '자유 입장 — 예약 없이도 방문 가능, 예약은 우선권', value: 'open' },
      ],
    },
    {
      type: 'list',
      name: 'cancelPolicy',
      message: '예약 취소 정책은 어떻게 할 예정인가요?',
      choices: [
        { name: '무료 취소 — 언제든 취소 가능', value: 'free' },
        { name: '기간별 차등 — 3일 전 무료, 당일 50% 등', value: 'tiered' },
        { name: '환불 불가 — 예약 확정 후 취소 불가', value: 'no-refund' },
      ],
    },
    {
      type: 'list',
      name: 'paymentTiming',
      message: '결제 시점은 언제인가요?',
      choices: [
        { name: '예약 시 선결제', value: 'prepay' },
        { name: '방문 시 현장결제', value: 'on-site' },
        { name: '선결제 + 현장 추가결제 모두', value: 'both' },
      ],
    },
  ],

  constraints: [
    { name: '위생 관련 인허가 필요 (음식점, 키즈카페 등)', value: 'hygiene-license', checked: false },
    { name: '소방/안전 인허가 필요 (다중이용시설)', value: 'safety-license', checked: false },
    { name: '의료 관련 인허가 필요 (병원, 한의원)', value: 'medical-license', checked: false },
    { name: '숙박업 등록 필요 (펜션, 게스트하우스)', value: 'accommodation-license', checked: false },
    { name: '보험 가입 필요 (체험/액티비티)', value: 'insurance', checked: false },
    { name: '미성년자 보호 의무 있음 (키즈 관련)', value: 'child-protection', checked: false },
  ],
};

const EDUCATION_SURVEY = {
  suggestedRoles: ['student', 'instructor', 'admin'],

  deepDive: [
    {
      type: 'list',
      name: 'educationType',
      message: '어떤 유형의 교육 서비스인가요?',
      choices: [
        { name: '온라인 강의 — 녹화된 영상 학습 (인프런, 클래스101)', value: 'vod' },
        { name: '실시간 수업 — 화상/대면 라이브 수업', value: 'live' },
        { name: '학원/교습소 — 오프라인 학원 관리', value: 'academy' },
        { name: '코칭/멘토링 — 1:1 또는 소그룹', value: 'coaching' },
        { name: '혼합 (온라인+오프라인)', value: 'blended' },
      ],
    },
    {
      type: 'list',
      name: 'pricingModel',
      message: '수강 요금 체계는 어떤가요?',
      choices: [
        { name: '강의별 개별 구매', value: 'per-course' },
        { name: '월정액 구독 (전체 열람)', value: 'subscription' },
        { name: '수강권/횟수권 (10회권 등)', value: 'ticket' },
        { name: '학기/기수 단위 등록', value: 'semester' },
      ],
    },
    {
      type: 'list',
      name: 'progressTracking',
      message: '학습 진도/성과 관리가 필요한가요?',
      choices: [
        { name: '필요 — 진도율, 과제, 시험, 수료증', value: 'full' },
        { name: '간단히 — 진도율 정도만', value: 'simple' },
        { name: '불필요 — 자유 학습', value: 'none' },
      ],
    },
  ],

  constraints: [
    { name: '학원 등록/신고 필요 (교습소, 학원)', value: 'academy-license', checked: false },
    { name: '저작권 관리 필요 (외부 강사 콘텐츠)', value: 'copyright', checked: false },
    { name: '미성년자 대상 서비스 (개인정보 보호 강화)', value: 'minor-privacy', checked: false },
    { name: '수료증/자격증 발급 (인증 체계 필요)', value: 'certification', checked: false },
    { name: '환불 규정 (수강 중 환불 계산)', value: 'refund-policy', checked: false },
  ],
};

const SAAS_SURVEY = {
  suggestedRoles: ['buyer', 'admin', 'partner'],

  deepDive: [
    {
      type: 'list',
      name: 'saasType',
      message: '어떤 유형의 SaaS인가요?',
      choices: [
        { name: '프로젝트 관리 — 업무/일정/협업 도구', value: 'project-mgmt' },
        { name: 'CRM — 고객 관리/영업 지원', value: 'crm' },
        { name: '마케팅 — 이메일, 광고, 분석 도구', value: 'marketing' },
        { name: '커뮤니케이션 — 메신저, 화상회의', value: 'communication' },
        { name: '업종 특화 — 특정 산업용 솔루션', value: 'vertical' },
        { name: '인프라/DevTool — 개발자용 도구', value: 'devtool' },
        { name: '기타', value: 'other' },
      ],
    },
    {
      type: 'list',
      name: 'tenancy',
      message: '고객(조직) 데이터 분리 방식은?',
      choices: [
        { name: '잘 모르겠어요 (AI가 추천해줄 거예요)', value: 'unknown' },
        { name: '멀티테넌트 — 하나의 시스템을 여러 고객이 공유', value: 'multi-tenant' },
        { name: '싱글테넌트 — 고객마다 독립 환경', value: 'single-tenant' },
      ],
    },
    {
      type: 'list',
      name: 'pricingModel',
      message: '과금 모델은 어떤가요?',
      choices: [
        { name: '무료+유료 (Freemium) — 기본 무료, 고급 기능 유료', value: 'freemium' },
        { name: '사용자 수 기반 — 인당 월 과금', value: 'per-seat' },
        { name: '사용량 기반 — API 호출, 저장 용량 등', value: 'usage-based' },
        { name: '플랜별 고정가 — Basic/Pro/Enterprise', value: 'tiered-plan' },
      ],
    },
    {
      type: 'list',
      name: 'integrationNeeds',
      message: '외부 연동이 중요한가요?',
      choices: [
        { name: '매우 중요 — API/웹훅이 핵심 가치', value: 'critical' },
        { name: '보통 — 기본 연동 몇 개 정도', value: 'moderate' },
        { name: '거의 없음 — 독립 동작', value: 'minimal' },
      ],
    },
  ],

  constraints: [
    { name: '개인정보 처리 (ISMS, 개인정보보호법 준수)', value: 'privacy-compliance', checked: false },
    { name: '클라우드 보안 인증 필요 (CSAP 등)', value: 'cloud-security', checked: false },
    { name: '해외 서비스 (GDPR 등 해외 규정)', value: 'gdpr', checked: false },
    { name: '데이터 백업/복구 SLA 필요', value: 'data-sla', checked: false },
    { name: 'SSO/SAML 기업 인증 지원', value: 'enterprise-auth', checked: false },
  ],
};

const COMMUNITY_SURVEY = {
  suggestedRoles: ['buyer', 'creator', 'admin'],

  deepDive: [
    {
      type: 'list',
      name: 'communityType',
      message: '어떤 유형의 커뮤니티인가요?',
      choices: [
        { name: 'SNS/소셜 — 게시글, 팔로우, 피드', value: 'social' },
        { name: '포럼/게시판 — 질문/답변, 토론', value: 'forum' },
        { name: '팬 커뮤니티 — 아티스트/크리에이터 팬 플랫폼', value: 'fandom' },
        { name: '전문가 네트워크 — 업계 인맥, 지식 공유', value: 'professional' },
        { name: '동호회/모임 — 오프라인 활동 중심', value: 'club' },
      ],
    },
    {
      type: 'list',
      name: 'monetization',
      message: '수익 모델은 어떤가요?',
      choices: [
        { name: '광고 기반 — 무료 서비스, 광고 수익', value: 'ads' },
        { name: '유료 멤버십 — 프리미엄 기능/콘텐츠', value: 'membership' },
        { name: '크리에이터 수익 분배 — 후원, 유료 콘텐츠', value: 'creator-revenue' },
        { name: '커머스 연동 — 커뮤니티 내 판매', value: 'commerce' },
        { name: '아직 미정', value: 'undecided' },
      ],
    },
    {
      type: 'list',
      name: 'contentType',
      message: '주요 콘텐츠 형태는?',
      choices: [
        { name: '텍스트 중심 (글, 댓글)', value: 'text' },
        { name: '이미지/사진 중심', value: 'image' },
        { name: '영상 중심', value: 'video' },
        { name: '혼합 (텍스트+이미지+영상)', value: 'mixed' },
      ],
    },
  ],

  constraints: [
    { name: '사용자 신고/차단 시스템 필요 (불법 콘텐츠 대응)', value: 'moderation', checked: false },
    { name: '미성년자 이용 가능 (청소년보호법)', value: 'minor-protection', checked: false },
    { name: '실명 인증 필요 (본인확인)', value: 'real-name', checked: false },
    { name: '저작권 보호 필요 (DMCA 등)', value: 'copyright', checked: false },
    { name: '위치 기반 서비스 (위치정보법)', value: 'location-service', checked: false },
  ],
};

const CONTENT_SURVEY = {
  suggestedRoles: ['buyer', 'creator', 'admin'],

  deepDive: [
    {
      type: 'list',
      name: 'contentModel',
      message: '어떤 유형의 콘텐츠 서비스인가요?',
      choices: [
        { name: '구독 미디어 — 뉴스, 매거진, 뉴스레터', value: 'subscription-media' },
        { name: '영상 스트리밍 — OTT, 유튜브형', value: 'video-streaming' },
        { name: '오디오 — 팟캐스트, 음악 스트리밍', value: 'audio' },
        { name: '전자책/웹소설 — 텍스트 콘텐츠', value: 'ebook' },
        { name: '혼합 플랫폼', value: 'mixed' },
      ],
    },
    {
      type: 'list',
      name: 'accessModel',
      message: '콘텐츠 접근 방식은?',
      choices: [
        { name: '전체 무료 + 광고', value: 'free-ads' },
        { name: '일부 무료 + 유료 프리미엄 (Freemium)', value: 'freemium' },
        { name: '전체 유료 구독', value: 'paid-only' },
        { name: '개별 구매 (건당 결제)', value: 'per-content' },
      ],
    },
    {
      type: 'list',
      name: 'creatorModel',
      message: '콘텐츠 제작자는 누구인가요?',
      choices: [
        { name: '자체 제작 — 우리 팀이 직접 만듦', value: 'in-house' },
        { name: '외부 창작자 — 누구나 올릴 수 있음 (UGC)', value: 'ugc' },
        { name: '계약 창작자 — 선별된 작가/크리에이터', value: 'contracted' },
        { name: '혼합', value: 'mixed' },
      ],
    },
  ],

  constraints: [
    { name: '저작권/DRM 보호 필요', value: 'drm', checked: false },
    { name: '성인 콘텐츠 포함 (연령 인증)', value: 'adult-content', checked: false },
    { name: '부가통신사업자 신고', value: 'telecom-register', checked: false },
    { name: '스트리밍 인프라 필요 (CDN, 트랜스코딩)', value: 'streaming-infra', checked: false },
    { name: '창작자 정산 시스템 필요', value: 'creator-settlement', checked: false },
  ],
};

const LOGISTICS_SURVEY = {
  suggestedRoles: ['buyer', 'seller', 'delivery', 'admin'],

  deepDive: [
    {
      type: 'list',
      name: 'logisticsType',
      message: '어떤 유형의 물류/배달 서비스인가요?',
      choices: [
        { name: '음식 배달 — 배달의민족, 쿠팡이츠 형태', value: 'food-delivery' },
        { name: '퀵서비스/당일배송 — 빠른 배달', value: 'quick-delivery' },
        { name: '화물 운송 — 대형 화물, 이사', value: 'freight' },
        { name: '라스트마일 — 택배 대행', value: 'last-mile' },
        { name: '심부름/대행 — 다양한 요청 처리', value: 'errand' },
      ],
    },
    {
      type: 'list',
      name: 'driverModel',
      message: '배달/배송 인력 구조는?',
      choices: [
        { name: '자체 고용 — 직접 고용한 기사', value: 'employed' },
        { name: '프리랜서 — 건별 매칭 (긱 워커)', value: 'freelance' },
        { name: '제휴 업체 — 택배사/물류사 연동', value: 'partner' },
        { name: '혼합', value: 'mixed' },
      ],
    },
    {
      type: 'list',
      name: 'routeOptimization',
      message: '배차/경로 최적화가 필요한가요?',
      choices: [
        { name: '필요 — 실시간 배차, 경로 최적화', value: 'required' },
        { name: '간단히 — 지역별 배정 정도', value: 'simple' },
        { name: '불필요 — 수동 배정', value: 'none' },
      ],
    },
  ],

  constraints: [
    { name: '화물자동차 운송사업 허가 필요', value: 'freight-license', checked: false },
    { name: '식품 운반 차량 기준 충족 (냉장/냉동)', value: 'food-transport', checked: false },
    { name: '배달 기사 보험 가입 필요', value: 'driver-insurance', checked: false },
    { name: '실시간 위치 추적 (위치정보법)', value: 'location-tracking', checked: false },
    { name: '화물 배상 보험 필요', value: 'cargo-insurance', checked: false },
  ],
};

// ─── 기타(other) 도메인용 범용 질문 ───
const GENERIC_SURVEY = {
  suggestedRoles: ['buyer', 'admin'],

  deepDive: [
    {
      type: 'list',
      name: 'serviceModel',
      message: '서비스 형태는 어떤가요?',
      choices: [
        { name: '플랫폼 — 공급자와 소비자를 연결', value: 'platform' },
        { name: '도구/SaaS — 특정 업무를 도와주는 소프트웨어', value: 'tool' },
        { name: '콘텐츠 — 정보나 미디어 제공', value: 'content' },
        { name: '커뮤니티 — 사람들이 모이는 공간', value: 'community' },
        { name: '하드웨어+SW — IoT, 기기 연동', value: 'hardware' },
      ],
    },
    {
      type: 'list',
      name: 'revenueModel',
      message: '수익 모델은 어떤가요?',
      choices: [
        { name: '구독료 (월/연 정기 결제)', value: 'subscription' },
        { name: '거래 수수료 (중개 시 발생)', value: 'commission' },
        { name: '건별 결제 (이용할 때마다)', value: 'per-use' },
        { name: '광고 수익', value: 'ads' },
        { name: '아직 미정', value: 'undecided' },
      ],
    },
    {
      type: 'input',
      name: 'uniqueValue',
      message: '기존 서비스와 비교해서 가장 다른 점이 뭔가요? (한 줄로):',
    },
  ],

  constraints: [
    { name: '사업자등록 필요', value: 'biz-register', checked: false },
    { name: '통신판매업 신고 필요', value: 'telecom-sales', checked: false },
    { name: '개인정보 처리 (개인정보보호법)', value: 'privacy', checked: false },
    { name: '결제 기능 포함 (PG 연동 필요)', value: 'payment', checked: false },
    { name: '특수 인허가 필요 (해당 업종)', value: 'special-license', checked: false },
  ],
};

// ─── 도메인 매핑 ───
const DOMAIN_SURVEY_MAP = {
  commerce: COMMERCE_SURVEY,
  reservation: RESERVATION_SURVEY,
  education: EDUCATION_SURVEY,
  saas: SAAS_SURVEY,
  community: COMMUNITY_SURVEY,
  content: CONTENT_SURVEY,
  logistics: LOGISTICS_SURVEY,
  other: GENERIC_SURVEY,
};

/**
 * 도메인에 맞는 설문 세트를 반환한다.
 * @param {string} domain - 도메인 키
 * @returns {{ suggestedRoles: string[], deepDive: object[], constraints: object[] }}
 */
export function getSurveyForDomain(domain) {
  return DOMAIN_SURVEY_MAP[domain] || GENERIC_SURVEY;
}

/**
 * 선택된 역할에 맞는 워크플로우 질문 목록을 반환한다.
 * @param {string[]} roles - 선택된 역할 키 배열
 * @returns {{ role: string, question: string }[]}
 */
export function getWorkflowQuestions(roles) {
  return roles
    .filter((role) => ROLE_WORKFLOW_QUESTIONS[role])
    .map((role) => ({
      role,
      roleName: ROLE_OPTIONS.find((o) => o.value === role)?.name?.split(' — ')[0] || role,
      question: ROLE_WORKFLOW_QUESTIONS[role],
    }));
}

/**
 * 도메인 선택지 목록 (meta-smelt에서 사용)
 */
export const DOMAIN_OPTIONS = [
  { name: '커머스 (온라인 쇼핑몰, 마켓플레이스)', value: 'commerce' },
  { name: '예약 (숙박, 레스토랑, 병원, 키즈카페 등)', value: 'reservation' },
  { name: '교육 (온라인 강의, 학원 관리)', value: 'education' },
  { name: 'SaaS (B2B 소프트웨어 서비스)', value: 'saas' },
  { name: '커뮤니티 (SNS, 포럼, 팬 플랫폼)', value: 'community' },
  { name: '콘텐츠 (미디어, 구독, 뉴스레터)', value: 'content' },
  { name: '물류/배달 (배달 대행, 퀵서비스)', value: 'logistics' },
  { name: '기타 (직접 설명)', value: 'other' },
];

/**
 * 규모 선택지 목록
 */
export const SCALE_OPTIONS = [
  { name: 'MVP (최소 기능, 빠른 검증) — 핵심 기능만 1~2개월', value: 'mvp' },
  { name: '소규모 (초기 서비스) — 3~6개월, 사용자 수천 명', value: 'small' },
  { name: '중규모 (성장 단계) — 6~12개월, 사용자 수만 명', value: 'medium' },
  { name: '대규모 (엔터프라이즈) — 12개월+, 대규모 트래픽', value: 'large' },
];
