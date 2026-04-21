import PhaseNav from './PhaseNav'

/**
 * PhaseShell — 각 Phase의 공통 껍데기.
 *
 * 공통 요소:
 *   - 최상단 wrapper div (.generic-phase)
 *   - 본문 (children)
 *   - 다운로드/액션 바 (downloadBar prop: 렌더링된 DownloadBar 또는 null)
 *   - 페이즈 네비게이션 (PhaseNav)
 *
 * BuildPhase/TemperPhase/InspectPhase의 중복된 outer JSX를 제거.
 */
export default function PhaseShell({
  className = 'generic-phase',
  currentPhase,
  onPrev,
  onNext,
  canNext = true,
  downloadBar = null,
  children,
}) {
  return (
    <div className={className}>
      <div className="phase-scroll-area">
        {children}
        {downloadBar}
      </div>
      <PhaseNav
        currentPhase={currentPhase}
        onPrev={onPrev}
        onNext={onNext}
        canNext={canNext}
      />
    </div>
  )
}

/**
 * DownloadBar — "코드 내보내기" 스타일의 버튼 묶음.
 * label + children(버튼들)만 받아 공통 마크업/스타일을 적용.
 */
export function DownloadBar({ label, children }) {
  return (
    <div className="download-bar">
      <span className="download-bar-label">{label}</span>
      {children}
    </div>
  )
}
