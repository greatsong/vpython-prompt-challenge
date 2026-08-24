/**
 * 교사 인증 토큰 클라이언트 헬퍼
 *
 * PIN 인증 성공 시 서버에서 받은 토큰을 sessionStorage에 보관하고
 * 교사 전용 HTTP 요청·소켓 연결에서 사용한다.
 * 탭을 닫으면 자동으로 소실되어 공용 PC 사용 시 안전.
 */

const TOKEN_KEY = 'vpython_teacher_token'

export function setTeacherToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
}

export function getTeacherToken() {
  return sessionStorage.getItem(TOKEN_KEY) || null
}

export function clearTeacherToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

/** 교사 전용 fetch — x-teacher-token 헤더 자동 주입 */
export function teacherFetch(url, options = {}) {
  const token = getTeacherToken()
  const headers = {
    ...(options.headers || {}),
    ...(token ? { 'x-teacher-token': token } : {}),
  }
  return fetch(url, { ...options, headers })
}
