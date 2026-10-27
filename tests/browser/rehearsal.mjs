// 배포본 리허설 기록: 교사 1 + 팀 2, 제출 3회, 화면 녹화·단계별 스크린샷
// 실행: node rehearsal.mjs   (제출 ②·③ 프롬프트는 ctl/prompt2.txt·prompt3.txt 파일이 생길 때까지 기다린다)
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const APP_DIR = '/Users/greatsong/greatsong-project/prompt-coding/education'
const { PNG } = require(path.join(APP_DIR, 'node_modules/pngjs'))
const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE || 'https://vpython-prompt-challenge.fly.dev'
const OUTDIR = '/Users/greatsong/greatsong-project/prompt-coding/리허설기록_261027'
const SHOTS = path.join(OUTDIR, 'screenshots')
const RAW = path.join(HERE, 'rehearsal_raw')
const CTL = path.join(HERE, 'ctl')
fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(CTL, { recursive: true })
const PIN = fs.readFileSync(path.join(APP_DIR, '.env'), 'utf8').split('\n').find((l) => l.startsWith('TEACHER_PIN='))?.slice('TEACHER_PIN='.length).trim()
if (!PIN) throw new Error('TEACHER_PIN 없음')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => Date.now()
const hhmmss = (t = now()) => new Date(t).toLocaleTimeString('ko-KR', { hour12: false, timeZone: 'Asia/Seoul' })
const log = (...a) => console.log(hhmmss(), ...a)
const d = new Date()
const pad = (n) => String(n).padStart(2, '0')
const CODE = `rehearsal-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`

const R = { code: CODE, base: BASE, startedAt: new Date().toISOString(), steps: [], submissions: [], api: [], errors: {}, reqFails: {}, http: {}, downloads: [], videos: {} }
let shotNo = 0
const step = (action, screen, shots = []) => { R.steps.push({ t: hhmmss(), action, screen, shots }); log('STEP', action, '|', screen, shots.join(',')) ; save() }
const save = () => fs.writeFileSync(path.join(RAW, 'run.json'), JSON.stringify(R, null, 2))

