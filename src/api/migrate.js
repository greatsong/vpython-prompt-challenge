/**
 * 기존 DB 마이그레이션 — 서버 기동 시 schema.sql 적용 직후 1회 실행한다.
 *
 * schema.sql의 CREATE TABLE IF NOT EXISTS는 이미 있는 테이블에 컬럼을 추가하지 않는다.
 * 배포본 /data 볼륨의 DB에는 예전 테이블이 남아 있으므로 여기서 컬럼을 멱등으로 보강한다.
 * 새 컬럼에 거는 인덱스도 컬럼이 생긴 뒤에 만들어야 하므로 schema.sql이 아니라 여기에 둔다.
 */

function columnsOf(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
}

function addColumnIfMissing(db, table, column, definition) {
  if (!columnsOf(db, table).includes(column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run()
  }
}

export function migrateDb(db) {
  // 진행 중 챌린지 테이블 — 예전 DB에는 없을 수 있다
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_challenges (
      session_id   TEXT PRIMARY KEY,
      challenge_id TEXT,
      time_limit   INTEGER,
      started_at   INTEGER
    )
  `)

  // 팀 접근 토큰
  addColumnIfMissing(db, 'teams', 'access_token', 'TEXT')
  db.prepare("UPDATE teams SET access_token = lower(hex(randomblob(32))) WHERE access_token IS NULL OR access_token = ''").run()
  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_access_token ON teams(access_token)').run()

  // 챌린지 마감 시각 — 행을 지우지 않고 ended_at을 남겨 마감 직후 유예 제출을 판정한다.
  // ended_at IS NULL 이면 진행 중이다.
  addColumnIfMissing(db, 'active_challenges', 'ended_at', 'INTEGER')

  // 평가 증명 토큰의 고유 id — 같은 증명으로 시도를 두 번 저장하지 못하게 한다
  addColumnIfMissing(db, 'attempts', 'proof_jti', 'TEXT')
  db.prepare(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_proof_jti ON attempts(proof_jti) WHERE proof_jti IS NOT NULL'
  ).run()

  // 시도 저장 시각(ms) — created_at(초 단위)만으로는 같은 초에 저장된 이전 라운드 시도가 새 라운드에 섞였다
  addColumnIfMissing(db, 'attempts', 'created_ms', 'INTEGER')

  // 챌린지 라운드 이력 — 같은 챌린지를 다시 내도 이번 라운드 제출만 순위에 넣기 위해 시작·마감 시각을 남긴다
  db.exec(`
    CREATE TABLE IF NOT EXISTS challenge_rounds (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      started_at   INTEGER NOT NULL,
      ended_at     INTEGER
    )
  `)
  db.prepare(
    'CREATE INDEX IF NOT EXISTS idx_challenge_rounds_session ON challenge_rounds(session_id, challenge_id, started_at)'
  ).run()

  // 수업을 만든 교사 토큰의 해시 — 연수 토큰이 자기 수업에만 접근하도록 확인한다
  addColumnIfMissing(db, 'sessions', 'owner_token_hash', 'TEXT')
}
