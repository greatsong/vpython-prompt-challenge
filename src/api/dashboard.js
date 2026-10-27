import { Router } from 'express'
import {
  getTeacherAuth,
  requireTeacher,
  requireSessionAccess,
  canAccessTeam,
} from './teacherAuth.js'
import { getAuthorizedTeam } from './teamAuth.js'
import { verifyEvaluationProof } from './evaluationProof.js'
import { MAX_TEAMS } from './session.js'
import { getChallengeState, roundFilter, SUBMIT_GRACE_MS, SUBMIT_GRACE_ARRIVAL_MS } from './challengeState.js'

const router = Router()

const MAX_PROMPT_LENGTH = 3000
const MAX_CODE_LENGTH = 20000

// ── CSV ─────────────────────────────────────────────────────────────────────
// 모든 칸을 따옴표로 감싸고 안의 따옴표는 두 번 쓴다.
// = + - @ 탭 CR로 시작하는 값은 엑셀이 수식으로 실행하므로 앞에 ' 를 붙인다(CSV 수식 주입 방지).
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function csvRow(values) {
  return values.map(csvCell).join(',')
}

// 다운로드 파일 이름에 넣을 수 있는 글자만 남긴다
function parseMemberList(json) {
  try {
    const v = JSON.parse(json || '[]')
    return Array.isArray(v) ? v.map((m) => (typeof m === 'string' ? m : m?.studentName || '')) : []
  } catch {
    return []
  }
}

const safeFilePart = (value) => String(value || '').replace(/[^\w-]/g, '').slice(0, 64) || 'session'

function requireAttemptWriter(req, res, next) {
  const teacherAuth = getTeacherAuth(req.headers['x-teacher-token'])
  if (teacherAuth) {
    // 연수 토큰은 자기 수업의 팀에만 기록할 수 있다
    if (!canAccessTeam(req.db, teacherAuth, req.body?.teamId)) {
      return res.status(403).json({ error: '다른 선생님의 수업입니다.', reason: 'not_owner' })
    }
    req.authRole = 'teacher'
    return next()
  }

  const team = getAuthorizedTeam(req)
  if (!team) {
    return res.status(401).json({ error: '제출 권한이 없습니다. 팀 화면에서 다시 입장해주세요.' })
  }
  req.authRole = 'team'
  req.team = team
  next()
}

// GET /api/public/dashboard/:sessionId — 관람자용 최소 현황
router.get('/public/dashboard/:sessionId', (req, res) => {
  const { sessionId } = req.params
  const teams = req.db
    .prepare('SELECT id, name, color FROM teams WHERE session_id = ?')
    .all(sessionId)

  res.json({
    teams: teams.map((team) => ({
      ...team,
      members: [],
    })),
  })
})

// GET /api/dashboard/:sessionId — 실시간 팀 현황
router.get('/dashboard/:sessionId', requireTeacher, requireSessionAccess('sessionId'), (req, res) => {
  const { sessionId } = req.params
  const { challengeId } = req.query

  const teams = req.db
    .prepare('SELECT * FROM teams WHERE session_id = ?')
    .all(sessionId)

  const round = typeof challengeId === 'string' && challengeId
    ? roundFilter(req.db, sessionId, challengeId)
    : { sql: '', params: [] }

  const teamsWithScores = teams.map((team) => {
    // 현재 챌린지 기준 최고 점수 행 — 점수·평가·제출시각이 반드시 같은 시도(row)에서 오도록
    // best attempt 전체를 ORDER BY로 선택한다.
    // 같은 챌린지를 다시 낸 경우 이번 라운드 제출만 본다(제출 현황·최신 점수)
    const current = challengeId
      ? req.db
          .prepare(
            `SELECT score, evaluation, created_at
             FROM attempts a
             WHERE team_id = ? AND challenge_id = ?${round.sql}
             ORDER BY score DESC, created_at DESC
             LIMIT 1`
          )
          .get(team.id, challengeId, ...round.params)
      : null

    // 챌린지별 최고 점수 목록 (전체)
    const perChallenge = req.db
      .prepare(
        `SELECT challenge_id, MAX(score) AS score
         FROM attempts
         WHERE team_id = ?
         GROUP BY challenge_id
         ORDER BY rowid`
      )
      .all(team.id)

    return {
      id: team.id,
      session_id: team.session_id,
      name: team.name,
      color: team.color,
      members: JSON.parse(team.members),
      latestScore: current?.score ?? null,
      hasSubmitted: !!(current?.score !== null && current?.score !== undefined),
      lastSubmitTime: current?.created_at ?? null,
      perChallenge,
    }
  })

  // maxTeams — 교사 화면에 "N / M팀" 형태로 정원을 함께 보여주기 위해 내려준다
  res.json({ teams: teamsWithScores, maxTeams: MAX_TEAMS })
})

