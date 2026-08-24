import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
// 루브릭·정답 코드는 서버 전용 모듈에서만 가져온다.
// (src/data/ 아래에 두면 Vite가 클라이언트 번들에 넣어 학생이 모범답안을 읽을 수 있다)
import { RUBRICS } from '../server-data/rubrics.js'
import { getChallenge } from '../server-data/challenges.js'
import { getApiKey } from './apiKeyStore.js'
import { isValidTeacherToken } from './teacherAuth.js'
import { getAuthorizedTeam } from './teamAuth.js'
import { createEvaluationProof } from './evaluationProof.js'
import { scoreCT, CT_MAX_POINTS } from './ctScore.js'
import { detectFormatViolation, FORMAT_GATE_NOTICE, FORMAT_GATE_MULTIPLIER } from './formatGate.js'
import { buildCacheKey, readEvaluationCache, writeEvaluationCache } from './evaluationCache.js'

const router = Router()

const CATEGORY_KEYS = ['structure', 'spatial', 'proportion', 'shape', 'color']

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

/**
 * 클라이언트에 내려보낼 카테고리 만점표 — 5축 키가 항상 모두 존재한다.
 * 학생 화면은 이 값으로 점수 막대의 분모를 그리므로, 해당 축이 없는 문제도 0으로 채워 보낸다.
 * (예전에는 클라이언트가 rubrics.js를 직접 import해서 계산했고, 그 탓에 모범답안이 번들에 실렸다)
 */
function categoryMaxForClient(rubric) {
  const base = Object.fromEntries(CATEGORY_KEYS.map((key) => [key, 0]))
  const source = rubric ? categoryMaxByRubric(rubric) : GENERIC_CATEGORY_MAX
  for (const [key, value] of Object.entries(source)) base[key] = value
  return base
}

// 채점 AI가 피드백에 정답 코드를 흘리는 것을 막는 최후 방어선.
// 프롬프트로도 금지하지만, 만에 하나 새어 나오면 여기서 지운다.
const CODE_CALL_LEAK_RE = /\b(sphere|box|cylinder|cone|arrow|ring|ellipsoid|pyramid|vec)\s*\([^)]*\)?/gi
const CODE_COLOR_LEAK_RE = /\bcolor\s*\.\s*[a-zA-Z]+/g
const CODE_PARAM_LEAK_RE = /\b(pos|axis|radius|thickness|shaftwidth)\s*[:=]\s*[^,\s]+/gi

function scrubCodeLeak(text) {
  if (typeof text !== 'string') return text
  return text
    .replace(CODE_CALL_LEAK_RE, '(코드 생략)')
    .replace(CODE_COLOR_LEAK_RE, '(코드 생략)')
    .replace(CODE_PARAM_LEAK_RE, '(코드 생략)')
}

function scrubEvaluationText(evaluation) {
  evaluation.feedback = scrubCodeLeak(evaluation.feedback)
  if (Array.isArray(evaluation.strengths)) evaluation.strengths = evaluation.strengths.map(scrubCodeLeak)
  if (Array.isArray(evaluation.improvements)) evaluation.improvements = evaluation.improvements.map(scrubCodeLeak)
  return evaluation
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
//
// max_tokens 상향 이유 (2026-08 버그)
//   2048로는 복잡한 장면("회전목마" 등)에서 코드가 문장 중간에 잘렸다.
//   실측: 출력 3521자 · 괄호 151개 열림/149개 닫힘 · stop_reason=max_tokens
//   → 브라우저에서 "missing ) after argument list". 8192로 올렸다.
//   실제 사용한 토큰만 과금되므로 단순 장면의 비용은 그대로다.
const GENERATE_MAX_TOKENS = 8192

/** 코드 블록 마크다운 껍데기를 벗긴다 */
function extractGeneratedCode(message) {
  const raw = (message?.content?.[0]?.text || '').trim()
  return raw.replace(/^```(?:javascript|js|python)?\n?/m, '').replace(/\n?```$/m, '').trim()
}

/**
 * 서버측 구문 검증 — new Function은 코드를 실행하지 않고 파싱만 한다.
 * 잘린 코드뿐 아니라 그 밖의 깨진 출력도 여기서 함께 걸린다.
 */
function isParseableJs(code) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(code)
    return true
  } catch {
    return false
  }
}

/**
 * 이전 코드를 프롬프트에 넣을 때의 길이 제한.
 * 문법이 깨지는 곳은 대개 끝부분이므로, 길면 앞머리 조금 + 뒷부분 위주로 남긴다.
 */
