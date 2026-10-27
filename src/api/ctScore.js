/**
 * CT(사고력) 보너스 — **규칙 기반 결정적 채점**
 *
 * 왜 LLM에서 뺐나
 *   감사 실측에서 같은 답을 5번 채점했더니 49~66점(폭 17, 표준편차 5)으로 흔들렸고,
 *   진폭의 주범이 CT였다(같은 답에 1~12점). 수업에서 팀 순위를 매기는 이상
 *   "같은 답 = 같은 점수"는 타협할 수 없어서 CT는 LLM 판정에서 완전히 빼고
 *   아래 규칙으로만 산출한다. 같은 입력이면 언제나 같은 값이 나온다.
 *
 * 왜 이 축들인가
 *   이 수업의 목표는 "본 것을 관찰해 정확히 언어화하기"다. 그래서
 *   (1) 문장으로 썼는가 (2) 요소 사이의 관계를 서술했는가
 *   (3) 부분을 이름 붙여 나눴는가 (4) 수치·비교로 정량화했는가
 *   (5) 재현에 필요한 만큼 썼는가 — 다섯 가지를 본다.
 *
 * 배점 (총 15점, 루브릭의 ct.maxPoints와 같다)
 *   A. 완결된 문장   3점 : 2문장 이상 3 / 1문장 2 / 0문장 0
 *   B. 관계 서술     4점 : 서로 다른 관계어 4종 이상 4 / 3종 3 / 2종 2 / 1종 1 / 0종 0
 *   C. 부분 명명     3점 : 서로 다른 부분·도형 이름 3종 이상 3 / 2종 2 / 1종 1 / 0종 0
 *   D. 정량 표현     3점 : 수치 2개 이상 2 · 수치 1개 1.5 (택1) + 비교 표현 1 (합 3 상한)
 *   E. 서술 밀도     2점 : 공백 제외 60자 이상 2 / 30자 이상 1 / 그 미만 0
 *
 *   보정 — 완결된 문장이 하나도 없으면(A=0) 합계에 0.5를 곱한다.
 *          단어·키워드만 늘어놓은 답이 관계어·부분명만으로 높은 CT를 받는 것을 막는다.
 *   형식 게이트(src/api/formatGate.js)에 걸리면 호출부에서 CT를 0으로 만든다.
 *
 * 최종값은 소수 첫째 자리에서 반올림한다.
 */

export const CT_MAX_POINTS = 15

// ── A. 완결된 문장 ──────────────────────────────────────────────────────────
// 한국어 서술어 종결형으로 끝나는 6자 이상 조각을 "완결된 문장"으로 센다.
// '~음/~임' 같은 명사형 종결은 뺐다. "고리 청록 수직 얇음"처럼 단어를 늘어놓은 답이
// 완결된 문장으로 잘못 인정되기 때문이다.
const SENTENCE_END_RE = /(다|요|까|죠|네|군|야|해)$/

// ── B. 관계어 ───────────────────────────────────────────────────────────────
// 요소끼리의 위치·방향·크기 관계를 나타내는 말. 같은 뜻끼리 묶어 중복 가산을 막는다.
const RELATION_GROUPS = [
  ['위에', '위쪽', '꼭대기', '상단'],
  ['아래', '밑에', '하단', '바닥'],
  ['왼쪽', '좌측'],
  ['오른쪽', '우측'],
  ['앞쪽', '앞면', '정면', '앞으로', '앞에'],
  ['뒤쪽', '뒷면', '뒤에', '후면'],
  ['가운데', '중앙', '중심', '가운데에'],
  ['사이', '틈'],
  ['둘레', '주위', '주변', '둘러', '감싸', '에워'],
  ['향해', '향하', '바라보'],
  ['맞닿', '붙어', '접해', '이어져', '연결'],
  ['얹혀', '올려', '얹어', '놓여', '받치', '지탱'],
  ['매달', '달려', '박혀', '꽂혀'],
  ['안에', '내부', '속에'],
  ['바깥', '외부', '겉'],
  ['보다', '에 비해', '비교하면'],
  ['나란히', '일렬', '줄지어'],
  ['대칭', '좌우 대칭', '대칭적'],
  ['평행', '수평', '가로로'],
  ['수직', '세로로', '서 있'],
  ['기준으로', '기준점'],
  ['끝에', '양끝', '양 끝', '끝부분'],
  ['따라', '경로'],
]

