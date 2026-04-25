/**
 * 플랜 파서 + 블럭 매핑 엔진
 *
 * 지원 형식:
 *   - 마크다운: ## Phase명 섹션 + - [ ] 또는 - 항목
 *   - YAML: phases: { mvp: { features: [...] } }
 *
 * 매핑 전략 (점수제):
 *   1. block.name 완전 일치      → 100점
 *   2. block.name 포함           → 80점
 *   3. block.analogy 포함        → 60점
 *   4. block.user_desc 키워드 2개+ → 50점
 *   5. block.user_desc 키워드 1개  → 30점
 *   임계값 30점 미만 → 미매칭 처리
 */

import yaml from 'js-yaml';
import { MATCH_SCORES } from './constants.js';

// ── 플랜 파서 ──────────────────────────────────────────

/**
 * 파일 내용(string)과 확장자를 받아 단계별 피처 목록을 반환한다.
 * @param {string} content
 * @param {'md'|'yml'|'yaml'} ext
 * @returns {{ phases: { name: string, features: string[] }[] }}
 */
export function parsePlan(content, ext) {
  if (ext === 'yml' || ext === 'yaml') {
    return parseYamlPlan(content);
  }
  return parseMarkdownPlan(content);
}

function parseMarkdownPlan(content) {
  const phases = [];
  let current = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    // ## 로 시작하는 헤더 → 새 phase
    if (line.startsWith('## ')) {
      if (current) phases.push(current);
      current = { name: line.replace(/^##\s+/, '').trim(), features: [] };
      continue;
    }

    // # 로 시작하는 헤더(h1)는 제목으로 간주하고 무시
    if (line.startsWith('# ')) continue;

    // 리스트 항목: - [ ], - [x], - 모두 수용
    if (current && (line.startsWith('- ') || line.startsWith('* '))) {
      const feature = line
        .replace(/^[-*]\s+/, '')
        .replace(/^\[[ xX]\]\s*/, '')
        .trim();
      if (feature) current.features.push(feature);
    }
  }

  if (current) phases.push(current);

  // ## 섹션이 없으면 전체를 단일 phase로
  if (phases.length === 0 && content.trim()) {
    const features = content
      .split('\n')
      .map((l) =>
        l
          .replace(/^[-*]\s+/, '')
          .replace(/^\[[ xX]\]\s*/, '')
          .trim(),
      )
      .filter((l) => l && !l.startsWith('#'));
    if (features.length) {
      phases.push({ name: 'MVP', features });
    }
  }

  return { phases };
}

function parseYamlPlan(content) {
  const raw = yaml.load(content);
  const phases = [];

  if (raw?.phases) {
    for (const [phaseName, phaseData] of Object.entries(raw.phases)) {
      const features = phaseData?.features ?? phaseData ?? [];
      phases.push({
        name: phaseName,
        features: Array.isArray(features) ? features.map(String) : [],
      });
    }
  }

  return { phases };
}

// ── 블럭 매핑 엔진 ────────────────────────────────────

/**
 * 피처명과 카탈로그 블럭 목록을 받아 가장 유사한 블럭을 찾는다.
 * @param {string} feature
 * @param {object[]} blocks
 * @returns {{ block: object|null, score: number, matched: boolean }}
 */
function matchFeatureToBlock(feature, blocks) {
  const query = normalize(feature);
  let best = { block: null, score: 0 };

  for (const block of blocks) {
    const score = calcScore(query, block);
    if (score > best.score) {
      best = { block, score };
    }
  }

  return {
    block: best.block,
    score: best.score,
    matched: best.score >= MATCH_SCORES.THRESHOLD,
  };
}

/**
 * 플랜 전체를 카탈로그에 매핑한다.
 * @param {{ phases: { name: string, features: string[] }[] }} plan
 * @param {object} catalog
 * @returns {MappingResult}
 *
 * MappingResult: {
 *   phases: [{
 *     name: string,
 *     mapped: [{ feature, block, score }],
 *     unmatched: string[],
 *   }],
 *   allMappedBlockIds: string[],
 * }
 */
export function mapPlanToCatalog(plan, catalog) {
  const { blocks } = catalog;
  const allMappedIds = new Set();
  const result = { phases: [], allMappedBlockIds: [] };

  for (const phase of plan.phases) {
    const mapped = [];
    const unmatched = [];

    for (const feature of phase.features) {
      const { block, score, matched } = matchFeatureToBlock(feature, blocks);
      if (matched && block) {
        mapped.push({ feature, block, score });
        allMappedIds.add(block.id);
      } else {
        unmatched.push(feature);
      }
    }

    result.phases.push({ name: phase.name, mapped, unmatched });
  }

  result.allMappedBlockIds = [...allMappedIds];
  return result;
}

// ── 유사도 계산 ───────────────────────────────────────

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^\w가-힣]/g, ' ') // 특수문자 → 공백
    .replace(/\s+/g, ' ')
    .trim();
}

function calcScore(query, block) {
  const name = normalize(block.name ?? '');
  const analogy = normalize(block.analogy ?? '');
  const userDesc = normalize(block.user_desc ?? '');
  const techDesc = normalize(block.tech_desc ?? '');

  // 완전 일치
  if (query === name) return MATCH_SCORES.EXACT;

  // name 포함 (양방향)
  if (name.includes(query) || query.includes(name)) return MATCH_SCORES.NAME_INCLUDES;

  // 쿼리 토큰 기반 매칭
  const queryTokens = query.split(' ').filter((t) => t.length >= 2);
  if (queryTokens.length === 0) return 0;

  // analogy 포함
  if (queryTokens.some((t) => analogy.includes(t))) return MATCH_SCORES.ANALOGY;

  // user_desc + tech_desc 키워드 매칭
  const combined = `${userDesc} ${techDesc}`;
  const hits = queryTokens.filter((t) => combined.includes(t) || name.includes(t));
  const ratio = hits.length / queryTokens.length;

  if (ratio >= 0.6) return MATCH_SCORES.DESC_MULTI_KEYWORD;
  if (ratio >= 0.3) return MATCH_SCORES.DESC_SINGLE_KEYWORD;

  return 0;
}
