import { Router } from 'express'

const router = Router()

// GET /api/dashboard/:sessionId — 실시간 팀 현황
router.get('/dashboard/:sessionId', (req, res) => {
  const { sessionId } = req.params
  const { challengeId } = req.query

  const teams = req.db
    .prepare('SELECT * FROM teams WHERE session_id = ?')
    .all(sessionId)

  const teamsWithScores = teams.map((team) => {
    // challengeId가 있으면 해당 챌린지 기준, 없으면 전체 최신
    const latest = challengeId
      ? req.db
          .prepare(
            `SELECT MAX(score) AS score, evaluation, created_at
             FROM attempts
             WHERE team_id = ? AND challenge_id = ?`
          )
          .get(team.id, challengeId)
      : req.db
          .prepare(
            `SELECT score, evaluation, created_at
             FROM attempts
             WHERE team_id = ?
             ORDER BY created_at DESC LIMIT 1`
          )
          .get(team.id)

    return {
      ...team,
      members: JSON.parse(team.members),
      latestScore: latest?.score ?? null,
      hasSubmitted: !!(latest?.score !== null && latest?.score !== undefined),
      lastSubmitTime: latest?.created_at ?? null,
    }
  })

  res.json({ teams: teamsWithScores })
})

// GET /api/dashboard/attempts/:sessionId/:teamId — 특정 팀의 시도 목록
router.get('/dashboard/attempts/:sessionId/:teamId', (req, res) => {
  const { sessionId, teamId } = req.params

  const attempts = req.db
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

// GET /api/growth/:teamId — Session 1 vs 5 성장 비교
router.get('/growth/:teamId', (req, res) => {
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
router.post('/attempts', (req, res) => {
  const {
    teamId,
    sessionNumber,
    challengeId,
    prompt,
    generatedCode,
    score,
    ctScores,
    evaluation,
  } = req.body

  if (!teamId || !sessionNumber || !challengeId || !prompt)
    return res.status(400).json({ error: '필수 필드 누락' })

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
      score || 0,
      JSON.stringify(ctScores || {}),
      JSON.stringify(evaluation || {})
    )

  res.json({ id: result.lastInsertRowid })
})

// GET /api/export/:sessionId — 결과 CSV
router.get('/export/:sessionId', (req, res) => {
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

export default router