// ── C. 부분·도형 이름 ───────────────────────────────────────────────────────
const PART_GROUPS = [
  ['구', '공', '구슬', '동그란'],
  ['상자', '박스', '정육면체', '육면체', '블록', '직육면체', '네모'],
  ['원기둥', '기둥', '막대', '봉', '실린더'],
  ['원뿔', '뿔', '고깔', '세모'],
  ['고리', '링', '도넛'],
  ['타원', '타원체', '럭비공', '달걀'],
  ['화살표', '화살'],
  ['피라미드'],
  ['판', '상판', '평면'],
  ['줄기'],
  ['갓', '머리', '두상'],
  ['몸통', '동체', '본체'],
  ['다리', '받침', '지지대'],
  ['지붕', '덮개'],
  ['좌석', '의자'],
  ['꽃잎'],
  ['꽃술'],
  ['안테나', '더듬이'],
  ['눈'],
  ['코'],
  ['입'],
  ['모자'],
  ['층', '단'],
  ['칸', '격자'],
  ['불', '전등', '등불', '램프'],
  ['추', '무게추'],
  ['날개'],
  ['계단'],
  ['건물'],
  ['꼭짓점', '모서리'],
]

// ── D. 정량 표현 ────────────────────────────────────────────────────────────
const KOREAN_NUMBER_RE =
  /(하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열|열두|스무|서른|한\s*개|두\s*개|세\s*개|네\s*개|두\s*배|절반|반쪽)/g
const DIGIT_RE = /\d+(\.\d+)?/g
const COMPARISON_RE =
  /(보다|더\s|훨씬|가장|제일|배\s|비슷|같은\s*크기|동일|절반|약간|매우|아주|조금|살짝|균등|일정|정도)/

/** 프롬프트를 CT 채점용으로 정규화 — 앞뒤 공백 제거 + 연속 공백 1칸 축약 */
export function normalizePrompt(text) {
  return String(text || '').trim().replace(/\s+/g, ' ')
}

// ── 한 글자 이름 판정 ───────────────────────────────────────────────────────
// '구'·'눈'·'코'·'입'·'단'·'불'·'추' 같은 한 글자 이름을 includes로 세면 '구조'·'입체'·'단계'·
// '추가' 같은 다른 낱말에서도 잡힌다. 한 글자 이름은 앞이 문장 처음·공백·숫자·문장 부호이고
// 뒤가 끝·공백·문장 부호·조사일 때만 인정한다.
// 조사처럼 보이는 글자로 이어지는 다른 낱말('구도', '추가로', '불만' 등)은 먼저 지운다.
const LONG_WORD_EXCLUDES = [
  '구조', '구성', '구도', '구분', '구간', '입체', '입력', '배열', '단계', '단위', '단면', '단순',
  '추가로', '추가해', '추가하', '추가된', '추가적', '불만', '판도', '코로나', '공간', '공중',
]
const PARTICLE_AFTER =
  '(?:으로|처럼|보다|까지|부터|마다|끼리|하고|이랑|입니다|가|이|를|을|은|는|와|과|의|에|로|도|만|들|랑)'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const singleCharPatterns = new Map()
function singleCharPattern(word) {
  if (!singleCharPatterns.has(word)) {
    singleCharPatterns.set(
      word,
      new RegExp(`(?:^|[^가-힣])${escapeRegExp(word)}(?=$|[^가-힣]|${PARTICLE_AFTER})`),
    )
  }
  return singleCharPatterns.get(word)
}

