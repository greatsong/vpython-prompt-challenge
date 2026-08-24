/**
 * 잔존 세션 정리 스크립트 (일회성 유지보수용)
 *
 * - status != 'ended' 인 세션을 전부 'ended' 처리한다.
 *   (수업 잔존·테스트 잔존 모두 대상 — 다음 수업은 어차피 새로 생성된다)
 * - 만료된 교사 토큰을 정리한다.
 * - WAL 파일을 TRUNCATE 체크포인트로 비운다.
 *
 * 실행: node scripts/cleanup-sessions.mjs
 */

import Database from 'better-sqlite3'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

// server.js와 동일한 규칙으로 DB 위치를 정한다
const dbDir = fs.existsSync('/data') ? '/data' : join(projectRoot, 'db')
const dbPath = join(dbDir, 'vpython.db')

if (!fs.existsSync(dbPath)) {
  console.error(`❌ DB를 찾을 수 없습니다: ${dbPath}`)
  process.exit(1)
}

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

const open = db
  .prepare("SELECT id, teacher_code, status, created_at FROM sessions WHERE status != 'ended' ORDER BY created_at")
  .all()

console.log(`정리 대상 세션: ${open.length}개`)
for (const s of open) {
  console.log(`  - ${s.teacher_code} (${s.status}, ${s.created_at})`)
}

const result = db.prepare("UPDATE sessions SET status = 'ended' WHERE status != 'ended'").run()
console.log(`✅ ${result.changes}개 세션을 'ended'로 변경했습니다`)

// 만료된 교사 토큰 정리 (테이블이 없을 수 있으므로 방어)
try {
  const tokenResult = db.prepare('DELETE FROM teacher_tokens WHERE expires_at < ?').run(Date.now())
  console.log(`✅ 만료 교사 토큰 ${tokenResult.changes}개 삭제`)
} catch {
  console.log('ℹ️  teacher_tokens 테이블 없음 — 건너뜀')
}

const walPath = dbPath + '-wal'
const beforeWal = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0
db.pragma('wal_checkpoint(TRUNCATE)')
const afterWal = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0
console.log(`✅ WAL 체크포인트: ${(beforeWal / 1024).toFixed(1)}KB → ${(afterWal / 1024).toFixed(1)}KB`)

db.close()
