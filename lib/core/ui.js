/**
 * lib/core/ui.js
 * Forge Protocol 리치 CLI UI 렌더링 엔진
 * 박스 드로잉 + 페이즈바 + 대시보드 + 커맨드 헤더
 */

import chalk from 'chalk';

// ── 터미널 너비 ────────────────────────────────────────────
export function getWidth() {
  return Math.min(process.stdout.columns || 80, 100);
}

// ── Phase 정의 ──────────────────────────────────────────────
// stateVal: state.yml에 저장되는 값 (build는 'forge'로 저장됨)
export const PHASES = [
  { id: 'meta-smelt', stateVal: 'meta-smelt', label: 'Meta-Smelt', ko: '발굴', icon: '✨', cmd: 'forge meta-smelt' },
  { id: 'smelt', stateVal: 'smelt', label: 'Smelt', ko: '제련', icon: '🔥', cmd: 'forge smelt' },
  { id: 'shape', stateVal: 'shape', label: 'Shape', ko: '성형', icon: '🏛', cmd: 'forge shape' },
  { id: 'build', stateVal: 'forge', label: 'Forge', ko: '단조', icon: '⚒', cmd: 'forge forge' },
  { id: 'temper', stateVal: 'temper', label: 'Temper', ko: '담금질', icon: '💧', cmd: 'forge temper' },
  { id: 'inspect', stateVal: 'inspect', ko: '검수', label: 'Inspect', icon: '🔍', cmd: 'forge inspect' },
  { id: 'verify', stateVal: 'verify', ko: '검증', label: 'Verify', icon: '✅', cmd: 'forge verify' },
];

// stateVal → phase index
const STATE_ORDER = ['init', 'meta-smelt', 'smelt', 'shape', 'forge', 'temper', 'inspect', 'verify'];

export function getPhaseStatus(statePhase) {
  const stateIdx = STATE_ORDER.indexOf(statePhase ?? 'init');
  return PHASES.map((p, i) => {
    const phaseStateIdx = STATE_ORDER.indexOf(p.stateVal);
    const done = phaseStateIdx <= stateIdx;
    const current = phaseStateIdx === stateIdx + 1;
    return { ...p, done, current, pending: !done && !current };
  });
}

export function getNextPhase(statePhase) {
  const phases = getPhaseStatus(statePhase);
  return phases.find((p) => p.current) ?? null;
}

// ── 박스 드로잉 ────────────────────────────────────────────
function pad(str, len) {
  const visible = stripAnsi(str).length;
  return str + ' '.repeat(Math.max(0, len - visible));
}

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

export function box(lines, opts = {}) {
  const w = opts.width ?? getWidth() - 4;
  const top = '  ┌' + '─'.repeat(w) + '┐';
  const bottom = '  └' + '─'.repeat(w) + '┘';
  const rows = lines.map((line) => {
    const content = '  │  ' + pad(line, w - 3) + '│';
    return content;
  });
  return [top, ...rows, bottom].join('\n');
}

