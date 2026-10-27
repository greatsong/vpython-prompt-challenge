/**
 * 교사 인증 토큰 관리
 *
 * PIN 검증 후 발급한 opaque 토큰을 SQLite(teacher_tokens 테이블)에 보관한다.
 * 교사 전용 HTTP 엔드포인트는 `x-teacher-token` 헤더로 검증.
 * 교사 전용 Socket 이벤트는 `auth:teacher`(또는 teacher:join의 token)로 인증한 뒤
 * 이벤트마다 토큰을 다시 확인한다.
 *
 * 만료 — 슬라이딩
 *   마지막 사용 뒤 6시간(IDLE_TTL) 동안 쓰지 않으면 만료된다. 쓸 때마다 만료가 뒤로 밀리되,
 *   발급 뒤 12시간(MAX_LIFETIME)은 넘지 않는다. 수업·연수 중간에 로그인이 풀리지 않게 하려는 것이다.
 *   DB에 저장하므로 서버를 재시작해도 만료 전이면 그대로 유효하다.
 * 서버 기동 시 initTeacherAuth(db)로 DB 핸들을 주입해야 한다.
 *
 * 토큰 범위(scope)
 *   - 'admin'    : 운영 교사 PIN(TEACHER_PIN)으로 받은 토큰. 모든 교사 기능·모든 수업에 접근.
 *   - 'training' : 연수 입장 코드(TRAINING_CODE)로 받은 토큰. API 키 설정·교체를 막고,
 *                  자기가 만든 수업(sessions.owner_token_hash)에만 접근한다.
 */

import { createHash, randomUUID, timingSafeEqual } from 'crypto'

export const IDLE_TTL_MS = 6 * 60 * 60 * 1000 // 마지막 사용 뒤 6시간
export const MAX_LIFETIME_MS = 12 * 60 * 60 * 1000 // 발급 뒤 최대 12시간
// 만료 연장 쓰기를 매 요청마다 하지 않도록, 1분 이상 늘어날 때만 기록한다
const EXTEND_MIN_STEP_MS = 60 * 1000

export const SCOPE_ADMIN = 'admin'
export const SCOPE_TRAINING = 'training'

let db = null

/** 서버 기동 시 1회 호출 — DB 핸들 주입 + 테이블 보장(마이그레이션) */
export function initTeacherAuth(database) {
  db = database
  db.exec(`
    CREATE TABLE IF NOT EXISTS teacher_tokens (
      token      TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    )
  `)
  // 기존 DB 마이그레이션: 토큰 범위 컬럼 추가.
  // 이 컬럼이 생기기 전에 발급된 토큰은 모두 운영 PIN 토큰이므로 기본값을 'admin'으로 둔다.
  const tokenColumns = db.prepare('PRAGMA table_info(teacher_tokens)').all().map((c) => c.name)
  if (!tokenColumns.includes('scope')) {
    db.prepare(`ALTER TABLE teacher_tokens ADD COLUMN scope TEXT NOT NULL DEFAULT '${SCOPE_ADMIN}'`).run()
  }
  // 발급 시각 — 슬라이딩 만료의 상한(12시간)을 계산한다.
  // 예전 토큰은 고정 6시간짜리였으므로 만료 시각에서 6시간을 빼 발급 시각으로 본다.
  if (!tokenColumns.includes('issued_at')) {
    db.prepare('ALTER TABLE teacher_tokens ADD COLUMN issued_at INTEGER').run()
    db.prepare('UPDATE teacher_tokens SET issued_at = expires_at - ? WHERE issued_at IS NULL').run(IDLE_TTL_MS)
  }
  // 연수 참가자 소유 키 — 연수 토큰은 입장할 때마다 새로 발급되므로, 탭을 닫았다 다시 들어와도
  // 자기 수업을 찾을 수 있게 브라우저가 보관하는 참가자 id(traineeId)의 해시를 소유 키로 쓴다.
  if (!tokenColumns.includes('owner_key')) {
    db.prepare('ALTER TABLE teacher_tokens ADD COLUMN owner_key TEXT').run()
  }
  pruneExpired()
}

// 참가자 id 형식 — 프론트가 localStorage에 보관하는 무작위 UUID(영숫자·하이픈 32~64자)
const TRAINEE_ID_RE = /^[A-Za-z0-9-]{32,64}$/

/** 형식이 맞는 참가자 id면 소유 키(sha256 hex), 아니면 null */
export function traineeOwnerKey(traineeId) {
  if (typeof traineeId !== 'string' || !TRAINEE_ID_RE.test(traineeId)) return null
  return createHash('sha256').update(`trainee:${traineeId}`).digest('hex')
}

/**
 * ownerKey — 연수 토큰에만 쓴다. 있으면 수업 소유 확인에 토큰 해시 대신 이 키를 쓴다.
 */
