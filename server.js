import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

import routesSession from './src/api/session.js'
import routesChallenges from './src/api/challenges.js'
import routesAI from './src/api/ai.js'
import routesDashboard from './src/api/dashboard.js'
import { setApiKey, getApiKey, hasApiKey } from './src/api/apiKeyStore.js'
import { issueTeacherToken, isValidTeacherToken, requireTeacher, initTeacherAuth } from './src/api/teacherAuth.js'
import { getAuthorizedTeam } from './src/api/teamAuth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── DB 초기화 ────────────────────────────────────────────────────────────────
// 프로덕션: /data 볼륨 (배포해도 데이터 유지), 개발: ./db
const dbDir = fs.existsSync('/data') ? '/data' : join(__dirname, 'db')
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

const db = new Database(join(dbDir, 'vpython.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// 스키마 적용
const schema = fs.readFileSync(join(__dirname, 'db', 'schema.sql'), 'utf8')
db.exec(schema)

// 기존 DB 마이그레이션: 팀 접근 토큰 추가/보강
const teamColumns = db.prepare('PRAGMA table_info(teams)').all().map((c) => c.name)
if (!teamColumns.includes('access_token')) {
  db.prepare('ALTER TABLE teams ADD COLUMN access_token TEXT').run()
}
db.prepare("UPDATE teams SET access_token = lower(hex(randomblob(32))) WHERE access_token IS NULL OR access_token = ''").run()
db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_access_token ON teams(access_token)').run()

// 교사 인증 토큰 저장소 초기화 (teacher_tokens 테이블 보장 + 만료 토큰 정리)
initTeacherAuth(db)

// ── CORS 화이트리스트 ────────────────────────────────────────────────────────
const DEFAULT_ORIGINS = [
  'https://vpython-prompt-challenge.fly.dev',
  'http://localhost:3000',
  'http://localhost:4008',
  'http://localhost:4009',
  'http://localhost:5173',
]

// 교실 LAN 접속 허용 — 사설망(RFC1918) + 루프백 origin은 포트에 관계없이 통과시킨다.
const PRIVATE_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : DEFAULT_ORIGINS

const corsOptions = {
  origin(origin, callback) {
    // origin이 없는 경우: 같은 서버에서 서빙하는 경우 또는 서버 간 요청
    if (!origin || allowedOrigins.includes(origin) || PRIVATE_ORIGIN_RE.test(origin)) {
      callback(null, true)
    } else {
      console.warn(`[CORS] 차단된 요청: ${origin}`)
      callback(new Error('CORS 정책에 의해 차단됨'))
    }
  },
  credentials: true,
}

// ── 앱 설정 ──────────────────────────────────────────────────────────────────
const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: corsOptions,
})

app.use(cors(corsOptions))
app.use(express.json({ limit: '64kb' }))

// db와 io를 라우터에서 사용할 수 있도록 주입
app.use((req, res, next) => {
  req.db = db
  req.io = io
  next()
})

// ── 교사 PIN 인증 ────────────────────────────────────────────────────────────
// PIN은 환경변수에서만 읽는다. 기본값 '000000' 같은 약한 값을 쓰지 않도록 시작 시 강제 검증.
const TEACHER_PIN = process.env.TEACHER_PIN
if (!TEACHER_PIN || TEACHER_PIN.length < 6) {
  console.error('❌ TEACHER_PIN 환경 변수를 6자리 이상으로 설정해야 합니다.')
  console.error('   예: .env 파일에 TEACHER_PIN=123456 추가 후 재시작')
  process.exit(1)
}

app.post('/api/auth/teacher', (req, res) => {
  const { pin } = req.body
  if (pin === TEACHER_PIN) {
    const token = issueTeacherToken()
    res.json({ ok: true, token })
  } else {
    res.status(401).json({ error: '인증 코드가 올바르지 않습니다' })
  }
})

// 토큰 유효성 확인 — 교사 화면이 마운트 시 실제 인증 상태를 검증하는 용도
app.get('/api/auth/verify', requireTeacher, (req, res) => {
  res.json({ ok: true })
})

