import { Router } from 'express'
import { randomUUID } from 'crypto'
import QRCode from 'qrcode'
import { generateTeamName } from '../data/teamNames.js'
import {
  requireTeacher,
  requireSessionAccess,
  getTeacherAuth,
  canAccessSession,
  SCOPE_TRAINING,
} from './teacherAuth.js'

const router = Router()

// 한 수업의 팀 정원. 인프라 한계가 아니라 운영상의 안전장치다.
// 기본 40팀 — 28명 14팀 기준으로 1인팀이 모두 쪼개져도 여유가 충분하다.
// 학급 규모가 다르면 .env의 MAX_TEAMS로 조정한다.
export const MAX_TEAMS = Number(process.env.MAX_TEAMS) || 40

// 한 팀 최대 인원
const TEAM_SIZE = 2
// 학번·이름 길이 상한
const STUDENT_FIELD_MAX = 30
// 수업코드 길이 상한
const TEACHER_CODE_MAX = 50
// 교사 일괄 생성 한 번에 받을 수 있는 학생 수
const BULK_STUDENTS_MAX = 200

const TEAM_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f59e0b', '#10b981',
  '#6366f1', '#a855f7',
]

// 정원 초과로 관람 모드가 될 때 학생에게 보여줄 안내 문구
export function capacityMessage() {
  return `팀 정원(${MAX_TEAMS}팀)이 모두 찼습니다. 관람 모드로 참여합니다. 선생님께 알려주세요.`
}

// ── 입력 검증 ────────────────────────────────────────────────────────────────
class InputError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

function parseTeacherCode(value) {
  if (typeof value !== 'string' || !value.trim()) throw new InputError('수업코드를 입력해주세요')
  const code = value.trim()
  if (code.length > TEACHER_CODE_MAX) throw new InputError(`수업코드는 ${TEACHER_CODE_MAX}자 이하로 입력해주세요`)
  return code
}

/**
 * 학생 목록 검증 — 학번·이름은 문자열(1~30자)만 받는다.
 * 숫자형 학번은 문자열로 바꾸지 않고 거부한다(앞자리 0이 사라지는 등 다른 학번이 되는 것을 막는다).
 * 같은 요청 안에서 학번이 겹치면 거부한다.
 */
function parseStudents(students, { min = 1, max = TEAM_SIZE } = {}) {
  if (!Array.isArray(students) || students.length < min) {
    throw new InputError('팀원 정보가 필요합니다')
  }
  if (students.length > max) {
    throw new InputError(max === TEAM_SIZE ? `팀원은 최대 ${TEAM_SIZE}명입니다` : `한 번에 ${max}명까지만 등록할 수 있습니다`)
  }
  const list = students.map((s) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      throw new InputError('팀원 정보 형식이 올바르지 않습니다')
    }
    const { studentNumber, studentName } = s
    if (typeof studentNumber !== 'string' || typeof studentName !== 'string') {
      throw new InputError('학번과 이름은 글자로 입력해주세요')
    }
    const number = studentNumber.trim()
    const name = studentName.trim()
    if (!number || !name) throw new InputError('모든 팀원의 학번과 이름을 입력해주세요')
    if (number.length > STUDENT_FIELD_MAX || name.length > STUDENT_FIELD_MAX) {
      throw new InputError(`학번과 이름은 ${STUDENT_FIELD_MAX}자 이하로 입력해주세요`)
    }
    return { number, name }
  })
  const seen = new Set()
  for (const s of list) {
    if (seen.has(s.number)) throw new InputError(`같은 학번(${s.number})이 두 번 입력되었습니다`)
    seen.add(s.number)
  }
  return list
}

// 이름 비교 — 앞뒤 공백과 가운데 공백 차이는 같은 이름으로 본다
const sameName = (a, b) => String(a || '').replace(/\s+/g, '') === String(b || '').replace(/\s+/g, '')

