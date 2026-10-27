/**
 * 세션별 챌린지 진행 상태 조회 — 진실의 원천은 active_challenges 테이블이다.
 *
 * server.js의 소켓 핸들러가 시작(upsert, ended_at = NULL)과 마감(ended_at 기록)을 쓰고,
 * 팀 경로의 /api/generate·/api/evaluate·/api/attempts가 이 모듈로 상태를 읽는다.
 *
 * 마감으로 보는 경우
 *   - ended_at이 기록됨 (교사 종료·결과 공개·타이머 만료·수업 종료)
 *   - 제한 시간이 지났는데 타이머가 아직 돌지 않음 (서버 재시작 직후 등) → 시작 + 제한 시간을 마감 시각으로 본다
 */

// 마감 뒤 이 시간 안에 발급된 평가 증명은 저장을 허용한다 (마감 직전에 제출해 채점이 늦게 끝난 팀)
export const SUBMIT_GRACE_MS = 90 * 1000
// 증명이 유예 안에 발급됐더라도 저장 요청은 이 시각까지만 받는다
export const SUBMIT_GRACE_ARRIVAL_MS = 120 * 1000

/**
 * @returns {null | { challengeId, startedAt, timeLimit, endedAt, active }}
 *   endedAt은 실제 마감 시각(ms) 또는 null(진행 중)
 */
export function getChallengeState(db, sessionId, now = Date.now()) {
  if (!sessionId) return null
  let row
  try {
    row = db
      .prepare('SELECT challenge_id, time_limit, started_at, ended_at FROM active_challenges WHERE session_id = ?')
      .get(sessionId)
  } catch {
    return null
  }
  if (!row) return null

  const timeLimit = row.time_limit || 0
  const startedAt = row.started_at || 0
  let endedAt = row.ended_at ?? null
  if (endedAt === null && timeLimit > 0 && startedAt && now >= startedAt + timeLimit * 1000) {
    endedAt = startedAt + timeLimit * 1000
  }

  return {
    challengeId: row.challenge_id,
    startedAt,
    timeLimit,
    endedAt,
    active: endedAt === null,
  }
}

/**
 * 팀이 지금 이 챌린지로 코드 생성·채점을 요청해도 되는가.
 * challengeId를 생략하면 "진행 중인 챌린지가 있는가"만 본다.
 * @returns {{ ok: true, state } | { ok: false, status, body }}
 */
export function checkTeamChallengeOpen(db, sessionId, challengeId) {
  const state = getChallengeState(db, sessionId)
  if (!state || !state.active) {
    return {
      ok: false,
      status: 409,
      body: {
        error: '진행 중인 챌린지가 없습니다. 선생님이 챌린지를 시작하면 다시 제출해주세요.',
        reason: 'no_active_challenge',
      },
    }
  }
  if (challengeId !== undefined && challengeId !== null && challengeId !== state.challengeId) {
    return {
      ok: false,
      status: 409,
      body: {
        error: '지금 진행 중인 챌린지와 다른 문제입니다. 화면을 새로고침한 뒤 다시 제출해주세요.',
        reason: 'challenge_mismatch',
        activeChallengeId: state.challengeId,
      },
    }
  }
  return { ok: true, state }
}

/**
 * 이 수업에서 이 챌린지의 가장 최근 라운드 시작 시각(ms). 없으면 null.
 * challenge_rounds 이력이 우선이고, 이력이 없던 예전 데이터는 active_challenges 행으로 대신한다.
 */
export function getLatestRoundStart(db, sessionId, challengeId) {
  if (!sessionId || !challengeId) return null
  try {
    const round = db
      .prepare('SELECT started_at FROM challenge_rounds WHERE session_id = ? AND challenge_id = ? ORDER BY started_at DESC LIMIT 1')
      .get(String(sessionId), challengeId)
    if (round) return round.started_at
    const row = db
      .prepare('SELECT challenge_id, started_at FROM active_challenges WHERE session_id = ?')
      .get(String(sessionId))
    return row && row.challenge_id === challengeId ? row.started_at : null
  } catch {
    return null
  }
}

/**
 * 시도를 라운드 시작 이후로 거르는 SQL 조각과 값.
 * created_ms(ms)가 있으면 그것으로, 없는 예전 행은 created_at(초 단위 UTC 문자열)으로 비교한다.
 * (초 단위만 쓰면 새 라운드 시작과 같은 초에 저장된 이전 라운드 시도가 새 라운드에 섞였다)
 * 라운드 정보가 없으면 거르지 않는다(교사가 챌린지 없이 넣은 시도 등).
 */
export function roundFilter(db, sessionId, challengeId, alias = 'a') {
  const startedAt = getLatestRoundStart(db, sessionId, challengeId)
  if (!startedAt) return { sql: '', params: [] }
  return {
    sql: ` AND (CASE WHEN ${alias}.created_ms IS NOT NULL THEN ${alias}.created_ms >= ?` +
      ` ELSE CAST(strftime('%s', ${alias}.created_at) AS INTEGER) >= ? END)`,
    params: [startedAt, Math.floor(startedAt / 1000)],
  }
}
