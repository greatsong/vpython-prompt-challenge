import { Router } from 'express'
import { isValidTeacherToken, requireTeacher } from './teacherAuth.js'
import { getAuthorizedTeam } from './teamAuth.js'
import { verifyEvaluationProof } from './evaluationProof.js'
import { MAX_TEAMS } from './session.js'

const router = Router()

function requireAttemptWriter(req, res, next) {
  if (isValidTeacherToken(req.headers['x-teacher-token'])) {
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
router.get('/dashboard/:sessionId', requireTeacher, (req, res) => {
  const { sessionId } = req.params
  const { challengeId } = req.query

  const teams = req.db
    .prepare('SELECT * FROM teams WHERE session_id = ?')
    .all(sessionId)

  const teamsWithScores = teams.map((team) => {
    // 현재 챌린지 기준 최고 점수 행 — 점수·평가·제출시각이 반드시 같은 시도(row)에서 오도록
    // best attempt 전체를 ORDER BY로 선택한다.
    const current = challengeId
      ? req.db
          .prepare(
            `SELECT score, evaluation, created_at
             FROM attempts
             WHERE team_id = ? AND challenge_id = ?
             ORDER BY score DESC, created_at DESC
             LIMIT 1`
          )
          .get(team.id, challengeId)
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
router.get('/dashboard/attempts/:sessionId/:teamId', requireTeacher, (req, res) => {
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

// GET /api/dashboard/rankings/:sessionId — 챌린지별 순위 조회 (결과 공개 폴백용)
router.get('/dashboard/rankings/:sessionId', requireTeacher, (req, res) => {
  const { sessionId } = req.params
  const { challengeId } = req.query

  // 윈도우 함수로 각 팀의 best attempt 전체 row를 정확히 집어온다.
  // 기존 MAX + 비집계 컬럼 방식은 점수와 프롬프트가 다른 시도에서 섞여 나오는 버그가 있었다.
  const rankings = challengeId
    ? req.db.prepare(`
        WITH ranked AS (
          SELECT a.*,
                 ROW_NUMBER() OVER (
                   PARTITION BY a.team_id
                   ORDER BY a.score DESC, a.created_at DESC
                 ) AS rn
          FROM attempts a
          WHERE a.challenge_id = ?
        )
        SELECT t.name, t.color,
               COALESCE(r.score, 0) AS score,
               r.prompt, r.generated_code
        FROM teams t
        LEFT JOIN ranked r ON r.team_id = t.id AND r.rn = 1
        WHERE t.session_id = ?
        ORDER BY score DESC
      `).all(challengeId, sessionId)
    : req.db.prepare(`
        WITH ranked AS (
          SELECT a.*,
                 ROW_NUMBER() OVER (
                   PARTITION BY a.team_id
                   ORDER BY a.score DESC, a.created_at DESC
                 ) AS rn
          FROM attempts a
        )
        SELECT t.name, t.color,
               COALESCE(r.score, 0) AS score,
               r.prompt, r.generated_code
        FROM teams t
        LEFT JOIN ranked r ON r.team_id = t.id AND r.rn = 1
        WHERE t.session_id = ?
        ORDER BY score DESC
      `).all(sessionId)

  res.json({ rankings })
})

// GET /api/growth/:teamId — Session 1 vs 5 성장 비교
router.get('/growth/:teamId', requireTeacher, (req, res) => {
  const { teamId } = req.params
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
  } = req.body

  if (!teamId || !sessionNumber || !challengeId || !prompt)
    return res.status(400).json({ error: '필수 필드 누락' })

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

    let verifiedScore = score || 0
    let verifiedCtScores = ctScores || {}
    let verifiedEvaluation = evaluation || {}

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
      verifiedScore = proof.score || 0
      verifiedCtScores = proof.ctScores || {}
      verifiedEvaluation = proof.evaluation || {}
    }

    const result = req.db
      .prepare(
        `INSERT INTO attempts
           (team_id, session_number, challenge_id, prompt, generated_code, score, ct_scores, evaluation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        teamId,
        sessionNumber,
        challengeId,
        prompt,
        generatedCode || '',
        verifiedScore,
        JSON.stringify(verifiedCtScores),
        JSON.stringify(verifiedEvaluation)
      )

    res.json({ id: result.lastInsertRowid })
  } catch (err) {
    console.error('[Attempts] 저장 에러:', err.message)
    res.status(500).json({ error: '저장에 실패했습니다. 새로고침 후 다시 시도해주세요.' })
  }
})

// GET /api/export/:sessionId — 결과 CSV
router.get('/export/:sessionId', requireTeacher, (req, res) => {
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

  const header = 'team,session,challenge,score,prompt,created_at\n'
  const csv =
    header +
    rows
      .map(
        (r) =>
          `"${r.team}",${r.session_number},"${r.challenge_id}",${r.score},"${r.prompt.replace(/"/g, '""')}","${r.created_at}"`
      )
      .join('\n')

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="session-${sessionId}.csv"`
  )
  res.send('\uFEFF' + csv)  // BOM for Excel 한글 인식
})

// GET /api/export/final/:sessionId — 종합 결과 CSV (순위+프롬프트+피드백)
router.get('/export/final/:sessionId', requireTeacher, (req, res) => {
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
      members: JSON.parse(team.members).join(', '),
      totalScore,
      perChallenge,
    }
  })

  results.sort((a, b) => b.totalScore - a.totalScore)

  // CSV 행 생성 (팀 × 챌린지)
  const header = '순위,팀명,팀원,총점,챌린지,챌린지점수,프롬프트,피드백,장점\n'
  const rows = []
  results.forEach((team, idx) => {
    const rank = idx + 1
    for (const ch of team.perChallenge) {
      rows.push(
        `${rank},"${team.name}","${team.members}",${team.totalScore},"${ch.challengeId}",${ch.score},"${(ch.prompt || '').replace(/"/g, '""')}","${(ch.feedback || '').replace(/"/g, '""')}","${(ch.strengths || '').replace(/"/g, '""')}"`
      )
    }
    // 챌린지가 없는 경우 팀 정보만
    if (team.perChallenge.length === 0) {
      rows.push(`${rank},"${team.name}","${team.members}",${team.totalScore},"","","","",""`)
    }
  })

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="final-results-${sessionId}.csv"`
  )
  res.send('\uFEFF' + header + rows.join('\n'))
})

export default router