function parseMembers(json) {
  try {
    const v = JSON.parse(json || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// 무인증 응답에서 실명을 가린다: "김철수" → "김○○"
function maskName(name) {
  const text = String(name ?? '')
  if (!text) return text
  const chars = Array.from(text)
  return chars[0] + '○'.repeat(Math.max(1, chars.length - 1))
}

function sendInputError(res, err) {
  if (err instanceof InputError) return res.status(err.status).json({ error: err.message, ...err.extra })
  throw err
}

// POST /api/session/create — 수업 생성 또는 이어가기
// 교사 전용. 기본 동작은 "이어가기"다 — 같은 teacherCode로 아직 종료되지 않은 세션이 있으면
// 그 세션을 그대로 돌려준다(resumed: true). 교사가 새로고침해도 기존 팀이 유지된다.
// body.forceNew === true 인 경우에만 이전 세션들을 'ended' 처리하고 새 세션을 만든다.
//
// 연수 토큰(scope: 'training')은 예외다. 연수에서는 여러 선생님이 각자 수업코드를 정하므로
// 이미 활성 세션이 있는 코드로 요청하면 남의 수업에 들어가거나(이어가기) 남의 수업을
// 끝내 버리지(forceNew) 않도록 409로 거절한다. 단, 같은 토큰으로 만든 자기 수업이면 이어간다.
router.post('/create', requireTeacher, (req, res) => {
  let teacherCode
  try {
    teacherCode = parseTeacherCode(req.body?.teacherCode)
  } catch (err) {
    return sendInputError(res, err)
  }
  const forceNew = req.body?.forceNew === true
  const ownerHash = req.teacherAuth?.tokenHash || null

  const resume = (existing) => {
    const teamCount = req.db
      .prepare('SELECT COUNT(*) AS n FROM teams WHERE session_id = ?')
      .get(existing.id).n
    return res.json({ sessionId: existing.id, teacherCode, resumed: true, teamCount, maxTeams: MAX_TEAMS })
  }

  if (req.teacherScope === SCOPE_TRAINING) {
    const inUse = req.db
      .prepare("SELECT id, owner_token_hash FROM sessions WHERE teacher_code = ? AND status != 'ended' ORDER BY created_at DESC LIMIT 1")
      .get(teacherCode)
    if (inUse) {
      if (ownerHash && inUse.owner_token_hash === ownerHash) return resume(inUse)
      return res.status(409).json({
        error: '이미 사용 중인 수업코드입니다. 다른 코드를 정해 주세요',
        reason: 'code_in_use',
      })
    }
  } else if (!forceNew) {
    const existing = req.db
      .prepare("SELECT id FROM sessions WHERE teacher_code = ? AND status != 'ended' ORDER BY created_at DESC LIMIT 1")
      .get(teacherCode)
    if (existing) return resume(existing)
  }

  const id = randomUUID()
  const endedInfo = req.db.transaction(() => {
    const info = req.db
      .prepare("UPDATE sessions SET status = 'ended' WHERE teacher_code = ? AND status != 'ended'")
      .run(teacherCode)
    req.db
      .prepare('INSERT INTO sessions (id, teacher_code, session_number, owner_token_hash) VALUES (?, ?, 1, ?)')
      .run(id, teacherCode, ownerHash)
    return info
  })()

  res.json({ sessionId: id, teacherCode, resumed: false, teamCount: 0, maxTeams: MAX_TEAMS, endedPrevious: endedInfo.changes })
})

// POST /api/session/:id/teams — 팀 자동 구성 (교사 일괄 생성)
// students: [{ studentNumber, studentName }, ...] — 등록 API와 같은 검증을 거친다.
// 정원(MAX_TEAMS)을 넘기면 거부한다. 교사가 의도적으로 넘기려면 body에 allowOverflow: true를 준다.
// 학생 행(students)도 함께 만들어, 나중에 학생이 같은 학번·이름으로 등록하면 이 팀으로 들어온다.
router.post('/:id/teams', requireTeacher, requireSessionAccess('id'), (req, res) => {
  const { id } = req.params
  const allowOverflow = req.body?.allowOverflow === true

  let list
  try {
    list = parseStudents(req.body?.students, { min: 1, max: BULK_STUDENTS_MAX })
  } catch (err) {
    return sendInputError(res, err)
  }

  const session = req.db.prepare('SELECT id, status FROM sessions WHERE id = ?').get(id)
  if (!session) return res.status(404).json({ error: '수업 없음' })
  if (session.status === 'ended') return res.status(410).json({ error: '이미 종료된 수업입니다' })

  try {
    const result = req.db.transaction(() => {
      const currentTeamCount = req.db
        .prepare('SELECT COUNT(*) AS n FROM teams WHERE session_id = ?')
        .get(id).n
      const plannedTeamCount = Math.ceil(list.length / TEAM_SIZE)

      if (!allowOverflow && currentTeamCount + plannedTeamCount > MAX_TEAMS) {
        throw new InputError(
          `팀 정원을 초과합니다. 현재 ${currentTeamCount}팀 + 새로 만들 ${plannedTeamCount}팀 = ${currentTeamCount + plannedTeamCount}팀 (상한 ${MAX_TEAMS}팀). 그래도 만들려면 allowOverflow: true로 다시 요청하세요.`,
          400,
          { teamCount: currentTeamCount, plannedTeamCount, maxTeams: MAX_TEAMS, reason: 'capacity' }
        )
      }

      const findStudent = req.db.prepare('SELECT id FROM students WHERE session_id = ? AND student_number = ?')
      const taken = list.filter((s) => findStudent.get(id, s.number)).map((s) => s.number)
      if (taken.length > 0) {
        throw new InputError(`이미 등록된 학번이 있습니다: ${taken.join(', ')}`, 409, { reason: 'already_registered', studentNumbers: taken })
      }

      const usedNames = req.db.prepare('SELECT name FROM teams WHERE session_id = ?').all(id).map((t) => t.name)
      const shuffled = [...list].sort(() => Math.random() - 0.5)
      const insertTeam = req.db.prepare(
        'INSERT INTO teams (session_id, name, members, color, access_token) VALUES (?, ?, ?, ?, ?)'
      )
      const insertStudent = req.db.prepare(
        'INSERT INTO students (session_id, team_id, student_number, name) VALUES (?, ?, ?, ?)'
      )
      const teams = []
      for (let i = 0; i < shuffled.length; i += TEAM_SIZE) {
        const members = shuffled.slice(i, i + TEAM_SIZE)
        const name = generateTeamName(usedNames)
        usedNames.push(name)
        const color = TEAM_COLORS[(currentTeamCount + teams.length) % TEAM_COLORS.length]
        const teamToken = randomUUID()
        const memberNames = members.map((m) => m.name)
        const info = insertTeam.run(id, name, JSON.stringify(memberNames), color, teamToken)
        for (const m of members) insertStudent.run(id, info.lastInsertRowid, m.number, m.name)
        teams.push({ id: info.lastInsertRowid, name, members: memberNames, color, teamToken })
      }
      return { teams, teamCount: currentTeamCount + teams.length }
    })()

    res.json({ teams: result.teams, teamCount: result.teamCount, maxTeams: MAX_TEAMS })
  } catch (err) {
    return sendInputError(res, err)
  }
})

// POST /api/session/register — 팀 등록 (1~2명 동시 입력)
// students: [{ studentNumber, studentName }, ...] (1~2명, 문자열)
// forceNewTeam: true면 같은 학번이 이미 등록되어 있어도 기존 팀으로 합류하지 않고 새 팀 생성
//
// 이미 등록된 학번은 이름까지 일치해야 한다. 학번만 알면 남의 팀 토큰을 받아 가거나
// (forceNewTeam으로) 남을 팀에서 빼낼 수 있었기 때문이다.
// 이미 등록된 학생이 새 짝과 함께 오면 새 짝을 그 팀에 더한다(팀 정원 2명 안에서).
router.post('/register', (req, res) => {
  let teacherCode
  let list
  try {
    teacherCode = parseTeacherCode(req.body?.teacherCode)
    list = parseStudents(req.body?.students)
  } catch (err) {
    return sendInputError(res, err)
  }
  const forceNewTeam = req.body?.forceNewTeam === true

  const events = [] // 트랜잭션이 커밋된 뒤 보낼 소켓 이벤트

  let outcome
  try {
    outcome = req.db.transaction(() => {
      // 수업코드로 활성 세션 찾기
      const session = req.db
        .prepare("SELECT id FROM sessions WHERE teacher_code = ? AND status != 'ended' ORDER BY created_at DESC LIMIT 1")
        .get(teacherCode)
      if (!session) {
        throw new InputError('수업을 찾을 수 없습니다. 수업코드를 확인해주세요.', 404)
      }

      const findStudent = req.db.prepare(
        'SELECT id, team_id, name FROM students WHERE session_id = ? AND student_number = ?'
      )
      const existingList = list.map((s) => findStudent.get(session.id, s.number) || null)

      // 이미 등록된 학번은 이름까지 같아야 한다
      for (let i = 0; i < list.length; i++) {
        const ex = existingList[i]
        if (ex && !sameName(ex.name, list[i].name)) {
          throw new InputError('이미 등록된 학번입니다. 이름을 확인하세요', 409, { reason: 'name_mismatch' })
        }
      }

      const anyExisting = existingList.find(Boolean)

      // ── 이전 등록이 있음: 기존 팀으로 안내 ──
      if (anyExisting && !forceNewTeam) {
        if (!anyExisting.team_id) {
          // 팀 없이 등록된 기록 = 이전에 정원 초과로 관람 모드가 된 학생
          return {
            sessionId: session.id,
            teamId: null,
            spectator: true,
            alreadyRegistered: true,
            reason: 'capacity',
            maxTeams: MAX_TEAMS,
            message: capacityMessage(),
          }
        }

        const team = req.db.prepare('SELECT * FROM teams WHERE id = ?').get(anyExisting.team_id)
        const members = parseMembers(team?.members)
        const newcomers = list.filter((_, i) => !existingList[i])
        const response = {
          sessionId: session.id,
          teamId: anyExisting.team_id,
          teamToken: team?.access_token,
          alreadyRegistered: true,
        }

        if (team && newcomers.length > 0) {
          if (members.length + newcomers.length <= TEAM_SIZE) {
            const insert = req.db.prepare(
              'INSERT INTO students (session_id, team_id, student_number, name) VALUES (?, ?, ?, ?)'
            )
            for (const s of newcomers) insert.run(session.id, team.id, s.number, s.name)
            const nextMembers = [...members, ...newcomers.map((s) => s.name)]
            req.db.prepare('UPDATE teams SET members = ? WHERE id = ?').run(JSON.stringify(nextMembers), team.id)
            response.addedMembers = newcomers.map((s) => s.name)
            events.push(['student:registered', {
              studentNames: response.addedMembers,
              team: { id: team.id, name: team.name, color: team.color, members: nextMembers },
            }])
          } else {
            response.partnerNotAdded = true
            response.message = `기존 팀은 이미 ${TEAM_SIZE}명이라 새 짝을 넣지 못했습니다. 함께하려면 새 팀으로 시작하세요.`
          }
        }
        return response
      }

      // ── forceNewTeam: 이전 등록 기록을 지우고 새로 등록 ──
      if (anyExisting && forceNewTeam) {
        const remove = req.db.prepare('DELETE FROM students WHERE id = ?')
        for (let i = 0; i < list.length; i++) {
          const ex = existingList[i]
          if (!ex) continue
          remove.run(ex.id)
          // 옛 팀의 팀원 이름 목록에서도 뺀다
          if (ex.team_id) {
            const oldTeam = req.db.prepare('SELECT members FROM teams WHERE id = ?').get(ex.team_id)
            if (oldTeam) {
              const members = parseMembers(oldTeam.members)
              const idx = members.findIndex((m) => sameName(m, ex.name))
              if (idx >= 0) {
                members.splice(idx, 1)
                req.db.prepare('UPDATE teams SET members = ? WHERE id = ?').run(JSON.stringify(members), ex.team_id)
              }
              // 마지막 팀원이 나간 팀은 기록이 없으면 지운다. 남겨 두면 빈 팀이 정원(MAX_TEAMS)을 차지하고
              // 교사 화면에 '미제출'로 계속 남는다. 제출 기록이 있는 팀은 결과 보존을 위해 그대로 둔다.
              const remaining = req.db.prepare('SELECT COUNT(*) AS n FROM students WHERE team_id = ?').get(ex.team_id).n
              if (members.length === 0 && remaining === 0) {
                const used =
                  req.db.prepare('SELECT 1 FROM attempts WHERE team_id = ? LIMIT 1').get(ex.team_id) ||
                  req.db.prepare('SELECT 1 FROM student_challenges WHERE team_id = ? LIMIT 1').get(ex.team_id)
                if (!used) req.db.prepare('DELETE FROM teams WHERE id = ?').run(ex.team_id)
              }
            }
          }
        }
      }

      const teams = req.db.prepare('SELECT name FROM teams WHERE session_id = ?').all(session.id)

      // 정원 초과: 팀을 더 만들 수 없으므로 관람 모드로 받는다.
      // 조용히 강등시키지 않고, 사유(reason)와 안내 문구(message)를 응답에 반드시 실어 보낸다.
      if (teams.length >= MAX_TEAMS) {
        const insert = req.db.prepare(
          'INSERT INTO students (session_id, team_id, student_number, name) VALUES (?, NULL, ?, ?)'
        )
        for (const s of list) insert.run(session.id, s.number, s.name)

        events.push(['student:registered', {
          studentNames: list.map((s) => s.name),
          team: { name: '관람자', color: '#64748b', members: [] },
          spectator: true,
          reason: 'capacity',
          teamCount: teams.length,
          maxTeams: MAX_TEAMS,
        }])

        return {
          sessionId: session.id,
          teamId: null,
          spectator: true,
          alreadyRegistered: false,
          reason: 'capacity',
          teamCount: teams.length,
          maxTeams: MAX_TEAMS,
          message: capacityMessage(),
        }
      }

      // 새 팀 생성
      const memberNames = list.map((s) => s.name)
      const teamName = generateTeamName(teams.map((t) => t.name))
      const color = TEAM_COLORS[teams.length % TEAM_COLORS.length]
      const teamToken = randomUUID()
      const info = req.db
        .prepare('INSERT INTO teams (session_id, name, members, color, access_token) VALUES (?, ?, ?, ?, ?)')
        .run(session.id, teamName, JSON.stringify(memberNames), color, teamToken)
      const teamId = info.lastInsertRowid

      const insert = req.db.prepare(
        'INSERT INTO students (session_id, team_id, student_number, name) VALUES (?, ?, ?, ?)'
      )
      for (const s of list) insert.run(session.id, teamId, s.number, s.name)

      events.push(['student:registered', {
        studentNames: memberNames,
        team: { id: teamId, session_id: session.id, name: teamName, members: memberNames, color },
      }])

      return { sessionId: session.id, teamId, teamToken, alreadyRegistered: false }
    })()
  } catch (err) {
    if (err instanceof InputError) return sendInputError(res, err)
    // 같은 학번이 동시에 두 번 들어와 유니크 인덱스에 걸린 경우
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: '같은 학번이 방금 등록되었습니다. 다시 시도해주세요.', reason: 'conflict' })
    }
    throw err
  }

  for (const [event, payload] of events) {
    req.io?.to(`session:${outcome.sessionId}:teacher`).emit(event, payload)
  }
  res.json(outcome)
})

