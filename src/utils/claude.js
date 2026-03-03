/**
 * Claude API 클라이언트 유틸
 * 브라우저에서 Express API를 통해 호출
 */

const BASE = '/api'

/**
 * 프롬프트로 VPython 코드 생성 (Haiku)
 */
export async function generateCode(prompt) {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()  // { code }
}

/**
 * 프롬프트 품질 평가 (Sonnet)
 */
export async function evaluatePrompt({ prompt, generatedCode, targetCode, sessionNumber }) {
  const res = await fetch(`${BASE}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, generatedCode, targetCode, sessionNumber }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()  // { score, ct_scores, feedback, strengths, improvements }
}

/**
 * 학생 출제 문제 품질 분석 (Session 4)
 */
export async function analyzeProblem({ code, title, difficulty }) {
  const res = await fetch(`${BASE}/analyze-problem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, title, difficulty }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * 출제팀 평가 (Session 5)
 */
export async function evaluateProblemQuality({ problemCode, solverPrompt, solverScore }) {
  const res = await fetch(`${BASE}/evaluate-problem-quality`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problemCode, solverPrompt, solverScore }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * 시도 저장
 */
export async function saveAttempt(data) {
  const res = await fetch(`${BASE}/attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
