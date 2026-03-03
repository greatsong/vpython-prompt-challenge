import { Router } from 'express'
import { randomUUID } from 'crypto'
import QRCode from 'qrcode'
import { generateTeamName } from '../data/teamNames.js'

const router = Router()

// POST /api/session/create — 새 수업 세션 생성
router.post('/create', (req, res) => {
  const { teacherCode, sessionNumber = 1 } = req.body
  if (!teacherCode) return res.status(400).json({ error: 'teacherCode 필요' })

  const id = randomUUID()
  req.db
    .prepare(
      'INSERT INTO sessions (id, teacher_code, session_number) VALUES (?, ?, ?)'
    )
    .run(id, teacherCode, sessionNumber)

  res.json({ sessionId: id, teacherCode, sessionNumber })
})

// POST /api/session/:id/teams — 팀 자동 구성
router.post('/:id/teams', (req, res) => {
  const { id } = req.params
  const { students } = req.body  // string[] 학생 이름 목록

  if (!students || students.length === 0)
    return res.status(400).json({ error: '학생 명단 필요' })

  // 2인 1팀으로 구성
  const teamColors = [
    '#ef4444','#f97316','#eab308','#22c55e',
    '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
    '#06b6d4','#84cc16','#f59e0b','#10b981',
    '#6366f1','#a855f7',
  ]

  const shuffled = [...students].sort(() => Math.random() - 0.5)
  const teams = []

  for (let i = 0; i < shuffled.length; i += 2) {
    const members = shuffled.slice(i, i + 2)
    const name = generateTeamName()
    const color = teamColors[teams.length % teamColors.length]

    const result = req.db
      .prepare(
        'INSERT INTO teams (session_id, name, members, color) VALUES (?, ?, ?, ?)'
      )
      .run(id, name, JSON.stringify(members), color)

    teams.push({ id: result.lastInsertRowid, name, members, color })
  }

  res.json({ teams })
})

// GET /api/session/:id/teams — 팀 목록
router.get('/:id/teams', (req, res) => {
  const teams = req.db
    .prepare('SELECT * FROM teams WHERE session_id = ?')
    .all(req.params.id)

  res.json({
    teams: teams.map((t) => ({ ...t, members: JSON.parse(t.members) })),
  })
})

// PATCH /api/session/:id/mode — 세션 모드 전환 (Socket emit 포함)
router.patch('/:id/mode', (req, res) => {
  const { mode, sessionNumber } = req.body
  const validModes = ['battle', 'detective', 'surgery', 'creator', 'compare']
  if (!validModes.includes(mode))
    return res.status(400).json({ error: '유효하지 않은 모드' })

  req.db
    .prepare(
      'UPDATE sessions SET mode = ?, session_number = COALESCE(?, session_number) WHERE id = ?'
    )
    .run(mode, sessionNumber ?? null, req.params.id)

  // Socket.io로 모든 팀에 브로드캐스트
  req.io.to(`session:${req.params.id}`).emit('session:mode-change', { mode })

  res.json({ mode, sessionNumber })
})

// GET /api/session/latest/teams — 가장 최근 세션의 팀 목록 (학생 접속용)
router.get('/latest/teams', (req, res) => {
  const session = req.db
    .prepare("SELECT id FROM sessions WHERE status != 'ended' ORDER BY created_at DESC LIMIT 1")
    .get()
  if (!session) return res.status(404).json({ error: '활성 세션 없음' })

  const teams = req.db
    .prepare('SELECT * FROM teams WHERE session_id = ?')
    .all(session.id)

  res.json({
    sessionId: session.id,
    teams: teams.map((t) => ({ ...t, members: JSON.parse(t.members) })),
  })
})

// GET /api/session/:id/qr — 팀별 QR코드
router.get('/:id/qr', async (req, res) => {
  const { teamId } = req.query
  const host = req.headers.host?.split(':')[0] || 'localhost'
  const url = `http://${host}:4008/team/${teamId}`
  const qr = await QRCode.toDataURL(url)
  res.json({ url, qr })
})

// GET /api/session/:id — 세션 정보
router.get('/:id', (req, res) => {
  const session = req.db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(req.params.id)
  if (!session) return res.status(404).json({ error: '세션 없음' })
  res.json(session)
})

export default router
