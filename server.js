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
import routesDashboard, { queryRankings } from './src/api/dashboard.js'
import { setApiKey, getApiKey, hasApiKey } from './src/api/apiKeyStore.js'
import QRCode from 'qrcode'
import {
  issueTeacherToken,
  getTeacherAuth,
  canAccessSession,
  canAccessTeam,
  requireTeacher,
  requireAdminTeacher,
  initTeacherAuth,
  revokeTrainingTokens,
  safeEqual,
  clientIp,
  createFailureLimiter,
  sendTooManyAttempts,
  traineeOwnerKey,
  TRAINING_FAIL_LIMIT,
  SCOPE_ADMIN,
  SCOPE_TRAINING,
} from './src/api/teacherAuth.js'
import { getAuthorizedTeam, findTeamByToken } from './src/api/teamAuth.js'
import { hasEvaluationSecret } from './src/api/evaluationProof.js'
import { migrateDb } from './src/api/migrate.js'
import { getChallenge } from './src/server-data/challenges.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 최후 방어선 ──────────────────────────────────────────────────────────────
// 처리하지 못한 예외 하나로 수업 중 서버 전체가 내려가지 않도록 로그만 남긴다.
// (각 소켓 핸들러·라우트는 자체적으로 예외를 잡는다. 여기까지 오면 버그이므로 로그를 꼭 확인할 것)
process.on('uncaughtException', (err) => {
  console.error('[Process] 처리되지 않은 예외 — 서버는 계속 동작합니다:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[Process] 처리되지 않은 Promise 거부 — 서버는 계속 동작합니다:', reason)
})

// ── DB 초기화 ────────────────────────────────────────────────────────────────
// 프로덕션: /data 볼륨 (배포해도 데이터 유지), 개발: ./db
// DB_PATH를 주면 그 파일을 쓴다 (테스트가 운영·개발 DB를 건드리지 않게 하려는 용도)
const dbDir = fs.existsSync('/data') ? '/data' : join(__dirname, 'db')
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
const dbPath = process.env.DB_PATH || join(dbDir, 'vpython.db')

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// 스키마 적용
const schema = fs.readFileSync(join(__dirname, 'db', 'schema.sql'), 'utf8')
db.exec(schema)

// 기존 DB 마이그레이션: 팀 접근 토큰, 챌린지 마감 시각, 증명 id, 수업 소유자 (src/api/migrate.js)
migrateDb(db)

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
  // 소켓 메시지는 채팅·제어 신호뿐이다. 큰 payload로 메모리를 쓰지 못하게 100KB로 묶는다(기본 1MB)
  maxHttpBufferSize: 100 * 1024,
})

// CORS는 API에만 건다. 정적 파일(/lib/glowscript/*, dist)까지 검사하면 sandbox iframe처럼
// Origin: null로 오는 요청이 403이 되어 3D 라이브러리를 못 불러왔다. (socket.io는 io의 cors 설정을 쓴다)
app.use('/api', cors(corsOptions))
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

// 평가 증명·생성 코드 서명 비밀값. 예전에는 없으면 PIN으로 대신했지만 이제는 필수다.
if (!hasEvaluationSecret()) {
  console.error('❌ EVALUATION_SECRET 환경 변수를 설정해야 합니다 (점수 증명·생성 코드 서명용 비밀값).')
  console.error('   예: .env 파일에 EVALUATION_SECRET=<길고 무작위한 문자열> 추가 후 재시작')
  process.exit(1)
}

// 무차별 대입 방지 — IP당 1분에 10회 실패하면 429. PIN과 연수 코드는 카운터를 따로 둔다.
const pinLimiter = createFailureLimiter('교사 PIN')
const trainingLimiter = createFailureLimiter('연수 입장 코드', TRAINING_FAIL_LIMIT)

app.post('/api/auth/teacher', (req, res) => {
  const ip = clientIp(req)
  const wait = pinLimiter.blockedFor(ip)
  if (wait) return sendTooManyAttempts(res, wait)

  const { pin } = req.body || {}
  if (safeEqual(typeof pin === 'string' ? pin : '', TEACHER_PIN)) {
    const token = issueTeacherToken(SCOPE_ADMIN)
    res.json({ ok: true, token, scope: SCOPE_ADMIN })
  } else {
    pinLimiter.recordFailure(ip)
    res.status(401).json({ error: '인증 코드가 올바르지 않습니다' })
  }
})

// ── 교사 연수 입장 ───────────────────────────────────────────────────────────
// 운영 PIN과 별도인 연수용 입장 코드. 비워 두면 연수 입장은 닫힌다.
// 연수 토큰(scope: 'training')은 API 키 설정·교체만 막고 나머지 교사 기능은 모두 쓸 수 있다.
const TRAINING_CODE = (process.env.TRAINING_CODE || '').trim()
if (TRAINING_CODE) {
  console.log('🎓 연수 입장 열림 (/training)')
} else {
  // 연수가 끝나 코드를 비우고 재시작하면 남아 있던 연수 토큰도 함께 무효화한다
  const revoked = revokeTrainingTokens()
  if (revoked > 0) console.log(`🎓 연수 입장 닫힘 — 남은 연수 토큰 ${revoked}개 무효화`)
}

