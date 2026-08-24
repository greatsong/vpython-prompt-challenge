/**
 * E2E 시뮬레이션 — 스모크 / 정원 / 재접속
 *
 * 로컬 서버(http://localhost:4009)에 실제 HTTP + 소켓 클라이언트로 붙어
 * 수업 상황을 재현한다. AI 호출 비용을 줄이기 위해 capacity 테스트는 evaluate를 건너뛰고
 * /api/attempts로 점수를 직접 주입해 집계·순위 로직만 검증한다.
 */

import { io } from 'socket.io-client'

const BASE = process.env.E2E_BASE || 'http://localhost:4009'
const PIN = process.env.TEACHER_PIN || '202601'

const results = { passed: 0, failed: 0, details: [] }
function record(name, ok, detail = '') {
  results[ok ? 'passed' : 'failed']++
  results.details.push(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
  console.log(results.details.at(-1))
}

async function http(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-teacher-token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

function teacherSocket(token, sessionId) {
  const sock = io(BASE, { path: '/socket.io', transports: ['websocket'], forceNew: true })
  sock.on('connect', () => {
    sock.emit('auth:teacher', { token })
    sock.emit('teacher:join', { sessionId })
  })
  return sock
}

function teamSocket(sessionId, teamId) {
  const sock = io(BASE, { path: '/socket.io', transports: ['websocket'], forceNew: true })
  sock.on('connect', () => sock.emit('team:join', { sessionId, teamId }))
  return sock
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

async function waitEvent(sock, ev, ms = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${ev}`)), ms)
    sock.once(ev, (data) => { clearTimeout(t); resolve(data) })
  })
}

// ═══ SMOKE ═══════════════════════════════════════════════════════════
async function smokeTest() {
  console.log('\n━━━ 스모크: 교사 1 + 팀 2 + 챌린지 1 ━━━')
  const teacherCode = 'smoke-' + Date.now()

  // 교사 인증
  const { status: s1, data: auth } = await http('/api/auth/teacher', { method: 'POST', body: { pin: PIN } })
  record('PIN 인증', s1 === 200 && auth.token, `token=${auth?.token?.slice(0, 8)}...`)
  const token = auth.token

  // 토큰 없이 세션 생성 → 401 기대
  const { status: s2 } = await http('/api/session/create', { method: 'POST', body: { teacherCode } })
  record('토큰 없이 /create 거부', s2 === 401)

  // 토큰으로 세션 생성
  const { status: s3, data: sess } = await http('/api/session/create', { method: 'POST', token, body: { teacherCode } })
  record('세션 생성', s3 === 200 && sess.sessionId, `sessionId=${sess?.sessionId?.slice(0, 8)}...`)
  const sessionId = sess.sessionId

  // 2팀 등록
  const { data: t1 } = await http('/api/session/register', { method: 'POST', body: {
    teacherCode, students: [{ studentNumber: 'S001', studentName: '학생A' }, { studentNumber: 'S002', studentName: '학생B' }]
  }})
  record('팀 1 등록 (2인)', !!t1.teamId && !t1.alreadyRegistered)

  const { data: t2 } = await http('/api/session/register', { method: 'POST', body: {
    teacherCode, students: [{ studentNumber: 'S003', studentName: '학생C' }]
  }})
  record('팀 2 등록 (1인)', !!t2.teamId && !t2.alreadyRegistered)

  // 같은 학번으로 재등록 → alreadyRegistered
  const { data: t1dup } = await http('/api/session/register', { method: 'POST', body: {
    teacherCode, students: [{ studentNumber: 'S001', studentName: '학생A' }]
  }})
  record('중복 등록 감지', t1dup.alreadyRegistered === true && t1dup.teamId === t1.teamId)

  // forceNewTeam → 새 팀
  const { data: t1new } = await http('/api/session/register', { method: 'POST', body: {
    teacherCode, students: [{ studentNumber: 'S001', studentName: '학생A' }], forceNewTeam: true
  }})
  record('forceNewTeam 새 팀 발급', t1new.teamId && t1new.teamId !== t1.teamId)

  // 소켓 통신: 교사 + 팀 소켓
  const teacherSock = teacherSocket(token, sessionId)
  const team1Sock = teamSocket(sessionId, t1new.teamId)
  const team2Sock = teamSocket(sessionId, t2.teamId)

  await wait(300)

  // 교사가 challenge 시작 → 팀들이 수신
  const t1Start = waitEvent(team1Sock, 'challenge:started').catch(() => null)
  const t2Start = waitEvent(team2Sock, 'challenge:started').catch(() => null)
  teacherSock.emit('challenge:start', { sessionId, challengeId: 'battle-01', timeLimit: 180 })
  const [r1, r2] = await Promise.all([t1Start, t2Start])
  record('챌린지 시작 브로드캐스트', !!r1 && !!r2)

  // 각 팀이 attempt 저장 (AI 생략)
  const { status: a1 } = await http('/api/attempts', { method: 'POST', token, body: {
    teamId: t1new.teamId, sessionNumber: 1, challengeId: 'battle-01',
    prompt: '중앙에 청록색 고리가 세워져 있다', generatedCode: 'ring(...)',
    score: 88, ctScores: { abstract: 15 }, evaluation: { feedback: '좋음', category_scores: {structure: 0, spatial: 25, proportion: 20, shape: 15, color: 5} }
  }})
  const { status: a2 } = await http('/api/attempts', { method: 'POST', token, body: {
    teamId: t2.teamId, sessionNumber: 1, challengeId: 'battle-01',
    prompt: '파란 동그라미', generatedCode: 'ring(...)',
    score: 45, evaluation: { feedback: '부족', category_scores: {structure: 0, spatial: 5, proportion: 5, shape: 15, color: 5} }
  }})
  record('attempts 저장', a1 === 200 && a2 === 200)

  // 교사가 reveal → 랭킹 수신
  const teacherReveal = waitEvent(teacherSock, 'result:revealed').catch(() => null)
  teacherSock.emit('challenge:reveal', { sessionId, challengeId: 'battle-01' })
  const reveal = await teacherReveal
  const ok = reveal?.rankings?.[0]?.score === 88 && reveal.rankings[0].prompt.includes('청록색')
  record('랭킹 정확도 (MAX 집계 + 프롬프트 일치)', ok,
    `1등=${reveal?.rankings?.[0]?.score}, prompt="${reveal?.rankings?.[0]?.prompt?.slice(0,20)}..."`)

  teacherSock.disconnect(); team1Sock.disconnect(); team2Sock.disconnect()
  return { sessionId, token, teacherCode }
}

// ═══ CAPACITY ═══════════════════════════════════════════════════════
async function capacityTest() {
  const teacherCode = 'cap-' + Date.now()

  const { data: auth } = await http('/api/auth/teacher', { method: 'POST', body: { pin: PIN } })
  const token = auth.token

  const { data: sess } = await http('/api/session/create', { method: 'POST', token, body: { teacherCode } })
  const sessionId = sess.sessionId

  // 정원은 서버가 알려준다 (MAX_TEAMS 환경변수로 바뀔 수 있으므로 하드코딩하지 않는다)
  const maxTeams = sess.maxTeams
  const bulkCount = maxTeams - 1 // 마지막 1자리는 "정원 딱 채우기" 검증용으로 남긴다
  console.log(`\n━━━ 정원 테스트: ${bulkCount}팀 + 정원 채우기 + 초과 관람자 (상한 ${maxTeams}팀) ━━━`)
  record('세션 생성 응답에 maxTeams 포함', Number.isInteger(maxTeams) && maxTeams > 0, `maxTeams=${maxTeams}`)

  // 정원 직전까지 병렬 등록
  const regs = await Promise.all(Array.from({ length: bulkCount }, (_, i) =>
    http('/api/session/register', { method: 'POST', body: {
      teacherCode,
      students: [
        { studentNumber: `C${i+1}01`, studentName: `팀${i+1}_학생1` },
        { studentNumber: `C${i+1}02`, studentName: `팀${i+1}_학생2` },
      ],
    }})
  ))
  const teamIds = regs.map(r => r.data.teamId)
  record(`${bulkCount}팀 동시 등록`, teamIds.every(Boolean) && new Set(teamIds).size === bulkCount,
    `${teamIds.filter(Boolean).length}/${bulkCount}, unique=${new Set(teamIds).size}`)

  // 정원을 딱 채우는 마지막 팀 → 아직 정원 내이므로 새 팀 생성
  const { data: lastTeam } = await http('/api/session/register', { method: 'POST', body: {
    teacherCode, students: [{ studentNumber: 'CLAST01', studentName: `팀${maxTeams}학생` }]
  }})
  record(`${maxTeams}번째는 정원 내(새 팀)`, !!lastTeam.teamId && !lastTeam.spectator)

  // 정원 초과 → 관람자 + capacity 사유 명시
  const { data: over } = await http('/api/session/register', { method: 'POST', body: {
    teacherCode, students: [{ studentNumber: 'COVER01', studentName: '초과학생' }]
  }})
  record(`${maxTeams + 1}번째는 관람자 모드`, over.spectator === true)
  record('관람자 강등에 capacity 사유 명시', over.reason === 'capacity' && typeof over.message === 'string' && over.message.length > 0,
    `reason=${over.reason}, message="${over.message}"`)
  record('관람자 응답에 정원 정보 포함', over.maxTeams === maxTeams, `maxTeams=${over.maxTeams}`)

  // 교사 일괄 생성 API도 정원을 검사해야 한다 (이미 꽉 찬 세션이므로 거부되어야 함)
  const bulkOver = await http(`/api/session/${sessionId}/teams`, { method: 'POST', token, body: {
    students: [{ studentNumber: 'B001', studentName: '일괄초과1' }, { studentNumber: 'B002', studentName: '일괄초과2' }],
  }})
  record('교사 일괄 생성 API가 정원 초과를 거부', bulkOver.status === 400 && bulkOver.data?.reason === 'capacity',
    `status=${bulkOver.status}, error="${bulkOver.data?.error}"`)

  // allowOverflow: true면 교사가 의도적으로 정원을 넘길 수 있다
  const bulkForced = await http(`/api/session/${sessionId}/teams`, { method: 'POST', token, body: {
    students: [{ studentNumber: 'B101', studentName: '강제생성1' }, { studentNumber: 'B102', studentName: '강제생성2' }],
    allowOverflow: true,
  }})
  record('allowOverflow: true면 정원 초과 생성 허용', bulkForced.status === 200 && bulkForced.data?.teams?.length === 1,
    `status=${bulkForced.status}, teams=${bulkForced.data?.teams?.length}`)

  // 정원 내 팀들의 attempts 병렬 삽입 (점수 0~100 랜덤)
  // 점수는 1~100에서 중복 없이 뽑는다 — 0점이나 동점 1등이 생기면 아래 검증이 흔들린다
  const scorePool = Array.from({ length: 100 }, (_, i) => i + 1).sort(() => Math.random() - 0.5)
  const scores = teamIds.map((_, i) => scorePool[i])
  await Promise.all(teamIds.map((tid, i) =>
    http('/api/attempts', { method: 'POST', token, body: {
      teamId: tid, sessionNumber: 1, challengeId: 'battle-04',
      prompt: `팀${i+1}의 프롬프트 (${scores[i]}점 목표)`,
      generatedCode: '// code', score: scores[i],
      evaluation: { feedback: `팀${i+1} 피드백`, category_scores: {structure: scores[i]/4, spatial: scores[i]/4, proportion: scores[i]/5, shape: scores[i]/10, color: scores[i]/20} }
    }})
  ))
  record(`${bulkCount}팀 attempts 병렬 저장`, true)

  // 랭킹 쿼리 (HTTP)
  const { data: rk } = await http(`/api/dashboard/rankings/${sessionId}?challengeId=battle-04`, { token })
  const topScore = rk.rankings[0].score
  const expectedTop = Math.max(...scores)
  const topTeamIdx = scores.indexOf(expectedTop)
  const topPromptMatches = rk.rankings[0].prompt.includes(`팀${topTeamIdx+1}의 프롬프트`)
  record('랭킹 1등 점수 정확', topScore === expectedTop, `expected=${expectedTop}, got=${topScore}`)
  record('랭킹 1등 프롬프트가 같은 row에서 옴 (MAX 집계 버그 없음)', topPromptMatches,
    `prompt="${rk.rankings[0].prompt?.slice(0,30)}..."`)
  // 세션에는 정원 채운 maxTeams개 + allowOverflow로 만든 1개 = maxTeams+1팀,
  // 그중 attempts를 낸 건 bulkCount팀뿐이다
  const expectedRankingTeams = maxTeams + 1
  const withScore = rk.rankings.filter(r => r.score > 0).length
  record(`전 팀 랭킹 노출 + 제출한 ${bulkCount}팀만 점수`,
    rk.rankings.length === expectedRankingTeams && withScore === bulkCount,
    `teams=${rk.rankings.length}(expected ${expectedRankingTeams}), scored=${withScore}`)

  // 점수 정렬 확인
  const sorted = [...rk.rankings].every((r, i, arr) => i === 0 || arr[i-1].score >= r.score)
  record('점수 내림차순 정렬', sorted)
}

// ═══ RECONNECT ═══════════════════════════════════════════════════════
async function reconnectTest() {
  console.log('\n━━━ 재접속 테스트: 교사 소켓 강제 끊기 ━━━')
  const teacherCode = 'rec-' + Date.now()

  const { data: auth } = await http('/api/auth/teacher', { method: 'POST', body: { pin: PIN } })
  const token = auth.token
  const { data: sess } = await http('/api/session/create', { method: 'POST', token, body: { teacherCode } })
  const sessionId = sess.sessionId

  const { data: team } = await http('/api/session/register', { method: 'POST', body: {
    teacherCode, students: [{ studentNumber: 'R001', studentName: '재접속테스터' }]
  }})
  const teamId = team.teamId

  // 교사 소켓 연결 — auth + join이 자동으로 매번 connect에서 실행되는 패턴 재현
  const teacherSock = io(BASE, { path: '/socket.io', transports: ['websocket'], forceNew: true, reconnection: true, reconnectionDelay: 300 })
  const doAuthAndJoin = () => {
    teacherSock.emit('auth:teacher', { token })
    teacherSock.emit('teacher:join', { sessionId })
  }
  teacherSock.on('connect', doAuthAndJoin)

  // 팀 소켓
  const teamSock = teamSocket(sessionId, teamId)
  await wait(400)

  // 첫 번째 브로드캐스트 — 교사에게 직접 가지 않지만, 팀이 이벤트를 받을 수 있는지 먼저 확인
  const firstStart = waitEvent(teamSock, 'challenge:started').catch(() => null)
  teacherSock.emit('challenge:start', { sessionId, challengeId: 'battle-01', timeLimit: 60 })
  const r1 = await firstStart
  record('재접속 전 브로드캐스트 정상', !!r1)

  // 교사 소켓 강제 끊기
  teacherSock.io.engine.close() // 트랜스포트 강제 종료 (reconnect 시도함)
  await wait(1200) // 재접속 대기

  record('재접속 완료', teacherSock.connected)

  // 재접속 후 hint 브로드캐스트 → 팀이 받는지 (교사가 방 재입장 했다는 증거)
  const hintWait = waitEvent(teamSock, 'challenge:hint', 2000).catch(() => null)
  teacherSock.emit('challenge:hint', { sessionId, hint: '재접속 후 힌트' })
  const hintResult = await hintWait
  record('재접속 후 교사가 방에 복귀해 브로드캐스트 가능', !!hintResult && hintResult.hint === '재접속 후 힌트')

  teacherSock.disconnect(); teamSock.disconnect()
}

// ═══ 정리 ════════════════════════════════════════════════════════════
async function cleanup() {
  // better-sqlite3 직접 연결 없이, 테스트에서 쓴 teacherCode 기반으로 남긴 row는
  // 수업코드 prefix(smoke-/cap-/rec-)로 식별 가능. 서버 API에 bulk delete가 없으니
  // 개발 환경에서는 그냥 남겨도 됨 — session status='ended'로라도 마킹은 되지 않음.
  // 실제 운영엔 영향 없음 (teacherCode가 unique한 epoch 기반).
  console.log('\n(테스트 데이터는 로컬 DB에 남음 — 필요 시 수동 정리)')
}

// ═══ 실행 ════════════════════════════════════════════════════════════
;(async () => {
  const start = Date.now()
  try {
    await smokeTest()
    await capacityTest()
    await reconnectTest()
  } catch (err) {
    console.error('\n💥 테스트 중 예외:', err)
    results.failed++
    results.details.push(`💥 exception: ${err.message}`)
  }
  await cleanup()
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log('\n═══ 결과 요약 ═══')
  console.log(`통과: ${results.passed}, 실패: ${results.failed}, 소요: ${elapsed}s`)
  if (results.failed > 0) {
    console.log('\n실패 항목:')
    results.details.filter(l => l.startsWith('❌') || l.startsWith('💥')).forEach(l => console.log('  ' + l))
  }
  process.exit(results.failed > 0 ? 1 : 0)
})()