// ── API 키 설정 (교사가 UI에서 입력) ─────────────────────────────────────────
app.post('/api/config/apikey', requireTeacher, async (req, res) => {
  const { apiKey } = req.body
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'API 키를 입력해주세요' })
  }

  // 키 유효성 검증: 실제 API 호출 테스트
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const testClient = new Anthropic({ apiKey: apiKey.trim() })
    await testClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }],
    })
    setApiKey(apiKey.trim())
    res.json({ ok: true, message: 'API 키가 설정되었습니다' })
  } catch (err) {
    console.error('[API Key 검증 실패]', err.message)
    if (err.status === 401 || err.message?.includes('auth')) {
      return res.status(401).json({ error: '유효하지 않은 API 키입니다. 키를 확인해주세요.' })
    }
    // 네트워크 오류 등 — 키 자체는 저장하되 경고
    setApiKey(apiKey.trim())
    res.json({ ok: true, warning: '키를 저장했지만 검증 중 오류가 발생했습니다: ' + err.message })
  }
})

app.get('/api/config/apikey/status', (req, res) => {
  res.json({ configured: hasApiKey() })
})

// ── 라우터 ──────────────────────────────────────────────────────────────────
app.use('/api/session', routesSession)
app.use('/api/challenges', routesChallenges)
app.use('/api', routesAI)
app.use('/api', routesDashboard)

// 팀 단건 조회 (팀 화면 초기 로드용)
app.get('/api/team/:teamId', (req, res) => {
  const teacherAuthed = isValidTeacherToken(req.headers['x-teacher-token'])
  const teamAuthed = getAuthorizedTeam(req, req.params.teamId)
  if (!teacherAuthed && !teamAuthed) {
    return res.status(401).json({ error: '팀 인증이 필요합니다. QR 코드 또는 등록 화면에서 다시 입장해주세요.' })
  }

  const team = db
    .prepare('SELECT id, session_id, name, members, color FROM teams WHERE id = ?')
    .get(req.params.teamId)
  if (!team) return res.status(404).json({ error: '팀 없음' })
  res.json({ ...team, members: JSON.parse(team.members) })
})

// 서버 IP (학생 접속용 QR 생성)
app.get('/api/network/ip', async (req, res) => {
  const { networkInterfaces } = await import('os')
  const nets = networkInterfaces()
  let ip = 'localhost'
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ip = addr.address
        break
      }
    }
  }
  res.json({ ip })
})

// ── 세션별 활성 챌린지 추적 ──────────────────────────────────────────────────
// 인메모리 맵은 캐시일 뿐이고, 진실의 원천은 active_challenges 테이블이다.
// 서버가 죽었다 살아나도 DB에서 상태를 복원하고 자동 종료 타이머를 다시 건다.
const activeChallenge = {} // { sessionId: { challengeId, timeLimit, startedAt } }
const challengeTimers = {} // { sessionId: setTimeout ID }

// 배포본 /data 볼륨의 기존 DB에는 이 테이블이 없을 수 있으므로 여기서도 멱등 실행한다.
db.exec(`
  CREATE TABLE IF NOT EXISTS active_challenges (
    session_id   TEXT PRIMARY KEY,
    challenge_id TEXT,
    time_limit   INTEGER,
    started_at   INTEGER
  )
`)

const upsertActiveChallengeStmt = db.prepare(`
  INSERT INTO active_challenges (session_id, challenge_id, time_limit, started_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(session_id) DO UPDATE SET
    challenge_id = excluded.challenge_id,
    time_limit   = excluded.time_limit,
    started_at   = excluded.started_at
`)
const deleteActiveChallengeStmt = db.prepare('DELETE FROM active_challenges WHERE session_id = ?')
const selectActiveChallengeStmt = db.prepare('SELECT * FROM active_challenges WHERE session_id = ?')
const selectAllActiveChallengesStmt = db.prepare('SELECT * FROM active_challenges')

// 챌린지 시작 상태를 캐시 + DB에 함께 기록
function persistActiveChallenge(sessionId, data) {
  activeChallenge[sessionId] = data
  try {
    upsertActiveChallengeStmt.run(sessionId, data.challengeId, data.timeLimit || 0, data.startedAt)
  } catch (err) {
    console.error(`[ActiveChallenge] 저장 실패: session=${sessionId}`, err.message)
  }
}

