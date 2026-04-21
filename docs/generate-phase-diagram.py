"""Forge Protocol 6단계 프로세스 다이어그램 생성기"""

import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyArrowPatch
import matplotlib
matplotlib.rcParams['font.family'] = 'Malgun Gothic'
matplotlib.rcParams['axes.unicode_minus'] = False

fig, ax = plt.subplots(1, 1, figsize=(20, 7))
ax.set_xlim(-0.5, 18.5)
ax.set_ylim(-2.5, 4.5)
ax.axis('off')
fig.patch.set_facecolor('#0d1117')

# --- 제목 ---
ax.text(9, 4.0, 'Forge Protocol', fontsize=28, fontweight='bold',
        ha='center', va='center', color='#e6edf3',
        fontfamily='Consolas')
ax.text(9, 3.4, '설계 우선 AI-Human 협업 개발 프로토콜',
        fontsize=13, ha='center', va='center', color='#8b949e')

# --- Phase 데이터 ---
phases = [
    {
        'num': '0', 'name': 'Meta-Smelt', 'ko': '발굴',
        'desc': '자연어\n→ 블럭 카탈로그',
        'color': '#f0883e', 'icon': '✨',
    },
    {
        'num': '1', 'name': 'Smelt', 'ko': '제련',
        'desc': '블럭 선택 +\n의존성 해결',
        'color': '#da3633', 'icon': '🔥',
    },
    {
        'num': '2', 'name': 'Shape', 'ko': '성형',
        'desc': '아키텍처\n결정 + ADR',
        'color': '#a371f7', 'icon': '🏛️',
    },
    {
        'num': '3', 'name': 'Forge', 'ko': '단조',
        'desc': 'API 계약 +\n코드 생성',
        'color': '#3fb950', 'icon': '⚒️',
    },
    {
        'num': '4', 'name': 'Temper', 'ko': '담금질',
        'desc': 'GWT 테스트\n시나리오',
        'color': '#58a6ff', 'icon': '💧',
    },
    {
        'num': '5', 'name': 'Inspect', 'ko': '검수',
        'desc': '보안 / 성능\n운영 리뷰',
        'color': '#f778ba', 'icon': '🔍',
    },
]

box_w = 2.2
box_h = 2.0
gap = 0.85
start_x = 0.3
y_center = 1.0

for i, p in enumerate(phases):
    x = start_x + i * (box_w + gap)
    c = p['color']

    # 그림자
    shadow = patches.FancyBboxPatch(
        (x + 0.06, y_center - box_h / 2 - 0.06), box_w, box_h,
        boxstyle='round,pad=0.15', facecolor='#010409',
        edgecolor='none', alpha=0.5, zorder=1)
    ax.add_patch(shadow)

    # 메인 박스
    box = patches.FancyBboxPatch(
        (x, y_center - box_h / 2), box_w, box_h,
        boxstyle='round,pad=0.15',
        facecolor='#161b22', edgecolor=c, linewidth=2.5, zorder=2)
    ax.add_patch(box)

    # 상단 컬러 바
    bar = patches.FancyBboxPatch(
        (x + 0.08, y_center + box_h / 2 - 0.35), box_w - 0.16, 0.28,
        boxstyle='round,pad=0.06', facecolor=c, edgecolor='none',
        alpha=0.25, zorder=3)
    ax.add_patch(bar)

    cx = x + box_w / 2

    # Phase 번호
    ax.text(cx, y_center + 0.72, f'Phase {p["num"]}',
            fontsize=9, ha='center', va='center',
            color=c, fontweight='bold', zorder=4)

    # Phase 영문 이름
    ax.text(cx, y_center + 0.32, p['name'],
            fontsize=14, ha='center', va='center',
            color='#e6edf3', fontweight='bold',
            fontfamily='Consolas', zorder=4)

    # 한글 이름
    ax.text(cx, y_center - 0.05, f'({p["ko"]})',
            fontsize=11, ha='center', va='center',
            color=c, zorder=4)

    # 구분선
    ax.plot([x + 0.3, x + box_w - 0.3], [y_center - 0.3, y_center - 0.3],
            color='#30363d', linewidth=1, zorder=3)

    # 설명
    ax.text(cx, y_center - 0.65, p['desc'],
            fontsize=9, ha='center', va='center',
            color='#8b949e', linespacing=1.5, zorder=4)

    # 화살표 (마지막 제외)
    if i < len(phases) - 1:
        arrow_x = x + box_w + 0.08
        arrow = FancyArrowPatch(
            (arrow_x, y_center), (arrow_x + gap - 0.16, y_center),
            arrowstyle='->', mutation_scale=18,
            color='#484f58', linewidth=2, zorder=5)
        ax.add_patch(arrow)

# --- 하단 플로우 요약 ---
flow_y = -1.7
ax.text(9, flow_y - 0.05,
        '자연어 의도  →  블럭 카탈로그  →  선택 + 의존성  →  아키텍처  →  API 계약  →  테스트  →  검수 보고서',
        fontsize=10, ha='center', va='center', color='#484f58',
        fontfamily='Malgun Gothic')

# 하단 라인
ax.plot([1.5, 16.5], [flow_y + 0.35, flow_y + 0.35],
        color='#21262d', linewidth=1, zorder=1)

# 하단 범례
ax.text(9, flow_y - 0.55,
        '프로토콜은 무료  ·  지능은 선택사항  ·  .forge/ 디렉토리가 곧 설계 아티팩트',
        fontsize=9, ha='center', va='center', color='#30363d',
        style='italic')

plt.tight_layout(pad=0.5)
plt.savefig('docs/forge-protocol-phases.png', dpi=200,
            facecolor=fig.get_facecolor(), bbox_inches='tight')
plt.savefig('docs/forge-protocol-phases.svg',
            facecolor=fig.get_facecolor(), bbox_inches='tight')
print('저장 완료: docs/forge-protocol-phases.png, docs/forge-protocol-phases.svg')