export function issueTeacherToken(scope = SCOPE_ADMIN, { ownerKey = null } = {}) {
  if (!db) throw new Error('teacherAuth가 초기화되지 않았습니다 (initTeacherAuth 필요)')
  // 발급 시마다 만료된 토큰 정리
  pruneExpired()
  const token = randomUUID()
  const now = Date.now()
  const isTraining = scope === SCOPE_TRAINING
  db.prepare('INSERT INTO teacher_tokens (token, expires_at, scope, issued_at, owner_key) VALUES (?, ?, ?, ?, ?)').run(
    token,
    now + IDLE_TTL_MS,
    isTraining ? SCOPE_TRAINING : SCOPE_ADMIN,
    now,
    isTraining && typeof ownerKey === 'string' && ownerKey ? ownerKey : null
  )
  return token
}

/** 수업 소유 확인용 토큰 해시 (토큰 원문은 sessions 테이블에 남기지 않는다) */
export function hashTeacherToken(token) {
  if (!token || typeof token !== 'string') return null
  return createHash('sha256').update(`teacher-token:${token}`).digest('hex')
}

/**
 * 유효한 토큰이면 { scope, tokenHash }, 아니면 null.
 * 유효하면 만료를 뒤로 민다(슬라이딩, 발급 뒤 12시간 상한).
 */
export function getTeacherAuth(token) {
  if (!token || typeof token !== 'string') return null
  if (!db) return null
  const row = db.prepare('SELECT expires_at, scope, issued_at, owner_key FROM teacher_tokens WHERE token = ?').get(token)
  if (!row) return null
  const now = Date.now()
  if (now > row.expires_at) {
    db.prepare('DELETE FROM teacher_tokens WHERE token = ?').run(token)
    return null
  }
  const issuedAt = row.issued_at ?? row.expires_at - IDLE_TTL_MS
  const extended = Math.min(now + IDLE_TTL_MS, issuedAt + MAX_LIFETIME_MS)
  if (extended - row.expires_at >= EXTEND_MIN_STEP_MS) {
    try {
      db.prepare('UPDATE teacher_tokens SET expires_at = ? WHERE token = ?').run(extended, token)
    } catch (err) {
      console.warn('[TeacherAuth] 만료 연장 실패 — 무시:', err.message)
    }
  }
  // tokenHash는 "수업 소유 키"다. 참가자 id로 들어온 연수 토큰은 참가자 키, 그 밖에는 토큰 해시.
  return {
    scope: row.scope === SCOPE_TRAINING ? SCOPE_TRAINING : SCOPE_ADMIN,
    tokenHash: row.owner_key || hashTeacherToken(token),
  }
}

/** 유효한 토큰이면 범위('admin' | 'training'), 아니면 null */
export function getTeacherTokenScope(token) {
  return getTeacherAuth(token)?.scope ?? null
}

export function isValidTeacherToken(token) {
  return getTeacherTokenScope(token) !== null
}

export function revokeTeacherToken(token) {
  if (!token || !db) return
  db.prepare('DELETE FROM teacher_tokens WHERE token = ?').run(token)
}

/** 연수 입장이 닫혔을 때 남아 있는 연수 토큰을 모두 무효화한다 */
export function revokeTrainingTokens() {
  if (!db) return 0
  return db.prepare('DELETE FROM teacher_tokens WHERE scope = ?').run(SCOPE_TRAINING).changes
}

function pruneExpired() {
  if (!db) return
  db.prepare('DELETE FROM teacher_tokens WHERE expires_at < ?').run(Date.now())
}

// ── 수업 소유 확인 ───────────────────────────────────────────────────────────
/**
 * 이 교사가 이 수업에 접근해도 되는가.
 * 운영(admin) 토큰은 모든 수업, 연수 토큰은 자기가 만든 수업만.
 * 수업이 없으면 운영 토큰은 true(각 라우트가 404·빈 결과를 낸다), 연수 토큰은 false.
 */
export function canAccessSession(database, auth, sessionId) {
  if (!auth) return false
  if (auth.scope === SCOPE_ADMIN) return true
  if (!sessionId || !auth.tokenHash) return false
  const row = database.prepare('SELECT owner_token_hash FROM sessions WHERE id = ?').get(String(sessionId))
  return !!row && !!row.owner_token_hash && row.owner_token_hash === auth.tokenHash
}

/** 팀이 속한 수업 기준으로 접근 확인 */
export function canAccessTeam(database, auth, teamId) {
  if (!auth) return false
  if (auth.scope === SCOPE_ADMIN) return true
  const team = database.prepare('SELECT session_id FROM teams WHERE id = ?').get(teamId)
  return !!team && canAccessSession(database, auth, team.session_id)
}