// 챌린지 종료 — 캐시·타이머·DB 레코드를 모두 정리
function clearActiveChallenge(sessionId) {
  if (challengeTimers[sessionId]) {
    clearTimeout(challengeTimers[sessionId])
    delete challengeTimers[sessionId]
  }
  delete activeChallenge[sessionId]
  try {
    deleteActiveChallengeStmt.run(sessionId)
  } catch (err) {
    console.error(`[ActiveChallenge] 삭제 실패: session=${sessionId}`, err.message)
  }
}

// 캐시에 없으면 DB에서 읽어 채운다 (DB가 진실의 원천)
function getActiveChallenge(sessionId) {
  if (activeChallenge[sessionId]) return activeChallenge[sessionId]
  try {
    const row = selectActiveChallengeStmt.get(sessionId)
    if (!row) return null
    const restored = {
      challengeId: row.challenge_id,
      timeLimit: row.time_limit || 0,
      startedAt: row.started_at,
    }
    activeChallenge[sessionId] = restored
    return restored
  } catch (err) {
    console.error(`[ActiveChallenge] 조회 실패: session=${sessionId}`, err.message)
    return null
  }
}

// 남은 시간(ms)만큼 자동 종료 타이머를 건다
function scheduleChallengeTimeout(sessionId, remainingMs) {
  if (challengeTimers[sessionId]) clearTimeout(challengeTimers[sessionId])
  challengeTimers[sessionId] = setTimeout(() => {
    clearActiveChallenge(sessionId)
    io.to(`session:${sessionId}`).emit('challenge:ended', { autoEnded: true })
    console.log(`[Timer] 자동 종료: session=${sessionId}`)
  }, remainingMs)
}

// ── 서버 기동 시 진행 중 챌린지 복구 ─────────────────────────────────────────
// 재시작 전에 진행 중이던 챌린지를 되살리고, 경과 시간을 뺀 만큼 타이머를 다시 건다.
function restoreActiveChallenges() {
  let rows = []
  try {
    rows = selectAllActiveChallengesStmt.all()
  } catch (err) {
    console.error('[Restore] active_challenges 조회 실패', err.message)
    return
  }
  if (rows.length === 0) return

  let restored = 0
  let expired = 0
  let dropped = 0

  for (const row of rows) {
    const sessionId = row.session_id
    const session = db.prepare('SELECT status FROM sessions WHERE id = ?').get(sessionId)

    // 이미 종료된(또는 사라진) 수업의 레코드는 그냥 버린다
    if (!session || session.status === 'ended') {
      clearActiveChallenge(sessionId)
      dropped += 1
      continue
    }

    const timeLimit = row.time_limit || 0
    const startedAt = row.started_at || Date.now()
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000)
    const remainingSec = timeLimit > 0 ? timeLimit - elapsedSec : 0

    // 시간제한이 있는데 이미 지난 챌린지는 즉시 종료 처리
    if (timeLimit > 0 && remainingSec <= 0) {
      clearActiveChallenge(sessionId)
      io.to(`session:${sessionId}`).emit('challenge:ended', { autoEnded: true })
      expired += 1
      console.log(`[Restore] 만료된 챌린지 정리: session=${sessionId}, challenge=${row.challenge_id}`)
      continue
    }

    activeChallenge[sessionId] = { challengeId: row.challenge_id, timeLimit, startedAt }
    if (timeLimit > 0) scheduleChallengeTimeout(sessionId, remainingSec * 1000)
    restored += 1
    console.log(
      `[Restore] 챌린지 복구: session=${sessionId}, challenge=${row.challenge_id}, 남은시간=${timeLimit > 0 ? `${remainingSec}초` : '무제한'}`
    )
  }

  console.log(`[Restore] 복구 ${restored}건 / 만료정리 ${expired}건 / 폐기 ${dropped}건`)
}

