/**
 * 교사 인증 토큰 클라이언트 헬퍼
 *
 * PIN 인증 성공 시 서버에서 받은 토큰을 sessionStorage에 보관하고
 * 교사 전용 HTTP 요청·소켓 연결에서 사용한다.
 * 탭을 닫으면 자동으로 소실되어 공용 PC 사용 시 안전.
 */

const TOKEN_KEY = 'vpython_teacher_token'
// 토큰 범위 — 'admin'(운영 PIN) | 'training'(연수 입장 코드). 서버 /api/auth/verify 응답으로 갱신한다.
const SCOPE_KEY = 'vpython_teacher_scope'

export function setTeacherToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
}

export function getTeacherToken() {
  return sessionStorage.getItem(TOKEN_KEY) || null
}

export function clearTeacherToken() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(SCOPE_KEY)
}

export function setTeacherScope(scope) {
  if (scope) sessionStorage.setItem(SCOPE_KEY, scope)
}

export function getTeacherScope() {
  return sessionStorage.getItem(SCOPE_KEY) || null
}

// ── 진행 중인 수업 정보(localStorage) ─────────────────────────────────────
// 새로고침·재접속 후 같은 수업으로 돌아오기 위해 { sessionId, teacherCode }를 보관한다.
// 같은 브라우저에서 운영 교사(/teacher PIN)와 연수(/training) 화면을 오가도 서로 덮어쓰지 않도록
// 토큰 범위(scope)별로 키를 나눈다.
const TEACHER_SESSION_KEY_PREFIX = 'vpython_teacher_session'
// 범위를 나누기 전에 쓰던 키. 값이 남아 있으면 운영(admin) 키로 한 번 옮기고 지운다.
const LEGACY_TEACHER_SESSION_KEY = 'vpython_teacher_session'

function normalizeScope(scope) {
  return scope === 'training' ? 'training' : 'admin'
}

/** 현재(또는 지정한) 토큰 범위에 맞는 수업 저장 키 */
export function teacherSessionKey(scope = getTeacherScope()) {
  return `${TEACHER_SESSION_KEY_PREFIX}:${normalizeScope(scope)}`
}

/** 예전 공용 키의 값을 운영(admin) 키로 1회 옮긴다. admin 키에 이미 값이 있으면 그 값을 지킨다. */
export function migrateLegacyTeacherSession() {
  try {
    const legacy = localStorage.getItem(LEGACY_TEACHER_SESSION_KEY)
    if (legacy === null) return
    const adminKey = teacherSessionKey('admin')
    if (localStorage.getItem(adminKey) === null) localStorage.setItem(adminKey, legacy)
    localStorage.removeItem(LEGACY_TEACHER_SESSION_KEY)
  } catch { /* 저장소를 쓸 수 없는 환경 */ }
}

export function loadTeacherSession(scope = getTeacherScope()) {
  migrateLegacyTeacherSession()
  try {
    const raw = localStorage.getItem(teacherSessionKey(scope))
    if (!raw) return null
    const saved = JSON.parse(raw)
    return saved?.sessionId ? saved : null
  } catch {
    return null
  }
}

export function saveTeacherSession(sessionId, teacherCode, scope = getTeacherScope()) {
  migrateLegacyTeacherSession()
  try {
    localStorage.setItem(teacherSessionKey(scope), JSON.stringify({ sessionId, teacherCode }))
  } catch { /* ignore */ }
}

export function clearTeacherSession(scope = getTeacherScope()) {
  try {
    localStorage.removeItem(teacherSessionKey(scope))
  } catch { /* ignore */ }
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