// GET /api/session/latest/teams?teacherCode=... — 해당 수업의 팀 목록
// teacherCode를 주면 그 수업으로 한정한다. 생략하면 (하위 호환) 전역 최신 활성 세션.
// 무인증이므로 팀원 실명은 "김○○"처럼 가린다. 교사 토큰(그 수업에 접근 가능한)이 있으면 실명을 준다.
router.get('/latest/teams', (req, res) => {
  const teacherCode = typeof req.query.teacherCode === 'string' ? req.query.teacherCode : null
  const session = teacherCode
    ? req.db
        .prepare("SELECT id FROM sessions WHERE teacher_code = ? AND status != 'ended' ORDER BY created_at DESC LIMIT 1")
        .get(teacherCode)
    : req.db
        .prepare("SELECT id FROM sessions WHERE status != 'ended' ORDER BY created_at DESC LIMIT 1")
        .get()
  if (!session) return res.status(404).json({ error: '활성 수업 없음' })

  const auth = getTeacherAuth(req.headers['x-teacher-token'])
  const showNames = canAccessSession(req.db, auth, session.id)

  const teams = req.db
    .prepare('SELECT id, session_id, name, members, color FROM teams WHERE session_id = ?')
    .all(session.id)

  res.json({
    sessionId: session.id,
    teams: teams.map((t) => {
      const members = parseMembers(t.members)
      return { ...t, members: showNames ? members : members.map(maskName) }
    }),
  })
})

