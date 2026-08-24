/**
 * Claude API 클라이언트 유틸
 * 브라우저에서 Express API를 통해 호출
 */

import { getTeacherToken } from './teacherAuth.js'
import { getTeamToken } from './teamAuth.js'

const BASE = '/api'

/**
 * 서버 에러 응답을 사람이 읽을 수 있는 메시지로 변환.
 * 서버는 { error: "..." } 형태의 JSON을 주므로 error 필드만 뽑아낸다.
 * (예전에는 응답 본문 원문을 그대로 던져 학생 화면에 날 JSON이 노출됐다)
 */
async function toReadableError(res) {
  let text = ''
  try { text = await res.text() } catch { /* 본문 읽기 실패는 무시 */ }

  let message = ''
  try {
    const data = JSON.parse(text)
    if (data && typeof data.error === 'string') message = data.error
    else if (data && typeof data.message === 'string') message = data.message
  } catch { /* JSON이 아니면 아래 기본 메시지 사용 */ }

  if (!message) {
    if (res.status === 401) message = '인증이 만료되었습니다. 입장 화면에서 다시 들어와주세요.'
    else if (res.status === 429) message = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
    else if (res.status >= 500) message = '서버가 잠시 불안정합니다. 잠시 후 다시 시도해주세요.'
    else message = `요청에 실패했습니다 (오류 코드 ${res.status})`
  }

  const err = new Error(message)
  err.status = res.status
  return err
}

function getHeaders(teamId) {
  const headers = { 'Content-Type': 'application/json' }
  const teamToken = getTeamToken(teamId)
  if (teamId) {
    if (teamToken) headers['x-team-token'] = teamToken
    return headers
  }

  const teacherToken = getTeacherToken()
  if (teacherToken) headers['x-teacher-token'] = teacherToken
  return headers
}

/**
 * 프롬프트로 VPython 코드 생성 (Haiku)
 *
 * repair — 선택. 직전에 만든 코드가 렌더링에 실패했을 때 그 사실을 함께 보낸다.
 *   { previousCode, errorMessage }
 * 서버는 이 정보를 생성 프롬프트에 넣어 "같은 장면을 더 단순한 구조로,
 * 문법적으로 완결된 코드로" 다시 만들게 한다. 없으면 기존과 동일하게 동작한다.
 */
export async function generateCode(prompt, teamId = null, repair = null) {
  const body = { prompt, teamId }
  if (repair?.previousCode) {
    body.repair = {
      previousCode: repair.previousCode,
      errorMessage: repair.errorMessage || '',
    }
  }
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: getHeaders(teamId),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await toReadableError(res)
  return res.json()  // { code }
}

/**
 * 프롬프트 품질 평가 (Sonnet)
 */
export async function evaluatePrompt({ prompt, generatedCode, targetCode, challengeId, sessionNumber, teamId }) {
  const res = await fetch(`${BASE}/evaluate`, {
    method: 'POST',
    headers: getHeaders(teamId),
    body: JSON.stringify({ prompt, generatedCode, targetCode, challengeId, sessionNumber, teamId }),
  })
  if (!res.ok) throw await toReadableError(res)
  return res.json()  // { score, ct_scores, feedback, strengths, improvements }
}

/**
 * 학생 출제 문제 품질 분석 (Session 4)
 */
export async function analyzeProblem({ code, title, difficulty }) {
  const res = await fetch(`${BASE}/analyze-problem`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ code, title, difficulty }),
  })
  if (!res.ok) throw await toReadableError(res)
  return res.json()
}

/**
 * 출제팀 평가 (Session 5)
 */
export async function evaluateProblemQuality({ problemCode, solverPrompt, solverScore }) {
  const res = await fetch(`${BASE}/evaluate-problem-quality`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ problemCode, solverPrompt, solverScore }),
  })
  if (!res.ok) throw await toReadableError(res)
  return res.json()
}

/**
 * 시도 저장
 */
export async function saveAttempt(data) {
  const res = await fetch(`${BASE}/attempts`, {
    method: 'POST',
    headers: getHeaders(data.teamId),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw await toReadableError(res)
  return res.json()
}
