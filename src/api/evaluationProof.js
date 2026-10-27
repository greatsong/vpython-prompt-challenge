import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto'

const PROOF_TTL_MS = 30 * 60 * 1000

/**
 * 서명 비밀값은 EVALUATION_SECRET 하나만 쓴다.
 * 예전에는 없으면 TEACHER_PIN·API 키·고정 문자열로 대신했는데, 그러면 PIN을 아는 사람이
 * 점수 증명을 위조할 수 있었다. 이제 없으면 서버가 기동 단계에서 멈춘다(server.js).
 * 테스트가 import 뒤에 환경 변수를 넣을 수 있도록 값은 호출 시점에 읽는다.
 */
export function getEvaluationSecret() {
  const secret = process.env.EVALUATION_SECRET
  if (!secret || !secret.trim()) {
    throw new Error('EVALUATION_SECRET 환경 변수가 설정되어 있지 않습니다')
  }
  return secret
}

export function hasEvaluationSecret() {
  return !!(process.env.EVALUATION_SECRET && process.env.EVALUATION_SECRET.trim())
}

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function sign(payload) {
  return createHmac('sha256', getEvaluationSecret()).update(payload).digest('base64url')
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function hashText(value) {
  return createHash('sha256').update(String(value ?? '')).digest('base64url')
}

// ── 생성 코드 서명 (codeSig) ────────────────────────────────────────────────
// /api/generate가 돌려준 코드에 서명을 붙이고, /api/evaluate가 같은 코드인지 확인한다.
// 교사 비교 화면에 저장되는 코드가 서버가 만든 코드임을 보장하기 위한 장치다.
export function signGeneratedCode(code) {
  return createHmac('sha256', getEvaluationSecret())
    .update(`generated-code:v1:${hashText(code)}`)
    .digest('base64url')
}

export function verifyGeneratedCodeSig(code, sig) {
  if (typeof code !== 'string' || typeof sig !== 'string' || !sig) return false
  return safeEqual(sig, signGeneratedCode(code))
}

// ── 평가 증명 (evaluationProof) ─────────────────────────────────────────────
// roundStartedAt: 채점 당시 진행 중이던 챌린지 라운드의 시작 시각.
//   같은 챌린지를 다시 시작하면 이전 라운드의 증명으로는 저장할 수 없다.
// jti: 증명마다 다른 id. attempts.proof_jti에 남겨 같은 증명의 재사용을 막는다.
export function createEvaluationProof({ teamId, sessionNumber, challengeId, prompt, generatedCode, evaluation, roundStartedAt = null }) {
  const now = Date.now()
  const payload = {
    v: 1,
    jti: randomUUID(),
    iat: now,
    exp: now + PROOF_TTL_MS,
    teamId: String(teamId),
    sessionNumber: Number(sessionNumber || 1),
    challengeId,
    rs: roundStartedAt,
    promptHash: hashText(prompt),
    generatedCodeHash: hashText(generatedCode || ''),
    score: evaluation.score || 0,
    ctScores: evaluation.ct_scores || {},
    evaluation,
  }

  const encoded = base64url(JSON.stringify(payload))
  return `${encoded}.${sign(encoded)}`
}

export function verifyEvaluationProof(token, { teamId, sessionNumber, challengeId, prompt, generatedCode }) {
  if (!token || typeof token !== 'string') throw new Error('평가 검증 토큰이 없습니다')

  const [encoded, signature] = token.split('.')
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) {
    throw new Error('평가 검증 토큰이 올바르지 않습니다')
  }

  let payload
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    throw new Error('평가 검증 토큰을 읽을 수 없습니다')
  }

  if (payload.v !== 1 || Date.now() > payload.exp) {
    throw new Error('평가 검증 토큰이 만료되었습니다')
  }

  if (
    payload.teamId !== String(teamId) ||
    payload.sessionNumber !== Number(sessionNumber || 1) ||
    payload.challengeId !== challengeId ||
    payload.promptHash !== hashText(prompt) ||
    payload.generatedCodeHash !== hashText(generatedCode || '')
  ) {
    throw new Error('평가 검증 토큰과 제출 내용이 일치하지 않습니다')
  }

  return payload
}
