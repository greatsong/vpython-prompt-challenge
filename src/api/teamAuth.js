import { timingSafeEqual } from 'crypto'

function safeEqual(a, b) {
  if (!a || !b) return false
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function getTeamToken(req) {
  return req.headers['x-team-token'] || req.query.teamToken || req.body?.teamToken || null
}

export function sanitizeTeam(team) {
  if (!team) return team
  const { access_token, ...safeTeam } = team
  return safeTeam
}

export function getAuthorizedTeam(req, teamId = req.body?.teamId || req.query?.teamId) {
  const token = getTeamToken(req)
  if (!teamId || !token) return null

  const team = req.db
    .prepare(`
      SELECT t.*, s.status AS session_status
      FROM teams t
      JOIN sessions s ON s.id = t.session_id
      WHERE t.id = ?
    `)
    .get(teamId)

  if (!team || team.session_status === 'ended') return null
  if (!safeEqual(token, team.access_token)) return null
  return team
}

export function requireTeam(req, res, next) {
  const team = getAuthorizedTeam(req)
  if (!team) {
    return res.status(401).json({ error: '팀 인증이 필요합니다. QR 코드 또는 등록 화면에서 다시 입장해주세요.' })
  }
  req.team = team
  next()
}
