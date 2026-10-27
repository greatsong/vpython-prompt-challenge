-- VPython 프롬프트 챌린지 — SQLite 스키마
-- 수업 세션
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  teacher_code TEXT NOT NULL,
  mode       TEXT DEFAULT 'battle',  -- battle|detective|surgery|creator|compare
  status     TEXT DEFAULT 'waiting', -- waiting|active|paused|ended
  session_number INTEGER DEFAULT 1,  -- 1~5 (어느 세션인지)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  owner_token_hash TEXT               -- 만든 교사 토큰의 해시 (연수 토큰의 자기 수업 확인용)
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
  proof_jti       TEXT,                -- 평가 증명 id (같은 증명 재사용 방지, 유니크 인덱스는 migrate.js)
  created_ms      INTEGER,             -- 저장 시각(ms). created_at은 초 단위라 같은 초의 라운드 경계를 가르지 못한다
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- 교사 인증 토큰 (서버 재시작 후에도 로그인 유지)
-- scope·issued_at 컬럼은 teacherAuth.js의 initTeacherAuth가 보강한다
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

-- 채점 결과 캐시 (재현성 보장)
-- 같은 챌린지에 같은 프롬프트가 다시 들어오면 AI를 다시 부르지 않고 저장된 평가를 그대로 준다.
-- "같은 답 = 항상 같은 점수"가 보장되고, 다른 팀이 우연히 같은 문장을 써도 동점이 된다.
-- cache_key = sha256(캐시버전 + challenge_id + 정규화된 프롬프트) — src/api/evaluationCache.js 참조.
CREATE TABLE IF NOT EXISTS evaluation_cache (
  cache_key       TEXT PRIMARY KEY,
  challenge_id    TEXT,
  evaluation_json TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

-- 세션별 최근 챌린지 상태 (서버 재시작 후 복구 + 마감 판정용)
-- 서버가 죽어도 이 레코드로 activeChallenge 맵과 자동 종료 타이머를 되살린다.
-- ended_at IS NULL 이면 진행 중, 값이 있으면 그 시각에 마감됐다(마감 직후 유예 제출 판정에 쓴다).
CREATE TABLE IF NOT EXISTS active_challenges (
  session_id   TEXT PRIMARY KEY,
  challenge_id TEXT,
  time_limit   INTEGER,
  started_at   INTEGER,
  ended_at     INTEGER
);
