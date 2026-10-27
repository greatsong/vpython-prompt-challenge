/**
 * 채점 결과 캐시 — **재현성 보장 장치**
 *
 * 왜 필요한가
 *   같은 프롬프트를 5번 채점했더니 49~66점(표준편차 5)으로 흔들렸다.
 *   수업에서 팀 순위를 매기므로 "같은 답 = 항상 같은 점수"가 보장돼야 하고,
 *   서로 다른 팀이 우연히 같은 문장을 써도 동점이 되어야 공정하다.
 *   부수 효과로 API 비용과 지연도 줄어든다.
 *
 * 키 설계
 *   sha256(캐시버전 + 채점 설정 태그(모델·effort) + challengeId + 정규화된 프롬프트)
 *   채점 모델이나 effort가 바뀌면 키가 달라져 옛 모델의 점수를 재사용하지 않는다.
 *   정규화는 보수적으로 trim + 연속 공백 1칸 축약까지만 한다.
 *   (조사·어미까지 정규화하면 다른 답이 같은 점수를 받는 사고가 난다)
 *
 * 캐시 버전
 *   루브릭이나 채점 프롬프트를 바꾸면 옛 점수가 남으면 안 되므로
 *   EVAL_CACHE_VERSION을 올려 키 공간을 통째로 갈아치운다.
 *
 * 저장하지 않는 것
 *   - 채점 실패(failed) 결과
 *   - 팀별 서명(evaluationProof) — 팀마다 달라야 하므로 매 요청에 새로 만든다
 */

import { createHash } from 'crypto'

/** 채점 규칙을 바꿀 때마다 올린다 (올리면 기존 캐시가 전부 무효가 된다)
 *  v3-2026-10-sonnet55: 채점 모델 Sonnet 4.6 → Sonnet 5.5 전환(2026-10-27)
 *  v4-2026-10-27-rubric: 루브릭·목표 코드 수정 + 채점 프롬프트에서 학생 프롬프트를 <student_prompt> 태그로 감싸 끝에 배치(2026-10-27)
 *  v5-2026-10-27-final: 앵커 기준선을 앵커 자체 CT로 계산, 기준점을 해석 예시로 낮춤, 형식 제재를 서버 규칙으로만 한정,
 *                       요소명 게이트 완화, CT 한 글자 이름·문장 분할 수정(2026-10-27)
 *  v6-2026-10-27-feedback: 피드백 금지 표현 규칙(견주다·그냥·쓰다·뜨다·재다·대시) 추가와 서버 후처리 치환(2026-10-27) */
export const EVAL_CACHE_VERSION = 'v6-2026-10-27-feedback'

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS evaluation_cache (
    cache_key       TEXT PRIMARY KEY,
    challenge_id    TEXT,
    evaluation_json TEXT NOT NULL,
    created_at      INTEGER NOT NULL
  )
`

// 요청마다 DDL을 돌리지 않도록 DB 핸들 단위로 1회만 초기화한다
const initialized = new WeakSet()

/**
 * 캐시 테이블 보장 (멱등).
 * 배포본 /data 볼륨의 기존 DB에는 테이블이 없을 수 있어 런타임에도 한 번 더 실행한다.
 */
export function ensureEvaluationCache(db) {
  if (!db || initialized.has(db)) return
  db.exec(CREATE_TABLE_SQL)
  initialized.add(db)
}

/** 캐시 키 계산용 프롬프트 정규화 — trim + 연속 공백 1칸 */
export function normalizeForCache(prompt) {
  return String(prompt || '').trim().replace(/\s+/g, ' ')
}

/**
 * 캐시 키 = sha256(버전 + 채점 설정 태그 + 챌린지 + 정규화 프롬프트), 구분자는 NUL(\0)
 * evalTag는 ai.js의 EVALUATE_CACHE_TAG (예: 'claude-sonnet-5-5/effort-medium')
 */
export function buildCacheKey(challengeId, prompt, evalTag = '') {
  return createHash('sha256')
    .update(`${EVAL_CACHE_VERSION}\0${evalTag}\0${challengeId || ''}\0${normalizeForCache(prompt)}`)
    .digest('hex')
}

/** 캐시 조회 — 없으면 null */
export function readEvaluationCache(db, cacheKey) {
  if (!db) return null
  ensureEvaluationCache(db)
  const row = db.prepare('SELECT evaluation_json FROM evaluation_cache WHERE cache_key = ?').get(cacheKey)
  if (!row) return null
  try {
    return JSON.parse(row.evaluation_json)
  } catch {
    // 저장값이 깨졌으면 캐시 미스로 취급하고 지운다
    db.prepare('DELETE FROM evaluation_cache WHERE cache_key = ?').run(cacheKey)
    return null
  }
}

/** 캐시 저장 — 실패 결과(failed)는 저장하지 않는다 */
export function writeEvaluationCache(db, cacheKey, challengeId, evaluation) {
  if (!db || !evaluation || evaluation.failed) return
  ensureEvaluationCache(db)
  db.prepare(
    `INSERT INTO evaluation_cache (cache_key, challenge_id, evaluation_json, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(cache_key) DO NOTHING`
  ).run(cacheKey, challengeId || null, JSON.stringify(evaluation), Date.now())
}
