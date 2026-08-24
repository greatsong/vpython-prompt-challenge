/**
 * API 키 인메모리 저장소
 * 교사가 UI에서 입력한 키를 서버 메모리에 보관
 * .env의 ANTHROPIC_API_KEY는 폴백으로만 사용
 */

let teacherApiKey = null

export function setApiKey(key) {
  teacherApiKey = key
}

export function getApiKey() {
  return teacherApiKey || process.env.ANTHROPIC_API_KEY || null
}

export function hasApiKey() {
  return !!(teacherApiKey || process.env.ANTHROPIC_API_KEY)
}
