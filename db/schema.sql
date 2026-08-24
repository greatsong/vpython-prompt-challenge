-- VPython 프롬프트 챌린지 — SQLite 스키마
-- 수업 세션
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  teacher_code TEXT NOT NULL,
  mode       TEXT DEFAULT 'battle',  -- battle|detective|surgery|creator|compare
  status     TEXT DEFAULT 'waiting', -- waiting|active|paused|ended
  session_number INTEGER DEFAULT 1,  -- 1~5 (어느 세션인지)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 팀
CREATE TABLE IF NOT EXISTS teams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  members    TEXT DEFAULT '[]',  -- JSON array ["김철수","이영희"]
  color      TEXT DEFAULT '#6366f1',
  access_token TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- 학생 (자기 등록)
CREATE TABLE IF NOT EXISTS students (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL,
  team_id         INTEGER,
  student_number  TEXT NOT NULL,   -- 학번
  name            TEXT NOT NULL,   -- 이름
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- (session_id, student_number) 유니크 제약 — 학생 중복 등록 방지.
-- 기존 DB에 중복 row가 있으면 INDEX 생성이 실패하므로,
-- 먼저 가장 오래된(id 최소) 1건만 남기고 나머지를 정리한 뒤 인덱스를 만든다.
DELETE FROM students
WHERE id NOT IN (
  SELECT MIN(id) FROM students GROUP BY session_id, student_number
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_session_number
  ON students (session_id, student_number);

-- 학생별 프롬프트 히스토리 (Session 1↔5 비교용)
CREATE TABLE IF NOT EXISTS attempts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id         INTEGER NOT NULL,
  session_number  INTEGER NOT NULL,  -- 어느 세션 (1~5)
  challenge_id    TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  generated_code  TEXT,
  score           INTEGER DEFAULT 0,
  ct_scores       TEXT DEFAULT '{}',   -- JSON: {decomp, pattern, abstract, algorithm}
  evaluation      TEXT DEFAULT '{}',   -- JSON: 전체 평가 결과
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- 교사 인증 토큰 (서버 재시작 후에도 로그인 유지)
CREATE TABLE IF NOT EXISTS teacher_tokens (
  token      TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- 학생이 만든 문제 (Session 4)
CREATE TABLE IF NOT EXISTS student_challenges (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id          INTEGER NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  code             TEXT NOT NULL,
  hint             TEXT,
  ct_elements      TEXT DEFAULT '[]',  -- JSON array
  difficulty       TEXT DEFAULT '기본', -- 기본|중급|도전
  ai_quality_score INTEGER DEFAULT 0,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- 진행 중인 챌린지 상태 (서버 재시작 후 복구용)
-- 서버가 죽어도 이 레코드로 activeChallenge 맵과 자동 종료 타이머를 되살린다.
CREATE TABLE IF NOT EXISTS active_challenges (
  session_id   TEXT PRIMARY KEY,
  challenge_id TEXT,
  time_limit   INTEGER,
  started_at   INTEGER
);
