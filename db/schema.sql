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
