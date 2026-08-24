import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { RUBRICS } from '../data/rubrics.js'
import { BATTLE_CHALLENGES } from '../data/challenges-battle.js'
import { getApiKey } from './apiKeyStore.js'
import { isValidTeacherToken } from './teacherAuth.js'
import { getAuthorizedTeam } from './teamAuth.js'
import { createEvaluationProof } from './evaluationProof.js'

const router = Router()

const GENERIC_CATEGORY_MAX = {
  structure: 25,
  spatial: 25,
  proportion: 20,
  shape: 10,
  color: 5,
}

const MAX_PROMPT_LENGTH = 3000
const MAX_CODE_LENGTH = 20000
const RATE_WINDOW_MS = 60 * 1000
const RATE_LIMIT = 30
const rateBuckets = new Map()

// ── Anthropic 호출 재시도 정책 ───────────────────────────────────────────────
// SDK 자체 재시도(maxRetries)는 끄고, 아래 래퍼가 총 시도 횟수를 단독으로 통제한다.
// (SDK와 래퍼가 동시에 재시도하면 최악의 경우 12번까지 호출돼 레이트리밋을 악화시킴)
const SDK_MAX_RETRIES = 0
const AI_MAX_ATTEMPTS = 4          // 최초 1회 + 재시도 3회
const AI_BASE_BACKOFF_MS = 1000    // 1s → 2s → 4s (+ 지터)
// 32팀 동시 평가 실측에서 최악 호출이 52초였다. 60초로 두면 마진이 8초뿐이라
// 타임아웃 → 재시도 3회로 번져 3분 대기 + 4배 과금이 된다.
const AI_REQUEST_TIMEOUT_MS = 90 * 1000

// 요청마다 현재 설정된 API 키로 클라이언트 생성
function getClient() {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다. 교사 화면에서 API 키를 입력해주세요.')
  return new Anthropic({ apiKey, maxRetries: SDK_MAX_RETRIES, timeout: AI_REQUEST_TIMEOUT_MS })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 재시도해도 되는 오류인가 — 429/529/5xx/네트워크 타임아웃만 해당.
// 400류 클라이언트 오류나 인증 오류(401/403)는 몇 번을 다시 보내도 같은 결과라 재시도하지 않는다.
function isRetryableAIError(err) {
  const status = err?.status ?? err?.response?.status
  if (typeof status === 'number') {
    return status === 408 || status === 409 || status === 429 || status >= 500
  }
  // 상태 코드가 없으면 네트워크·타임아웃 계열로 본다
  const name = err?.name || ''
  if (['APIConnectionError', 'APIConnectionTimeoutError', 'AbortError', 'TimeoutError'].includes(name)) return true
  const code = err?.code || err?.cause?.code || ''
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) return true
  return /fetch failed|network|socket hang up|timed? ?out/i.test(err?.message || '')
}

/**
 * Anthropic messages.create 재시도 래퍼.
 * 일시적 장애(429/529/5xx/네트워크)에 한해 지수 백오프로 재시도한다.
 * 재시도가 발생하면 서버 로그에 남겨 수업 중 장애를 추적할 수 있게 한다.
 */
async function callAnthropic(params, label = 'anthropic') {
  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await getClient().messages.create(params)
      if (attempt > 1) console.log(`[${label}] 재시도 ${attempt - 1}회 만에 성공`)
      return result
    } catch (err) {
      const retryable = isRetryableAIError(err)
      const reason = err?.status ?? err?.code ?? err?.name ?? 'unknown'

      if (!retryable) {
        console.error(`[${label}] 재시도 불가 오류(${reason}) — 즉시 실패: ${err.message}`)
        throw err
      }
      if (attempt === AI_MAX_ATTEMPTS) {
        console.error(`[${label}] 재시도 ${AI_MAX_ATTEMPTS - 1}회 모두 실패(${reason}) — 포기: ${err.message}`)
        throw err
      }

      // 지수 백오프 + 지터(0~30%) — 여러 팀이 동시에 재시도하며 몰리는 것을 방지
      const backoffMs = Math.round(AI_BASE_BACKOFF_MS * 2 ** (attempt - 1) * (1 + Math.random() * 0.3))
      console.warn(
        `[${label}] 일시적 오류(${reason}) — ${backoffMs}ms 후 재시도 ${attempt}/${AI_MAX_ATTEMPTS - 1}: ${err.message}`
      )
      await sleep(backoffMs)
    }
  }
}

