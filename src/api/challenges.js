import { Router } from 'express'
import { BATTLE_CHALLENGES } from '../data/challenges-battle.js'

const router = Router()

// GET /api/challenges?session=1 — 세션별 챌린지 목록
router.get('/', (req, res) => {
  const sessionNum = parseInt(req.query.session) || 1

  // 프리셋 챌린지 (코드에서 제공)
  const presets = BATTLE_CHALLENGES.filter(
    (c) => !c.sessionOnly || c.sessionOnly === sessionNum
  )

  // 학생 출제 챌린지 (Session 4에서 등록한 것, Session 5에서 사용)
  const studentMade = req.db
    .prepare('SELECT * FROM student_challenges ORDER BY created_at DESC')
    .all()
    .map((c) => ({
      ...c,
      ct_elements: JSON.parse(c.ct_elements),
      source: 'student',
    }))

  res.json({ presets, studentMade })
})

// GET /api/challenges/:id
router.get('/:id', (req, res) => {
  const challenge = BATTLE_CHALLENGES.find((c) => c.id === req.params.id)
  if (!challenge) return res.status(404).json({ error: '챌린지 없음' })
  res.json(challenge)
})

// POST /api/challenges — 학생 출제 문제 등록 (Session 4)
router.post('/', (req, res) => {
  const { teamId, title, description, code, hint, ct_elements, difficulty } = req.body

  if (!teamId || !title || !code)
    return res.status(400).json({ error: 'teamId, title, code 필요' })

  const result = req.db
    .prepare(
      `INSERT INTO student_challenges
         (team_id, title, description, code, hint, ct_elements, difficulty)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      teamId,
      title,
      description || '',
      code,
      hint || '',
      JSON.stringify(ct_elements || []),
      difficulty || '기본'
    )

  res.json({ id: result.lastInsertRowid, title })
})

export default router