app.post('/api/auth/training', (req, res) => {
  if (!TRAINING_CODE) {
    return res.status(403).json({ error: '연수 입장이 닫혀 있습니다', closed: true })
  }
  const ip = clientIp(req)
  const wait = trainingLimiter.blockedFor(ip)
  if (wait) return sendTooManyAttempts(res, wait)

  const { code, traineeId } = req.body || {}
  if (safeEqual(typeof code === 'string' ? code.trim() : '', TRAINING_CODE)) {
    // traineeId(선택): 브라우저가 보관하는 참가자 id. 있으면 그 해시를 수업 소유 키로 써서
    // 탭을 닫았다 다시 들어와도(새 토큰) 같은 수업코드로 자기 수업을 이어간다. 형식이 틀리면 무시한다.
    const ownerKey = traineeOwnerKey(traineeId)
    const token = issueTeacherToken(SCOPE_TRAINING, { ownerKey })
    res.json({ ok: true, token, scope: SCOPE_TRAINING, ownerKeyed: !!ownerKey })
  } else {
    trainingLimiter.recordFailure(ip)
    res.status(401).json({ error: '입장 코드가 올바르지 않습니다' })
  }
})

// 연수 입장 QR — 운영 PIN 토큰만. /training?code=… 링크를 담은 PNG를 돌려준다.
// ?origin=https://예시.fly.dev 로 링크의 주소를 바꿀 수 있다(로컬에서 만들어 배포 주소로 안내할 때).
app.get('/api/auth/training/qr', requireAdminTeacher, async (req, res) => {
  if (!TRAINING_CODE) {
    return res.status(404).json({ error: '연수 입장 코드(TRAINING_CODE)가 설정되어 있지 않습니다' })
  }
  let origin
  if (req.query.origin) {
    try {
      const u = new URL(String(req.query.origin))
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol')
      origin = u.origin
    } catch {
      return res.status(400).json({ error: 'origin은 http(s) 주소여야 합니다' })
    }
  } else {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http'
    const host = req.headers.host || 'localhost:4009'
    origin = `${protocol}://${host}`
  }
  const url = `${origin}/training?code=${encodeURIComponent(TRAINING_CODE)}`
  const png = await QRCode.toBuffer(url, {
    type: 'png',
    width: 512,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })
  res.set('Content-Type', 'image/png')
  res.set('Cache-Control', 'no-store')
  res.set('X-Training-Url', encodeURI(url))
  res.send(png)
})

// 토큰 유효성 확인 — 교사 화면이 마운트 시 실제 인증 상태를 검증하는 용도.
// scope로 운영('admin')·연수('training') 토큰을 구분해 화면을 맞춘다.
app.get('/api/auth/verify', requireTeacher, (req, res) => {
  res.json({ ok: true, scope: req.teacherScope })
})

