import { createHash, createHmac, timingSafeEqual } from 'crypto'

const PROOF_TTL_MS = 30 * 60 * 1000
const SECRET = process.env.EVALUATION_SECRET || process.env.TEACHER_PIN || process.env.ANTHROPIC_API_KEY || 'dev-evaluation-proof-secret'

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function sign(payload) {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
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

export function createEvaluationProof({ teamId, sessionNumber, challengeId, prompt, generatedCode, evaluation }) {
  const payload = {
    v: 1,
    iat: Date.now(),
    exp: Date.now() + PROOF_TTL_MS,
    teamId: String(teamId),
    sessionNumber: Number(sessionNumber || 1),
    challengeId,
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