const P = {}
async function makeRole(browser, role) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: path.join(RAW, 'video', role), size: { width: 1280, height: 800 } }, acceptDownloads: true })
  // 숨김 탭 재현(matrix.mjs와 같은 방식): visibilityState를 덮어쓰고 숨김 중 rAF를 멈춘다
  await ctx.addInitScript(() => {
    let hidden = false; const q = []
    const raf = window.requestAnimationFrame.bind(window); const caf = window.cancelAnimationFrame.bind(window); let seq = 1e7
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return hidden ? 'hidden' : 'visible' } })
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return hidden } })
    window.requestAnimationFrame = (cb) => { if (hidden) { const id = ++seq; q.push([id, cb]); return id } return raf(cb) }
    window.cancelAnimationFrame = (id) => { const k = q.findIndex((x) => x[0] === id); if (k >= 0) q.splice(k, 1); else caf(id) }
    window.__pwSetHidden = (h) => { h = !!h; if (hidden === h) return; hidden = h
      if (!h) { const items = q.splice(0); raf((t) => items.forEach(([, cb]) => { try { cb(t) } catch (e) { setTimeout(() => { throw e }) } })) }
      document.dispatchEvent(new Event('visibilitychange')) }
    window.__pwIsHidden = () => hidden
  })
  const page = await ctx.newPage()
  const r = { role, ctx, page, hidden: false }
  R.errors[role] = []; R.reqFails[role] = []; R.http[role] = []
  const syncFrame = (f) => { if (r.hidden) f.evaluate(() => window.__pwSetHidden?.(true)).catch(() => {}) }
  page.on('frameattached', syncFrame); page.on('framenavigated', syncFrame)
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') R.errors[role].push({ t: hhmmss(), type: 'console.' + m.type(), text: m.text().slice(0, 600) }) })
  page.on('pageerror', (e) => R.errors[role].push({ t: hhmmss(), type: 'pageerror', text: String(e?.stack || e).slice(0, 800) }))
  page.on('requestfailed', (q) => R.reqFails[role].push({ t: hhmmss(), url: q.url().slice(0, 200), err: q.failure()?.errorText }))
  page.on('response', (res) => { if (res.status() >= 400) R.http[role].push({ t: hhmmss(), url: res.url().slice(0, 200), status: res.status() }) })
  // Claude API를 부르는 엔드포인트 집계
  page.on('request', (q) => {
    const m = q.url().match(/\/api\/(generate|evaluate|evaluate-problem-quality|analyze-problem|chat)(\?|$)/)
    if (!m || q.method() !== 'POST') return
    const ent = { role, kind: m[1], start: now(), startT: hhmmss() }
    R.api.push(ent); q.__ent = ent
  })
  page.on('requestfinished', async (q) => {
    const ent = q.__ent; if (!ent) return
    ent.ms = now() - ent.start
    const res = await q.response().catch(() => null)
    ent.status = res?.status()
    if (ent.kind === 'evaluate') ent.body = await res?.json().catch(() => null)
    if (ent.kind === 'generate') { const j = await res?.json().catch(() => null); ent.code = j?.code }
    save()
  })
  page.on('download', async (dl) => {
    const dir = path.join(OUTDIR, 'csv'); fs.mkdirSync(dir, { recursive: true })
    const p = path.join(dir, dl.suggestedFilename())
    await dl.saveAs(p).catch((e) => R.downloads.push({ role, err: e.message }))
    R.downloads.push({ role, file: p, t: hhmmss() }); save()
  })
  P[role] = r
  return r
}
async function hideRole(role) {
  const r = P[role]
  if (!r.other) { r.other = await r.ctx.newPage(); await r.other.goto('about:blank') }
  await r.other.bringToFront(); r.hidden = true
  for (const f of r.page.frames()) await f.evaluate(() => window.__pwSetHidden?.(true)).catch(() => {})
}
async function showRole(role) {
  const r = P[role]
  await r.page.bringToFront(); r.hidden = false
  for (const f of r.page.frames().reverse()) await f.evaluate(() => window.__pwSetHidden?.(false)).catch(() => {})
}
const bodyText = (page) => page.evaluate(() => document.body?.innerText || '').catch(() => '')
async function waitText(page, re, timeout = 10000) {
  const src = re instanceof RegExp ? re.source : re.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const flags = re instanceof RegExp ? re.flags : ''
  try { await page.waitForFunction(([s, f]) => new RegExp(s, f).test(document.body?.innerText || ''), [src, flags], { timeout, polling: 250 }); return true } catch { return false }
}
async function shot(role, name, opts = {}) {
  shotNo++
  const file = `${pad(shotNo)}_${name}.png`
  await P[role].page.screenshot({ path: path.join(SHOTS, file), fullPage: !!opts.full, timeout: 20000 }).catch((e) => log('shot fail', file, e.message))
  return `screenshots/${file}`
}
async function dismissWelcome(page) {
  const w = page.getByText('화면을 터치하면 시작합니다')
  try { if (await w.isVisible({ timeout: 500 })) await w.click({ timeout: 2000 }) } catch {}
  await page.waitForFunction(() => !/화면을 터치하면 시작합니다/.test(document.body.innerText), null, { timeout: 6000 }).catch(() => {})
}
// 장면 칸의 iframe canvas·픽셀 판정
function sceneBox(page, label) { return page.locator(`xpath=//div[normalize-space(text())="${label}"]/following-sibling::div[1]`).first() }
async function sceneState(page, label, timeout = 15000) {
  const t0 = now(); let last = {}
  while (now() - t0 < timeout) {
    const box = sceneBox(page, label)
    if (await box.count()) {
      const h = await box.locator('iframe[sandbox]').first().elementHandle().catch(() => null)
      const fr = h && (await h.contentFrame().catch(() => null))
      const inner = fr ? await fr.evaluate(() => { const c = document.querySelector('canvas'); return { canvas: !!c, cw: c?.width || 0, ch: c?.height || 0, scene: !!window.__gsScene, err: document.getElementById('_error_')?.textContent || null } }).catch((e) => ({ evalErr: e.message.slice(0, 100) })) : null
      let px = null
      if (inner?.canvas && inner.scene) {
        await box.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {})
        const bb = await box.boundingBox()
        if (bb && bb.width > 4) {
          const buf = await page.screenshot({ clip: bb, timeout: 15000 }).catch(() => null)
          if (buf) {
            const png = PNG.sync.read(buf); const { width: W, height: H, data } = png
            const hist = new Map(); let n = 0
            for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) { const i = (y * W + x) * 4; const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3); hist.set(k, (hist.get(k) || 0) + 1); n++ }
            let domK = 0, domC = 0; for (const [k, c] of hist) if (c > domC) { domC = c; domK = k }
            const dr = ((domK >> 10) & 31) * 8 + 4, dg = ((domK >> 5) & 31) * 8 + 4, db = (domK & 31) * 8 + 4
            let differ = 0
            for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) { const i = (y * W + x) * 4; if (Math.max(Math.abs(data[i] - dr), Math.abs(data[i + 1] - dg), Math.abs(data[i + 2] - db)) > 24) differ++ }
            px = { dominant: `rgb(${dr},${dg},${db})`, differFrac: +(differ / n).toFixed(4) }
          }
        }
      }
      last = { inner, px, ms: now() - t0, rendered: !!(px && px.differFrac >= 0.003) }
      if (last.rendered) return last
    }
    await sleep(500)
  }
  return { ...last, ms: now() - t0, rendered: false }
}
async function waitFile(name, maxMs = 280000) {
  const p = path.join(CTL, name); const t0 = now()
  log('WAIT_PROMPT', name)
  while (!fs.existsSync(p)) { if (now() - t0 > maxMs) throw new Error('프롬프트 파일 대기 시간 초과 ' + name); await sleep(500) }
  await sleep(200)
  return fs.readFileSync(p, 'utf8').trim()
}
async function evalCardText(page) {
  return page.evaluate(() => {
    const sp = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === '평가 결과')
    return sp?.parentElement?.parentElement?.innerText || null
  }).catch(() => null)
}

