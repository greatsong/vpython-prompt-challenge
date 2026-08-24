import { Router } from 'express'
import { randomUUID } from 'crypto'
import QRCode from 'qrcode'
import { generateTeamName } from '../data/teamNames.js'
import { requireTeacher } from './teacherAuth.js'

const router = Router()

// 한 수업의 팀 정원. 인프라 한계가 아니라 운영상의 안전장치다.
// 기본 40팀 — 28명 14팀 기준으로 1인팀이 모두 쪼개져도 여유가 충분하다.
// 학급 규모가 다르면 .env의 MAX_TEAMS로 조정한다.
export const MAX_TEAMS = Number(process.env.MAX_TEAMS) || 40

// 정원 초과로 관람 모드가 될 때 학생에게 보여줄 안내 문구
export function capacityMessage() {
  return `팀 정원(${MAX_TEAMS}팀)이 모두 찼습니다. 관람 모드로 참여합니다. 선생님께 알려주세요.`
}

// POST /api/session/create — 수업 생성 또는 이어가기
// 교사 전용. 기본 동작은 "이어가기"다 — 같은 teacherCode로 아직 종료되지 않은 세션이 있으면
// 그 세션을 그대로 돌려준다(resumed: true). 교사가 새로고침해도 기존 팀이 유지된다.
// body.forceNew === true 인 경우에만 이전 세션들을 'ended' 처리하고 새 세션을 만든다.
router.post('/create', requireTeacher, (req, res) => {
  const { teacherCode, forceNew } = req.body
  if (!teacherCode) return res.status(400).json({ error: 'teacherCode 필요' })

  if (!forceNew) {
    const existing = req.db
      .prepare("SELECT id FROM sessions WHERE teacher_code = ? AND status != 'ended' ORDER BY created_at DESC LIMIT 1")
      .get(teacherCode)
    if (existing) {
      const teamCount = req.db
        .prepare('SELECT COUNT(*) AS n FROM teams WHERE session_id = ?')
        .get(existing.id).n
      return res.json({ sessionId: existing.id, teacherCode, resumed: true, teamCount, maxTeams: MAX_TEAMS })
    }
  }

  const endedInfo = req.db
    .prepare("UPDATE sessions SET status = 'ended' WHERE teacher_code = ? AND status != 'ended'")
    .run(teacherCode)

  const id = randomUUID()
  req.db
    .prepare(
      'INSERT INTO sessions (id, teacher_code, session_number) VALUES (?, ?, 1)'
    )
    .run(id, teacherCode)

  res.json({ sessionId: id, teacherCode, resumed: false, teamCount: 0, maxTeams: MAX_TEAMS, endedPrevious: endedInfo.changes })
})

// POST /api/session/:id/teams — 팀 자동 구성
// 정원(MAX_TEAMS)을 넘기면 거부한다. 교사가 의도적으로 넘기려면 body에 allowOverflow: true를 준다.
router.post('/:id/teams', requireTeacher, (req, res) => {
  const { id } = req.params
  const { students, allowOverflow } = req.body

  if (!students || students.length === 0)
    return res.status(400).json({ error: '학생 명단 필요' })

  const currentTeamCount = req.db
    .prepare('SELECT COUNT(*) AS n FROM teams WHERE session_id = ?')
    .get(id).n
  const plannedTeamCount = Math.ceil(students.length / 2)

  if (!allowOverflow && currentTeamCount + plannedTeamCount > MAX_TEAMS) {
    return res.status(400).json({
      error: `팀 정원을 초과합니다. 현재 ${currentTeamCount}팀 + 새로 만들 ${plannedTeamCount}팀 = ${currentTeamCount + plannedTeamCount}팀 (상한 ${MAX_TEAMS}팀). 그래도 만들려면 allowOverflow: true로 다시 요청하세요.`,
      teamCount: currentTeamCount,
      plannedTeamCount,
      maxTeams: MAX_TEAMS,
      reason: 'capacity',
    })
  }

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
    const teamToken = randomUUID()

    const result = req.db
      .prepare(
        'INSERT INTO teams (session_id, name, members, color, access_token) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, name, JSON.stringify(members), color, teamToken)

    teams.push({ id: result.lastInsertRowid, name, members, color, teamToken })
  }

  res.json({ teams, teamCount: currentTeamCount + teams.length, maxTeams: MAX_TEAMS })
})