// ── 진행 바 ────────────────────────────────────────────────
export function progressBar(current, total, opts = {}) {
  const w = opts.width ?? 36;
  const filled = Math.round((current / total) * w);
  const empty = w - filled;
  const bar = chalk.hex('#f97316')('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  return `  ${bar}  ${chalk.bold(current)} / ${chalk.dim(total)} Phase 완료`;
}

// ── Phase Bar (수평) ───────────────────────────────────────
export function phaseBar(statePhase) {
  const phases = getPhaseStatus(statePhase);
  const parts = [];

  phases.forEach((p, i) => {
    let node;
    if (p.done) {
      node = chalk.green(`${p.icon} ${p.label}`);
    } else if (p.current) {
      node = chalk.hex('#f97316').bold(`${p.icon} ${p.label}`);
    } else {
      node = chalk.dim(`${p.icon} ${p.label}`);
    }
    parts.push(node);
    if (i < phases.length - 1) {
      const connector = p.done ? chalk.green(' ──● ') : chalk.dim(' ──○ ');
      parts.push(connector);
    }
  });

  return '  ' + parts.join('');
}

// ── 헤더 배너 ─────────────────────────────────────────────
import { VERSION } from './version.js';

export function header(version = VERSION) {
  const w = getWidth() - 4;
  const brand = chalk.bold.hex('#f97316')('⚒  Forge Protocol') + chalk.dim(' Studio');
  const ver = chalk.dim(`v${version}`);
  // 이모지 너비 오차 없는 라인 스타일
  const brandLen = 'Forge Protocol Studio'.length + 5; // ⚒ = 2cols
  const gap = Math.max(2, w - brandLen - version.length - 1);
  const line = `  ${brand}${' '.repeat(gap)}${ver}`;
  const sep = '  ' + chalk.dim('═'.repeat(w));
  return [line, sep].join('\n');
}

// ── 커맨드 컨텍스트 헤더 (각 명령 실행 시 상단) ──────────
export function commandHeader(state, label) {
  if (!state) return '';
  const phases = getPhaseStatus(state.phase);
  const done = phases.filter((p) => p.done).length;
  const miniBar = phases
    .map((p) => (p.done ? chalk.green('●') : p.current ? chalk.hex('#f97316')('▶') : chalk.dim('○')))
    .join('');

  const parts = [
    chalk.bold.hex('#f97316')('⚒  ' + label),
    chalk.dim(`  ${miniBar}  ${done}/${PHASES.length}`),
    state.selected_blocks_count ? chalk.dim(`  블럭 ${state.selected_blocks_count}개`) : '',
    state.template ? chalk.dim(`  ${state.template}`) : '',
  ].filter(Boolean);

  const line = '  ' + '─'.repeat(getWidth() - 4);
  return '\n' + parts.join('') + '\n' + line;
}

// ── 파일 상태 목록 ────────────────────────────────────────
const PHASE_FILES = [
  { file: 'state.yml', label: 'state.yml', phase: 'init' },
  { file: 'meta-smelt-prompt.md', label: 'meta-smelt-prompt.md', phase: 'meta-smelt' },
  { file: 'intent.yml', label: 'intent.yml', phase: 'smelt' },
  { file: 'selected-blocks.yml', label: 'selected-blocks.yml', phase: 'smelt' },
  { file: 'architecture.yml', label: 'architecture.yml', phase: 'shape' },
  { file: 'contracts.yml', label: 'contracts.yml', phase: 'build' },
  { file: 'test-scenarios.yml', label: 'test-scenarios.yml', phase: 'temper' },
  { file: 'forge-report.md', label: 'forge-report.md', phase: 'inspect' },
];

export function renderFileStatus(existingFiles) {
  const set = new Set(existingFiles);
  const lines = PHASE_FILES.map((f) => {
    const exists = set.has(f.file);
    const icon = exists ? chalk.green('✅') : chalk.dim('○ ');
    const name = exists ? chalk.cyan(f.label) : chalk.dim(f.label);
    return `  ${icon}  ${name}`;
  });
  return lines.join('\n');
}

// ── Phase 상세 테이블 ─────────────────────────────────────
export function renderPhaseTable(state) {
  const phases = getPhaseStatus(state.phase);
  const lines = [];

  for (const p of phases) {
    let icon, label, detail;

    if (p.done) {
      icon = chalk.green('✅');
      label = chalk.green(p.label);

      // Phase별 추가 정보
      if (p.id === 'smelt' && state.selected_blocks_count) {
        detail = chalk.dim(`블럭 ${state.selected_blocks_count}개  ·  공수 ${state.total_effort_days ?? '?'}일`);
      } else {
        detail = chalk.dim('완료');
      }
    } else if (p.current) {
      icon = chalk.hex('#f97316').bold('▶ ');
      label = chalk.hex('#f97316').bold(p.label);
      detail = chalk.hex('#f97316')('← 지금 여기');
    } else {
      icon = chalk.dim('   ');
      label = chalk.dim(p.label);
      detail = chalk.dim('대기');
    }

    const labelPad = pad(label, 20);
    lines.push(`  ${icon}  ${labelPad}  ${detail}`);
  }

  return lines.join('\n');
}

// ── 전체 대시보드 ─────────────────────────────────────────
export function renderDashboard(state, existingFiles) {
  const phases = getPhaseStatus(state.phase);
  const doneCount = phases.filter((p) => p.done).length;
  const nextPhase = getNextPhase(state.phase);
  const w = getWidth() - 4;

  const sections = [];

  // 1. 헤더
  sections.push(header());
  sections.push('');

  // 2. Phase Bar
  sections.push(phaseBar(state.phase));
  sections.push('');

  // 3. 진행 바
  sections.push(progressBar(doneCount, PHASES.length));
  sections.push('');

  // 4. 프로젝트 정보 박스
  const infoItems = [
    chalk.bold(state.project_name ?? '(이름 없음)'),
    state.template ? chalk.cyan(state.template) : '',
    state.selected_blocks_count ? chalk.dim(`블럭 ${state.selected_blocks_count}개`) : '',
    state.total_effort_days ? chalk.dim(`공수 ${state.total_effort_days}일`) : '',
    state.created_at ? chalk.dim(new Date(state.created_at).toLocaleDateString('ko-KR')) : '',
  ]
    .filter(Boolean)
    .join('  ·  ');

  sections.push(box([infoItems], { width: w }));
  sections.push('');

  // 5. Phase 상세
  sections.push(chalk.bold('  Phase 진행'));
  sections.push('  ' + chalk.dim('─'.repeat(w)));
  sections.push(renderPhaseTable(state));
  sections.push('');

  // 6. 파일 상태
  sections.push(chalk.bold('  생성된 파일'));
  sections.push('  ' + chalk.dim('─'.repeat(w)));
  sections.push(renderFileStatus(existingFiles));
  sections.push('');

  // 7. 다음 액션
  sections.push('  ' + '─'.repeat(w));
  if (nextPhase) {
    sections.push(`  ${chalk.bold('💡  다음:')}  ${chalk.cyan.bold(nextPhase.cmd)}`);
  } else if (doneCount === PHASES.length) {
    sections.push(`  ${chalk.green.bold('🎉  모든 Phase 완료!')}`);
  } else {
    sections.push(`  ${chalk.yellow('⚡  forge smelt')} 로 시작하세요`);
  }
  sections.push('');

  return sections.join('\n');
}

// ── 인터랙티브 메뉴용 Phase 선택지 ──────────────────────
export function buildMenuChoices(state) {
  const phases = getPhaseStatus(state?.phase ?? 'init');
  const choices = [];

  for (const p of phases) {
    let prefix, disabled;
    if (p.done) {
      prefix = chalk.green('✅');
      disabled = false;
    } else if (p.current) {
      prefix = chalk.hex('#f97316').bold('▶ ');
      disabled = false;
    } else {
      prefix = chalk.dim('   ');
      disabled = true;
    }

    choices.push({
      name: `${prefix}  ${p.done || p.current ? p.label : chalk.dim(p.label)}  ${chalk.dim(p.ko)}`,
      value: p.cmd,
      disabled: disabled ? chalk.dim('(이전 Phase 먼저)') : false,
    });
  }

  choices.push(new inquirerSeparator());
  choices.push({ name: chalk.dim('📊  forge status  — 대시보드 보기'), value: 'forge status' });
  choices.push({ name: chalk.dim('❌  종료'), value: '__exit__' });

  return choices;
}

// Separator placeholder (실제 사용 시 inquirer에서 import)
function inquirerSeparator() {
  return { type: 'separator', line: chalk.dim('  ─────────────────────────────') };
}

// ── log 유틸 ─────────────────────────────────────────────
// chalk 직접 호출/이모지 매직 넘버를 대체하는 일관된 CLI 로거.
// 톤(tone)은 CLI 전체에서 동일하게 유지되어야 한다.
const INDENT = '  ';

function emit(msg) {
  console.log(msg);
}

export const log = {
  /** 빈 줄 1개 출력 */
  blank() {
    emit('');
  },

  /** 기본 정보 — 들여쓰기만 적용 */
  info(msg) {
    emit(INDENT + msg);
  },

  /** 보조 정보 — dim */
  dim(msg) {
    emit(INDENT + chalk.dim(msg));
  },

  /** 성공 — ✅ + green bold */
  success(msg) {
    emit(INDENT + chalk.green.bold(`✅ ${msg}`));
  },

  /** 경고 — ⚠ + yellow */
  warn(msg) {
    emit(INDENT + chalk.yellow(`⚠  ${msg}`));
  },

  /** 에러 — ✗ + red */
  err(msg) {
    emit(INDENT + chalk.red(`✗  ${msg}`));
  },

  /** 섹션 제목 — bold, 앞에 빈 줄 */
  section(title, icon = '') {
    emit('');
    const prefix = icon ? `${icon} ` : '';
    emit(INDENT + chalk.bold(prefix + title));
  },

  /** 항목(bullet) — 색상 커스터마이즈 가능 */
  item(msg, { color = null, prefix = '•' } = {}) {
    const body = color ? chalk[color](msg) : msg;
    emit(`${INDENT}  ${prefix} ${body}`);
  },

  /** 라벨 + 값 — 요약 출력 */
  kv(label, value, { labelWidth = 12 } = {}) {
    const padded = label.padEnd(labelWidth);
    emit(`${INDENT}  ${chalk.dim(padded)}${chalk.cyan(value)}`);
  },

  /** 다음 단계 안내 — forge 커맨드 강조 */
  next(cmd) {
    emit('');
    emit(`${INDENT}${chalk.dim('다음 단계: ')}${chalk.cyan(cmd)}`);
    emit('');
  },

  /** 생성된 파일 목록 안내 */
  files(paths) {
    emit('');
    emit(INDENT + chalk.dim('생성 파일:'));
    for (const p of paths) emit(`${INDENT}  ${chalk.dim(p)}`);
  },
};