const REPAIR_CODE_HEAD = 800
const REPAIR_CODE_TAIL = 2400
const REPAIR_ERROR_MAX = 400

function trimForRepair(code) {
  const text = String(code || '')
  if (text.length <= REPAIR_CODE_HEAD + REPAIR_CODE_TAIL) return text
  return `${text.slice(0, REPAIR_CODE_HEAD)}\n/* …중간 생략… */\n${text.slice(-REPAIR_CODE_TAIL)}`
}

/**
 * 재생성 지시문 — 브라우저에서 실제로 난 오류를 AI에게 알려준다.
 * 같은 설명을 그대로 다시 보내면 AI가 같은 실수를 반복할 이유가 충분하기 때문에,
 * 무엇이 어떻게 깨졌는지 알려주고 더 단순한 구조로 다시 쓰게 한다.
 */
function buildRepairBlock(repair) {
  const previousCode = trimForRepair(repair.previousCode)
  const errorMessage = String(repair.errorMessage || '문법 오류').slice(0, REPAIR_ERROR_MAX)
  return `

## 재생성 요청 (이전 시도가 실패했다)
이전에 생성한 아래 코드가 브라우저에서 문법 오류로 실행되지 못했다.

[브라우저 오류 메시지]
${errorMessage}

[실패한 코드]
${previousCode}

같은 장면을 **더 단순한 구조로, 반드시 문법적으로 완결된 코드**로 다시 작성하라.
- 모든 괄호와 중괄호를 빠짐없이 닫을 것
- 객체 수를 줄여도 좋다. 장면의 핵심 특징만 남기고 장식은 생략하라
- 반복되는 배치는 for 반복문으로 짧게 표현하라
- 절대 코드를 도중에 끊지 말 것`
}