// AI 호출 실패를 학생이 읽을 수 있는 한국어 메시지로 변환해 응답
function respondAIError(res, err) {
  const status = err?.status ?? err?.response?.status

  if (status === 401 || status === 403) {
    return res.status(502).json({ error: 'AI 서버 인증에 실패했습니다. 선생님께 API 키 확인을 요청해주세요.' })
  }
  if (status === 429) {
    return res.status(429).json({ error: 'AI 서버에 요청이 몰리고 있습니다. 10초쯤 기다렸다가 다시 제출해주세요.' })
  }
  if (typeof status === 'number' && status >= 500) {
    return res.status(503).json({ error: 'AI 서버가 잠시 불안정합니다. 잠시 후 다시 제출해주세요. 입력한 프롬프트는 그대로 남아 있어요.' })
  }
  if (isRetryableAIError(err)) {
    return res.status(503).json({ error: '네트워크가 불안정해 AI 서버에 연결하지 못했습니다. 다시 제출해주세요.' })
  }
  if (err?.message?.includes('API 키')) {
    return res.status(503).json({ error: err.message })
  }
  return res.status(500).json({ error: 'AI 처리 중 오류가 발생했습니다. 다시 제출해주세요.' })
}

function authorizeAI(req, res) {
  const teacherToken = req.headers['x-teacher-token']
  if (isValidTeacherToken(teacherToken)) {
    return { role: 'teacher' }
  }

  const team = getAuthorizedTeam(req)
  if (team) return { role: 'team', team }

  res.status(401).json({ error: '인증이 필요합니다. 교사 또는 팀 화면에서 다시 시도해주세요.' })
  return null
}

function checkRateLimit(req, res, auth) {
  const key = auth.role === 'team' ? `team:${auth.team.id}` : `teacher:${req.ip}`
  const now = Date.now()
  const bucket = rateBuckets.get(key) || { start: now, count: 0 }

  if (now - bucket.start > RATE_WINDOW_MS) {
    bucket.start = now
    bucket.count = 0
  }

  bucket.count += 1
  rateBuckets.set(key, bucket)

  if (bucket.count > RATE_LIMIT) {
    res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' })
    return false
  }
  return true
}

function ensureTextLimit(res, label, value, max) {
  if (typeof value !== 'string' || !value.trim()) {
    res.status(400).json({ error: `${label} 필요` })
    return false
  }
  if (value.length > max) {
    res.status(413).json({ error: `${label}가 너무 깁니다. ${max}자 이하로 줄여주세요.` })
    return false
  }
  return true
}

// Claude 응답에서 JSON 추출 (불완전한 JSON 복구 시도)
function parseAIJson(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('JSON 파싱 실패: JSON 객체를 찾을 수 없습니다')

  let jsonStr = jsonMatch[0]
  try {
    return JSON.parse(jsonStr)
  } catch (e1) {
    jsonStr = jsonStr
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/[\r\n]+/g, ' ')
      .replace(/"\s*:\s*"([^"]*?)"\s*([^,}\]])/g, '":"$1",$2')
    try {
      return JSON.parse(jsonStr)
    } catch (e2) {
      console.error('[parseAIJson] 원본:', raw.slice(0, 500))
      throw new Error('JSON 파싱 실패')
    }
  }
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clampScore(value, max) {
  return Math.min(max, Math.max(0, toNumber(value)))
}

function roundOne(value) {
  return Math.round(value * 10) / 10
}

function categoryMaxByRubric(rubric) {
  const max = {}
  for (const e of rubric.elements) {
    max[e.category] = (max[e.category] || 0) + e.weight
  }
  return max
}