function stripLongWords(text) {
  let result = text
  for (const word of LONG_WORD_EXCLUDES) result = result.split(word).join(' ')
  return result
}

function countGroups(text, groups) {
  const stripped = stripLongWords(text)
  let hit = 0
  for (const group of groups) {
    const found = group.some((word) =>
      word.length === 1 ? singleCharPattern(word).test(stripped) : text.includes(word),
    )
    if (found) hit += 1
  }
  return hit
}

/**
 * 결정적 CT 점수 산출.
 * @param {string} prompt 학생 프롬프트
 * @param {number} maxPoints 이 챌린지의 CT 만점 (기본 15)
 * @returns {{score:number, max:number, breakdown:Object, reasons:string[]}}
 */
export function scoreCT(prompt, maxPoints = CT_MAX_POINTS) {
  const text = normalizePrompt(prompt)
  const compact = text.replace(/\s/g, '')

  // A. 완결된 문장
  // 원문에서 먼저 문장을 나눈 뒤 각 문장의 공백을 정규화한다.
  // (정규화를 먼저 하면 줄바꿈이 공백이 되어 줄마다 쓴 문장이 한 문장으로 합쳐진다)
  const fragments = String(prompt || '')
    .split(/[.!?。\n]+/)
    .map((s) => normalizePrompt(s))
    .filter((s) => s.length >= 6)
  const completeSentences = fragments.filter((s) => SENTENCE_END_RE.test(s)).length
  const sentenceScore = completeSentences >= 2 ? 3 : completeSentences === 1 ? 2 : 0

  // B. 관계 서술
  const relationHits = countGroups(text, RELATION_GROUPS)
  const relationScore = Math.min(4, relationHits)

  // C. 부분 명명
  const partHits = countGroups(text, PART_GROUPS)
  const partScore = Math.min(3, partHits)

  // D. 정량 표현
  const digitCount = (text.match(DIGIT_RE) || []).length
  const koreanNumberCount = (text.match(KOREAN_NUMBER_RE) || []).length
  const numberCount = digitCount + koreanNumberCount
  const numberScore = numberCount >= 2 ? 2 : numberCount === 1 ? 1.5 : 0
  const comparisonScore = COMPARISON_RE.test(text) ? 1 : 0
  const quantityScore = Math.min(3, numberScore + comparisonScore)

  // E. 서술 밀도
  const densityScore = compact.length >= 60 ? 2 : compact.length >= 30 ? 1 : 0

  const rawTotal = sentenceScore + relationScore + partScore + quantityScore + densityScore
  // 문장이 하나도 없으면(단어 나열) 절반으로 깎는다
  const penaltyApplied = sentenceScore === 0
  const penalized = penaltyApplied ? rawTotal * 0.5 : rawTotal

  // 루브릭의 CT 만점이 15가 아니면 비례 환산한다
  const scaled = (penalized / CT_MAX_POINTS) * maxPoints
  const score = Math.round(Math.min(maxPoints, Math.max(0, scaled)) * 10) / 10

  const reasons = []
  if (sentenceScore === 0) reasons.push('완결된 문장이 없어 CT 점수가 절반으로 줄었습니다')
  if (relationScore <= 1) reasons.push('요소 사이의 위치·크기 관계 서술이 부족합니다')
  if (partScore <= 1) reasons.push('장면을 부분으로 나눠 이름 붙인 서술이 부족합니다')
  if (quantityScore === 0) reasons.push('개수·크기 비교 같은 정량 표현이 없습니다')

  return {
    score,
    max: maxPoints,
    breakdown: {
      sentence: sentenceScore,
      relation: relationScore,
      part: partScore,
      quantity: quantityScore,
      density: densityScore,
      penaltyApplied,
    },
    reasons,
  }
}