// ── Socket.io 이벤트 ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] 접속: ${socket.id}`)

  // 교사 소켓 인증 — 클라이언트가 연결 직후 token을 전달하면 socket.data.isTeacher 마킹.
  // 인증보다 teacher:join이 먼저 도착할 수 있는 타이밍 경합을 방어하기 위해,
  // 인증 전 teacher:join이 있었다면 여기서 소급 적용한다.
  // 진행 중인 챌린지를 해당 소켓에만 다시 전달 (재접속·새로고침 복구용)
  const replayActiveChallenge = (sessionId) => {
    // 캐시가 비었으면 DB에서 복원해서 쓴다 (재시작 직후 재접속 대비)
    const ac = getActiveChallenge(sessionId)
    if (!ac) return
    let remaining = ac.timeLimit || 0
    if (ac.timeLimit > 0 && ac.startedAt) {
      remaining = Math.max(0, ac.timeLimit - Math.floor((Date.now() - ac.startedAt) / 1000))
    }
    socket.emit('challenge:started', {
      challengeId: ac.challengeId,
      timeLimit: remaining,
      startedAt: ac.startedAt,
      resumed: true,
    })
  }

  socket.on('auth:teacher', ({ token }) => {
    socket.data.isTeacher = isValidTeacherToken(token)
    if (socket.data.isTeacher) {
      socket.emit('auth:teacher:ack', { ok: true })
      const pending = socket.data.pendingTeacherJoin
      if (pending?.sessionId) {
        socket.join(`session:${pending.sessionId}:teacher`)
        socket.join(`session:${pending.sessionId}`)
        socket.data.pendingTeacherJoin = null
        console.log(`[Socket] 교사 입장(지연): session=${pending.sessionId}`)
        replayActiveChallenge(pending.sessionId)
      }
    } else {
      socket.emit('auth:teacher:ack', { ok: false, error: '인증 만료' })
    }
  })

  // 교사 전용 이벤트 가드 (socket.data.isTeacher 미설정 시 거부)
  // 클라이언트가 ack 콜백을 넘긴 경우 조용히 무시하지 않고 실패 사유를 되돌려준다.
  const teacherOnly = (handler) => (payload, ack) => {
    if (!socket.data?.isTeacher) {
      console.warn(`[Socket] 교사 권한 없음: ${socket.id}`)
      if (typeof ack === 'function') ack({ ok: false, error: '인증 만료', authExpired: true })
      return
    }
    handler(payload, ack)
  }

  // 교사가 세션 방에 입장
  // 아직 auth:teacher가 도착하지 않은 상태라면 payload를 보류하고,
  // 인증이 성공하면 auth:teacher 핸들러에서 소급 처리한다.
  socket.on('teacher:join', ({ sessionId }) => {
    if (!sessionId) return
    if (!socket.data?.isTeacher) {
      socket.data.pendingTeacherJoin = { sessionId }
      return
    }
    socket.join(`session:${sessionId}:teacher`)
    socket.join(`session:${sessionId}`)
    console.log(`[Socket] 교사 입장: session=${sessionId}`)
    // 팀 화면과 동일하게, 진행 중인 챌린지가 있으면 남은 시간과 함께 상태를 복구시킨다.
    replayActiveChallenge(sessionId)
  })

  // 팀이 세션 방에 입장
  socket.on('team:join', ({ sessionId, teamId }) => {
    socket.join(`session:${sessionId}`)
    socket.join(`session:${sessionId}:team:${teamId}`)
    console.log(`[Socket] 팀 입장: session=${sessionId}, team=${teamId}`)

    // 현재 진행 중인 챌린지가 있으면 남은 시간 계산하여 전달
    replayActiveChallenge(sessionId)
  })

  // 교사 → 전체: 챌린지 시작
  socket.on('challenge:start', teacherOnly(({ sessionId, challengeId, timeLimit }, ack) => {
    // 이미 종료된 수업에서는 새 챌린지를 시작할 수 없다
    // (학생 화면은 열려도 제출이 전부 401로 막히기 때문)
    const session = db.prepare('SELECT status FROM sessions WHERE id = ?').get(sessionId)
    if (!session) {
      if (typeof ack === 'function') ack({ ok: false, error: '수업을 찾을 수 없습니다' })
      return
    }
    if (session.status === 'ended') {
      if (typeof ack === 'function') {
        ack({ ok: false, error: '이미 종료된 수업입니다. 새 수업을 시작해주세요.', sessionEnded: true })
      }
      return
    }

    const startedAt = Date.now()
    // 캐시 + DB에 기록 — 서버가 재시작돼도 이 레코드로 복구된다
    persistActiveChallenge(sessionId, { challengeId, timeLimit, startedAt })
    io.to(`session:${sessionId}`).emit('challenge:started', { challengeId, timeLimit, startedAt })
    if (typeof ack === 'function') ack({ ok: true, startedAt })

    // 기존 타이머 정리
    if (challengeTimers[sessionId]) clearTimeout(challengeTimers[sessionId])

    // 타이머 설정 시 자동 종료
    if (timeLimit && timeLimit > 0) {
      scheduleChallengeTimeout(sessionId, timeLimit * 1000)
    }
  }))

  // 교사 → 전체: 챌린지 종료 (제출 마감)
  socket.on('challenge:end', teacherOnly(({ sessionId }) => {
    // 자동 종료 타이머 + 캐시 + DB 레코드 정리
    clearActiveChallenge(sessionId)
    io.to(`session:${sessionId}`).emit('challenge:ended', {})
  }))

  // 교사 → 전체: 힌트 공개
  socket.on('challenge:hint', teacherOnly(({ sessionId, hint }) => {
    io.to(`session:${sessionId}`).emit('challenge:hint', { hint })
  }))

  // 교사 → 전체: 결과 공개
  socket.on('challenge:reveal', teacherOnly(({ sessionId, challengeId }) => {
    clearActiveChallenge(sessionId)
    let rankings

    // 윈도우 함수로 팀별 best attempt의 전체 row(prompt, generated_code)를 정확히 집어온다.
    // 기존 MAX(score) + 비집계 컬럼 방식은 SQLite가 임의 row를 골라 점수와 프롬프트가 어긋나는 이슈가 있었음.
    if (challengeId) {
      rankings = db
        .prepare(`
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
        `)
        .all(challengeId, sessionId)
    } else {
      rankings = db
        .prepare(`
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
        `)
        .all(sessionId)
    }

    io.to(`session:${sessionId}`).emit('result:revealed', { rankings })
  }))

  // 교사 → 전체: 전체 수업 종료
  socket.on('session:final-end', teacherOnly(({ sessionId }) => {
    console.log(`[Session] 최종 종료 요청: session=${sessionId}`)

    try {
      // 진행 중인 챌린지/타이머/DB 레코드 정리
      clearActiveChallenge(sessionId)

      // 종합 결과 계산
      const teams = db.prepare('SELECT * FROM teams WHERE session_id = ?').all(sessionId)
      const challenges = db.prepare(`
        SELECT DISTINCT a.challenge_id
        FROM attempts a JOIN teams t ON t.id = a.team_id
        WHERE t.session_id = ?
      `).all(sessionId)

      console.log(`[Session] 결과 계산: ${teams.length}팀, ${challenges.length}챌린지`)

      const results = teams.map(team => {
        let totalScore = 0
        const challengeResults = []

        for (const { challenge_id } of challenges) {
          const best = db.prepare(`
            SELECT prompt, score, evaluation, generated_code
            FROM attempts
            WHERE team_id = ? AND challenge_id = ?
            ORDER BY score DESC LIMIT 1
          `).get(team.id, challenge_id)

          if (best) {
            totalScore += best.score
            let evalData = {}
            try { evalData = JSON.parse(best.evaluation || '{}') } catch {}
            challengeResults.push({
              challengeId: challenge_id,
              score: best.score,
              prompt: best.prompt,
              feedback: evalData.feedback || '',
              strengths: evalData.strengths || [],
            })
          } else {
            challengeResults.push({
              challengeId: challenge_id,
              score: 0,
              prompt: '',
              feedback: '',
              strengths: [],
            })
          }
        }

        return {
          teamId: team.id,
          teamName: team.name,
          teamColor: team.color,
          members: JSON.parse(team.members),
          totalScore,
          challengeResults,
        }
      })

      results.sort((a, b) => b.totalScore - a.totalScore)

      io.to(`session:${sessionId}`).emit('session:final-ended', {
        rankings: results,
        challengeCount: challenges.length,
      })

      // DB 세션 상태를 ended로 업데이트 (같은 수업코드 재사용 시 새 세션 분리)
      db.prepare("UPDATE sessions SET status = 'ended' WHERE id = ?").run(sessionId)

      // 학생 화면도 챌린지 종료 + 세션 종료 처리
      io.to(`session:${sessionId}`).emit('challenge:ended', {})
      io.to(`session:${sessionId}`).emit('session:ended', {})

      console.log(`[Session] 최종 종료 완료: session=${sessionId}, ${teams.length}팀, ${challenges.length}챌린지`)
    } catch (err) {
      console.error(`[Session] 최종 종료 에러: session=${sessionId}`, err)
    }
  }))

  // 팀 → 서버: 점수 업데이트 (AI 평가 후)
  socket.on('team:score-update', ({ sessionId, teamId, score, evaluation }) => {
    io.to(`session:${sessionId}:teacher`).emit('team:submitted', {
      teamId,
      score,
      evaluation,
    })
    io.to(`session:${sessionId}`).emit('dashboard:update', {})
  })

  // ── 채팅 ──────────────────────────────────────────────────────────────────
  // 전체 채팅
  socket.on('chat:all', ({ sessionId, teamName, teamColor, sender, message }) => {
    io.to(`session:${sessionId}`).emit('chat:all', {
      teamName, teamColor, sender, message,
      timestamp: Date.now(),
    })
  })

  // 팀 채팅
  socket.on('chat:team', ({ sessionId, teamId, sender, message }) => {
    io.to(`session:${sessionId}:team:${teamId}`).emit('chat:team', {
      sender, message,
      timestamp: Date.now(),
    })
  })

  socket.on('disconnect', () => {
    console.log(`[Socket] 해제: ${socket.id}`)
  })
})