// ── API 키 설정 (교사가 UI에서 입력) ─────────────────────────────────────────
// 연수 토큰으로는 바꿀 수 없다 (운영자가 설정한 키를 그대로 사용).
app.post('/api/config/apikey', requireAdminTeacher, async (req, res) => {
  const { apiKey } = req.body || {}
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    return res.status(400).json({ error: 'API 키를 입력해주세요' })
  }

  // 키 유효성 검증: 실제 API 호출 테스트
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const testClient = new Anthropic({ apiKey: apiKey.trim() })
    // Haiku 5.5는 thinking을 생략하면 adaptive로 켜지고, 생각 토큰도 max_tokens에 들어간다.
    // 키 확인용 10토큰 호출이 생각에 다 쓰이지 않도록 thinking을 끈다
    // (Haiku 5.5의 disabled는 effort high 이하에서 허용되며, 기본 effort는 medium이다).
    await testClient.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 10,
      thinking: { type: 'disabled' },
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
  // 교사 토큰은 그 팀의 수업에 접근할 수 있을 때만 인정한다 (연수 토큰은 자기 수업만)
  const teacherAuth = getTeacherAuth(req.headers['x-teacher-token'])
  const teacherAuthed = !!teacherAuth && canAccessTeam(db, teacherAuth, req.params.teamId)
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
// 마감하면 행을 지우지 않고 ended_at을 남긴다 — 팀 경로 API(src/api/challengeState.js)가
// "지금 진행 중인가"와 "마감 직후 유예 안인가"를 이 값으로 판정한다.
const activeChallenge = {} // { sessionId: { challengeId, timeLimit, startedAt } } — 진행 중인 것만
const challengeTimers = {} // { sessionId: setTimeout ID }

const upsertActiveChallengeStmt = db.prepare(`
  INSERT INTO active_challenges (session_id, challenge_id, time_limit, started_at, ended_at)
  VALUES (?, ?, ?, ?, NULL)
  ON CONFLICT(session_id) DO UPDATE SET
    challenge_id = excluded.challenge_id,
    time_limit   = excluded.time_limit,
    started_at   = excluded.started_at,
    ended_at     = NULL
`)
const markChallengeEndedStmt = db.prepare(
  'UPDATE active_challenges SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL'
)
const selectActiveChallengeStmt = db.prepare(
  'SELECT * FROM active_challenges WHERE session_id = ? AND ended_at IS NULL'
)
const selectAllActiveChallengesStmt = db.prepare('SELECT * FROM active_challenges WHERE ended_at IS NULL')
// 라운드 이력 — 같은 챌린지를 다시 내도 이번 라운드 제출만 순위에 넣는다 (dashboard.js queryRankings)
const insertRoundStmt = db.prepare(
  'INSERT INTO challenge_rounds (session_id, challenge_id, started_at) VALUES (?, ?, ?)'
)
const endOpenRoundsStmt = db.prepare(
  'UPDATE challenge_rounds SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL'
)

// 챌린지 시작 상태를 캐시 + DB에 함께 기록
function persistActiveChallenge(sessionId, data) {
  activeChallenge[sessionId] = data
  try {
    db.transaction(() => {
      // 앞 라운드가 열려 있었으면 새 라운드 시작 시각으로 닫는다
      endOpenRoundsStmt.run(data.startedAt, String(sessionId))
      insertRoundStmt.run(String(sessionId), data.challengeId, data.startedAt)
      upsertActiveChallengeStmt.run(String(sessionId), data.challengeId, data.timeLimit || 0, data.startedAt)
    })()
  } catch (err) {
    console.error(`[ActiveChallenge] 저장 실패: session=${sessionId}`, err.message)
  }
}

// 챌린지 마감 — 캐시·타이머를 정리하고 DB에 마감 시각을 남긴다.
// 진행 중이던 챌린지가 있었으면 true (이미 마감됐으면 false — 여러 번 불러도 안전하다)
function endActiveChallenge(sessionId, endedAt = Date.now()) {
  if (challengeTimers[sessionId]) {
    clearTimeout(challengeTimers[sessionId])
    delete challengeTimers[sessionId]
  }
  const hadCache = !!activeChallenge[sessionId]
  delete activeChallenge[sessionId]
  try {
    const changed = markChallengeEndedStmt.run(endedAt, String(sessionId)).changes > 0
    endOpenRoundsStmt.run(endedAt, String(sessionId))
    return changed || hadCache
  } catch (err) {
    console.error(`[ActiveChallenge] 마감 기록 실패: session=${sessionId}`, err.message)
    return hadCache
  }
}

// 마감 + 방송을 한 곳에서 — 진행 중이었을 때만 challenge:ended를 보낸다.
// 교사 종료·결과 공개·타이머 만료가 겹쳐도 학생 화면에 종료 이벤트가 한 번만 간다.
function closeChallenge(sessionId, payload = {}, endedAt = Date.now()) {
  const wasActive = endActiveChallenge(sessionId, endedAt)
  if (wasActive) io.to(`session:${sessionId}`).emit('challenge:ended', payload)
  return wasActive
}

// 캐시에 없으면 DB에서 읽어 채운다 (DB가 진실의 원천)
// 제한 시간이 이미 지났는데 타이머가 돌지 않은 경우(재시작 직후 등)는 여기서 마감 처리한다.
function getActiveChallenge(sessionId) {
  let ac = activeChallenge[sessionId]
  if (!ac) {
    try {
      const row = selectActiveChallengeStmt.get(String(sessionId))
      if (!row) return null
      ac = {
        challengeId: row.challenge_id,
        timeLimit: row.time_limit || 0,
        startedAt: row.started_at,
      }
      activeChallenge[sessionId] = ac
    } catch (err) {
      console.error(`[ActiveChallenge] 조회 실패: session=${sessionId}`, err.message)
      return null
    }
  }
  if (ac.timeLimit > 0 && ac.startedAt && Date.now() >= ac.startedAt + ac.timeLimit * 1000) {
    closeChallenge(sessionId, { autoEnded: true }, ac.startedAt + ac.timeLimit * 1000)
    return null
  }
  return ac
}

// 남은 시간(ms)만큼 자동 종료 타이머를 건다
function scheduleChallengeTimeout(sessionId, remainingMs) {
  if (challengeTimers[sessionId]) clearTimeout(challengeTimers[sessionId])
  challengeTimers[sessionId] = setTimeout(() => {
    try {
      delete challengeTimers[sessionId]
      if (closeChallenge(sessionId, { autoEnded: true })) console.log(`[Timer] 자동 종료: session=${sessionId}`)
    } catch (err) {
      console.error(`[Timer] 자동 종료 처리 실패: session=${sessionId}`, err)
    }
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

    // 이미 종료된(또는 사라진) 수업의 레코드는 마감 처리만 한다
    if (!session || session.status === 'ended') {
      endActiveChallenge(sessionId)
      dropped += 1
      continue
    }

    const timeLimit = row.time_limit || 0
    const startedAt = row.started_at || Date.now()
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000)
    const remainingSec = timeLimit > 0 ? timeLimit - elapsedSec : 0

    // 시간제한이 있는데 이미 지난 챌린지는 즉시 종료 처리
    if (timeLimit > 0 && remainingSec <= 0) {
      closeChallenge(sessionId, { autoEnded: true }, startedAt + timeLimit * 1000)
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
// 모든 핸들러는 on()으로 등록한다. on()은
//   1) payload가 객체가 아니면(없음·null·문자열·배열) 빈 객체로 바꾸고
//   2) 핸들러 예외를 잡아 로그 + ack({ ok:false })로 돌려준다.
// socket.io는 핸들러를 nextTick에서 부르므로, 여기서 잡지 않은 예외는 프로세스를 죽인다.
//
// 신원은 payload가 아니라 서버가 확인해 socket.data에 넣은 값으로만 판단한다.
//   - 교사: auth:teacher 또는 teacher:join의 token → socket.data.teacherToken (이벤트마다 재확인)
//   - 팀:   team:join의 teamId + teamToken → socket.data.teamId / sessionId / teamName …
//   - 관람자: team:join의 teamId === 'spectator' → socket.data.spectatorSessionId (읽기 + 채팅만)
const MAX_CHAT_LENGTH = 500
const MAX_HINT_LENGTH = 500
const CHAT_WINDOW_MS = 10 * 1000
const CHAT_LIMIT = 10 // 소켓당 10초에 10개
const TIME_LIMIT_MIN = 30
const TIME_LIMIT_MAX = 1800

const isId = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 100) || Number.isInteger(v)

function parseMembersSafe(json) {
  try {
    const v = JSON.parse(json || '[]')
    return Array.isArray(v) ? v.map((m) => (typeof m === 'string' ? m : m?.studentName || '')).filter(Boolean) : []
  } catch {
    return []
  }
}

io.on('connection', (socket) => {
  console.log(`[Socket] 접속: ${socket.id}`)

  const on = (event, handler) => {
    socket.on(event, (payload, ack) => {
      // emit('x', callback)처럼 payload 자리에 콜백만 온 경우
      if (typeof payload === 'function' && ack === undefined) {
        ack = payload
        payload = undefined
      }
      const reply = typeof ack === 'function' ? ack : null
      const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
      try {
        handler(data, reply)
      } catch (err) {
        console.error(`[Socket] ${event} 처리 중 오류: socket=${socket.id}`, err)
        try {
          reply?.({ ok: false, error: '서버 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' })
        } catch { /* ack 실패는 무시 */ }
      }
    })
  }

  // 진행 중인 챌린지를 해당 소켓에만 다시 전달 (재접속·새로고침 복구용)
  // 다시 보냈으면 true
  const replayActiveChallenge = (sessionId) => {
    // 캐시가 비었으면 DB에서 복원해서 쓴다 (재시작 직후 재접속 대비)
    const ac = getActiveChallenge(sessionId)
    if (!ac) return false
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
    return true
  }

  // 진행 중인 챌린지가 없는데 마지막 챌린지가 마감돼 있으면 마감 상태를 이 소켓에 알린다.
  // 연결이 끊긴 동안 교사가 마감하면 challenge:ended를 놓쳐, 재접속한 팀 화면이 계속 제출 가능 상태로 남았다.
  const replayEndedChallenge = (sessionId) => {
    const row = db
      .prepare('SELECT challenge_id, started_at, ended_at FROM active_challenges WHERE session_id = ? AND ended_at IS NOT NULL')
      .get(String(sessionId))
    // startedAt도 함께 보낸다 — 팀 화면이 이 라운드의 키로 저장해 둔 프롬프트·채점 결과를 복원한다
    if (row) socket.emit('challenge:ended', { resumed: true, challengeId: row.challenge_id, startedAt: row.started_at || null })
  }

  // 이 소켓이 들어가 있던 팀·관람 방에서 나온다 (같은 소켓으로 다른 팀·수업·관람으로 옮길 때)
  // 수업 공용 방까지 나오지 않으면 이전 수업의 시작·마감·결과 이벤트가 계속 들어왔다.
  const leaveCurrentRooms = (nextSessionId) => {
    const next = nextSessionId == null ? null : String(nextSessionId)
    // 교사로 들어가 있는 수업의 공용 방은 그대로 둔다
    const keep = (sid) => String(sid) === next || socket.data.teacherSessions?.has(String(sid))
    if (socket.data.teamId) {
      socket.leave(`session:${socket.data.sessionId}:team:${socket.data.teamId}`)
      if (!keep(socket.data.sessionId)) socket.leave(`session:${socket.data.sessionId}`)
    }
    if (socket.data.spectatorSessionId && !keep(socket.data.spectatorSessionId)) {
      socket.leave(`session:${socket.data.spectatorSessionId}`)
    }
    socket.data.teamId = null
    socket.data.sessionId = null
    socket.data.teamName = null
    socket.data.teamColor = null
    socket.data.teamMembers = null
    socket.data.spectatorSessionId = null
  }

  // ── 교사 인증 ──────────────────────────────────────────────────────────────
  // 토큰은 소켓에 보관하고 교사 이벤트마다 다시 확인한다(만료·폐기 반영 + 슬라이딩 연장).
  const currentTeacherAuth = () => {
    const auth = getTeacherAuth(socket.data.teacherToken)
    if (!auth) socket.data.isTeacher = false
    return auth
  }

  // 교사 방 입장 — 연수 토큰은 자기 수업만 들어갈 수 있다
  const joinTeacherRoom = (auth, sessionId, reply) => {
    if (!isId(sessionId)) {
      reply?.({ ok: false, error: 'sessionId가 필요합니다' })
      return
    }
    if (!canAccessSession(db, auth, sessionId)) {
      console.warn(`[Socket] 교사 입장 거부(소유 아님): session=${sessionId}, socket=${socket.id}`)
      reply?.({ ok: false, error: '다른 선생님의 수업입니다', reason: 'not_owner' })
      return
    }
    socket.join(`session:${sessionId}:teacher`)
    socket.join(`session:${sessionId}`)
    socket.data.teacherSessions = new Set([...(socket.data.teacherSessions || []), String(sessionId)])
    console.log(`[Socket] 교사 입장: session=${sessionId}`)
    // 팀 화면과 동일하게, 진행 중인 챌린지가 있으면 남은 시간과 함께 상태를 복구시킨다.
    // 없고 마지막 챌린지가 마감돼 있으면 마감 상태를 알려 교사 화면도 '마감됨'으로 복원한다.
    if (!replayActiveChallenge(sessionId)) replayEndedChallenge(sessionId)
    reply?.({ ok: true })
  }

  // 클라이언트가 연결 직후 token을 전달하면 교사로 표시한다.
  // 인증보다 teacher:join이 먼저 도착할 수 있는 타이밍 경합을 방어하기 위해,
  // 인증 전 teacher:join이 있었다면 여기서 소급 적용한다.
  on('auth:teacher', ({ token }, reply) => {
    const auth = getTeacherAuth(token)
    if (!auth) {
      socket.data.isTeacher = false
      socket.data.teacherToken = null
      socket.emit('auth:teacher:ack', { ok: false, error: '인증 만료' })
      reply?.({ ok: false, error: '인증 만료', authExpired: true })
      return
    }
    socket.data.isTeacher = true
    socket.data.teacherToken = token
    socket.emit('auth:teacher:ack', { ok: true })
    reply?.({ ok: true, scope: auth.scope })
    const pending = socket.data.pendingTeacherJoin
    if (pending?.sessionId) {
      socket.data.pendingTeacherJoin = null
      joinTeacherRoom(auth, pending.sessionId, null)
    }
  })

  // 교사 전용 이벤트 가드 — 토큰 재확인 + (sessionId가 있으면) 수업 소유 확인
  // 클라이언트가 ack 콜백을 넘긴 경우 조용히 무시하지 않고 실패 사유를 되돌려준다.
  const teacherOnly = (handler) => (data, reply) => {
    const auth = currentTeacherAuth()
    if (!auth) {
      console.warn(`[Socket] 교사 권한 없음: ${socket.id}`)
      reply?.({ ok: false, error: '인증 만료', authExpired: true })
      return
    }
    if (!isId(data.sessionId)) {
      reply?.({ ok: false, error: 'sessionId가 필요합니다' })
      return
    }
    if (!canAccessSession(db, auth, data.sessionId)) {
      reply?.({ ok: false, error: '다른 선생님의 수업입니다', reason: 'not_owner' })
      return
    }
    handler(data, reply, auth)
  }

  // 교사가 세션 방에 입장. payload에 token을 함께 보내면 그 토큰으로 인증한다.
  // 아직 auth:teacher가 도착하지 않은 상태라면 payload를 보류하고,
  // 인증이 성공하면 auth:teacher 핸들러에서 소급 처리한다.
  on('teacher:join', ({ sessionId, token }, reply) => {
    if (!isId(sessionId)) {
      reply?.({ ok: false, error: 'sessionId가 필요합니다' })
      return
    }
    if (typeof token === 'string' && token) {
      const auth = getTeacherAuth(token)
      if (!auth) {
        reply?.({ ok: false, error: '인증 만료', authExpired: true })
        return
      }
      socket.data.isTeacher = true
      socket.data.teacherToken = token
      joinTeacherRoom(auth, sessionId, reply)
      return
    }
    const auth = socket.data.teacherToken ? currentTeacherAuth() : null
    if (!auth) {
      socket.data.pendingTeacherJoin = { sessionId }
      reply?.({ ok: false, pending: true, error: '교사 인증을 기다리는 중입니다' })
      return
    }
    joinTeacherRoom(auth, sessionId, reply)
  })

  // ── 팀 입장 ────────────────────────────────────────────────────────────────
  // payload: { sessionId, teamId, teamToken }
  //   teamToken이 그 팀의 토큰과 맞아야 방에 들어간다. 세션은 payload가 아니라 팀의 실제 세션을 쓴다.
  //   teamId === 'spectator'이면 관람자로 세션 방에만 들어간다(제출·점수 이벤트 불가).
  // 실패하면 'team:join:error' 이벤트와 ack({ ok:false })로 알린다.
  on('team:join', ({ sessionId, teamId, teamToken }, reply) => {
    if (teamId === 'spectator') {
      if (!isId(sessionId)) {
        reply?.({ ok: false, error: 'sessionId가 필요합니다' })
        return
      }
      const session = db.prepare('SELECT status FROM sessions WHERE id = ?').get(String(sessionId))
      if (!session || session.status === 'ended') {
        const error = '수업을 찾을 수 없거나 이미 끝났습니다'
        socket.emit('team:join:error', { error, reason: 'session_unavailable' })
        reply?.({ ok: false, error })
        return
      }
      // 팀으로 들어와 있던 소켓이면 팀 신원을 지운다 — 남아 있으면 채팅이 이전 팀 이름으로 나갔다
      leaveCurrentRooms(sessionId)
      socket.data.spectatorSessionId = String(sessionId)
      socket.join(`session:${sessionId}`)
      console.log(`[Socket] 관람자 입장: session=${sessionId}`)
      if (!replayActiveChallenge(String(sessionId))) replayEndedChallenge(String(sessionId))
      reply?.({ ok: true, spectator: true })
      return
    }

    const team = findTeamByToken(db, teamId, teamToken)
    if (!team) {
      const error = '팀 인증이 필요합니다. QR 코드 또는 등록 화면에서 다시 입장해주세요.'
      console.warn(`[Socket] 팀 입장 거부: team=${String(teamId).slice(0, 20)}, socket=${socket.id}`)
      socket.emit('team:join:error', { error, reason: 'auth_failed' })
      reply?.({ ok: false, error, authFailed: true })
      return
    }

    // 다른 팀·수업·관람 방에 들어가 있던 소켓이면 먼저 나온다
    leaveCurrentRooms(team.session_id)
    socket.data.teamId = team.id
    socket.data.sessionId = team.session_id
    socket.data.teamName = team.name
    socket.data.teamColor = team.color
    socket.data.teamMembers = parseMembersSafe(team.members)

    socket.join(`session:${team.session_id}`)
    socket.join(`session:${team.session_id}:team:${team.id}`)
    console.log(`[Socket] 팀 입장: session=${team.session_id}, team=${team.id}`)

    // 현재 진행 중인 챌린지가 있으면 남은 시간 계산하여 전달, 없고 마지막 챌린지가 마감됐으면 마감 상태 전달
    if (!replayActiveChallenge(team.session_id)) replayEndedChallenge(team.session_id)
    reply?.({ ok: true, teamId: team.id, sessionId: team.session_id })
  })

  // ── 교사 제어 이벤트 ───────────────────────────────────────────────────────
  // 교사 → 전체: 챌린지 시작
  // challengeId는 프리셋 챌린지여야 하고, timeLimit은 0(무제한) 또는 30~1800초 정수여야 한다.
  on('challenge:start', teacherOnly(({ sessionId, challengeId, timeLimit }, reply) => {
    if (typeof challengeId !== 'string' || !getChallenge(challengeId)) {
      reply?.({ ok: false, error: '알 수 없는 챌린지입니다' })
      return
    }
    // 숫자 또는 숫자 문자열만 정수로 받는다. 1e10처럼 큰 값은 setTimeout이 넘쳐 즉시 종료되므로 범위로 막는다
    const limit = timeLimit === undefined || timeLimit === null || timeLimit === ''
      ? 0
      : typeof timeLimit === 'string' && /^\d+$/.test(timeLimit.trim())
        ? Number(timeLimit.trim())
        : timeLimit
    if (!Number.isInteger(limit) || (limit !== 0 && (limit < TIME_LIMIT_MIN || limit > TIME_LIMIT_MAX))) {
      reply?.({ ok: false, error: `제한 시간은 ${TIME_LIMIT_MIN}~${TIME_LIMIT_MAX}초 정수(또는 0 = 무제한)여야 합니다` })
      return
    }

    // 이미 종료된 수업에서는 새 챌린지를 시작할 수 없다
    // (학생 화면은 열려도 제출이 전부 401로 막히기 때문)
    const session = db.prepare('SELECT status FROM sessions WHERE id = ?').get(sessionId)
    if (!session) {
      reply?.({ ok: false, error: '수업을 찾을 수 없습니다' })
      return
    }
    if (session.status === 'ended') {
      reply?.({ ok: false, error: '이미 종료된 수업입니다. 새 수업을 시작해주세요.', sessionEnded: true })
      return
    }

    // 기존 타이머 정리
    if (challengeTimers[sessionId]) {
      clearTimeout(challengeTimers[sessionId])
      delete challengeTimers[sessionId]
    }

    const startedAt = Date.now()
    // 캐시 + DB에 기록 — 서버가 재시작돼도 이 레코드로 복구된다
    persistActiveChallenge(sessionId, { challengeId, timeLimit: limit, startedAt })
    io.to(`session:${sessionId}`).emit('challenge:started', { challengeId, timeLimit: limit, startedAt })
    reply?.({ ok: true, startedAt })

    // 타이머 설정 시 자동 종료
    if (limit > 0) scheduleChallengeTimeout(sessionId, limit * 1000)
  }))

  // 교사 → 전체: 챌린지 종료 (제출 마감)
  on('challenge:end', teacherOnly(({ sessionId }, reply) => {
    // 자동 종료 타이머 + 캐시 정리, DB에 마감 시각 기록 — 이미 마감됐으면 다시 방송하지 않는다
    const wasActive = closeChallenge(sessionId, {})
    reply?.({ ok: true, alreadyEnded: !wasActive })
  }))

  // 교사 → 전체: 힌트 공개
  on('challenge:hint', teacherOnly(({ sessionId, hint }, reply) => {
    if (typeof hint !== 'string' || !hint.trim()) {
      reply?.({ ok: false, error: '힌트 내용이 필요합니다' })
      return
    }
    io.to(`session:${sessionId}`).emit('challenge:hint', { hint: hint.slice(0, MAX_HINT_LENGTH) })
    reply?.({ ok: true })
  }))

  // 교사 → 전체: 결과 공개
  // 진행 중에 공개하면 그 자리에서 마감한다 — 학생 화면이 계속 제출 가능 상태로 남지 않도록 challenge:ended도 보낸다.
  on('challenge:reveal', teacherOnly(({ sessionId, challengeId }, reply) => {
    closeChallenge(sessionId, { revealed: true })

    // 같은 챌린지를 다시 낸 경우 이번 라운드 시작 이후 제출만 집계한다
    const rankings = queryRankings(db, sessionId, typeof challengeId === 'string' && challengeId ? challengeId : null)
    io.to(`session:${sessionId}`).emit('result:revealed', { rankings })
    reply?.({ ok: true })
  }))

  // 교사 → 전체: 전체 수업 종료
  on('session:final-end', teacherOnly(({ sessionId }, reply) => {
    console.log(`[Session] 최종 종료 요청: session=${sessionId}`)

    try {
      // 진행 중인 챌린지/타이머 정리 + 마감 기록
      endActiveChallenge(sessionId)

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
          members: parseMembersSafe(team.members),
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
      reply?.({ ok: true })
    } catch (err) {
      console.error(`[Session] 최종 종료 에러: session=${sessionId}`, err)
      reply?.({ ok: false, error: '수업 종료 처리 중 오류가 발생했습니다' })
    }
  }))

  // ── 팀 → 교사: 점수 업데이트 알림 (AI 평가·저장 후) ───────────────────────
  // 팀·세션은 socket.data에서만 가져온다. 점수도 payload를 믿지 않고 DB에 저장된 최근 시도 점수를 보낸다.
  on('team:score-update', (_data, reply) => {
    const { teamId, sessionId } = socket.data
    if (!teamId || !sessionId) {
      reply?.({ ok: false, error: '팀으로 입장한 뒤에 보낼 수 있습니다' })
      return
    }
    const latest = db
      .prepare('SELECT score FROM attempts WHERE team_id = ? ORDER BY id DESC LIMIT 1')
      .get(teamId)
    io.to(`session:${sessionId}:teacher`).emit('team:submitted', {
      teamId,
      score: latest?.score ?? null,
    })
    io.to(`session:${sessionId}`).emit('dashboard:update', {})
    reply?.({ ok: true })
  })

  // ── 채팅 ──────────────────────────────────────────────────────────────────
  // 보낸 사람·팀 이름·색은 payload가 아니라 서버가 정한다. 교사는 "선생님"으로 고정.
  // 메시지는 500자까지 잘라서 보낸다.
  const chatTimes = []
  const chatAllowed = () => {
    const now = Date.now()
    while (chatTimes.length && now - chatTimes[0] > CHAT_WINDOW_MS) chatTimes.shift()
    if (chatTimes.length >= CHAT_LIMIT) return false
    chatTimes.push(now)
    return true
  }
  const cleanMessage = (message) =>
    typeof message === 'string' ? message.trim().slice(0, MAX_CHAT_LENGTH) : ''

  // 이 소켓의 채팅 신원 — 팀 > 교사 > 관람자 순
  const chatIdentity = (requestedSessionId) => {
    if (socket.data.teamId) {
      return {
        sessionId: socket.data.sessionId,
        sender: socket.data.teamMembers?.join(' · ') || socket.data.teamName,
        teamName: socket.data.teamName,
        teamColor: socket.data.teamColor,
        role: 'team',
      }
    }
    if (socket.data.teacherToken && isId(requestedSessionId) &&
        socket.data.teacherSessions?.has(String(requestedSessionId)) && currentTeacherAuth()) {
      return { sessionId: String(requestedSessionId), sender: '선생님', teamName: '선생님', teamColor: '#f59e0b', role: 'teacher' }
    }
    if (socket.data.spectatorSessionId) {
      return { sessionId: socket.data.spectatorSessionId, sender: '관람자', teamName: '관람자', teamColor: '#64748b', role: 'spectator' }
    }
    return null
  }

  // 전체 채팅
  on('chat:all', ({ sessionId, message }, reply) => {
    const who = chatIdentity(sessionId)
    const text = cleanMessage(message)
    if (!who) {
      reply?.({ ok: false, error: '수업에 입장한 뒤에 채팅할 수 있습니다' })
      return
    }
    if (!text) {
      reply?.({ ok: false, error: '메시지가 비어 있습니다' })
      return
    }
    if (!chatAllowed()) {
      reply?.({ ok: false, error: '메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 보내주세요.' })
      return
    }
    io.to(`session:${who.sessionId}`).emit('chat:all', {
      teamName: who.teamName,
      teamColor: who.teamColor,
      sender: who.sender,
      message: text,
      timestamp: Date.now(),
    })
    reply?.({ ok: true })
  })

  // 팀 채팅 — 팀은 자기 팀 방으로만, 교사는 자기 수업의 팀(payload.teamId)으로 보낼 수 있다
  on('chat:team', ({ sessionId, teamId, message }, reply) => {
    const who = chatIdentity(sessionId)
    const text = cleanMessage(message)
    if (!who || who.role === 'spectator' || !text || !chatAllowed()) {
      reply?.({ ok: false, error: '보낼 수 없는 메시지입니다' })
      return
    }
    let targetTeamId = socket.data.teamId
    if (who.role === 'teacher') {
      const team = isId(teamId) ? db.prepare('SELECT id, session_id FROM teams WHERE id = ?').get(teamId) : null
      if (!team || team.session_id !== who.sessionId) {
        reply?.({ ok: false, error: '팀을 찾을 수 없습니다' })
        return
      }
      targetTeamId = team.id
    }
    io.to(`session:${who.sessionId}:team:${targetTeamId}`).emit('chat:team', {
      sender: who.sender,
      message: text,
      timestamp: Date.now(),
    })
    reply?.({ ok: true })
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

// 없는 API 경로 — Express 기본 HTML("Cannot GET") 대신 JSON으로 답한다
app.use('/api', (req, res) => {
  res.status(404).json({ error: '없는 API 경로입니다' })
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

// ── 오류 응답 ────────────────────────────────────────────────────────────────
// 잘못된 JSON·너무 큰 본문·CORS 거절·라우트 예외를 모두 JSON { error }로 돌려준다.
// Express 기본 처리기는 HTML 스택 트레이스를 내보내고(NODE_ENV 미설정 시), 본문 일부가 담긴
// 파싱 오류 메시지를 로그에 남겨 PIN이 평문으로 찍혔다. 여기서는 요청 본문과 파싱 오류 메시지를
// 로그에 남기지 않고, 응답에도 스택을 싣지 않는다.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = Number(err?.status || err?.statusCode) || 500
  let message = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
  const type = err?.type || err?.name || 'Error'

  if (err?.type === 'entity.parse.failed') {
    status = 400
    message = '요청 형식이 올바르지 않습니다 (JSON 파싱 실패)'
  } else if (err?.type === 'entity.too.large') {
    status = 413
    message = '요청이 너무 큽니다'
  } else if (err?.message === 'CORS 정책에 의해 차단됨') {
    status = 403
    message = '허용되지 않은 출처의 요청입니다'
  } else if (status >= 400 && status < 500) {
    message = '요청을 처리할 수 없습니다'
  } else {
    status = 500
  }

  if (status >= 500) {
    // 서버 버그 추적용으로 스택은 서버 로그에만 남긴다 (인증 경로는 메시지도 남기지 않는다)
    const detail = req.path.startsWith('/api/auth') ? '' : `: ${err?.stack || err}`
    console.error(`[HTTP] ${req.method} ${req.path} → ${status} (${type})${detail}`)
  } else {
    console.warn(`[HTTP] ${req.method} ${req.path} → ${status} (${type})`)
  }

  if (res.headersSent) return
  res.status(status).json({ error: message })
})

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
  console.log(`   DB       → ${dbPath}\n`)
})

export { db }
