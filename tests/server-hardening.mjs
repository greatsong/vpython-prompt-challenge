/**
 * 서버 안정성·보안 회귀 테스트 — server.js를 임시 DB로 띄워 실제 HTTP·소켓으로 검증한다.
 *
 * - 운영·개발 DB를 건드리지 않도록 DB_PATH로 임시 파일을 쓰고, 끝나면 지운다.
 * - AI는 부르지 않는다(ANTHROPIC_BASE_URL을 닫힌 포트로 둔다). AI 경로는 tests/offline-routes.mjs가 맡는다.
 *
 * 실행: node tests/server-hardening.mjs
 */
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import net from 'net'
import { io } from 'socket.io-client'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const PIN = 'hardening-pin-1234'
const TRAINING = 'hardening-train'
const LEAK_MARK = 'PIN-LEAK-CHECK-7731'

const results = []
const check = (name, cond, info = '') => {
  results.push([cond ? 'PASS' : 'FAIL', name, info])
  console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : info)
}
const S = (o) => JSON.stringify(o)?.slice(0, 300)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function startServer(extraEnv = {}) {
  const env = {
    ...process.env,
    TEACHER_PIN: PIN,
    TRAINING_CODE: TRAINING,
    EVALUATION_SECRET: 'hardening-secret',
    ANTHROPIC_API_KEY: 'sk-ant-fake',
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
    AUTH_FAIL_LIMIT: '1000',
    ...extraEnv,
  }
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', (d) => { log += d })
  child.stderr.on('data', (d) => { log += d })
  return { child, getLog: () => log }
}

async function waitHealthy(base, ms = 8000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      const r = await fetch(base + '/api/health')
      if (r.ok) return true
    } catch { /* 아직 안 뜸 */ }
    await wait(100)
  }
  return false
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpy-hardening-'))

// ── 1. EVALUATION_SECRET 없이 기동 → 명확한 오류로 종료 (#15) ──────────────────
{
  const port = await freePort()
  const { child, getLog } = startServer({ PORT: String(port), DB_PATH: path.join(tmpDir, 'nosecret.db'), EVALUATION_SECRET: '' })
  const code = await new Promise((resolve) => {
    const t = setTimeout(() => { child.kill(); resolve('timeout') }, 8000)
    child.on('exit', (c) => { clearTimeout(t); resolve(c) })
  })
  check('#15 EVALUATION_SECRET 없으면 기동 중단(exit 1) + 안내', code === 1 && getLog().includes('EVALUATION_SECRET'), `code=${code} log=${getLog().slice(0, 200)}`)
}

// ── 2. 본 서버 기동 ────────────────────────────────────────────────────────────
const port = await freePort()
const BASE = `http://127.0.0.1:${port}`
const { child, getLog } = startServer({ PORT: String(port), DB_PATH: path.join(tmpDir, 'test.db') })
let exited = null
child.on('exit', (c, sig) => { exited = { c, sig } })
const healthy = await waitHealthy(BASE)
check('서버 기동', healthy, getLog().slice(-500))
if (!healthy) {
  child.kill()
  process.exit(1)
}

async function http(p, { method = 'GET', token, teamToken, body, raw, headers = {} } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-teacher-token': token } : {}),
      ...(teamToken ? { 'x-team-token': teamToken } : {}),
      ...headers,
    },
    body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined,
  })
  const textBody = await res.text()
  let data = null
  try { data = JSON.parse(textBody) } catch { data = textBody }
  return { status: res.status, data, contentType: res.headers.get('content-type') || '' }
}

const sockets = []
function connect() {
  const s = io(BASE, { path: '/socket.io', transports: ['websocket'], forceNew: true, reconnection: false })
  sockets.push(s)
  return new Promise((resolve) => s.on('connect', () => resolve(s)))
}
function waitEvent(sock, ev, ms = 1500) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    sock.once(ev, (d) => { clearTimeout(t); resolve(d ?? {}) })
  })
}
function emitAck(sock, ev, payload, ms = 1500) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ timeout: true }), ms)
    sock.emit(ev, payload, (res) => { clearTimeout(t); resolve(res) })
  })
}