// GET /api/dashboard/attempts/:sessionId/:teamId — 특정 팀의 시도 목록
router.get('/dashboard/attempts/:sessionId/:teamId', requireTeacher, requireSessionAccess('sessionId'), (req, res) => {
  const { sessionId, teamId } = req.params
  const { challengeId } = req.query

  const attempts = challengeId
    ? req.db
        .prepare(
          `SELECT a.prompt, a.generated_code, a.score, a.evaluation, a.created_at
           FROM attempts a
           JOIN teams t ON t.id = a.team_id
           WHERE t.session_id = ? AND a.team_id = ? AND a.challenge_id = ?
           ORDER BY a.created_at DESC`
        )
        .all(sessionId, teamId, challengeId)
    : req.db
        .prepare(
          `SELECT a.prompt, a.generated_code, a.score, a.evaluation, a.created_at
           FROM attempts a
           JOIN teams t ON t.id = a.team_id
           WHERE t.session_id = ? AND a.team_id = ?
           ORDER BY a.created_at DESC`
        )
        .all(sessionId, teamId)

  res.json({
    attempts: attempts.map(a => ({
      ...a,
      evaluation: JSON.parse(a.evaluation || '{}'),
    })),
  })
})

/**
 * 순위표 — 팀별 최고 시도 row 전체(점수·프롬프트·코드가 같은 row에서 온다).
 * challengeId가 있으면 그 챌린지의 **가장 최근 라운드 시작 이후** 시도만 집계한다.
 * (같은 챌린지를 다시 내면 이전 라운드 점수가 섞이던 문제) — 결과 공개 소켓(server.js)도 이 함수를 쓴다.
 */
export function queryRankings(db, sessionId, challengeId) {
  // 윈도우 함수로 각 팀의 best attempt 전체 row를 정확히 집어온다.
  // 기존 MAX + 비집계 컬럼 방식은 점수와 프롬프트가 다른 시도에서 섞여 나오는 버그가 있었다.
  const round = challengeId ? roundFilter(db, sessionId, challengeId) : { sql: '', params: [] }
  const where = challengeId ? `WHERE a.challenge_id = ?${round.sql}` : ''
  const params = challengeId ? [challengeId, ...round.params, sessionId] : [sessionId]
  const rows = db.prepare(`
    WITH ranked AS (
      SELECT a.*,
             ROW_NUMBER() OVER (
               PARTITION BY a.team_id
               ORDER BY a.score DESC, a.created_at DESC
             ) AS rn
      FROM attempts a
      ${where}
    )
    SELECT t.name, t.color,
           COALESCE(r.score, 0) AS score,
           r.prompt, r.generated_code,
           CASE WHEN r.team_id IS NULL THEN 0 ELSE 1 END AS submitted
    FROM teams t
    LEFT JOIN ranked r ON r.team_id = t.id AND r.rn = 1
    WHERE t.session_id = ?
    ORDER BY submitted DESC, score DESC
  `).all(...params)
  // 미제출 팀은 submitted:false로 표시하고 맨 뒤에 둔다 — 화면이 순위 번호·메달 대신 "미제출"로 그린다.
  // rank는 제출 팀끼리만 매긴다(미제출은 null). score는 예전 화면 호환을 위해 0을 유지한다.
  let rank = 0
  return rows.map((row) => {
    const submitted = row.submitted === 1
    return { ...row, submitted, rank: submitted ? ++rank : null }
  })
}

// GET /api/dashboard/rankings/:sessionId — 챌린지별 순위 조회 (결과 공개 폴백용)
router.get('/dashboard/rankings/:sessionId', requireTeacher, requireSessionAccess('sessionId'), (req, res) => {
  const { sessionId } = req.params
  const challengeId = typeof req.query.challengeId === 'string' && req.query.challengeId ? req.query.challengeId : null
  res.json({ rankings: queryRankings(req.db, sessionId, challengeId) })
})

// GET /api/growth/:teamId — Session 1 vs 5 성장 비교
router.get('/growth/:teamId', requireTeacher, (req, res) => {
  const { teamId } = req.params
  if (!canAccessTeam(req.db, req.teacherAuth, teamId)) {
    return res.status(403).json({ error: '다른 선생님의 수업입니다.', reason: 'not_owner' })
  }
  const { challengeId } = req.query

  const s1 = req.db
    .prepare(
      `SELECT * FROM attempts
       WHERE team_id = ? AND session_number = 1
         AND challenge_id = COALESCE(?, challenge_id)
       ORDER BY score DESC LIMIT 1`
    )
    .get(teamId, challengeId ?? null)

  const s5 = req.db
    .prepare(
      `SELECT * FROM attempts
       WHERE team_id = ? AND session_number = 5
         AND challenge_id = COALESCE(?, challenge_id)
       ORDER BY score DESC LIMIT 1`
    )
    .get(teamId, challengeId ?? null)

  const parse = (row) =>
    row
      ? {
          ...row,
          ct_scores: JSON.parse(row.ct_scores || '{}'),
          evaluation: JSON.parse(row.evaluation || '{}'),
        }
      : null

  res.json({ session1: parse(s1), session5: parse(s5) })
})