// GET /api/session/:id/join-qr — 참여 화면 QR코드
// 학생이 휴대폰으로 스캔해 바로 들어오는 용도. 수업 코드를 쿼리에 담아
// 칠판에 적은 코드를 옮겨 적다 틀리는 일을 없앤다.
router.get('/:id/join-qr', requireTeacher, requireSessionAccess('id'), async (req, res, next) => {
  try {
    const session = req.db
      .prepare('SELECT teacher_code FROM sessions WHERE id = ?')
      .get(req.params.id)
    if (!session) return res.status(404).json({ error: '수업 없음' })

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http'
    const host = req.headers.host || 'localhost:4009'
    const url = `${protocol}://${host}/join?code=${encodeURIComponent(session.teacher_code)}`
    // 교실 뒤에서도 스캔되도록 넉넉한 크기와 높은 오류 정정 수준으로 만든다
    const qr = await QRCode.toDataURL(url, {
      width: 512,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
    res.json({ url, qr, teacherCode: session.teacher_code })
  } catch (err) {
    next(err)
  }
})

// GET /api/session/:id — 수업 정보 (무인증: 팀 화면·교사 화면이 상태 확인에 쓴다)
// 소유 토큰 해시 같은 내부 값은 내보내지 않는다.
// challengeStarted: 이 수업에서 챌린지를 한 번이라도 시작했는가 (교사 화면 새로고침 시 탭 복원용)
router.get('/:id', (req, res) => {
  const session = req.db
    .prepare('SELECT id, teacher_code, mode, status, session_number, created_at FROM sessions WHERE id = ?')
    .get(req.params.id)
  if (!session) return res.status(404).json({ error: '수업 없음' })

  let challengeStarted = false
  try {
    challengeStarted = !!req.db.prepare('SELECT 1 FROM active_challenges WHERE session_id = ?').get(session.id)
    if (!challengeStarted) {
      challengeStarted = !!req.db
        .prepare('SELECT 1 FROM attempts a JOIN teams t ON t.id = a.team_id WHERE t.session_id = ? LIMIT 1')
        .get(session.id)
    }
  } catch { /* 상태 조회 실패는 기본값(false)으로 */ }

  // 교사 토큰을 보냈으면 이 수업을 다룰 수 있는지도 알려 준다.
  // 교사 화면이 localStorage에 남은 수업(다른 탭·다른 연수 토큰이 만든 것)을 복원했다가
  // 모든 교사 API가 403이 되는 먹통 화면에 갇히지 않게 하려는 것이다.
  const body = { ...session, challengeStarted }
  if (req.headers['x-teacher-token']) {
    const auth = getTeacherAuth(req.headers['x-teacher-token'])
    body.canManage = canAccessSession(req.db, auth, session.id)
  }
  res.json(body)
})

export default router
