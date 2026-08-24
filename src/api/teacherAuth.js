/**
 * 교사 인증 토큰 관리
 *
 * PIN 검증 후 발급한 opaque 토큰을 SQLite(teacher_tokens 테이블)에 보관한다.
 * 교사 전용 HTTP 엔드포인트는 `x-teacher-token` 헤더로 검증.
 * 교사 전용 Socket 이벤트는 `auth:teacher` 로 연결 직후 인증 후 `socket.data.isTeacher` 플래그로 판정.
 *
 * DB에 저장하므로 서버를 재시작해도 TTL(6시간)이 남아 있으면 그대로 유효하다.
 * 서버 기동 시 initTeacherAuth(db)로 DB 핸들을 주입해야 한다.
 */

import { randomUUID } from 'crypto'

const TTL_MS = 6 * 60 * 60 * 1000 // 6시간

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
  pruneExpired()
}

export function issueTeacherToken() {
  if (!db) throw new Error('teacherAuth가 초기화되지 않았습니다 (initTeacherAuth 필요)')
  // 발급 시마다 만료된 토큰 정리
  pruneExpired()
  const token = randomUUID()
  db.prepare('INSERT INTO teacher_tokens (token, expires_at) VALUES (?, ?)').run(
    token,
    Date.now() + TTL_MS
  )
  return token
}

export function isValidTeacherToken(token) {
  if (!token || typeof token !== 'string') return false
  if (!db) return false
  const row = db.prepare('SELECT expires_at FROM teacher_tokens WHERE token = ?').get(token)
  if (!row) return false
  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM teacher_tokens WHERE token = ?').run(token)
    return false
  }
  return true
}

export function revokeTeacherToken(token) {
  if (!token || !db) return
  db.prepare('DELETE FROM teacher_tokens WHERE token = ?').run(token)
}

function pruneExpired() {
  if (!db) return
  db.prepare('DELETE FROM teacher_tokens WHERE expires_at < ?').run(Date.now())
}

// Express 미들웨어
export function requireTeacher(req, res, next) {
  const token = req.headers['x-teacher-token']
  if (!isValidTeacherToken(token)) {
    return res.status(401).json({ error: '교사 인증이 필요합니다. 다시 로그인해주세요.' })
  }
  next()
}