// POST /api/attempts — 시도 저장
//
// 팀 경로는 /api/evaluate가 준 평가 증명(evaluationProof)이 있어야 하고, 점수는 증명 안의 값만 쓴다.
//   - 증명이 발급된 챌린지 라운드가 지금 세션의 라운드와 같아야 한다(rs = 라운드 시작 시각)
//   - 진행 중이면 허용. 마감됐으면 마감 뒤 90초 안에 발급된 증명만, 마감 뒤 120초 안에 도착한 요청만 허용
//   - 같은 증명(jti)으로 두 번 저장하면 새 행을 만들지 않고 { duplicate: true }로 답한다
// 교사 경로(교사 토큰)는 직접 점수를 기록할 수 있다(테스트·보정용).
router.post('/attempts', requireAttemptWriter, (req, res) => {
  const {
    teamId,
    sessionNumber,
    challengeId,
    prompt,
    generatedCode,
    score,
    ctScores,
    evaluation,
    evaluationProof,
  } = req.body || {}

  if (!teamId || !sessionNumber || !challengeId || !prompt)
    return res.status(400).json({ error: '필수 필드 누락' })
  if (typeof challengeId !== 'string' || challengeId.length > 100)
    return res.status(400).json({ error: 'challengeId 형식이 올바르지 않습니다' })
  if (typeof prompt !== 'string' || prompt.length > MAX_PROMPT_LENGTH)
    return res.status(400).json({ error: `prompt는 ${MAX_PROMPT_LENGTH}자 이하 글자여야 합니다` })
  if (generatedCode !== undefined && generatedCode !== null &&
      (typeof generatedCode !== 'string' || generatedCode.length > MAX_CODE_LENGTH))
    return res.status(400).json({ error: `generatedCode는 ${MAX_CODE_LENGTH}자 이하 글자여야 합니다` })
  const sessionNum = Number(sessionNumber)
  if (!Number.isInteger(sessionNum) || sessionNum < 1 || sessionNum > 5)
    return res.status(400).json({ error: 'sessionNumber는 1~5 정수여야 합니다' })

  try {
    // 팀 존재 여부 확인
    const team = req.db.prepare('SELECT id, session_id FROM teams WHERE id = ?').get(teamId)
    if (!team) return res.status(404).json({ error: '팀을 찾을 수 없습니다. 새로고침 후 다시 참여해주세요.' })

    // 세션이 종료되었는지 확인
    const session = req.db.prepare('SELECT status FROM sessions WHERE id = ?').get(team.session_id)
    if (session?.status === 'ended') return res.status(410).json({ error: '수업이 종료되었습니다. 새 수업코드로 다시 참여해주세요.' })

    if (req.authRole === 'team' && req.team.id !== Number(teamId)) {
      return res.status(403).json({ error: '다른 팀으로 제출할 수 없습니다.' })
    }

    let verifiedScore = Number(score) || 0
    let verifiedCtScores = ctScores || {}
    let verifiedEvaluation = evaluation || {}
    let proofJti = null

    if (req.authRole === 'team') {
      let proof
      try {
        proof = verifyEvaluationProof(evaluationProof, {
          teamId,
          sessionNumber,
          challengeId,
          prompt,
          generatedCode: generatedCode || '',
        })
      } catch (err) {
        return res.status(401).json({ error: err.message })
      }

      // 같은 증명 재사용 → 새 행 없이 성공으로 답한다 (네트워크 재시도로 두 번 온 경우 포함)
      if (proof.jti) {
        const dup = req.db.prepare('SELECT id FROM attempts WHERE proof_jti = ?').get(proof.jti)
        if (dup) return res.json({ id: dup.id, duplicate: true })
      }

      // 챌린지 라운드·마감 확인
      const now = Date.now()
      const state = getChallengeState(req.db, team.session_id, now)
      const sameRound =
        state &&
        state.challengeId === proof.challengeId &&
        (proof.rs === undefined || proof.rs === null || proof.rs === state.startedAt)
      const withinGrace =
        state &&
        state.endedAt !== null &&
        proof.iat <= state.endedAt + SUBMIT_GRACE_MS &&
        now <= state.endedAt + SUBMIT_GRACE_ARRIVAL_MS
      if (!sameRound || !(state.active || withinGrace)) {
        return res.status(409).json({
          error: '제출 시간이 지났습니다. 이번 챌린지는 마감되었습니다.',
          reason: 'challenge_closed',
        })
      }

      verifiedScore = proof.score || 0
      verifiedCtScores = proof.ctScores || {}
      verifiedEvaluation = proof.evaluation || {}
      proofJti = proof.jti || null
    }

    let result
    try {
      result = req.db
        .prepare(
          `INSERT INTO attempts
             (team_id, session_number, challenge_id, prompt, generated_code, score, ct_scores, evaluation, proof_jti, created_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          teamId,
          sessionNum,
          challengeId,
          prompt,
          generatedCode || '',
          verifiedScore,
          JSON.stringify(verifiedCtScores),
          JSON.stringify(verifiedEvaluation),
          proofJti,
          Date.now()
        )
    } catch (err) {
      // 같은 증명이 동시에 두 번 들어와 유니크 인덱스에 걸린 경우
      if (proofJti && err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        const dup = req.db.prepare('SELECT id FROM attempts WHERE proof_jti = ?').get(proofJti)
        return res.json({ id: dup?.id ?? null, duplicate: true })
      }
      throw err
    }

    res.json({ id: result.lastInsertRowid })
  } catch (err) {
    console.error('[Attempts] 저장 에러:', err.message)
    res.status(500).json({ error: '저장에 실패했습니다. 새로고침 후 다시 시도해주세요.' })
  }
})

// GET /api/export/:sessionId — 결과 CSV
router.get('/export/:sessionId', requireTeacher, requireSessionAccess('sessionId'), (req, res) => {
  const { sessionId } = req.params

  const rows = req.db
    .prepare(
      `SELECT t.name as team, a.session_number, a.challenge_id,
              a.prompt, a.score, a.ct_scores, a.created_at
       FROM attempts a
       JOIN teams t ON t.id = a.team_id
       WHERE t.session_id = ?
       ORDER BY a.created_at`
    )
    .all(sessionId)

  const header = csvRow(['team', 'session', 'challenge', 'score', 'prompt', 'created_at'])
  const csv = [
    header,
    ...rows.map((r) => csvRow([r.team, r.session_number, r.challenge_id, r.score, r.prompt, r.created_at])),
  ].join('\n')

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="session-${safeFilePart(sessionId)}.csv"`
  )
  res.send('\uFEFF' + csv)  // BOM for Excel 한글 인식
})

// GET /api/export/final/:sessionId — 종합 결과 CSV (순위+프롬프트+피드백)
router.get('/export/final/:sessionId', requireTeacher, requireSessionAccess('sessionId'), (req, res) => {
  const { sessionId } = req.params

  const teams = req.db.prepare('SELECT * FROM teams WHERE session_id = ?').all(sessionId)
  const challenges = req.db.prepare(`
    SELECT DISTINCT a.challenge_id
    FROM attempts a JOIN teams t ON t.id = a.team_id
    WHERE t.session_id = ?
  `).all(sessionId)

  const results = teams.map(team => {
    let totalScore = 0
    const perChallenge = []

    for (const { challenge_id } of challenges) {
      const best = req.db.prepare(`
        SELECT prompt, score, evaluation
        FROM attempts
        WHERE team_id = ? AND challenge_id = ?
        ORDER BY score DESC LIMIT 1
      `).get(team.id, challenge_id)

      if (best) {
        totalScore += best.score
        let evalData = {}
        try { evalData = JSON.parse(best.evaluation || '{}') } catch {}
        perChallenge.push({
          challengeId: challenge_id,
          score: best.score,
          prompt: best.prompt,
          feedback: evalData.feedback || '',
          strengths: (evalData.strengths || []).join('; '),
        })
      } else {
        perChallenge.push({
          challengeId: challenge_id,
          score: 0,
          prompt: '',
          feedback: '',
          strengths: '',
        })
      }
    }

    return {
      name: team.name,
      members: parseMemberList(team.members).join(', '),
      totalScore,
      perChallenge,
    }
  })

  results.sort((a, b) => b.totalScore - a.totalScore)

  // CSV 행 생성 (팀 × 챌린지)
  const header = csvRow(['순위', '팀명', '팀원', '총점', '챌린지', '챌린지점수', '프롬프트', '피드백', '장점'])
  const rows = []
  results.forEach((team, idx) => {
    const rank = idx + 1
    for (const ch of team.perChallenge) {
      rows.push(csvRow([rank, team.name, team.members, team.totalScore, ch.challengeId, ch.score, ch.prompt, ch.feedback, ch.strengths]))
    }
    // 챌린지가 없는 경우 팀 정보만
    if (team.perChallenge.length === 0) {
      rows.push(csvRow([rank, team.name, team.members, team.totalScore, '', '', '', '', '']))
    }
  })

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="final-results-${safeFilePart(sessionId)}.csv"`
  )
  res.send('\uFEFF' + [header, ...rows].join('\n'))
})

export default router