function withLegacyCtScores(evaluation) {
  if (evaluation.ct_scores || evaluation.ct_score === undefined) return evaluation

  const ct = evaluation.ct_score || 0
  return {
    ...evaluation,
    ct_scores: {
      abstract: Math.round(ct * 0.3),
      pattern: Math.round(ct * 0.25),
      decomp: Math.round(ct * 0.25),
      algorithm: Math.round(ct * 0.2),
    },
  }
}

export function normalizeEvaluation(evaluation, rubric = null) {
  const normalized = { ...evaluation }
  const categoryMax = rubric ? categoryMaxByRubric(rubric) : GENERIC_CATEGORY_MAX
  const ctMax = rubric?.ct?.maxPoints ?? 15
  const ctScore = roundOne(clampScore(normalized.ct_score, ctMax))

  let categoryScores

  if (rubric) {
    const rawElementScores = normalized.element_scores || {}
    const hasAllElementScores = rubric.elements.every((e) =>
      Object.prototype.hasOwnProperty.call(rawElementScores, e.name)
    )

    normalized.element_scores = {}
    for (const e of rubric.elements) {
      normalized.element_scores[e.name] = roundOne(clampScore(rawElementScores[e.name], e.weight))
    }

    if (hasAllElementScores) {
      categoryScores = Object.fromEntries(Object.keys(categoryMax).map((cat) => [cat, 0]))
      for (const e of rubric.elements) {
        categoryScores[e.category] += normalized.element_scores[e.name]
      }
      for (const cat of Object.keys(categoryScores)) {
        categoryScores[cat] = roundOne(clampScore(categoryScores[cat], categoryMax[cat]))
      }
    }
  }

  if (!categoryScores) {
    categoryScores = {}
    for (const [cat, max] of Object.entries(categoryMax)) {
      categoryScores[cat] = roundOne(clampScore(normalized.category_scores?.[cat], max))
    }
  }

  const subtotal = Object.values(categoryScores).reduce((sum, score) => sum + score, 0)
  normalized.category_scores = categoryScores
  normalized.ct_score = ctScore
  normalized.score = Math.round(clampScore(subtotal + ctScore, 100))

  return withLegacyCtScores(normalized)
}

// ── 코드 생성 (Sonnet — 정확하고 일관된 코드 생성) ─────────────────────────
router.post('/generate', async (req, res) => {
  const { prompt, challengeId } = req.body
  const auth = authorizeAI(req, res)
  if (!auth || !checkRateLimit(req, res, auth)) return
  if (!ensureTextLimit(res, 'prompt', prompt, MAX_PROMPT_LENGTH)) return

  try {
    const message = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `glow.js 3D 코드 생성기. 학생의 자연어 설명을 glow.js 코드로 변환하라.

반드시 코드만 출력. 설명/주석/안내 절대 금지.
아무리 짧거나 모호한 설명이라도 최선을 다해 코드로 변환하라.

API 레퍼런스:
- sphere({pos:vec(x,y,z), radius:r, color:color.red})
- box({pos:vec(x,y,z), size:vec(w,h,d), color:color.blue})
- cylinder({pos:vec(x,y,z), axis:vec(ax,ay,az), radius:r, color:color.green})
- cone({pos:vec(x,y,z), axis:vec(ax,ay,az), radius:r, color:color.yellow})
- arrow({pos:vec(x,y,z), axis:vec(ax,ay,az), shaftwidth:w, color:color.magenta})
- ring({pos:vec(x,y,z), axis:vec(ax,ay,az), radius:r, thickness:t, color:color.cyan})
- ellipsoid({pos:vec(x,y,z), size:vec(w,h,d), color:color.orange})
- pyramid({pos:vec(x,y,z), size:vec(w,h,d), color:color.white})

사용 가능한 색상:
- color.red, color.blue, color.green, color.white, color.black
- color.yellow, color.orange, color.cyan, color.magenta
- 커스텀: vec(r,g,b) (0~1 범위) — 갈색 vec(0.6,0.3,0.1), 회색 vec(0.5,0.5,0.5)

위치/크기 규칙:
- 특별한 언급 없으면 원점 vec(0,0,0) 기준
- "큰/작은"은 상대적으로 2배/0.5배 적용
- "위/아래"는 y축, "좌/우"는 x축, "앞/뒤"는 z축
- scene/canvas 선언 불필요

설명: ${prompt}`,
        },
      ],
    }, 'generate')

    let code = message.content[0].text.trim()
    code = code.replace(/^```(?:javascript|js|python)?\n?/m, '').replace(/\n?```$/m, '').trim()
    res.json({ code })
  } catch (err) {
    console.error('[generate]', err)
    respondAIError(res, err)
  }
})