try {
  // ── 오류 응답 JSON (#13) ──────────────────────────────────────────────────
  let r = await http('/api/auth/teacher', { method: 'POST', raw: `{"pin":"${LEAK_MARK}` })
  check('#13 잘못된 JSON → 400 JSON', r.status === 400 && r.contentType.includes('json') && typeof r.data?.error === 'string', S(r))
  check('#13 오류 응답에 스택 없음', !/at\s+\S+\s+\(|node_modules|SyntaxError/.test(JSON.stringify(r.data)), S(r.data))
  r = await http('/api/session/register', { method: 'POST', raw: JSON.stringify({ x: 'a'.repeat(70 * 1024) }) })
  check('#13 64KB 초과 본문 → 413 JSON', r.status === 413 && r.contentType.includes('json') && typeof r.data?.error === 'string', S(r))
  r = await http('/api/없는경로')
  check('#13 없는 API → 404 JSON', r.status === 404 && r.contentType.includes('json'), S(r))
  await wait(200)
  check('#13 서버 로그에 요청 본문(PIN) 없음', !getLog().includes(LEAK_MARK), getLog().split('\n').filter((l) => l.includes(LEAK_MARK)).join('\n'))

  // ── 준비: 교사·수업·팀 ───────────────────────────────────────────────────
  const auth = await http('/api/auth/teacher', { method: 'POST', body: { pin: PIN } })
  const token = auth.data.token
  const sess = await http('/api/session/create', { method: 'POST', token, body: { teacherCode: 'qa-be-hard' } })
  const sessionId = sess.data.sessionId
  const t1 = await http('/api/session/register', { method: 'POST', body: { teacherCode: 'qa-be-hard', students: [{ studentNumber: 'H001', studentName: '하나' }, { studentNumber: 'H002', studentName: '둘' }] } })
  const t2 = await http('/api/session/register', { method: 'POST', body: { teacherCode: 'qa-be-hard', students: [{ studentNumber: 'H003', studentName: '셋' }] } })
  check('준비: 수업·팀 2개', !!sessionId && !!t1.data.teamToken && !!t2.data.teamToken, S([sess, t1, t2]))

  // ── payload 없는 소켓 이벤트 → 프로세스 생존 (#1) ─────────────────────────
  const fuzzT = await connect()
  fuzzT.emit('auth:teacher', { token })
  await wait(100)
  const fuzzA = await connect()
  const events = ['team:join', 'teacher:join', 'auth:teacher', 'challenge:start', 'challenge:end', 'challenge:hint',
    'challenge:reveal', 'session:final-end', 'team:score-update', 'chat:all', 'chat:team']
  const bad = [undefined, null, 'str', 42, [], [1, 2], { sessionId: null }, { sessionId: {} }, { teamId: { $ne: 1 } }]
  for (const s of [fuzzA, fuzzT]) {
    for (const ev of events) {
      if (ev === 'session:final-end') continue // 아래에서 수업을 끝내지 않도록 이 이벤트는 빈 payload만
      for (const p of bad) {
        if (p === undefined) s.emit(ev)
        else s.emit(ev, p)
      }
      s.emit(ev, () => {}) // payload 자리에 콜백만
    }
    s.emit('session:final-end')
    s.emit('session:final-end', null)
  }
  // ack가 있는 경우 오류가 ack로 돌아오는지
  const ackRes = await emitAck(fuzzT, 'challenge:start', 'str')
  await wait(500)
  const health = await http('/api/health')
  check('#1 잘못된 payload 소켓 이벤트 11종 × 9형태 → 프로세스 생존', exited === null && health.status === 200, `exited=${S(exited)}`)
  check('#1 잘못된 payload에 ack로 실패 사유', ackRes && ackRes.ok === false, S(ackRes))
  check('#1 처리되지 않은 예외 로그 없음', !getLog().includes('[Process] 처리되지 않은'), getLog().split('\n').filter((l) => l.includes('[Process]')).slice(0, 3).join('\n'))
  const sessAfter = await http(`/api/session/${sessionId}`)
  check('#1 퍼징 후에도 수업이 끝나지 않음(빈 payload final-end 무시)', sessAfter.data.status !== 'ended', S(sessAfter))

  // ── 교사·팀 소켓 (#10) ───────────────────────────────────────────────────
  const teacher = await connect()
  const authAck = await emitAck(teacher, 'auth:teacher', { token })
  const joinAck = await emitAck(teacher, 'teacher:join', { sessionId })
  check('#10 교사 auth + teacher:join', authAck?.ok === true && joinAck?.ok === true, S([authAck, joinAck]))
  const teacher2 = await connect()
  const joinWithToken = await emitAck(teacher2, 'teacher:join', { sessionId, token })
  check('#10 teacher:join에 token을 함께 보내도 인증', joinWithToken?.ok === true, S(joinWithToken))
  const badTeacher = await connect()
  const badJoin = await emitAck(badTeacher, 'teacher:join', { sessionId, token: 'not-a-token' })
  check('#10 잘못된 교사 토큰 teacher:join 거부', badJoin?.ok === false, S(badJoin))

  const noTok = await connect()
  const errEv = waitEvent(noTok, 'team:join:error')
  const noTokAck = await emitAck(noTok, 'team:join', { sessionId, teamId: t1.data.teamId })
  check('#10 팀 토큰 없이 team:join → 거부 + team:join:error', noTokAck?.ok === false && !!(await errEv), S(noTokAck))
  const wrongTok = await connect()
  const wrongAck = await emitAck(wrongTok, 'team:join', { sessionId, teamId: t1.data.teamId, teamToken: t2.data.teamToken })
  check('#10 다른 팀 토큰으로 team:join → 거부', wrongAck?.ok === false, S(wrongAck))

  const team1 = await connect()
  const team1Ack = await emitAck(team1, 'team:join', { sessionId: 'spoofed-session', teamId: t1.data.teamId, teamToken: t1.data.teamToken })
  check('#10 올바른 토큰 team:join → 실제 팀 세션으로 입장', team1Ack?.ok === true && team1Ack.sessionId === sessionId, S(team1Ack))
  const team2 = await connect()
  await emitAck(team2, 'team:join', { sessionId, teamId: t2.data.teamId, teamToken: t2.data.teamToken })
  const spectator = await connect()
  const specAck = await emitAck(spectator, 'team:join', { sessionId, teamId: 'spectator' })
  check('#10 관람자 입장(토큰 없이 세션 방만)', specAck?.ok === true && specAck.spectator === true, S(specAck))

  // 토큰 없이 들어오려던 소켓은 방송을 못 받는다
  const leakHint = waitEvent(noTok, 'challenge:hint', 800)
  teacher.emit('challenge:hint', { sessionId, hint: '힌트' })
  check('#10 인증 실패 소켓은 수업 방송을 받지 못함', (await leakHint) === null)

  // ── 채팅·점수 알림은 socket.data 기준 (#10) ────────────────────────────────
  let got = waitEvent(team2, 'chat:all')
  team1.emit('chat:all', { sessionId: 'other', teamName: '가짜팀', teamColor: '#000', sender: '선생님', message: 'x'.repeat(600) })
  let chat = await got
  check('#10 팀 채팅: sender·팀명은 서버가 정함', chat && chat.sender === '하나 · 둘' && chat.teamName !== '가짜팀', S(chat))
  check('#10 채팅 500자 제한', chat && chat.message.length === 500, `len=${chat?.message?.length}`)
  got = waitEvent(team1, 'chat:all')
  teacher.emit('chat:all', { sessionId, sender: '해커', message: '안내합니다' })
  chat = await got
  check('#10 교사 채팅 sender는 "선생님"', chat && chat.sender === '선생님', S(chat))
  got = waitEvent(team1, 'chat:all')
  spectator.emit('chat:all', { sessionId, sender: '선생님', message: '관람자 메시지' })
  chat = await got
  check('#10 관람자 채팅 sender는 "관람자"', chat && chat.sender === '관람자', S(chat))
  const outsider = await connect()
  got = waitEvent(team1, 'chat:all', 800)
  outsider.emit('chat:all', { sessionId, sender: '선생님', message: '외부인' })
  check('#10 입장하지 않은 소켓의 채팅은 방송되지 않음', (await got) === null)
  got = waitEvent(teacher, 'team:submitted')
  team1.emit('team:score-update', { sessionId, teamId: t2.data.teamId, score: 100, evaluation: { big: 'x' } })
  const sub = await got
  check('#10 team:score-update는 소켓의 팀 id로만 알림 (payload teamId·score 무시)', sub && sub.teamId === t1.data.teamId && sub.score !== 100 && !('evaluation' in sub), S(sub))

  // ── challenge:start 검증 (#7) ─────────────────────────────────────────────
  for (const [label, payload] of [
    ['없는 challengeId', { sessionId, challengeId: 'battle-999', timeLimit: 60 }],
    ['timeLimit 10', { sessionId, challengeId: 'battle-01', timeLimit: 10 }],
    ['timeLimit 99999', { sessionId, challengeId: 'battle-01', timeLimit: 99999 }],
    ['timeLimit 1.5', { sessionId, challengeId: 'battle-01', timeLimit: 1.5 }],
    ['timeLimit 1e10', { sessionId, challengeId: 'battle-01', timeLimit: 1e10 }],
    ['timeLimit -5', { sessionId, challengeId: 'battle-01', timeLimit: -5 }],
    ['timeLimit "abc"', { sessionId, challengeId: 'battle-01', timeLimit: 'abc' }],
    ['timeLimit "-5"', { sessionId, challengeId: 'battle-01', timeLimit: '-5' }],
  ]) {
    const res = await emitAck(teacher, 'challenge:start', payload)
    check(`#7 challenge:start 거부 — ${label}`, res?.ok === false, S(res))
  }
  let started = waitEvent(team1, 'challenge:started')
  const specStarted = waitEvent(spectator, 'challenge:started')
  let res = await emitAck(teacher, 'challenge:start', { sessionId, challengeId: 'battle-01', timeLimit: 60 })
  const st = await started
  check('#7 challenge:start 정상(60초)', res?.ok === true && !!st, S(res))
  // 시작 이벤트에 챌린지 정보(목표 코드·제목·레벨)를 실어 팀 화면이 상세 조회를 건너뛰게 한다.
  // 상세 API(무인증)와 같은 객체여야 노출 범위가 늘지 않는다
  const detail = await http('/api/challenges/battle-01')
  check('PERF challenge:started payload에 challenge.code·title·level 포함',
    st?.challenge?.id === 'battle-01' && typeof st.challenge.code === 'string' && st.challenge.code.length > 0
      && typeof st.challenge.title === 'string' && st.challenge.title.length > 0 && Number.isInteger(st.challenge.level),
    S(st))
  check('PERF challenge:started의 challenge = GET /api/challenges/:id 응답(노출 범위 동일)',
    detail.status === 200 && JSON.stringify(st?.challenge) === JSON.stringify(detail.data), S([st?.challenge, detail.data]))
  const sst = await specStarted
  check('PERF 관람 화면도 같은 challenge payload 수신', sst?.challenge?.code === st?.challenge?.code, S(sst))
  // 재입장 리플레이
  const team1b = await connect()
  const replay = waitEvent(team1b, 'challenge:started')
  await emitAck(team1b, 'team:join', { teamId: t1.data.teamId, teamToken: t1.data.teamToken })
  const rp = await replay
  check('#10 재입장 시 진행 중 챌린지 리플레이', rp && rp.resumed === true && rp.challengeId === 'battle-01', S(rp))
  check('PERF 재입장 리플레이(resumed)에도 challenge.code·title 포함',
    rp?.challenge?.id === 'battle-01' && rp.challenge.code === detail.data?.code && rp.challenge.title === detail.data?.title, S(rp))

  // ── 진행 중 결과 공개 → challenge:ended도 방송 (#3), 종료는 한 번만 (#21) ──────
  let endedCount = 0
  const countEnded = () => { endedCount += 1 }
  team1.on('challenge:ended', countEnded)
  const ended = waitEvent(team1, 'challenge:ended')
  const revealed = waitEvent(team1, 'result:revealed')
  res = await emitAck(teacher, 'challenge:reveal', { sessionId, challengeId: 'battle-01' })
  const [e1, rv] = await Promise.all([ended, revealed])
  check('#3 진행 중 결과 공개 → challenge:ended + result:revealed', res?.ok === true && !!e1 && Array.isArray(rv?.rankings), S([res, e1]))
  const endAgain = await emitAck(teacher, 'challenge:end', { sessionId })
  await wait(300)
  check('#21 이미 마감된 뒤 교사 종료 → 다시 방송하지 않음', endAgain?.ok === true && endAgain.alreadyEnded === true && endedCount === 1, `count=${endedCount} ${S(endAgain)}`)
  team1.off('challenge:ended', countEnded)

  // ── 같은 챌린지 재출제 시 이번 라운드 점수만 순위에 (#20) ─────────────────────
  // 1라운드 점수(90)는 교사 경로로 넣고, 2라운드를 다시 시작한 뒤 30점만 넣는다
  await http('/api/attempts', { method: 'POST', token, body: { teamId: t1.data.teamId, sessionNumber: 1, challengeId: 'battle-01', prompt: '1라운드 답', score: 90 } })
  await wait(1100) // created_at이 초 단위라 라운드 경계를 1초 넘긴다
  res = await emitAck(teacher, 'challenge:start', { sessionId, challengeId: 'battle-01', timeLimit: 60 })
  await wait(1100)
  await http('/api/attempts', { method: 'POST', token, body: { teamId: t1.data.teamId, sessionNumber: 1, challengeId: 'battle-01', prompt: '2라운드 답', score: 30 } })
  const rk = await http(`/api/dashboard/rankings/${sessionId}?challengeId=battle-01`, { token })
  const t1Rank = rk.data?.rankings?.find((x) => x.prompt)
  const dash = await http(`/api/dashboard/${sessionId}?challengeId=battle-01`, { token })
  const t2Dash = dash.data?.teams?.find((t) => t.id === t2.data.teamId)
  const revealed2 = waitEvent(team1, 'result:revealed')
  await emitAck(teacher, 'challenge:reveal', { sessionId, challengeId: 'battle-01' })
  const rv2 = await revealed2
  check('#20 재출제 라운드: HTTP 순위는 이번 라운드 점수(30)만', res?.ok === true && t1Rank?.score === 30 && t1Rank.prompt === '2라운드 답', S(rk.data))
  check('#20 재출제 라운드: 공개 순위도 이번 라운드 기준', rv2?.rankings?.find((x) => x.prompt)?.score === 30, S(rv2))
  check('#20 재출제 라운드: 대시보드 제출 현황도 이번 라운드 기준', t2Dash && t2Dash.hasSubmitted === false, S(t2Dash))

  // 마감 뒤 팀 generate → 409 (#2, AI 호출 전에 막힘)
  r = await http('/api/generate', { method: 'POST', teamToken: t1.data.teamToken, body: { teamId: t1.data.teamId, prompt: '공' } })
  check('#2 결과 공개(마감) 뒤 팀 generate → 409', r.status === 409 && r.data?.reason === 'no_active_challenge', S(r))
  r = await http(`/api/session/${sessionId}`)
  check('#19 GET /session/:id challengeStarted = true', r.data?.challengeStarted === true, S(r))

  // ── 연수 토큰 소유 (#8, 소켓) ──────────────────────────────────────────────
  const ta = (await http('/api/auth/training', { method: 'POST', body: { code: TRAINING } })).data.token
  const tb = (await http('/api/auth/training', { method: 'POST', body: { code: TRAINING } })).data.token
  const sa = (await http('/api/session/create', { method: 'POST', token: ta, body: { teacherCode: 'qa-be-hard-train' } })).data.sessionId
  const sockB = await connect()
  await emitAck(sockB, 'auth:teacher', { token: tb })
  const bJoin = await emitAck(sockB, 'teacher:join', { sessionId: sa })
  check('#8 다른 연수 토큰 teacher:join → not_owner', bJoin?.ok === false && bJoin.reason === 'not_owner', S(bJoin))
  const bStart = await emitAck(sockB, 'challenge:start', { sessionId: sa, challengeId: 'battle-01', timeLimit: 60 })
  check('#8 다른 연수 토큰 challenge:start → not_owner', bStart?.ok === false && bStart.reason === 'not_owner', S(bStart))
  const bAdminSess = await emitAck(sockB, 'challenge:end', { sessionId })
  check('#8 연수 토큰으로 운영 수업 challenge:end → not_owner', bAdminSess?.ok === false, S(bAdminSess))
  const sockA = await connect()
  await emitAck(sockA, 'auth:teacher', { token: ta })
  const aJoin = await emitAck(sockA, 'teacher:join', { sessionId: sa })
  const aStart = await emitAck(sockA, 'challenge:start', { sessionId: sa, challengeId: 'battle-02', timeLimit: 0 })
  check('#8 본인 연수 토큰은 자기 수업 제어 가능(timeLimit 0 = 무제한)', aJoin?.ok === true && aStart?.ok === true, S([aJoin, aStart]))
  const adminOnTraining = await emitAck(teacher, 'challenge:end', { sessionId: sa })
  check('#8 운영 토큰은 연수 수업도 제어 가능', adminOnTraining?.ok === true, S(adminOnTraining))

  // ── 3-way 적대적 테스트 회귀 (2026-10-27) ─────────────────────────────────
  {
    const tx = (await http('/api/auth/training', { method: 'POST', body: { code: TRAINING } })).data.token
    const ty = (await http('/api/auth/training', { method: 'POST', body: { code: TRAINING } })).data.token
    const sx = (await http('/api/session/create', { method: 'POST', token: tx, body: { teacherCode: 'adv-x' } })).data.sessionId
    const sy = (await http('/api/session/create', { method: 'POST', token: ty, body: { teacherCode: 'adv-y' } })).data.sessionId
    const tmX = (await http('/api/session/register', { method: 'POST', body: { teacherCode: 'adv-x', students: [{ studentNumber: 'X01', studentName: '엑스' }] } })).data
    const tmY = (await http('/api/session/register', { method: 'POST', body: { teacherCode: 'adv-y', students: [{ studentNumber: 'Y01', studentName: '와이' }] } })).data
    const tx1 = await connect()
    await emitAck(tx1, 'auth:teacher', { token: tx })
    await emitAck(tx1, 'teacher:join', { sessionId: sx })

    // 3W-R3 같은 초에 저장된 이전 라운드 시도가 새 라운드 순위에 섞이지 않는다
    await emitAck(tx1, 'challenge:start', { sessionId: sx, challengeId: 'battle-01', timeLimit: 0 })
    await wait(1000 - (Date.now() % 1000) + 30) // 다음 초의 시작 직후
    const old = await http('/api/attempts', { method: 'POST', token: tx, body: { teamId: tmX.teamId, sessionNumber: 1, challengeId: 'battle-01', prompt: '지난 라운드', generatedCode: 'box()', score: 91 } })
    await wait(5) // 같은 ms(저장 시각 = 시작 시각)는 앞뒤를 가를 수 없는 동률이라 피한다. 검증 대상은 '같은 초'다
    const restart = await emitAck(tx1, 'challenge:start', { sessionId: sx, challengeId: 'battle-01', timeLimit: 0 })
    const rk = await http(`/api/dashboard/rankings/${sx}?challengeId=battle-01`, { token: tx })
    const dash = await http(`/api/dashboard/${sx}?challengeId=battle-01`, { token: tx })
    const sameSecond = Math.floor(restart.startedAt / 1000) === Math.floor((Date.now() - 1) / 1000)
    check('3W-R3 같은 초 재시작: 이전 라운드 점수가 새 라운드 순위·제출 현황에 없음',
      old.status === 200 && restart.ok && !(rk.data.rankings || []).some((x) => x.score === 91) &&
      !(dash.data.teams || []).some((t) => t.hasSubmitted), S({ sameSecond, restart, old: old.status, rk: rk.data, dash: (dash.data.teams || []).map((t) => t.hasSubmitted) }))

    // 3W-R5 끊긴 동안 마감 → 재접속한 팀이 마감 상태를 받는다
    await emitAck(tx1, 'challenge:start', { sessionId: sx, challengeId: 'battle-02', timeLimit: 0 })
    const ts1 = await connect()
    await emitAck(ts1, 'team:join', { teamId: tmX.teamId, teamToken: tmX.teamToken })
    ts1.disconnect()
    await emitAck(tx1, 'challenge:end', { sessionId: sx })
    const ts2 = await connect()
    const endedP = waitEvent(ts2, 'challenge:ended', 1000)
    const rejoin = await emitAck(ts2, 'team:join', { teamId: tmX.teamId, teamToken: tmX.teamToken })
    const ended = await endedP
    check('3W-R5 마감 뒤 재접속한 팀에 challenge:ended(resumed) 전달', rejoin?.ok === true && ended?.resumed === true && ended?.challengeId === 'battle-02', S([rejoin, ended]))

    // 3W-R6 같은 소켓으로 다른 수업 팀에 들어가면 이전 수업 방에서 나온다
    const sw = await connect()
    await emitAck(sw, 'team:join', { teamId: tmX.teamId, teamToken: tmX.teamToken })
    await emitAck(sw, 'team:join', { teamId: tmY.teamId, teamToken: tmY.teamToken })
    const leakP = waitEvent(sw, 'challenge:started', 600)
    await emitAck(tx1, 'challenge:start', { sessionId: sx, challengeId: 'battle-03', timeLimit: 0 })
    check('3W-R6 수업 B로 옮긴 소켓은 수업 A 이벤트를 받지 않음', (await leakP) === null)
    // 팀 → 관람자 전환 뒤 채팅은 관람자 이름으로 나간다
    const lis = await connect()
    await emitAck(lis, 'team:join', { sessionId: sy, teamId: 'spectator' })
    const chatP = waitEvent(lis, 'chat:all', 1000)
    await emitAck(sw, 'team:join', { sessionId: sy, teamId: 'spectator' })
    const sent = await emitAck(sw, 'chat:all', { message: '관람 채팅' })
    const heard = await chatP
    check('3W-R6 팀에서 관람자로 바꾼 소켓의 채팅 신원 = 관람자', sent?.ok === true && heard?.sender === '관람자', S([sent, heard]))

    // 3W-A2 혼자인 팀에서 forceNewTeam → 기록 없는 빈 팀은 지운다
    await http('/api/session/register', { method: 'POST', body: { teacherCode: 'adv-y', students: [{ studentNumber: 'Y09', studentName: '홀로' }] } })
    await http('/api/session/register', { method: 'POST', body: { teacherCode: 'adv-y', students: [{ studentNumber: 'Y09', studentName: '홀로' }], forceNewTeam: true } })
    await http('/api/session/register', { method: 'POST', body: { teacherCode: 'adv-y', students: [{ studentNumber: 'Y09', studentName: '홀로' }], forceNewTeam: true } })
    const dy = await http(`/api/dashboard/${sy}`, { token: ty })
    const emptyTeams = (dy.data.teams || []).filter((t) => !t.members || t.members.length === 0)
    check('3W-A2 forceNewTeam 반복 뒤 빈 팀 없음', dy.status === 200 && emptyTeams.length === 0 && (dy.data.teams || []).length === 2, S((dy.data.teams || []).map((t) => t.members)))

    // 3W-A9 공개 수업 조회에 교사 토큰을 보내면 canManage로 소유 여부를 알려 준다
    const own = await http(`/api/session/${sx}`, { token: tx })
    const other = await http(`/api/session/${sx}`, { token: ty })
    const anon = await http(`/api/session/${sx}`)
    check('3W-A9 canManage: 본인 true · 다른 연수 토큰 false · 토큰 없음은 필드 없음',
      own.data.canManage === true && other.data.canManage === false && !('canManage' in anon.data), S([own.data.canManage, other.data.canManage, anon.data]))
  }

  // ── 브라우저 최종 검증에서 나온 서버 수정 (S1~S3) + 연수 입장 제한 ─────────
  {
    // S1 정적 파일은 CORS 검사를 하지 않는다 (sandbox iframe은 Origin: null)
    const lib = await http('/lib/glowscript/glow.3.2.min.js', { headers: { Origin: 'null' } })
    const apiNull = await http('/api/health', { headers: { Origin: 'null' } })
    check('S1 Origin: null 정적 파일 200 (API는 여전히 CORS 검사)', lib.status === 200 && apiNull.status === 403, S([lib.status, apiNull.status]))

    // S2 같은 traineeId로 다시 들어오면(새 토큰) 자기 수업을 이어간다
    const tid = 'trainee-' + 'a1b2c3d4'.repeat(4)
    const e1 = await http('/api/auth/training', { method: 'POST', body: { code: TRAINING, traineeId: tid } })
    const c1 = await http('/api/session/create', { method: 'POST', token: e1.data.token, body: { teacherCode: 'adv-trainee' } })
    const e2 = await http('/api/auth/training', { method: 'POST', body: { code: TRAINING, traineeId: tid } })
    const c2 = await http('/api/session/create', { method: 'POST', token: e2.data.token, body: { teacherCode: 'adv-trainee' } })
    const d2 = await http(`/api/dashboard/${c1.data.sessionId}`, { token: e2.data.token })
    const q2 = await http(`/api/session/${c1.data.sessionId}/join-qr`, { token: e2.data.token })
    check('S2 같은 traineeId 재입장: 새 토큰으로 같은 수업 resume + 대시보드·QR 200',
      e1.data.ownerKeyed === true && e2.data.token !== e1.data.token && c2.status === 200 && c2.data.resumed === true &&
      c2.data.sessionId === c1.data.sessionId && d2.status === 200 && q2.status === 200, S([c1.data, c2.data, d2.status, q2.status]))
    const other = await http('/api/auth/training', { method: 'POST', body: { code: TRAINING, traineeId: 'trainee-' + 'ffffeeee'.repeat(4) } })
    const c3 = await http('/api/session/create', { method: 'POST', token: other.data.token, body: { teacherCode: 'adv-trainee' } })
    const d3 = await http(`/api/dashboard/${c1.data.sessionId}`, { token: other.data.token })
    check('S2 다른 traineeId는 그 수업코드 409 · 대시보드 403', c3.status === 409 && d3.status === 403, S([c3.status, d3.status]))
    const bad = await http('/api/auth/training', { method: 'POST', body: { code: TRAINING, traineeId: 'short' } })
    const c4 = await http('/api/session/create', { method: 'POST', token: bad.data.token, body: { teacherCode: 'adv-trainee-2' } })
    const bad2 = await http('/api/auth/training', { method: 'POST', body: { code: TRAINING, traineeId: 'short' } })
    const d4 = await http(`/api/dashboard/${c4.data.sessionId}`, { token: bad2.data.token })
    check('S2 형식이 틀린 traineeId는 무시(토큰 해시 소유, 다른 토큰은 403)', bad.status === 200 && bad.data.ownerKeyed === false && c4.status === 200 && d4.status === 403, S([bad.data, d4.status]))

    // S3 결과 순위: 미제출 팀은 submitted:false·rank null로 맨 뒤
    const tk = e1.data.token
    const sid = c1.data.sessionId
    const ra = (await http('/api/session/register', { method: 'POST', body: { teacherCode: 'adv-trainee', students: [{ studentNumber: 'T01', studentName: '제출' }] } })).data
    await http('/api/session/register', { method: 'POST', body: { teacherCode: 'adv-trainee', students: [{ studentNumber: 'T02', studentName: '미제출' }] } })
    const ts = await connect()
    await emitAck(ts, 'auth:teacher', { token: tk })
    await emitAck(ts, 'teacher:join', { sessionId: sid })
    await emitAck(ts, 'challenge:start', { sessionId: sid, challengeId: 'battle-04', timeLimit: 0 })
    await wait(5)
    await http('/api/attempts', { method: 'POST', token: tk, body: { teamId: ra.teamId, sessionNumber: 1, challengeId: 'battle-04', prompt: '제출함', generatedCode: 'box()', score: 40 } })
    const revealedP = waitEvent(ts, 'result:revealed', 1500)
    await emitAck(ts, 'challenge:reveal', { sessionId: sid, challengeId: 'battle-04' })
    const revealed = await revealedP
    const rows = revealed?.rankings || []
    check('S3 결과 공개: 제출 팀 rank 1·submitted true, 미제출 팀 submitted false·rank null·맨 뒤',
      rows.length === 2 && rows[0].submitted === true && rows[0].rank === 1 && rows[1].submitted === false && rows[1].rank === null, S(rows))

    // S4 최종 결과: 시도가 없는 팀은 submitted:false·rank null·맨 뒤, 제출 팀끼리만 순위 (소켓·CSV 같은 규칙)
    const rc = (await http('/api/session/register', { method: 'POST', body: { teacherCode: 'adv-trainee', students: [{ studentNumber: 'T03', studentName: '나중제출' }] } })).data
    await http('/api/attempts', { method: 'POST', token: tk, body: { teamId: rc.teamId, sessionNumber: 1, challengeId: 'battle-04', prompt: '늦게 제출', generatedCode: 'box()', score: 25 } })
    const finalP = waitEvent(ts, 'session:final-ended', 1500)
    const fin = await emitAck(ts, 'session:final-end', { sessionId: sid })
    const fr = (await finalP)?.rankings || []
    check('S4 최종 결과 소켓: 제출 2팀 rank 1·2(총점순), 미제출 팀 submitted false·rank null·맨 뒤',
      fin?.ok === true && fr.length === 3 &&
      fr[0].teamId === ra.teamId && fr[0].submitted === true && fr[0].rank === 1 && fr[0].totalScore === 40 &&
      fr[1].teamId === rc.teamId && fr[1].submitted === true && fr[1].rank === 2 && fr[1].totalScore === 25 &&
      fr[2].submitted === false && fr[2].rank === null && fr[2].totalScore === 0 &&
      fr[2].challengeResults.every((cr) => cr.attempted === false), S(fr.map((r) => [r.teamName, r.submitted, r.rank, r.totalScore])))
    const finalCsv = await http(`/api/export/final/${sid}`, { token: tk })
    const csvLines = typeof finalCsv.data === 'string' ? finalCsv.data.replace(/^\uFEFF/, '').split('\n') : []
    check('S4 최종 CSV: 순위 1·2, 미제출 팀은 순위 칸 "미제출"·맨 뒤, 챌린지 칸 "제목(id)"',
      finalCsv.status === 200 && csvLines.length === 4 &&
      csvLines[1].startsWith('"1",') && csvLines[2].startsWith('"2",') && csvLines[3].startsWith('"미제출",') &&
      csvLines[1].includes('"버섯(battle-04)"'), S(csvLines))
    const roundCsv = await http(`/api/export/${sid}`, { token: tk })
    check('S4 챌린지 CSV: 챌린지 칸 "제목(id)"', roundCsv.status === 200 && typeof roundCsv.data === 'string' && roundCsv.data.includes('"버섯(battle-04)"'), S(roundCsv.data))

    // 연수 입장 실패 제한은 기본 30회 — 오타 10번이 정확한 코드 입장을 막지 않는다
    for (let i = 0; i < 10; i++) await http('/api/auth/training', { method: 'POST', body: { code: 'wrong-code-' + i } })
    const okAfter = await http('/api/auth/training', { method: 'POST', body: { code: TRAINING } })
    check('연수 입장: 같은 IP 오타 10회 뒤에도 정확한 코드는 200', okAfter.status === 200, S(okAfter))
  }

  // ── 브라우저 전수 검사 후속 (MX3·MX5) ─────────────────────────────────────
  {
    const tx = (await http('/api/auth/training', { method: 'POST', body: { code: TRAINING } })).data.token
    const sx = (await http('/api/session/create', { method: 'POST', token: tx, body: { teacherCode: 'mx-x' } })).data.sessionId
    const tmX = (await http('/api/session/register', { method: 'POST', body: { teacherCode: 'mx-x', students: [{ studentNumber: 'M01', studentName: '엠' }] } })).data
    const tx1 = await connect()
    await emitAck(tx1, 'auth:teacher', { token: tx })
    await emitAck(tx1, 'teacher:join', { sessionId: sx })

    // MX3 끊긴 사이에 보낸 힌트 → 재접속한 팀의 리플레이(resumed)에 hints 배열로 담긴다
    await emitAck(tx1, 'challenge:start', { sessionId: sx, challengeId: 'battle-03', timeLimit: 0 })
    const h1 = await emitAck(tx1, 'challenge:hint', { sessionId: sx, hint: '첫째 힌트' })
    await emitAck(tx1, 'challenge:hint', { sessionId: sx, hint: '둘째 힌트' })
    await emitAck(tx1, 'challenge:hint', { sessionId: sx, hint: '첫째 힌트' }) // 같은 힌트를 다시 보내도 한 번만
    const ts3 = await connect()
    const startedP = waitEvent(ts3, 'challenge:started', 1000)
    const j3 = await emitAck(ts3, 'team:join', { teamId: tmX.teamId, teamToken: tmX.teamToken })
    const rp3 = await startedP
    check('MX3 재접속 리플레이에 이 라운드 힌트 배열(보낸 순서·중복 제거)',
      h1?.ok === true && j3?.ok === true && rp3?.resumed === true && S(rp3?.hints) === S(['첫째 힌트', '둘째 힌트']), S([h1, j3, rp3?.hints]))
    // 새 라운드가 시작되면 앞 라운드 힌트는 다시 보내지 않는다
    await emitAck(tx1, 'challenge:start', { sessionId: sx, challengeId: 'battle-03', timeLimit: 0 })
    const ts4 = await connect()
    const startedP4 = waitEvent(ts4, 'challenge:started', 1000)
    await emitAck(ts4, 'team:join', { teamId: tmX.teamId, teamToken: tmX.teamToken })
    const rp4 = await startedP4
    check('MX3 새 라운드 리플레이에는 이전 라운드 힌트 없음', rp4?.resumed === true && Array.isArray(rp4.hints) && rp4.hints.length === 0, S(rp4?.hints))
    // 교사 화면 리플레이에도 hints가 담긴다 (SessionController가 '힌트 전송됨'을 복원)
    await emitAck(tx1, 'challenge:hint', { sessionId: sx, hint: '셋째 힌트' })
    const tx2 = await connect()
    await emitAck(tx2, 'auth:teacher', { token: tx })
    const tStartedP = waitEvent(tx2, 'challenge:started', 1000)
    await emitAck(tx2, 'teacher:join', { sessionId: sx })
    const trp = await tStartedP
    check('MX3 교사 재입장 리플레이에도 hints', trp?.resumed === true && S(trp?.hints) === S(['셋째 힌트']), S(trp?.hints))
    await emitAck(tx1, 'challenge:end', { sessionId: sx })

    // MX5 팀 등록 → 수업 방(관람 화면 포함)에 team:registered, 실명은 싣지 않는다
    const specX = await connect()
    await emitAck(specX, 'team:join', { sessionId: sx, teamId: 'spectator' })
    const regP = waitEvent(specX, 'team:registered', 1500)
    const nameLeakP = waitEvent(specX, 'student:registered', 800)
    const reg = await http('/api/session/register', { method: 'POST', body: { teacherCode: 'mx-x', students: [{ studentNumber: 'M02', studentName: '관람확인' }] } })
    const regEv = await regP
    check('MX5 등록 시 관람 소켓이 team:registered 수신', reg.status === 200 && !!regEv, S([reg.status, regEv]))
    check('MX5 team:registered에 학생 실명 없음 · 관람 소켓은 student:registered 미수신',
      !!regEv && !JSON.stringify(regEv).includes('관람확인') && (await nameLeakP) === null, S(regEv))
    const pubDash = await http(`/api/public/dashboard/${sx}`)
    check('MX5 공개 현황 팀 수 갱신(2팀)', pubDash.status === 200 && (pubDash.data.teams || []).length === 2, S(pubDash.data))
  }

  // ── 최종 종료 후 팀 소켓 재입장 거부 ────────────────────────────────────────
  res = await emitAck(teacher, 'session:final-end', { sessionId })
  const lateTeam = await connect()
  const lateAck = await emitAck(lateTeam, 'team:join', { teamId: t1.data.teamId, teamToken: t1.data.teamToken })
  check('수업 종료 후 team:join 거부', res?.ok === true && lateAck?.ok === false, S([res, lateAck]))
  // MX4 종료된 수업의 유효한 팀 토큰 → 401이 아니라 ended 안내 (팀 정보는 주지 않는다)
  const endedTeam = await http(`/api/team/${t1.data.teamId}`, { teamToken: t1.data.teamToken })
  check('MX4 종료 수업 + 유효 팀 토큰 → 200 { ended: true }, 팀 정보 없음',
    endedTeam.status === 200 && endedTeam.data?.ended === true && !('name' in (endedTeam.data || {})) && !('members' in (endedTeam.data || {})), S(endedTeam))
  const endedWrong = await http(`/api/team/${t1.data.teamId}`, { teamToken: t2.data.teamToken })
  check('MX4 종료 수업 + 다른 팀 토큰 → 여전히 401', endedWrong.status === 401, S(endedWrong))
  check('MX4 종료 수업 소켓 재입장: ack sessionEnded', lateAck?.sessionEnded === true, S(lateAck))
  const endedGen = await http('/api/generate', { method: 'POST', teamToken: t1.data.teamToken, body: { teamId: t1.data.teamId, prompt: 'x', challengeId: 'battle-01' } })
  check('MX4 종료 수업 팀 토큰으로 생성 API는 계속 401', endedGen.status === 401, S(endedGen))

  await wait(200)
  check('최종: 프로세스 생존 + 처리되지 않은 예외 없음', exited === null && !getLog().includes('[Process] 처리되지 않은'), S(exited))
} catch (err) {
  check('테스트 예외 없음', false, err.stack)
} finally {
  for (const s of sockets) s.disconnect()
  child.kill()
  await wait(200)
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

const failed = results.filter(([s]) => s === 'FAIL').length
console.log(`\nserver hardening checks: ${results.length - failed}/${results.length} passed`)
if (failed) console.log('\n--- server log (tail) ---\n' + getLog().split('\n').slice(-40).join('\n'))
process.exit(failed ? 1 : 0)
