import { Router } from 'express'
import { randomUUID } from 'crypto'
import QRCode from 'qrcode'
import { generateTeamName } from '../data/teamNames.js'

const router = Router()

// POST /api/session/create — 새 수업 생성 (내부적으로 UUID 생성)
router.post('/create', (req, res) => {
  const { teacherCode } = req.body
  if (!teacherCode) return res.status(400).json({ error: 'teacherCode 필요' })

  const id = randomUUID()
  req.db
    .prepare(
      'INSERT INTO sessions (id, teacher_code, session_number) VALUES (?, ?, 1)'
    )
    .run(id, teacherCode)

  res.json({ sessionId: id, teacherCode })
})

// POST /api/session/:id/teams — 팀 자동 구성
router.post('/:id/teams', (req, res) => {
  const { id } = req.params
  const { students } = req.body

  if (!students || students.length === 0)
    return res.status(400).json({ error: '학생 명단 필요' })

  const teamColors = [
    '#ef4444','#f97316','#eab308','#22c55e',
    '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
    '#06b6d4','#84cc16','#f59e0b','#10b981',
    '#6366f1','#a855f7',
  ]

  const shuffled = [...students].sort(() => Math.random() - 0.5)
  const teams = []

  const usedNames = []
  for (let i = 0; i < shuffled.length; i += 2) {
    const members = shuffled.slice(i, i + 2)
    const name = generateTeamName(usedNames)
    usedNames.push(name)
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

const MAX_TEAMS = 15

// POST /api/session/register — 팀 등록 (1~2명 동시 입력)
router.post('/register', (req, res) => {
  const { teacherCode, students } = req.body
  // students: [{ studentNumber, studentName }, ...] (1~2명)
  if (!teacherCode || !students || !Array.isArray(students) || students.length === 0)
    return res.status(400).json({ error: '수업코드와 팀원 정보가 필요합니다' })

  if (students.length > 2)
    return res.status(400).json({ error: '팀원은 최대 2명입니다' })

  // 필수 필드 확인
  for (const s of students) {
    if (!s.studentNumber?.trim() || !s.studentName?.trim())
      return res.status(400).json({ error: '모든 팀원의 학번과 이름을 입력해주세요' })
  }

  // 수업코드로 활성 세션 찾기
  const session = req.db
    .prepare("SELECT id FROM sessions WHERE teacher_code = ? AND status != 'ended' ORDER BY created_at DESC LIMIT 1")
    .get(teacherCode)
  if (!session) return res.status(404).json({ error: '수업을 찾을 수 없습니다. 수업코드를 확인해주세요.' })

  // 중복 등록 방지 — 첫 번째 학생 기준
  const existing = req.db
    .prepare('SELECT id, team_id FROM students WHERE session_id = ? AND student_number = ?')
    .get(session.id, students[0].studentNumber.trim())
  if (existing) {
    if (existing.team_id) {
      return res.json({ sessionId: session.id, teamId: existing.team_id, alreadyRegistered: true })
    }
    return res.json({ sessionId: session.id, teamId: null, spectator: true, alreadyRegistered: true })
  }

  const teamColors = [
    '#ef4444','#f97316','#eab308','#22c55e',
    '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
    '#06b6d4','#84cc16','#f59e0b','#10b981',
    '#6366f1','#a855f7',
  ]

  const teams = req.db
    .prepare('SELECT * FROM teams WHERE session_id = ?')
    .all(session.id)

  // 15팀 제한: 꽉 찼으면 관람 모드
  if (teams.length >= MAX_TEAMS) {
    for (const s of students) {
      req.db
        .prepare('INSERT INTO students (session_id, team_id, student_number, name) VALUES (?, NULL, ?, ?)')
        .run(session.id, s.studentNumber.trim(), s.studentName.trim())
    }

    req.io.to(`session:${session.id}:teacher`).emit('student:registered', {
      studentNames: students.map(s => s.studentName.trim()),
      team: { name: '관람자', color: '#64748b', members: [] },
    })

    return res.json({ sessionId: session.id, teamId: null, spectator: true })
  }

  // 새 팀 생성 (항상 새 팀)
  const memberNames = students.map(s => s.studentName.trim())
  const existingNames = teams.map(t => t.name)
  const teamName = generateTeamName(existingNames)
  const color = teamColors[teams.length % teamColors.length]
  const result = req.db
    .prepare('INSERT INTO teams (session_id, name, members, color) VALUES (?, ?, ?, ?)')
    .run(session.id, teamName, JSON.stringify(memberNames), color)
  const teamId = result.lastInsertRowid

  for (const s of students) {
    req.db
      .prepare('INSERT INTO students (session_id, team_id, student_number, name) VALUES (?, ?, ?, ?)')
      .run(session.id, teamId, s.studentNumber.trim(), s.studentName.trim())
  }

  const team = req.db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId)
  req.io.to(`session:${session.id}:teacher`).emit('student:registered', {
    studentNames: memberNames,
    team: { ...team, members: JSON.parse(team.members) },
  })

  res.json({ sessionId: session.id, teamId, alreadyRegistered: false })
})

// GET /api/session/latest/teams — 가장 최근 수업의 팀 목록 (학생 접속용)
router.get('/latest/teams', (req, res) => {
  const session = req.db
    .prepare("SELECT id FROM sessions WHERE status != 'ended' ORDER BY created_at DESC LIMIT 1")
    .get()
  if (!session) return res.status(404).json({ error: '활성 수업 없음' })

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
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http'
  const host = req.headers.host || 'localhost:4009'
  const url = `${protocol}://${host}/team/${teamId}`
  const qr = await QRCode.toDataURL(url)
  res.json({ url, qr })
})

// GET /api/session/:id — 수업 정보
router.get('/:id', (req, res) => {
  const session = req.db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(req.params.id)
  if (!session) return res.status(404).json({ error: '수업 없음' })
  res.json(session)
})

export default router