// ── 루브릭 기반 프롬프트 품질 평가 (Sonnet) ──────────────────────────────
router.post('/evaluate', async (req, res) => {
  const { prompt, generatedCode, targetCode, challengeId, sessionNumber = 1 } = req.body

  const auth = authorizeAI(req, res)
  if (!auth || !checkRateLimit(req, res, auth)) return
  if (!ensureTextLimit(res, 'prompt', prompt, MAX_PROMPT_LENGTH)) return
  if ((generatedCode || '').length > MAX_CODE_LENGTH) {
    return res.status(413).json({ error: `generatedCode가 너무 깁니다. ${MAX_CODE_LENGTH}자 이하로 줄여주세요.` })
  }

  const presetChallenge = challengeId ? BATTLE_CHALLENGES.find((c) => c.id === challengeId) : null
  if (auth.role === 'team' && !presetChallenge) {
    return res.status(400).json({ error: '알 수 없는 챌린지입니다.' })
  }
  const effectiveTargetCode = presetChallenge?.code || targetCode
  if (!effectiveTargetCode) return res.status(400).json({ error: 'targetCode 필요' })

  // 루브릭 조회
  const rubric = challengeId ? RUBRICS[challengeId] : null

  try {
    let evalPrompt

    if (rubric) {
      // ── 루브릭 기반 정밀 평가 ──
      const elementTotal = rubric.elements.reduce((s, e) => s + e.weight, 0)
      const elementsList = rubric.elements
        .map(e => `- ${e.name} (${e.weight}점): ${e.desc}`)
        .join('\n')

      const anchorsList = rubric.anchors
        .map(a => `- ${a.score}점 수준: "${a.prompt}"`)
        .join('\n')

      // 카테고리별 합계 계산
      const categories = {}
      for (const e of rubric.elements) {
        if (!categories[e.category]) categories[e.category] = 0
        categories[e.category] += e.weight
      }
      const categoryInfo = Object.entries(categories)
        .map(([cat, total]) => `${cat}: ${total}점`)
        .join(', ')

      evalPrompt = `당신은 3D 장면 프롬프트 품질 평가 전문가입니다.

## 핵심 원칙
학생이 3D 장면을 보고 작성한 **프롬프트 텍스트 자체의 품질**만 평가합니다.
AI가 생성한 코드의 품질은 채점 대상이 아닙니다.
평가 초점: **"도형 이름"과 "색깔"보다, 부분-전체 관계·공간 관계·비율을 얼마나 정확히 언어화했는가.**

## 평가 축 (5축)
- structure (구조·분해): 부분을 나누어 명명했는가, 반복·순서·대칭 같은 구조적 규칙을 인식했는가
- spatial (공간 관계): 방향, 배치, 접합, 수직·수평, 정면·측면, 내부·외부
- proportion (비율): 부분 간 상대적 크기, 길이, 두께, 납작함, 크기 증감
- shape (도형 종류): 어떤 기본 도형인가 (비중 낮음, 유사어 관대)
- color (색): 색상 언급 (비중 낮음, 유사어 관대)

## 유연성 규칙
도형 이름은 유사어로 관대하게 인정. "막대·봉·기둥" → cylinder, "공·동그란 것" → sphere,
"세모·뾰족한 것" → cone, "네모·판·블록" → box. 핵심은 "이 프롬프트를 읽고 장면을 재현할 수 있는가".
단, **공간 관계와 비율**은 모호하게 넘어가지 말 것. "A 위에 B" "한쪽이 더 큼" 같은 관계 언어가 빠지면 감점.

## 이 챌린지의 채점 루브릭

### 필수 요소 (${elementTotal}점 만점)
${elementsList}

각 요소를 학생 프롬프트에서 확인하세요:
- 명확히 포함 → 해당 요소 만점
- 부분적/모호하게 포함 → 절반
- 포함하지 않음 → 0점

카테고리 합계: ${categoryInfo}

### CT 사고력 보너스 (${rubric.ct.maxPoints}점 만점)
- 평가 관점: ${rubric.ct.criteria}
- 만점: 체계적이고 논리적인 구조로 장면을 설명
- 절반: 요소는 나열했으나 구조적 사고가 부족
- 0점: 단어 나열 수준

## 점수 기준점 (이 점수대에 맞춰 채점하세요)
${anchorsList}

## 점수 산정 규칙 (엄수)
1. element_scores에는 위 필수 요소의 name을 빠짐없이 그대로 키로 넣으세요.
2. 각 element_scores 값은 해당 요소 배점 안에서만 부여합니다. 명확히 포함=만점, 부분적/모호=절반, 없음=0점입니다.
3. category_scores는 element_scores를 category별로 합산한 값이어야 합니다.
4. score는 category_scores 합계 + ct_score입니다. 앵커는 보정 기준일 뿐, 이 합산 규칙을 어기면 안 됩니다.

## 학생의 프롬프트
"${prompt}"

## 피드백 작성 규칙 (엄수)
1. 빠진 **축**을 알려주세요. 구조/공간 관계/비율 관련 결손을 우선 지적 (예: "부분을 나눠서 각각 묘사해 보세요", "위아래·앞뒤 관계가 모호합니다", "크기 비교가 빠졌습니다").
2. 구체적 정답을 절대 알려주지 마세요
   금지: "다리를 네 모서리에 놓으세요", "원기둥을 사용하세요", "빨간색을 추가하세요"
   허용: "각 부분이 어디에 위치하는지 관찰해보세요", "부분 간 크기를 비교해보세요"
3. 사고 전략을 제안하세요 (예: "전체를 부분으로 나눠서 각각 묘사해보세요", "기준점 하나를 정하고 다른 부분을 그 기준에 대해 서술해보세요")

JSON만 응답:
{
  "score": 0~100,
  "category_scores": {"structure": 0~N, "spatial": 0~N, "proportion": 0~N, "shape": 0~N, "color": 0~N},
  "element_scores": {"요소명": 획득점수, ...},
  "ct_score": 0~${rubric.ct.maxPoints},
  "feedback": "2줄 피드백 (사고 방향 제안, 정답 금지)",
  "strengths": ["잘한 점 1~2개"],
  "improvements": ["사고 전략 제안 1~2개 (정답 금지)"]
}`
    } else {
      // ── 루브릭 없는 문제 (학생 출제 등) — 5축 프레임워크 적용 ──
      evalPrompt = `3D 장면 프롬프트 평가. 학생은 3D 장면을 눈으로 보고 설명한다.

중요: 학생의 프롬프트 품질을 평가하세요. AI 코드 생성 품질이 아닙니다.
초점은 "부분-전체 관계, 공간 관계, 비율"을 얼마나 정확히 언어화했는가입니다.
도형 이름·색 맞추기는 비중이 낮습니다.

채점 기준 (5축):
- structure (25%): 부분 분해, 반복·순서·대칭 같은 구조 규칙 인식
- spatial   (25%): 방향·배치·접합·수직수평·정면측면·내부외부
- proportion(20%): 부분 간 상대적 크기/길이/두께/납작함
- shape     (10%): 어떤 기본 도형인가 (유사어 관대)
- color     (5%) : 색상 언급 (유사어 관대)
- CT 보너스 (15%): 체계성·일관성·재현 가능성

[목표 코드]
${effectiveTargetCode}

[학생 프롬프트]
${prompt}

피드백 규칙: 구체적 정답을 알려주지 말고, 구조/공간/비율 축의 결손을 먼저 짚고 사고 방향만 제안하세요.

JSON만 응답:
{"score":0~100,"category_scores":{"structure":0,"spatial":0,"proportion":0,"shape":0,"color":0},"element_scores":{},"ct_score":0,"feedback":"2줄 피드백","strengths":["잘한 점"],"improvements":["개선 사고 방향"]}`
    }

    const message = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: 0,
      messages: [{ role: 'user', content: evalPrompt }],
    }, 'evaluate')

    const raw = message.content[0].text.trim()
    const evaluation = normalizeEvaluation(parseAIJson(raw), rubric)
    if (auth.role === 'team') {
      evaluation.evaluationProof = createEvaluationProof({
        teamId: auth.team.id,
        sessionNumber,
        challengeId,
        prompt,
        generatedCode,
        evaluation,
      })
    }

    res.json(evaluation)
  } catch (err) {
    console.error('[evaluate]', err)
    if (err.message.includes('JSON')) {
      res.json({
        score: 50,
        ct_scores: { abstract: 12, pattern: 12, decomp: 13, algorithm: 13 },
        category_scores: { structure: 0, spatial: 0, proportion: 0, shape: 0, color: 0 },
        element_scores: {},
        ct_score: 0,
        feedback: '평가 중 오류가 발생하여 임시 점수가 부여되었습니다. 다시 제출해주세요.',
        strengths: [],
        improvements: ['다시 제출을 시도해보세요'],
      })
    } else {
      respondAIError(res, err)
    }
  }
})

