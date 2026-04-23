/**
 * Forge Protocol — 아키텍처 스타일 자동 선택 가드레일
 *
 * 팀 규모 · 총 공수 · 블럭/서비스 수 를 고려해 과설계를 막는다.
 * 과거 결함: 58 person-day / 1인 프로젝트에도 "MSA (서비스 분리)" 를
 * 추천해 Kubernetes 지옥 시나리오 유도.
 *
 * 임계치 (휴리스틱, 프로젝트 수집된 데이터 늘면 조정):
 *   - 1~2인 + 200일 미만               → modular-monolith (단일 배포)
 *   - 5인 이상 또는 블럭 40개 이상        → msa (조직·배포 독립성 우선)
 *   - 그 사이                           → modular-monolith + 분리 경로 명시
 */

export const ARCHITECTURE_STYLES = Object.freeze({
  'modular-monolith': {
    label: '모듈러 모놀리스',
    description: '단일 배포, 모듈 경계는 코드로 강제. 분리 필요 시 모듈 단위로 쉽게 추출.',
  },
  'msa': {
    label: 'MSA (서비스 분리)',
    description: '서비스 단위 독립 배포. 조직·기술 분리 필요 시.',
  },
});

/**
 * @param {Object} ctx
 * @param {number} [ctx.blockCount]        - 선택된 블럭 수
 * @param {number} [ctx.serviceCount]      - 자동 감지된 서비스(World) 수
 * @param {number} [ctx.totalEffortDays]   - 선택된 블럭 총 공수
 * @param {number} [ctx.teamSize]          - 팀 규모 (기본 1)
 * @param {string} [ctx.forceStyle]        - "--force-style msa" 같은 명시 override
 * @returns {{style: 'modular-monolith'|'msa', choice: string, reason: string, transition: string}}
 */
export function pickArchitectureStyle(ctx = {}) {
  const {
    blockCount = 0,
    serviceCount = 0,
    totalEffortDays = 0,
    teamSize = 1,
    forceStyle,
  } = ctx;

  if (forceStyle && ARCHITECTURE_STYLES[forceStyle]) {
    return format(forceStyle, `사용자 --force-style 로 명시 지정`, transitionFor(forceStyle));
  }

  // 과설계 차단: 소규모는 무조건 모놀리스
  if (teamSize <= 2 && totalEffortDays < 200) {
    return format(
      'modular-monolith',
      `1~2인 · 공수 ${totalEffortDays}일 → 단일 배포가 개발 속도·운영 단순성에서 유리`,
      transitionFor('modular-monolith')
    );
  }

  // 규모 확장: 5인 이상 또는 40블럭 이상이면 분리 전제
  if (teamSize >= 5 || blockCount >= 40) {
    return format(
      'msa',
      `팀 ${teamSize}인 · 블럭 ${blockCount}개 → 서비스 독립 배포로 조직·기술 분리`,
      transitionFor('msa')
    );
  }

  // 중간 규모: 모놀리스 + 분리 경로 명시
  return format(
    'modular-monolith',
    `중간 규모(팀 ${teamSize}인 · 블럭 ${blockCount}개) → 모듈 경계 유지하며 분리 경로 열어둠`,
    transitionFor('modular-monolith')
  );
}

function format(style, reason, transition) {
  return {
    style,
    choice: ARCHITECTURE_STYLES[style].label,
    reason,
    transition,
  };
}

function transitionFor(style) {
  if (style === 'modular-monolith') {
    return [
      'ingest/배치 CPU 가 API 요청 지연을 유발할 때 → 해당 모듈부터 별도 서비스로 분리',
      '팀 5인 도달 시 → 모듈 소유권을 서비스로 승격',
      '블럭 40개 초과 시 → 도메인별 분할 재검토',
    ].join('; ');
  }
  return [
    '초기 1~2개 서비스로 시작해 검증된 경계만 분리',
    '공통 데이터(사용자·인증)는 중복보다 단일 서비스 유지',
    '서비스 간 동기 호출이 많아지면 이벤트 기반 재검토',
  ].join('; ');
}
