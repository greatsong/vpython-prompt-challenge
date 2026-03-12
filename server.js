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

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── DB 초기화 ────────────────────────────────────────────────────────────────
const dbDir = join(__dirname, 'db')
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

const db = new Database(join(dbDir, 'vpython.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// 스키마 적용
const schema = fs.readFileSync(join(__dirname, 'db', 'schema.sql'), 'utf8')
db.exec(schema)

// ── CORS 화이트리스트 ────────────────────────────────────────────────────────
const DEFAULT_ORIGINS = [
  'https://vpython-prompt-challenge.fly.dev',
  'http://localhost:3000',
  'http://localhost:4008',
  'http://localhost:4009',
  'http://localhost:5173',
]

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : DEFAULT_ORIGINS

const corsOptions = {
  origin(origin, callback) {
    // origin이 없는 경우: 같은 서버에서 서빙하는 경우 또는 서버 간 요청
    if (!origin || allowedOrigins.includes(origin)) {
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
app.use(express.json())

// db와 io를 라우터에서 사용할 수 있도록 주입
app.use((req, res, next) => {
  req.db = db
  req.io = io
  next()
})

// ── 라우터 ──────────────────────────────────────────────────────────────────
app.use('/api/session', routesSession)
app.use('/api/challenges', routesChallenges)
app.use('/api', routesAI)
app.use('/api', routesDashboard)

// 팀 단건 조회 (팀 화면 초기 로드용)
app.get('/api/team/:teamId', (req, res) => {
  const team = db
    .prepare('SELECT * FROM teams WHERE id = ?')
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
const activeChallenge = {} // { sessionId: { challengeId, timeLimit } }

// ── Socket.io 이벤트 ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] 접속: ${socket.id}`)

  // 교사가 세션 방에 입장
  socket.on('teacher:join', ({ sessionId }) => {
    socket.join(`session:${sessionId}:teacher`)
    socket.join(`session:${sessionId}`)
    console.log(`[Socket] 교사 입장: session=${sessionId}`)
  })

  // 팀이 세션 방에 입장
  socket.on('team:join', ({ sessionId, teamId }) => {
    socket.join(`session:${sessionId}`)
    socket.join(`session:${sessionId}:team:${teamId}`)
    console.log(`[Socket] 팀 입장: session=${sessionId}, team=${teamId}`)

    // 현재 진행 중인 챌린지가 있으면 즉시 전달
    if (activeChallenge[sessionId]) {
      socket.emit('challenge:started', activeChallenge[sessionId])
    }
  })

  // 교사 → 전체: 챌린지 시작
  socket.on('challenge:start', ({ sessionId, challengeId, timeLimit }) => {
    activeChallenge[sessionId] = { challengeId, timeLimit }
    io.to(`session:${sessionId}`).emit('challenge:started', { challengeId, timeLimit })
  })

  // 교사 → 전체: 챌린지 종료 (제출 마감)
  socket.on('challenge:end', ({ sessionId }) => {
    delete activeChallenge[sessionId]
    io.to(`session:${sessionId}`).emit('challenge:ended', {})
  })

  // 교사 → 전체: 힌트 공개
  socket.on('challenge:hint', ({ sessionId, hint }) => {
    io.to(`session:${sessionId}`).emit('challenge:hint', { hint })
  })

  // 교사 → 전체: 결과 공개
  socket.on('challenge:reveal', ({ sessionId, challengeId }) => {
    delete activeChallenge[sessionId]
    let rankings

    if (challengeId) {
      // 현재 챌린지의 최고 점수 (미제출 팀은 0점)
      rankings = db
        .prepare(`
          SELECT t.name, t.color,
                 COALESCE(MAX(a.score), 0) AS score,
                 a.prompt, a.generated_code
          FROM teams t
          LEFT JOIN attempts a ON a.team_id = t.id AND a.challenge_id = ?
          WHERE t.session_id = ?
          GROUP BY t.id
          ORDER BY score DESC
        `)
        .all(challengeId, sessionId)
    } else {
      // 전체 챌린지 최고 점수 (미제출 팀은 0점)
      rankings = db
        .prepare(`
          SELECT t.name, t.color,
                 COALESCE(MAX(a.score), 0) AS score,
                 a.prompt, a.generated_code
          FROM teams t
          LEFT JOIN attempts a ON a.team_id = t.id
          WHERE t.session_id = ?
          GROUP BY t.id
          ORDER BY score DESC
        `)
        .all(sessionId)
    }

    io.to(`session:${sessionId}`).emit('result:revealed', { rankings })
  })

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
