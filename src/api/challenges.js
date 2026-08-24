import { Router } from 'express'
// 정답 코드가 포함된 서버 전용 챌린지 데이터 (클라이언트 번들에는 메타데이터만 들어간다)
import { BATTLE_CHALLENGES } from '../server-data/challenges.js'

const router = Router()

/** 정답 코드를 뺀 사본 — 목록 응답에는 절대 code를 담지 않는다 */
function withoutCode(challenge) {
  const { code, ...rest } = challenge
  return rest
}

// GET /api/challenges?session=1 — 세션별 챌린지 목록 (정답 코드 제외)
//
// ⚠️ 이 엔드포인트는 무인증이다. 예전에는 23개 챌린지의 정답 코드를 통째로 반환해서,
//    번들에서 정답을 빼낸 조치를 학생이 주소창 한 줄로 무력화할 수 있었다.
//    목록은 메타데이터(제목·난이도·힌트)만 주고, 코드는 아래 단건 조회로만 나간다.
//    클라이언트에서 이 목록의 code를 쓰는 곳은 없다(교사 화면도 메타데이터만 쓴다).
router.get('/', (req, res) => {
  const sessionNum = parseInt(req.query.session) || 1

  // 프리셋 챌린지 (코드에서 제공)
  const presets = BATTLE_CHALLENGES
    .filter((c) => !c.sessionOnly || c.sessionOnly === sessionNum)
    .map(withoutCode)

  // 학생 출제 챌린지 (Session 4에서 등록한 것, Session 5에서 사용)
  const studentMade = req.db
    .prepare('SELECT * FROM student_challenges ORDER BY created_at DESC')
    .all()
    .map((c) => ({
      ...withoutCode(c),
      ct_elements: JSON.parse(c.ct_elements),
      source: 'student',
    }))

  res.json({ presets, studentMade })
})

// GET /api/challenges/:id — 단건 조회 (정답 코드 포함)
//
// 무인증을 유지하는 이유: 학생 화면(TeamApp)과 관전 화면(SpectatorPage)이 이 응답의 code로
// 목표 3D 장면을 렌더링한다. 어차피 그 코드는 학생 브라우저에서 실행돼야 하므로 감출 수 없다.
// 대신 한 번에 한 문제만 나가므로, 23개를 한꺼번에 긁어가는 것은 막힌다.
router.get('/:id', (req, res) => {
  const challenge = BATTLE_CHALLENGES.find((c) => c.id === req.params.id)
  if (!challenge) return res.status(404).json({ error: '챌린지 없음' })
  res.json(challenge)
})

// POST /api/challenges — 학생 출제 문제 등록 (Session 4)
router.post('/', (req, res) => {
  const { teamId, title, description, code, hint, ct_elements, difficulty } = req.body

  if (!teamId || !title || !code)
    return res.status(400).json({ error: 'teamId, title, code 필요' })

  const result = req.db
    .prepare(
      `INSERT INTO student_challenges
         (team_id, title, description, code, hint, ct_elements, difficulty)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      teamId,
      title,
      description || '',
      code,
      hint || '',
      JSON.stringify(ct_elements || []),
      difficulty || '기본'
    )

  res.json({ id: result.lastInsertRowid, title })
})

export default router