// ── 문제 품질 분석 (Session 4) ────────────────────────────────────────────────
router.post('/analyze-problem', async (req, res) => {
  const { code, title, difficulty } = req.body
  const auth = authorizeAI(req, res)
  if (!auth || !checkRateLimit(req, res, auth)) return
  if (!ensureTextLimit(res, 'code', code, MAX_CODE_LENGTH)) return

  try {
    const message = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `이 VPython 코드로 만든 문제의 품질을 분석해주세요.

[코드]
${code}

[제목] ${title || '미입력'}
[학생 설정 난이도] ${difficulty || '기본'}

다음 JSON 형식으로만 응답해주세요:
{
  "estimated_difficulty": "기본|중급|도전",
  "ct_elements_detected": ["추상화"|"패턴인식"|"분해"|"알고리즘"],
  "prompt_difficulty": "★~★★★★ (프롬프트로 설명하기 어려운 정도)",
  "suggestion": "개선 제안 (1~2줄)"
}`,
        },
      ],
    }, 'analyze-problem')

    const raw = message.content[0].text.trim()
    res.json(parseAIJson(raw))
  } catch (err) {
    console.error('[analyze-problem]', err)
    respondAIError(res, err)
  }
})

// ── 출제팀 평가 (Session 5) ───────────────────────────────────────────────
router.post('/evaluate-problem-quality', async (req, res) => {
  const { problemCode, solverPrompt, solverScore } = req.body
  const auth = authorizeAI(req, res)
  if (!auth || !checkRateLimit(req, res, auth)) return
  if (!ensureTextLimit(res, 'problemCode', problemCode, MAX_CODE_LENGTH)) return
  if (!ensureTextLimit(res, 'solverPrompt', solverPrompt, MAX_PROMPT_LENGTH)) return

  try {
    const message = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `VPython 출제 문제의 품질을 평가해주세요.

[문제 코드]
${problemCode}

[풀이팀 프롬프트]
${solverPrompt}

[풀이팀 점수] ${solverScore}점

다음 JSON 형식으로만 응답해주세요:
{
  "quality_score": 0~100,
  "breakdown": {
    "ct_included": 0~30,
    "difficulty": 0~25,
    "clarity": 0~25,
    "uniqueness": 0~20
  },
  "feedback": "출제팀에게 주는 피드백 (2줄)",
  "deductions": ["감점 이유들"]
}`,
        },
      ],
    }, 'evaluate-problem-quality')

    const raw = message.content[0].text.trim()
    res.json(parseAIJson(raw))
  } catch (err) {
    console.error('[evaluate-problem-quality]', err)
    respondAIError(res, err)
  }
})

export default router