// ── 개인정보 처리방침 (서버사이드 HTML) ──────────────────────────────────────
app.get('/api/privacy', (req, res) => {
  res.json({
    title: '개인정보 처리방침',
    lastUpdated: '2026-03-12',
    content: {
      purpose: '학생 식별, 팀 구성, 학습 진행 추적, AI 채점',
      collected: '학번, 이름, 프롬프트, 생성 코드, CT 점수, 평가 결과',
      retention: '해당 수업 종료 후 학기말 파기',
      ai: 'Claude API를 통해 프롬프트와 코드가 처리됩니다. 학생의 이름·학번은 API로 전송되지 않으며, 서비스 운영을 위한 기술적 처리 목적으로만 사용됩니다.',
      officer: '석리송 (당곡고등학교 정보과 교사)',
      access: '열람·삭제 요청은 담당 교사에게 직접 요청하시기 바랍니다.',
    },
  })
})

// ── 헬스체크 ────────────────────────────────────────────────────────────────
// Fly.io 프록시가 이 엔드포인트로 준비 상태를 확인한다. 이게 없으면 재시작 직후
// Node가 뜨기 전에 프록시가 요청을 넘겨 학생 화면이 몇 초간 502를 받는다.
// 인증 없이 접근 가능하되 내부 상태는 노출하지 않는다.
app.get('/api/health', (req, res) => {
  try {
    // DB가 실제로 응답하는지까지 확인해야 "포트만 열린" 상태를 통과시키지 않는다
    db.prepare('SELECT 1').get()
    res.json({ ok: true })
  } catch (e) {
    console.error('[Health] DB 응답 실패:', e.message)
    res.status(503).json({ ok: false })
  }
})

// ── 프로덕션: React 빌드 파일 서빙 ──────────────────────────────────────────
const distDir = join(__dirname, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  // SPA 라우팅 — /api 제외한 모든 경로를 index.html로
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(join(distDir, 'index.html'))
  })
  console.log('📦 프로덕션 모드: dist/ 서빙 중')
}

// ── 서버 시작 ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4009

// 리스닝 전에 진행 중이던 챌린지를 복구해, 재접속하는 팀이 곧바로 리플레이를 받게 한다
restoreActiveChallenges()

httpServer.listen(PORT, '0.0.0.0', () => {
  const isProd = fs.existsSync(distDir)
  console.log(`\n🚀 VPython 프롬프트 챌린지 서버`)
  if (isProd) {
    console.log(`   앱      → http://localhost:${PORT}`)
  } else {
    console.log(`   Express  → http://localhost:${PORT}`)
    console.log(`   React    → http://localhost:4008`)
  }
  console.log(`   DB       → ${join(dbDir, 'vpython.db')}\n`)
})

export { db }