async function submit(n, text) {
  const page = P.A.page
  const apiBefore = R.api.length
  await page.locator('textarea[placeholder^="예: 원점에"]').scrollIntoViewIfNeeded().catch(() => {})
  await page.locator('textarea[placeholder^="예: 원점에"]').fill(text)
  await sleep(800) // 녹화에 입력 장면이 보이도록
  const t0 = now(); const tStart = hhmmss()
  await page.locator('button.battle-submit').click()
  const ok = await waitText(page, new RegExp(`이 챌린지 시도 기록 \\(${n}회\\)|제출에 실패했어요|채점에 실패했어요`), 90000)
  const total = now() - t0
  const txt = await bodyText(page)
  const failed = !new RegExp(`시도 기록 \\(${n}회\\)`).test(txt)
  const ai = await sceneState(page, '🤖 AI가 만든 장면', 20000)
  await sleep(1500)
  const calls = R.api.slice(apiBefore)
  const ev = [...calls].reverse().find((c) => c.kind === 'evaluate')
  const gen = calls.filter((c) => c.kind === 'generate')
  const card = await evalCardText(page)
  // 결과 카드가 화면에 보이도록 내려서 녹화에 담는다
  await page.evaluate(() => { const sp = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === '평가 결과'); sp?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }).catch(() => {})
  await sleep(2500)
  const s1 = await shot('A', `teamA_submit${n}_result_viewport`)
  const s2 = await shot('A', `teamA_submit${n}_result_fullpage`, { full: true })
  const sub = { n, prompt: text, startT: tStart, totalMs: total, ok: ok && !failed, failText: failed ? txt.match(/⚠️[^\n]*\n?[^\n]*/)?.[0] : null,
    generate: gen.map((g) => ({ ms: g.ms, status: g.status, code: g.code })), evaluate: ev ? { ms: ev.ms, status: ev.status, body: ev.body } : null,
    apiCallsThisSubmit: calls.map((c) => c.kind), aiScene: ai, card, attemptsLine: (txt.match(/이 챌린지 시도 기록 \(\d+회\)/) || [null])[0], shots: [s1, s2] }
  R.submissions.push(sub); save()
  fs.writeFileSync(path.join(CTL, `result${n}.json`), JSON.stringify({ score: ev?.body?.score, cats: ev?.body?.category_scores, max: ev?.body?.category_max, body: ev?.body, card, totalMs: total, aiRendered: ai.rendered, calls: sub.apiCallsThisSubmit }, null, 2))
  log('RESULT', n, 'score=', ev?.body?.score, 'ms=', total, 'calls=', sub.apiCallsThisSubmit.join('+'), 'ai=', ai.rendered)
  step(`팀 A 제출 ${'①②③'[n - 1]}`, `점수 ${ev?.body?.score ?? '?'}점, 생성+채점 ${Math.round(total / 1000)}초, AI 장면 ${ai.rendered ? '표시' : '미표시'}`, [s1, s2])
  return sub
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] })
  R.browser = browser.version()
  await makeRole(browser, 'teacher'); await makeRole(browser, 'teamA'); await makeRole(browser, 'teamB')
  P.T = P.teacher; P.A = P.teamA; P.B = P.teamB
  const T = P.T.page, A = P.A.page, B = P.B.page
  log('CODE', CODE)

  // 1. 교사 로그인·수업 생성
  await T.goto(BASE + '/teacher')
  await T.locator('input[type=password]').waitFor({ timeout: 20000 })
  let s = await shot('T', 'teacher_pin_screen')
  await T.locator('input[type=password]').fill(PIN)
  await T.getByRole('button', { name: '인증', exact: true }).click()
  await T.getByPlaceholder('예: 1반3교시').waitFor({ timeout: 15000 })
  const s1b = await shot('T', 'teacher_after_login')
  step('교사 /teacher 접속 → PIN 인증', 'PIN 입력 화면 뒤 수업 코드 입력 화면', [s, s1b])
  await T.getByPlaceholder('예: 1반3교시').fill(CODE)
  await sleep(500)
  await T.getByRole('button', { name: '수업 시작 (이어가기)', exact: true }).click()
  await T.getByText('학생 접속 안내').waitFor({ timeout: 15000 })
  await sleep(1500)
  s = await shot('T', 'teacher_join_guide_code_qr')
  step(`수업 코드 ${CODE} 생성`, "'접속 안내' 탭에 수업 코드·QR 표시", [s])

  // 2. 팀 참가
  const joinTeam = async (r, students) => {
    const page = r.page
    await page.goto(BASE + '/join')
    await page.getByPlaceholder('선생님이 알려준 코드 입력').fill(CODE)
    if (students.length > 1) { // 2인 팀이면 두 번째 학생 칸이 필요한지 확인
      if ((await page.getByPlaceholder('학번').count()) < 2) {
        const add = page.getByRole('button', { name: /2명|두 명|추가/ }).first()
        if (await add.count()) await add.click().catch(() => {})
      }
    }
    for (let i = 0; i < students.length; i++) {
      await page.getByPlaceholder('학번').nth(i).fill(students[i][0])
      await page.getByPlaceholder('이름').nth(i).fill(students[i][1])
    }
    await sleep(500)
    const pre = await shot(r.role === 'teamA' ? 'A' : 'B', `${r.role}_join_form`)
    await page.getByRole('button', { name: /참여하기/ }).click()
    await page.waitForURL(/\/team\/\d+/, { timeout: 20000 })
    await page.locator('header').waitFor({ timeout: 15000 })
    await dismissWelcome(page)
    await waitText(page, '선생님이 챌린지를 시작할 때까지 기다려주세요', 10000)
    r.teamName = (await page.locator('header span').first().innerText()).trim()
    const post = await shot(r.role === 'teamA' ? 'A' : 'B', `${r.role}_waiting`)
    return [pre, post]
  }
  const sa = await joinTeam(P.A, [['R-01', '리허설A1'], ['R-02', '리허설A2']])
  step('팀 A(R-01 리허설A1, R-02 리허설A2) /join 참가', `팀 이름 '${P.A.teamName}', 대기 화면`, sa)
  const sb = await joinTeam(P.B, [['R-03', '리허설B']])
  step('팀 B(R-03 리허설B) /join 참가', `팀 이름 '${P.B.teamName}', 대기 화면`, sb)
  R.teams = { A: P.A.teamName, B: P.B.teamName }
  await T.bringToFront()
  const listed = await waitText(T, new RegExp(`${P.A.teamName}[\\s\\S]*${P.B.teamName}|${P.B.teamName}[\\s\\S]*${P.A.teamName}`), 10000)
  s = await shot('T', 'teacher_team_list', { full: true })
  step('교사 화면 팀 목록 확인', `두 팀 실시간 반영 ${listed ? '확인' : '안 됨'}`, [s])

  // 3. 07번 로켓 시작(팀 A는 숨김 상태)
  await T.getByRole('button', { name: /수업 진행 화면으로/ }).click()
  await waitText(T, '위에서 챌린지를 선택하세요', 8000)
  await hideRole('A')
  await T.bringToFront()
  await T.locator('aside button[aria-label^="로켓, 레벨"]').click()
  await T.locator('aside button[aria-label="제한 시간 5분"]').click()
  await sleep(600)
  s = await shot('T', 'teacher_rocket_selected_5min')
  const tStart = now(); R.challengeStart = hhmmss(tStart)
  await T.locator('aside button', { hasText: '시작하기' }).click()
  const started = await waitText(T, /로켓 — 진행 중/, 10000)
  await sleep(3000)
  const hiddenInfo = await A.evaluate(() => ({ vis: document.visibilityState })).catch(() => null)
  const s3b = await shot('T', 'teacher_rocket_started')
  step('교사: 07번 로켓 선택, 제한 5분, 시작 (팀 A 탭은 숨김 상태)', `교사 '로켓 — 진행 중' ${started ? '확인' : '실패'}, 팀 A visibilityState=${hiddenInfo?.vis}`, [s, s3b])
  await showRole('A')
  const tgt = await sceneState(A, '👁 이 장면을 묘사하세요', 15000)
  R.targetScene = tgt
  await A.evaluate(() => window.scrollTo(0, 0))
  await sleep(800)
  s = await shot('A', 'teamA_target_scene_after_front')
  step('팀 A 탭을 앞으로 가져옴', `목표 장면 ${tgt.rendered ? `그려짐(${tgt.ms}ms, 픽셀 변화 ${tgt.px?.differFrac})` : '안 그려짐 ' + JSON.stringify(tgt).slice(0, 200)}`, [s])
  const tgtB = await sceneState(B, '👁 이 장면을 묘사하세요', 10000)
  await B.evaluate(() => window.scrollTo(0, 0))
  s = await shot('B', 'teamB_target_scene')
  step('팀 B 화면 확인(보이는 탭)', `목표 장면 ${tgtB.rendered ? '그려짐' : '안 그려짐'}`, [s])

  // 4~6. 제출 3회
  await A.bringToFront()
  await submit(1, process.env.PROMPT1 || '로켓이 하나 있다.')
  await submit(2, await waitFile('prompt2.txt'))
  await submit(3, await waitFile('prompt3.txt'))
  const txtA = await bodyText(A)
  R.attemptsLine = (txtA.match(/이 챌린지 시도 기록 \(\d+회\)/) || [null])[0]
  await A.evaluate(() => { const p = [...document.querySelectorAll('p')].find((x) => /이 챌린지 시도 기록/.test(x.textContent)); p?.scrollIntoView({ block: 'start', behavior: 'smooth' }) })
  await sleep(2000)
  s = await shot('A', 'teamA_attempt_history')
  step('팀 A 시도 기록 확인', `${R.attemptsLine || '시도 기록 없음'}`, [s])

  // 7. 교사 대시보드·비교·마감·공개
  await T.bringToFront()
  await waitText(T, /제출\s*1\s*\/\s*2팀/, 8000)
  s = await shot('T', 'teacher_dashboard_status', { full: true })
  const card = (name) => T.locator('div[style*="cursor: pointer"]').filter({ hasText: name }).first()
  await card(P.A.teamName).click(); await sleep(800)
  await card(P.B.teamName).click()
  const cmp = await waitText(T, '🔍 프롬프트 비교', 8000)
  await sleep(1500)
  await T.getByText('🔍 프롬프트 비교').scrollIntoViewIfNeeded().catch(() => {})
  await sleep(1000)
  const s7b = await shot('T', 'teacher_prompt_compare_viewport')
  const s7c = await shot('T', 'teacher_prompt_compare_fullpage', { full: true })
  R.compareText = await T.evaluate(() => { const h = [...document.querySelectorAll('h3')].find((x) => /프롬프트 비교/.test(x.textContent)); return h?.parentElement?.innerText?.slice(0, 1500) || null })
  step('교사 대시보드: 제출 현황, 팀 A·B 프롬프트 비교', `제출 현황 화면, 비교 패널 ${cmp ? '표시' : '안 보임'}`, [s, s7b, s7c])
  await T.evaluate(() => window.scrollTo(0, 0))
  await T.locator('aside button', { hasText: '제출 마감' }).click()
  const closed = await waitText(T, /로켓 — 마감됨/, 10000)
  await sleep(1500)
  s = await shot('T', 'teacher_closed')
  step('교사: 제출 마감', `'로켓 — 마감됨' ${closed ? '확인' : '실패'}`, [s])
  await T.getByRole('button', { name: '🎯 결과 공개' }).click()
  const rv = await waitText(T, /로켓 순위/, 10000)
  await sleep(1500)
  const s8a = await shot('T', 'teacher_results_revealed', { full: true })
  await waitText(A, '결과 발표!', 10000); await waitText(B, '결과 발표!', 10000)
  await sleep(1500)
  await A.bringToFront(); await sleep(1500)
  const s8b = await shot('A', 'teamA_ranking', { full: true })
  await B.bringToFront(); await sleep(1500)
  const s8c = await shot('B', 'teamB_ranking_unsubmitted', { full: true })
  R.rankA = (await bodyText(A)).match(/결과 발표![\s\S]{0,400}/)?.[0]
  R.rankB = (await bodyText(B)).match(/결과 발표![\s\S]{0,400}/)?.[0]
  R.rankT = (await bodyText(T)).match(/로켓 순위[\s\S]{0,300}/)?.[0]
  step('교사: 결과 공개', `교사 순위 ${rv ? '표시' : '안 보임'}, 팀 A·B 결과 발표 화면`, [s8a, s8b, s8c])

  // 8. 전체 수업 종료
  await T.bringToFront()
  T.once('dialog', (dlg) => { R.dialogText = dlg.message(); dlg.accept() })
  await T.locator('aside button', { hasText: '전체 수업 종료' }).click()
  const fin = await waitText(T, '🏆 최종 결과', 20000)
  await sleep(4000)
  const s9a = await shot('T', 'teacher_final_results', { full: true })
  await waitText(A, '🏆 최종 결과', 10000); await waitText(B, '🏆 최종 결과', 10000)
  await A.bringToFront(); await sleep(1500)
  const s9b = await shot('A', 'teamA_final_results', { full: true })
  await B.bringToFront(); await sleep(1500)
  const s9c = await shot('B', 'teamB_final_results', { full: true })
  R.finalT = (await bodyText(T)).match(/🏆 최종 결과[\s\S]{0,500}/)?.[0]
  step('교사: 전체 수업 종료(확인창 수락)', `최종 결과 ${fin ? '표시' : '안 보임'}, 확인창 문구: ${R.dialogText || '없음'}`, [s9a, s9b, s9c])
  await sleep(3000)

  // 녹화 마무리
  for (const r of [P.T, P.A, P.B]) {
    const v = r.page.video()
    await r.ctx.close()
    R.videos[r.role] = await v.path()
  }
  await browser.close()
  R.endedAt = new Date().toISOString(); save()
  log('DONE')
}
main().catch(async (e) => { R.fatal = String(e?.stack || e); save(); log('FATAL', e?.message); for (const r of Object.values(P)) { try { const v = r.page.video(); await r.ctx.close(); R.videos[r.role] = await v.path() } catch {} } save(); process.exit(1) })