router.post('/generate', async (req, res) => {
  const { prompt, challengeId, repair } = req.body
  const auth = authorizeAI(req, res)
  if (!auth || !checkRateLimit(req, res, auth)) return
  if (!ensureTextLimit(res, 'prompt', prompt, MAX_PROMPT_LENGTH)) return

  // repair는 선택 필드다. 없으면 기존과 완전히 동일하게 동작한다.
  const repairRequest =
    repair && typeof repair.previousCode === 'string' && repair.previousCode.trim()
      ? repair
      : null
  if (repairRequest && repairRequest.previousCode.length > MAX_CODE_LENGTH) {
    return res.status(413).json({ error: `previousCode가 너무 깁니다. ${MAX_CODE_LENGTH}자 이하로 줄여주세요.` })
  }
  const repairBlock = repairRequest ? buildRepairBlock(repairRequest) : ''

  const buildParams = (temperature) => ({
    model: 'claude-sonnet-4-6',
    max_tokens: GENERATE_MAX_TOKENS,
    temperature,
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

설명: ${prompt}${repairBlock}`,
      },
    ],
  })

  try {
    // 1차 시도 — temperature 0 (같은 설명이면 같은 코드)
    // 재생성 요청은 같은 결과가 반복되지 않도록 온도를 살짝 올린다
    let message = await callAnthropic(buildParams(repairRequest ? 0.3 : 0), 'generate')

    // 잘림 감지: 재생성해도 같은 길이에서 잘리므로 즉시 실패시키고 안내한다
    if (message.stop_reason === 'max_tokens') {
      console.warn('[generate] 출력 토큰 상한 도달 — 코드가 잘렸다')
      return res.status(422).json({
        error: '장면이 너무 복잡해요. 설명을 더 간결하게 나눠보세요. (한 번에 만들 수 있는 양을 넘었어요)',
      })
    }

    let code = extractGeneratedCode(message)

    // 구문 검증 실패 → 1회만 재생성 (temperature를 살짝 올려 같은 결과가 반복되지 않게 한다)
    if (!code || !isParseableJs(code)) {
      console.warn('[generate] 구문 검증 실패 — 1회 재생성 시도')
      message = await callAnthropic(buildParams(0.4), 'generate-retry')
      if (message.stop_reason === 'max_tokens') {
        return res.status(422).json({
          error: '장면이 너무 복잡해요. 설명을 더 간결하게 나눠보세요. (한 번에 만들 수 있는 양을 넘었어요)',
        })
      }
      code = extractGeneratedCode(message)
    }

    if (!code || !isParseableJs(code)) {
      console.error('[generate] 재생성 후에도 구문 검증 실패')
      return res.status(422).json({
        error: '코드를 만들다가 문법이 깨졌어요. 설명을 조금 더 단순하게 바꿔서 다시 제출해주세요.',
      })
    }

    res.json({ code })
  } catch (err) {
    console.error('[generate]', err)
    respondAIError(res, err)
  }
})

// ── 루브릭 기반 프롬프트 품질 평가 (Sonnet) ──────────────────────────────
//
// 2026-08 감사 반영 사항
//   1. 형식 게이트  — 루브릭 항목명 나열(93점)·목표 코드 전사(98점) 어뷰징 차단
//   2. 결정적 캐시  — 같은 답이 49~66점으로 흔들리던 문제. 같은 답 = 항상 같은 점수
//   3. 규칙 기반 CT — 진폭의 주범이던 CT를 LLM에서 빼고 src/api/ctScore.js 규칙으로 산출
//   4. 목표 코드 주입 — 장면과 정반대로 묘사한 답이 만점을 받던 문제
//   5. 앵커 상충 제거 — "앵커에 맞춰라" vs "합산 규칙 우선"이 싸워 앵커가 무력화됐다
//   6. 요소별 4단계 부분점수 — 만점/절반/0 셋뿐이라 Lv3~5에서 점수가 급락했다
router.post('/evaluate', async (req, res) => {
  const { prompt, generatedCode, targetCode, challengeId, sessionNumber = 1 } = req.body

  const auth = authorizeAI(req, res)
  if (!auth || !checkRateLimit(req, res, auth)) return
  if (!ensureTextLimit(res, 'prompt', prompt, MAX_PROMPT_LENGTH)) return
  if ((generatedCode || '').length > MAX_CODE_LENGTH) {
    return res.status(413).json({ error: `generatedCode가 너무 깁니다. ${MAX_CODE_LENGTH}자 이하로 줄여주세요.` })
  }

  const presetChallenge = challengeId ? getChallenge(challengeId) : null
  if (auth.role === 'team' && !presetChallenge) {
    return res.status(400).json({ error: '알 수 없는 챌린지입니다.' })
  }

  // 목표 코드는 서버가 challengeId로 직접 조회한 값만 쓴다.
  // 클라이언트가 보낸 targetCode를 폴백으로 받으면 학생이 조작할 수 있다.
  // (교사 가이드의 연습 문제만 challengeId 없이 targetCode를 직접 보낸다)
  const effectiveTargetCode = presetChallenge
    ? presetChallenge.code
    : auth.role === 'teacher'
      ? targetCode
      : null
  if (!effectiveTargetCode) return res.status(400).json({ error: 'targetCode 필요' })

  // 루브릭 조회 (서버 전용 모듈)
  const rubric = challengeId ? RUBRICS[challengeId] : null
  const ctMax = rubric?.ct?.maxPoints ?? CT_MAX_POINTS
  const categoryMax = categoryMaxForClient(rubric)

  // 팀별 서명은 캐시에 담지 않고 응답할 때마다 새로 만든다
  const withProof = (evaluation) => {
    if (auth.role === 'team' && !evaluation.failed) {
      return {
        ...evaluation,
        evaluationProof: createEvaluationProof({
          teamId: auth.team.id,
          sessionNumber,
          challengeId,
          prompt,
          generatedCode,
          evaluation,
        }),
      }
    }
    return evaluation
  }

  // ── 결정적 캐시 ──
  // 프리셋 챌린지에만 적용한다. challengeId가 없는 연습 문제는 목표 장면이 매번 달라
  // 프롬프트만으로는 같은 답인지 판단할 수 없다.
  const cacheKey = presetChallenge ? buildCacheKey(challengeId, prompt) : null
  if (cacheKey) {
    try {
      const cached = readEvaluationCache(req.db, cacheKey)
      if (cached) return res.json(withProof({ ...cached, cached: true }))
    } catch (err) {
      console.warn('[evaluate] 캐시 조회 실패 — 무시하고 진행:', err.message)
    }
  }

  // ── 규칙 기반 판정 (AI 호출 전에 결정된다) ──
  const gate = detectFormatViolation(prompt, rubric)
  const ct = scoreCT(prompt, ctMax)

  try {
    let evalPrompt

    const formatGateBlock = `## 형식 게이트 (element_scores 산정 전에 먼저 판정)
학생 프롬프트가 다음 중 하나에 해당하면 "장면을 관찰해 언어화한 묘사"가 아닙니다:
 (a) 평가 항목명·평가 축 이름(공간관계/비율/도형 종류/색 등)을 그대로 나열한 목록
 (b) API 파라미터나 코드를 나열한 것 (pos, axis, radius, thickness, size, vec, color.xxx 등)
 (c) 완결된 문장이 아닌 키-값 쌍 목록
해당하면 "format_violation": true 로 표시하세요. 서버가 CT를 0으로 만들고 모든 요소 점수를 절반으로 깎습니다.
그런 답을 **절대 칭찬하지 마세요.** "인상적입니다", "탁월합니다", "훌륭합니다" 같은 표현은 금지이고 strengths는 빈 배열로 두세요.
feedback 첫 문장에서 "${FORMAT_GATE_NOTICE}"라고 알리세요.`

    const targetSceneBlock = `## 목표 장면 (정답 코드 — 학생은 이 코드를 보지 못하고 3D 화면만 봤습니다)
${effectiveTargetCode}

각 요소를 판정할 때: 언급했더라도 목표 장면과 모순되면(방향 반대, 크기 관계 반대 등)
그 요소는 0점입니다. feedback 첫 문장에서 어느 서술이 장면과 다른지 명시하세요.
**정답 코드의 내용·수치·좌표·API 이름을 피드백에 절대 노출하지 마세요.** 학생은 이 코드를 볼 수 없습니다.`

    if (rubric) {
      // ── 루브릭 기반 정밀 평가 ──
      const elementTotal = rubric.elements.reduce((s, e) => s + e.weight, 0)
      const elementsList = rubric.elements
        .map(e => `- ${e.name} (${e.weight}점): ${e.desc}`)
        .join('\n')

      // 앵커 점수는 CT 보너스를 포함한 총점이다. 요소 합계와 직접 비교할 수 있도록
      // 이번 학생의 CT(규칙 계산치)를 뺀 "요소 합계 기준선"을 함께 보여준다.
      const anchorsList = rubric.anchors
        .map(a => `- 총점 ${a.score}점 수준 (요소 합계 기준선 약 ${Math.max(0, Math.round(a.score - ct.score))}점): "${a.prompt}"`)
        .join('\n')

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

${formatGateBlock}

${targetSceneBlock}

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

각 요소는 **4단계**로 채점합니다 (부분점수가 급락하지 않도록):
- 명확히 정확하게 포함 → 배점 만점
- 대체로 포함했으나 한 가지가 빠지거나 살짝 모호 → 배점의 2/3
- 스치듯 언급했거나 매우 모호 → 배점의 1/3
- 언급이 없거나 목표 장면과 모순 → 0점

카테고리 합계: ${categoryInfo}

## 점수 기준점 (보정용)
${anchorsList}

## 점수 산정 규칙 (엄수)
1. element_scores에는 위 필수 요소의 name을 빠짐없이 그대로 키로 넣으세요.
2. 각 값은 해당 요소 배점의 만점 / 2/3 / 1/3 / 0 중 하나입니다.
3. category_scores는 element_scores를 category별로 합산한 값이어야 합니다.
4. 합산이 끝나면 위 기준점과 대조하세요. 학생 프롬프트가 어느 기준점과 비슷한 수준인데
   요소 합계가 그 기준점의 "요소 합계 기준선"과 10점 이상 벌어지면, element_scores를
   다시 검토해 조정하세요. 기준점은 이 루브릭의 공식 보정 기준입니다.
5. CT 사고력 보너스는 서버가 규칙으로 따로 계산합니다. ct_score는 응답에 넣지 마세요.
6. score 필드는 서버가 다시 계산하므로 대략적인 값이어도 됩니다.

## 학생의 프롬프트
"${prompt}"

## 피드백 작성 규칙 (엄수)
1. 목표 장면과 모순되는 서술이 있으면 그것을 가장 먼저 짚으세요.
2. 빠진 **축**을 알려주세요. 구조/공간 관계/비율 관련 결손을 우선 지적 (예: "부분을 나눠서 각각 묘사해 보세요", "위아래·앞뒤 관계가 모호합니다", "크기 비교가 빠졌습니다").
3. 구체적 정답을 절대 알려주지 마세요
   금지: "다리를 네 모서리에 놓으세요", "원기둥을 사용하세요", "빨간색을 추가하세요"
   허용: "각 부분이 어디에 위치하는지 관찰해보세요", "부분 간 크기를 비교해보세요"
4. 정답 코드·수치·좌표·API 이름을 절대 노출하지 마세요.
5. 사고 전략을 제안하세요 (예: "전체를 부분으로 나눠서 각각 묘사해보세요", "기준점 하나를 정하고 다른 부분을 그 기준에 대해 서술해보세요")

JSON만 응답:
{
  "format_violation": true 또는 false,
  "score": 0~100,
  "category_scores": {"structure": 0~N, "spatial": 0~N, "proportion": 0~N, "shape": 0~N, "color": 0~N},
  "element_scores": {"요소명": 획득점수, ...},
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

${formatGateBlock}

${targetSceneBlock}

채점 기준 (5축, 요소 합계 85점):
- structure (25점): 부분 분해, 반복·순서·대칭 같은 구조 규칙 인식
- spatial   (25점): 방향·배치·접합·수직수평·정면측면·내부외부
- proportion(20점): 부분 간 상대적 크기/길이/두께/납작함
- shape     (10점): 어떤 기본 도형인가 (유사어 관대)
- color     (5점) : 색상 언급 (유사어 관대)
CT 사고력 보너스 15점은 서버가 규칙으로 따로 계산하므로 ct_score는 응답에 넣지 마세요.

[학생 프롬프트]
${prompt}

피드백 규칙: 구체적 정답을 알려주지 말고, 구조/공간/비율 축의 결손을 먼저 짚고 사고 방향만 제안하세요.
정답 코드·수치·API 이름은 절대 노출하지 마세요.

JSON만 응답:
{"format_violation":false,"score":0~100,"category_scores":{"structure":0,"spatial":0,"proportion":0,"shape":0,"color":0},"element_scores":{},"feedback":"2줄 피드백","strengths":["잘한 점"],"improvements":["개선 사고 방향"]}`
    }

    const message = await callAnthropic({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      temperature: 0,
      messages: [{ role: 'user', content: evalPrompt }],
    }, 'evaluate')

    const raw = message.content[0].text.trim()
    const parsed = parseAIJson(raw)

    // ── 형식 게이트 적용 ──
    // 규칙 판정이 우선이고, 규칙이 놓친 것을 채점 AI 판정으로 보완한다.
    const violated = gate.violated || parsed.format_violation === true

    if (violated) {
      for (const key of Object.keys(parsed.element_scores || {})) {
        parsed.element_scores[key] = toNumber(parsed.element_scores[key]) * FORMAT_GATE_MULTIPLIER
      }
      for (const key of Object.keys(parsed.category_scores || {})) {
        parsed.category_scores[key] = toNumber(parsed.category_scores[key]) * FORMAT_GATE_MULTIPLIER
      }
      parsed.ct_score = 0
      parsed.strengths = []
      const rest = typeof parsed.feedback === 'string' ? parsed.feedback.replace(FORMAT_GATE_NOTICE, '').trim() : ''
      parsed.feedback = `${FORMAT_GATE_NOTICE} ${rest}`.trim()
      parsed.improvements = ['장면을 보면서 무엇이 어디에 있고 무엇이 더 큰지 문장으로 적어보세요']
    } else {
      // CT는 LLM이 아니라 규칙으로 결정한다 (같은 답이면 언제나 같은 값)
      parsed.ct_score = ct.score
    }

    const evaluation = normalizeEvaluation(parsed, rubric)
    evaluation.category_max = categoryMax
    evaluation.ct_max = ctMax
    evaluation.format_violation = violated
    if (!violated && ct.reasons.length > 0 && ct.score < ctMax * 0.6) {
      const improvements = Array.isArray(evaluation.improvements) ? evaluation.improvements : []
      evaluation.improvements = [...improvements, ct.reasons[0]].slice(0, 3)
    }
    scrubEvaluationText(evaluation)

    if (cacheKey) {
      try {
        writeEvaluationCache(req.db, cacheKey, challengeId, evaluation)
      } catch (err) {
        console.warn('[evaluate] 캐시 저장 실패 — 무시하고 진행:', err.message)
      }
    }

    res.json(withProof(evaluation))
  } catch (err) {
    console.error('[evaluate]', err)
    if (err.message.includes('JSON')) {
      // 채점 실패 — 임시 점수를 주지 않는다.
      // 예전에는 score: 50에 category_scores가 전부 0이라 학생 화면에 "50점"과 빈 막대가 함께 떴고,
      // 그 50점이 리더보드에까지 반영됐다. 이제 failed 플래그로 실패를 분명히 알린다.
      res.json({
        failed: true,
        score: null,
        ct_scores: {},
        category_scores: {},
        category_max: categoryMax,
        element_scores: {},
        ct_score: null,
        ct_max: ctMax,
        feedback: '채점에 실패했습니다. 다시 제출해주세요.',
        strengths: [],
        improvements: ['잠시 후 다시 제출해주세요'],
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
