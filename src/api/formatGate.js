/**
 * 형식 게이트 — 어뷰징 차단
 *
 * 감사 실측: 루브릭 항목명을 그대로 나열한 답이 93점, 목표 코드를 그대로 옮겨 적은 답이
 * 98점을 받았다. 성실하게 관찰해서 쓴 학생 답(55.8점)보다 높았고, 채점 AI는 이런 답에
 * "인상적입니다", "탁월"이라고 칭찬까지 해서 어뷰징을 강화하고 있었다.
 *
 * 이 모듈은 "장면을 관찰해 언어화한 묘사"가 아닌 제출물을 결정적 규칙으로 걸러낸다.
 * 채점 프롬프트에도 같은 기준을 넣지만, 점수 제재는 이 규칙 판정으로만 한다(LLM 판정보다 재현성이 높다).
 * 채점 AI가 형식 위반을 의심해도 제재하지 않고 개선 안내 한 줄만 붙인다(src/api/ai.js).
 *
 * 걸리면:
 *   - ct_score = 0
 *   - 모든 element_scores × 0.5
 *   - feedback 첫 문장에 안내를 붙인다
 *
 * 판정 기준
 *   (a) 평가 항목명·평가 축 이름을 그대로 나열
 *   (b) API 파라미터·코드 나열 (pos, axis, radius, vec(), color.xxx, sphere() 등)
 *   (c) 완결된 문장이 아닌 키-값 쌍 목록
 */

/** 5축 이름 (한국어·영어) — 학생이 장면을 묘사하며 쓸 말이 아니다 */
const AXIS_TERMS = [
  '공간관계', '공간 관계', '도형 종류', '구조·분해', '구조 분해',
  'structure', 'spatial', 'proportion', 'shape', 'color',
  'element_scores', 'category_scores', 'ct_score', '루브릭', '평가 항목', '채점 기준',
]

/** glow.js API 파라미터·함수 — 코드를 옮겨 적었다는 확실한 증거 */
const CODE_CALL_RE = /\b(sphere|box|cylinder|cone|arrow|ring|ellipsoid|pyramid|vec)\s*\(/i
const CODE_COLOR_RE = /\bcolor\s*\.\s*[a-z]+/i
const CODE_PARAM_RE = /\b(pos|axis|radius|thickness|size|shaftwidth|opacity|texture)\s*[:=]/i

/** 키-값 쌍 한 줄 (예: "색: 청록", "방향 = 수직") */
const KEY_VALUE_LINE_RE = /^[^\n:：=]{1,24}\s*[:：=]\s*\S.*$/

// '~음/~임' 명사형 종결은 완결 문장으로 치지 않는다 (src/api/ctScore.js와 동일한 기준)
const SENTENCE_END_RE = /(다|요|까|죠|네|군|야|해)$/

/** 요소명 대조에 쓸 만한 이름인가 — 짧은 이름과 색 이름은 일상 묘사와 겹친다 */
function isListableName(name) {
  const value = String(name || '').trim()
  return value.length >= 4 && !value.endsWith('색')
}

export const FORMAT_GATE_NOTICE =
  '항목을 나열한 것은 묘사가 아닙니다. 본 것을 문장으로 설명해 주세요.'

/** element_scores에 곱하는 계수 */
export const FORMAT_GATE_MULTIPLIER = 0.5

/**
 * 형식 게이트 판정.
 * @param {string} prompt 학생 프롬프트
 * @param {object|null} rubric 이 챌린지의 서버 전용 루브릭 (요소명 대조용)
 * @returns {{violated:boolean, reason:string|null, matched:string[]}}
 */
export function detectFormatViolation(prompt, rubric = null) {
  const text = String(prompt || '')
  const matched = []

  // (b) 코드·API 파라미터 나열 — 가장 확실한 신호라 먼저 본다
  if (CODE_CALL_RE.test(text) || CODE_COLOR_RE.test(text) || CODE_PARAM_RE.test(text)) {
    return {
      violated: true,
      reason: 'code',
      matched: ['glow.js 코드/파라미터'],
    }
  }

  // (a-1) 평가 축 이름 나열
  const axisHits = AXIS_TERMS.filter((term) => text.includes(term))
  if (axisHits.length >= 2) {
    return { violated: true, reason: 'axis-names', matched: axisHits }
  }

  // 완결 문장 수 — (a-2)의 적용 여부와 (c)에 함께 쓴다
  const completeSentences = text
    .split(/[.!?。\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6 && SENTENCE_END_RE.test(s)).length

  // (a-2) 루브릭 요소명을 그대로 옮겨 적음
  // 완결 문장이 2개 이상이면 요소명이 겹쳐도 묘사로 본다(정상 묘사가 걸린 실측 사례가 있다).
  // 셀 때도 짧은 이름(4자 미만)과 '~색'으로 끝나는 이름은 빼서 일상어와 겹치지 않게 한다.
  if (rubric?.elements?.length && completeSentences < 2) {
    const nameHits = rubric.elements
      .map((element) => element.name)
      .filter((name) => isListableName(name) && text.includes(name))
    if (nameHits.length >= 3) {
      return { violated: true, reason: 'rubric-names', matched: nameHits }
    }
    // 요소명 2개 + 축 이름 1개도 항목 나열로 본다
    if (nameHits.length >= 2 && axisHits.length >= 1) {
      return { violated: true, reason: 'rubric-names', matched: [...nameHits, ...axisHits] }
    }
    matched.push(...nameHits)
  }

  // (c) 완결 문장 없는 키-값 쌍 목록
  const lines = text
    .split(/[\n·•\-–—]+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const keyValueLines = lines.filter((line) => KEY_VALUE_LINE_RE.test(line)).length

  if (keyValueLines >= 3 && completeSentences === 0) {
    return { violated: true, reason: 'key-value-list', matched: [`키-값 ${keyValueLines}줄`] }
  }

  return { violated: false, reason: null, matched }
}