// ── 코드 비교 ────────────────────────────────────────────────────────────────
/** 길이 고정 비교. 길이가 다르거나 문자열이 아니면 false */
export function safeEqual(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' || !expected) return false
  const a = Buffer.from(input, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ── 시도 횟수 제한 ───────────────────────────────────────────────────────────
// IP당 1분 창에서 실패가 AUTH_FAIL_LIMIT(기본 10)회 쌓이면 창이 끝날 때까지 429를 돌려준다.
// 연수장처럼 여러 사람이 같은 공인 IP로 나가는 환경을 고려해 .env로 조정할 수 있게 둔다.
const FAIL_WINDOW_MS = 60 * 1000
const FAIL_LIMIT = Number(process.env.AUTH_FAIL_LIMIT) || 10
// 연수 입장 코드는 따로 넉넉하게(기본 30) — 연수장 30명이 한 공인 IP로 나가면, 몇 명의 오타가
// 정확한 QR로 들어오는 다른 참가자까지 1분간 429로 막았다. TRAINING_FAIL_LIMIT로 조정한다.
export const TRAINING_FAIL_LIMIT = Number(process.env.TRAINING_FAIL_LIMIT) || 30

/**
 * 요청자 IP. Fly.io 프록시 뒤에서는 소켓 주소가 프록시 주소라 모든 사용자가 한 IP로 묶이므로
 * 프록시가 덮어쓰는 Fly-Client-IP를 쓴다. Fly 밖에서는 이 헤더를 위조할 수 있으므로 무시한다.
 */
export function clientIp(req) {
  if (process.env.FLY_APP_NAME && req.headers['fly-client-ip']) {
    return String(req.headers['fly-client-ip'])
  }
  return req.socket?.remoteAddress || req.ip || 'unknown'
}

/** 엔드포인트별로 독립된 실패 카운터를 만든다 (PIN과 연수 코드가 서로를 막지 않도록) */
export function createFailureLimiter(label, limit = FAIL_LIMIT) {
  const FAIL_LIMIT = limit
  const buckets = new Map() // ip → { count, resetAt }

  const sweep = (now) => {
    if (buckets.size < 1000) return
    for (const [ip, b] of buckets) if (b.resetAt <= now) buckets.delete(ip)
  }

  return {
    /** 제한 중이면 남은 초, 아니면 0 */
    blockedFor(ip) {
      const now = Date.now()
      const b = buckets.get(ip)
      if (!b) return 0
      if (b.resetAt <= now) {
        buckets.delete(ip)
        return 0
      }
      return b.count >= FAIL_LIMIT ? Math.ceil((b.resetAt - now) / 1000) : 0
    },
    recordFailure(ip) {
      const now = Date.now()
      sweep(now)
      const b = buckets.get(ip)
      if (!b || b.resetAt <= now) {
        buckets.set(ip, { count: 1, resetAt: now + FAIL_WINDOW_MS })
      } else {
        b.count += 1
        if (b.count === FAIL_LIMIT) console.warn(`[Auth] ${label} 실패 ${FAIL_LIMIT}회 — 1분간 차단: ip=${ip}`)
      }
    },
  }
}

export function sendTooManyAttempts(res, retryAfterSec) {
  res.set('Retry-After', String(retryAfterSec))
  return res.status(429).json({
    error: `시도가 너무 많습니다. ${retryAfterSec}초 뒤에 다시 시도해 주세요.`,
    retryAfter: retryAfterSec,
  })
}

// ── Express 미들웨어 ─────────────────────────────────────────────────────────
// 통과하면 req.teacherScope·req.teacherAuth에 토큰 범위와 해시를 남긴다.
export function requireTeacher(req, res, next) {
  const auth = getTeacherAuth(req.headers['x-teacher-token'])
  if (!auth) {
    return res.status(401).json({ error: '교사 인증이 필요합니다. 다시 로그인해주세요.' })
  }
  req.teacherScope = auth.scope
  req.teacherAuth = auth
  next()
}

// 운영 교사 PIN 토큰만 허용 (연수 토큰은 403)
export function requireAdminTeacher(req, res, next) {
  const auth = getTeacherAuth(req.headers['x-teacher-token'])
  if (!auth) {
    return res.status(401).json({ error: '교사 인증이 필요합니다. 다시 로그인해주세요.' })
  }
  if (auth.scope !== SCOPE_ADMIN) {
    return res.status(403).json({ error: '운영 교사 PIN이 필요합니다' })
  }
  req.teacherScope = auth.scope
  req.teacherAuth = auth
  next()
}

/**
 * requireTeacher 뒤에 붙인다 — 연수 토큰이면 자기 수업인지 확인한다.
 * paramName: 수업 id가 들어 있는 경로 파라미터 이름 (기본 sessionId)
 */
export function requireSessionAccess(paramName = 'sessionId') {
  return (req, res, next) => {
    if (!canAccessSession(req.db, req.teacherAuth, req.params[paramName])) {
      return res.status(403).json({ error: '다른 선생님의 수업입니다. 자기 수업만 볼 수 있습니다.', reason: 'not_owner' })
    }
    next()
  }
}
