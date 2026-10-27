/**
 * 교사 화면의 "완료한 챌린지" 기록 — 순수 함수 모음
 *
 * 예전에는 SessionController의 지역 상태라서 새로고침하거나 탭(접속 안내·안내서)을 오가면
 * 컴포넌트가 다시 마운트되며 목록이 비고, "전체 수업 종료" 버튼까지 사라졌다.
 * (E2E에서 챌린지 3개를 진행했는데 "2개 완료"로 표시된 원인)
 * 이제 sessionStorage에 수업(sessionId)별로 저장하고, 서버 집계(팀별 perChallenge)와 합쳐 보여 준다.
 */

const KEY_PREFIX = 'vpython_teacher_progress:'

export function progressKey(sessionId) {
  return `${KEY_PREFIX}${sessionId}`
}

const EMPTY = { completedIds: [], selectedId: null, status: 'idle' }

/** 저장된 진행 기록을 읽는다. 형식이 깨졌으면 빈 기록을 돌려준다. */
export function loadProgress(storage, sessionId) {
  if (!storage || !sessionId) return { ...EMPTY }
  try {
    const raw = storage.getItem(progressKey(sessionId))
    if (!raw) return { ...EMPTY }
    const data = JSON.parse(raw)
    const completedIds = Array.isArray(data?.completedIds)
      ? [...new Set(data.completedIds.filter((id) => typeof id === 'string' && id))]
      : []
    const status = ['idle', 'running', 'ended'].includes(data?.status) ? data.status : 'idle'
    const selectedId = typeof data?.selectedId === 'string' ? data.selectedId : null
    return { completedIds, selectedId, status: selectedId ? status : 'idle' }
  } catch {
    return { ...EMPTY }
  }
}

/** 진행 기록을 저장한다. 저장소 오류(사생활 보호 모드 등)는 무시한다. */
export function saveProgress(storage, sessionId, { completedIds = [], selectedId = null, status = 'idle' } = {}) {
  if (!storage || !sessionId) return
  try {
    storage.setItem(progressKey(sessionId), JSON.stringify({
      completedIds: [...new Set(completedIds)],
      selectedId,
      status,
    }))
  } catch { /* 무시 */ }
}

export function clearProgress(storage, sessionId) {
  if (!storage || !sessionId) return
  try { storage.removeItem(progressKey(sessionId)) } catch { /* 무시 */ }
}

/** 목록에 id를 중복 없이 더한다. */
export function addCompleted(ids, id) {
  if (!id) return ids
  return ids.includes(id) ? ids : [...ids, id]
}

/**
 * 화면에 보여 줄 완료 목록.
 * 로컬 기록 ∪ 서버에서 제출 기록이 있는 챌린지 — 단, 지금 진행 중인 챌린지는 뺀다.
 * teams: /api/dashboard 응답의 teams (각 팀의 perChallenge[].challenge_id)
 */
export function mergeCompleted(localIds, teams, runningId = null) {
  const set = new Set(localIds || [])
  for (const t of teams || []) {
    for (const pc of t?.perChallenge || []) {
      if (pc?.challenge_id) set.add(pc.challenge_id)
    }
  }
  if (runningId) set.delete(runningId)
  return [...set]
}