// POST /api/session/register — 팀 등록 (1~2명 동시 입력)
router.post('/register', (req, res) => {
  const { teacherCode, students, forceNewTeam } = req.body
  // students: [{ studentNumber, studentName }, ...] (1~2명)
  // forceNewTeam: true면 같은 학번이 이미 등록되어 있어도 기존 팀으로 합류하지 않고 새 팀 생성
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

  // 중복 등록 확인 — 모든 팀원의 학번을 검사
  const existingList = students.map(s =>
    req.db
      .prepare('SELECT id, team_id FROM students WHERE session_id = ? AND student_number = ?')
      .get(session.id, s.studentNumber.trim())
  )
  // 하나라도 이미 등록되어 있으면 "이전 등록이 있다"고 판단
  const anyExisting = existingList.find(e => !!e)
  if (anyExisting && !forceNewTeam) {
    if (anyExisting.team_id) {
      const existingTeam = req.db
        .prepare('SELECT access_token FROM teams WHERE id = ?')
        .get(anyExisting.team_id)
      return res.json({
        sessionId: session.id,
        teamId: anyExisting.team_id,
        teamToken: existingTeam?.access_token,
        alreadyRegistered: true,
      })
    }
    // 팀 없이 등록된 기록 = 이전에 정원 초과로 관람 모드가 된 학생
    return res.json({
      sessionId: session.id,
      teamId: null,
      spectator: true,
      alreadyRegistered: true,
      reason: 'capacity',
      maxTeams: MAX_TEAMS,
      message: capacityMessage(),
    })
  }

  // forceNewTeam=true인 경우: 모든 팀원의 이전 등록 기록을 현 세션에서 제거하고 새로 등록
  if (anyExisting && forceNewTeam) {
    for (const s of students) {
      req.db
        .prepare('DELETE FROM students WHERE session_id = ? AND student_number = ?')
        .run(session.id, s.studentNumber.trim())
    }
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

  // 정원 초과: 팀을 더 만들 수 없으므로 관람 모드로 받는다.
  // 조용히 강등시키지 않고, 사유(reason)와 안내 문구(message)를 응답에 반드시 실어 보낸다.
  if (teams.length >= MAX_TEAMS) {
    for (const s of students) {
      req.db
        .prepare('INSERT INTO students (session_id, team_id, student_number, name) VALUES (?, NULL, ?, ?)')
        .run(session.id, s.studentNumber.trim(), s.studentName.trim())
    }

    req.io.to(`session:${session.id}:teacher`).emit('student:registered', {
      studentNames: students.map(s => s.studentName.trim()),
      team: { name: '관람자', color: '#64748b', members: [] },
      spectator: true,
      reason: 'capacity',
      teamCount: teams.length,
      maxTeams: MAX_TEAMS,
    })

    return res.json({
      sessionId: session.id,
      teamId: null,
      spectator: true,
      alreadyRegistered: false,
      reason: 'capacity',
      teamCount: teams.length,
      maxTeams: MAX_TEAMS,
      message: capacityMessage(),
    })
  }

  // 새 팀 생성 (항상 새 팀)
  const memberNames = students.map(s => s.studentName.trim())
  const existingNames = teams.map(t => t.name)
  const teamName = generateTeamName(existingNames)
  const color = teamColors[teams.length % teamColors.length]
  const teamToken = randomUUID()
  const result = req.db
    .prepare('INSERT INTO teams (session_id, name, members, color, access_token) VALUES (?, ?, ?, ?, ?)')
    .run(session.id, teamName, JSON.stringify(memberNames), color, teamToken)
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

  res.json({ sessionId: session.id, teamId, teamToken, alreadyRegistered: false })
})

// GET /api/session/latest/teams?teacherCode=... — 해당 수업의 팀 목록 (학생 접속용)
// teacherCode를 주면 그 수업으로 한정한다. 생략하면 (하위 호환) 전역 최신 활성 세션.
router.get('/latest/teams', (req, res) => {
  const { teacherCode } = req.query
  const session = teacherCode
    ? req.db
        .prepare("SELECT id FROM sessions WHERE teacher_code = ? AND status != 'ended' ORDER BY created_at DESC LIMIT 1")
        .get(teacherCode)
    : req.db
        .prepare("SELECT id FROM sessions WHERE status != 'ended' ORDER BY created_at DESC LIMIT 1")
        .get()
  if (!session) return res.status(404).json({ error: '활성 수업 없음' })

  const teams = req.db
    .prepare('SELECT * FROM teams WHERE session_id = ?')
    .all(session.id)

  res.json({
    sessionId: session.id,
    teams: teams.map((t) => {
      const { access_token, ...safeTeam } = t
      return { ...safeTeam, members: JSON.parse(t.members) }
    }),
  })
})

// GET /api/session/:id/qr — 팀별 QR코드
router.get('/:id/qr', requireTeacher, async (req, res) => {
  const { teamId } = req.query
  const team = req.db
    .prepare('SELECT access_token FROM teams WHERE id = ? AND session_id = ?')
    .get(teamId, req.params.id)
  if (!team) return res.status(404).json({ error: '팀 없음' })

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http'
  const host = req.headers.host || 'localhost:4009'
  const url = `${protocol}://${host}/team/${teamId}?token=${encodeURIComponent(team.access_token)}`
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
