/**
 * 챌린지 전체 데이터 (메타데이터 + 정답 코드) — **서버 전용**
 *
 * 클라이언트용 메타데이터(src/data/challenges-battle.js)에 서버 전용 정답 코드를
 * 합쳐서 서버 라우터와 채점기가 쓰는 완전한 챌린지 객체를 만든다.
 *
 * ⚠️ 이 파일은 절대 src/components/ 아래에서 import 하지 말 것.
 *    (import 하는 순간 정답 코드 23개가 클라이언트 번들로 다시 들어간다)
 */

import { BATTLE_CHALLENGES as CHALLENGE_META } from '../data/challenges-battle.js'
import { CHALLENGE_CODES } from './challenge-codes.js'

export const BATTLE_CHALLENGES = CHALLENGE_META.map((challenge) => ({
  ...challenge,
  code: CHALLENGE_CODES[challenge.id] || '',
}))

const byId = new Map(BATTLE_CHALLENGES.map((challenge) => [challenge.id, challenge]))

/** 챌린지 id로 서버가 직접 조회 — 클라이언트가 보낸 targetCode를 신뢰하지 않기 위해 사용한다. */
export function getChallenge(challengeId) {
  return byId.get(challengeId) || null
}
