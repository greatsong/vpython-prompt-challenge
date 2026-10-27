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
  let data = null
  try {
    data = JSON.parse(text)
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
  // 서버가 붙여 주는 사유 코드 — 화면이 오류 종류별로 다르게 안내할 때 쓴다
  // (no_active_challenge · challenge_mismatch · forbidden_code · invalid_code_sig · challenge_closed 등)
  err.reason = data && typeof data.reason === 'string' ? data.reason : null
  err.data = data && typeof data === 'object' ? data : null
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
 * 프롬프트로 VPython 코드 생성 (서버 MODEL_GENERATE — 2026-10-27 현재 claude-sonnet-5-5)
 *
 * repair — 선택. 직전에 만든 코드가 렌더링에 실패했을 때 그 사실을 함께 보낸다.
 *   { previousCode, errorMessage }
 * 서버는 이 정보를 생성 프롬프트에 넣어 "같은 장면을 더 단순한 구조로,
 * 문법적으로 완결된 코드로" 다시 만들게 한다. 없으면 기존과 동일하게 동작한다.
 */
export async function generateCode(prompt, teamId = null, repair = null, challengeId = null) {
  const body = { prompt, teamId }
  // 팀 경로는 지금 풀고 있는 챌린지를 함께 보내 서버의 진행 중 챌린지와 대조받는다
  if (challengeId) body.challengeId = challengeId
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
  const data = await res.json()
  // codeSig — 서버가 만든 코드라는 서명. /api/evaluate에 code와 함께 그대로 돌려줘야 한다
  return { code: data?.code, codeSig: data?.codeSig ?? null }
}

/**
 * 프롬프트 품질 평가 (서버 MODEL_EVALUATE — 2026-10-27 현재 claude-sonnet-5-5)
 */
export async function evaluatePrompt({ prompt, generatedCode, codeSig, targetCode, challengeId, sessionNumber, teamId }) {
  // codeSig: generateCode가 돌려준 서명. 팀 경로는 필수다(없거나 코드와 다르면 400 invalid_code_sig)
  const body = { prompt, generatedCode, targetCode, challengeId, sessionNumber, teamId }
  if (codeSig) body.codeSig = codeSig
  const res = await fetch(`${BASE}/evaluate`, {
    method: 'POST',
    headers: getHeaders(teamId),
    body: JSON.stringify(body),
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
