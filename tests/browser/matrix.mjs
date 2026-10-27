// VPython 프롬프트 챌린지 — 실제 Chromium 화면 전환·상태 복원 전수 검사 하네스
// 실행: node matrix.mjs   (환경변수 BASE=http://localhost:4120 PIN=test-pin TRAINING=test-code)
// 결과: results/<타임스탬프>/ 에 results.json · matrix.md · 스크린샷
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const APP_DIR = process.env.APP_DIR || '/Users/greatsong/greatsong-project/prompt-coding/education'
const { PNG } = require(path.join(APP_DIR, 'node_modules/pngjs'))

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE || 'http://localhost:4120'
const PIN = process.env.PIN || 'test-pin'
const TRAINING = process.env.TRAINING || 'test-code'
const MOCK = process.env.MOCK || 'http://localhost:4092'
const SCENE_TIMEOUT = Number(process.env.SCENE_TIMEOUT || 8000)
const HEADED = process.env.HEADED === '1'

const TS = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
const OUT = path.join(HERE, 'results', TS)
fs.mkdirSync(OUT, { recursive: true })

// ── 끊을 수 있는 TCP 프록시 ─────────────────────────────────────────────────
// Chromium의 setOffline은 이미 열린 WebSocket을 끊지 않는다(1차 실행에서 확인).
// 그래서 팀 B·교사는 각자 프록시 포트로 접속시키고, 프록시에서 연결을 실제로 끊는다.
import net from 'net'
const UP = new URL(BASE)
function makeProxy(port) {
  const socks = new Set()
  let blocked = false
  const server = net.createServer((c) => {
    if (blocked) { c.destroy(); return }
    const u = net.connect(Number(UP.port), UP.hostname)
    socks.add(c); socks.add(u)
    const drop = () => { c.destroy(); u.destroy(); socks.delete(c); socks.delete(u) }
    c.on('error', drop); u.on('error', drop); c.on('close', drop); u.on('close', drop)
    c.pipe(u); u.pipe(c)
  })
  return new Promise((res) => server.listen(port, '127.0.0.1', () => res({
    base: `http://localhost:${port}`,
    cut() { blocked = true; for (const s of socks) s.destroy(); socks.clear() },
    restore() { blocked = false },
    close() { blocked = true; for (const s of socks) s.destroy(); server.close() },
  })))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => Date.now()
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// ── 결과 기록 ────────────────────────────────────────────────────────────────
const STEPS = {
  1: '시작 전 대기',
  2: '챌린지 시작(03) 무새로고침 전환',
  3: '제출(가짜 API)',
  4: '진행 중 새로고침 복원',
  5: '교사 마감',
  6: '결과 공개·새로고침 유지',
  7: '연속 시작(07→11) 무새로고침',
  8: '같은 챌린지 재출제(07) 라운드 분리',
  9: '늦은 참가(D)',
  10: '재접속(오프라인→복귀)',
  11: '타이머 자연 만료(1분)',
  12: '전체 수업 종료',
  13: '새 수업 주기(같은 교사 코드)',
  14: '연수 입장',
  15: '모바일 375×812',
}
const ROLES = ['T', 'A', 'B', 'C', 'S', 'D', 'M', 'TR']
const cells = [] // { step, role, check, ok, detail }
let currentStep = 0

function record(step, role, check, ok, detail = {}) {
  cells.push({ step, role, check, ok: !!ok, detail })
  log(`${ok ? '✅' : '❌'} [${step}·${role}] ${check}${ok ? '' : ' — ' + JSON.stringify(detail).slice(0, 400)}`)
}

// ── 빌드 정보 ────────────────────────────────────────────────────────────────
function distInfo() {
  const dir = path.join(APP_DIR, 'dist')
  const out = {}
  try {
    out.index = fs.statSync(path.join(dir, 'index.html')).mtime.toISOString()
    out.assets = fs.readdirSync(path.join(dir, 'assets')).map((f) => {
      const st = fs.statSync(path.join(dir, 'assets', f))
      return { f, mtime: st.mtime.toISOString(), size: st.size }
    })
  } catch (e) {
    out.error = e.message
  }
  return out
}

// ── 브라우저·역할 ────────────────────────────────────────────────────────────
const P = {} // role → { ctx, page, errors:[], reqFails:[], ws:[] }

async function makeRole(browser, role, opts = {}) {
  const base = opts.base || BASE
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: Number(process.env.VW || 1100), height: Number(process.env.VH || 820) },
    isMobile: !!opts.isMobile,
    hasTouch: !!opts.hasTouch,
    deviceScaleFactor: opts.deviceScaleFactor || 1,
    userAgent: opts.userAgent,
  })
  // 숨김 탭 재현: Playwright는 포커스 에뮬레이션 때문에 배경 탭도 visibilityState='visible'로 보고한다.
  // 그래서 최상위 문서의 visibilityState·hidden을 덮어써 앱이 '숨김'을 보게 하고(visibilitychange 발생),
  // 실제 렌더 스로틀링은 다른 탭을 앞으로 가져와(bringToFront) 브라우저가 걸게 한다.
  // 모든 프레임(장면 iframe 포함)에 심는다. 숨김이면 rAF 콜백을 쌓아 두었다가 보일 때 한 번에 돌린다
  // (실제 숨김 탭은 rAF를 멈춘다). setTimeout·소켓 이벤트는 그대로 돈다.
  await ctx.addInitScript(() => {
    let hidden = false
    let paused = false // 하네스 부하 조절용 — 검사하지 않는 페이지의 장면 iframe 렌더만 멈춘다(visibility는 그대로)
    const q = []
    const raf = window.requestAnimationFrame.bind(window)
    const caf = window.cancelAnimationFrame.bind(window)
    let seq = 1e7
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return hidden ? 'hidden' : 'visible' } })
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return hidden } })
    window.requestAnimationFrame = (cb) => {
      if (hidden || paused) { const id = ++seq; q.push([id, cb]); return id }
      return raf(cb)
    }
    window.cancelAnimationFrame = (id) => {
      const k = q.findIndex((x) => x[0] === id)
      if (k >= 0) q.splice(k, 1); else caf(id)
    }
    window.__pwSetHidden = (h) => {
      h = !!h
      if (hidden === h) return
      hidden = h
      if (!h) {
        const items = q.splice(0)
        raf((t) => items.forEach(([, cb]) => { try { cb(t) } catch (e) { setTimeout(() => { throw e }) } }))
      }
      document.dispatchEvent(new Event('visibilitychange'))
    }
    window.__pwIsHidden = () => hidden
    window.__pwPause = (p) => {
      p = !!p
      if (paused === p) return
      paused = p
      if (!p && !hidden) {
        const items = q.splice(0)
        raf((t) => items.forEach(([, cb]) => { try { cb(t) } catch (e) { setTimeout(() => { throw e }) } }))
      }
    }
  })
  const page = await ctx.newPage()
  const r = { role, ctx, page, base, errors: [], reqFails: [], http: [], ws: [], wsSeq: 0, hidden: false }
  // 숨긴 동안 새로 생긴 프레임(장면 iframe)도 곧바로 숨김으로 맞춘다
  const syncFrame = (f) => {
    if (r.hidden) f.evaluate(() => window.__pwSetHidden?.(true)).catch(() => {})
    if (r.paused && f !== page.mainFrame()) f.evaluate(() => window.__pwPause?.(true)).catch(() => {})
  }
  page.on('frameattached', syncFrame)
  page.on('framenavigated', syncFrame)
  page.on('domcontentloaded', () => { if (r.hidden) for (const f of page.frames()) syncFrame(f) })
  page.on('console', (m) => {
    if (m.type() === 'error') r.errors.push({ step: currentStep, t: now(), type: 'console', text: m.text().slice(0, 1000), loc: m.location()?.url })
  })
  page.on('pageerror', (e) => r.errors.push({ step: currentStep, t: now(), type: 'pageerror', text: String(e?.stack || e).slice(0, 1500) }))
  page.on('requestfailed', (req) => r.reqFails.push({ step: currentStep, t: now(), url: req.url(), err: req.failure()?.errorText }))
  page.on('response', (res) => {
    if (res.status() >= 400) r.http.push({ step: currentStep, t: now(), url: res.url(), status: res.status() })
  })
  // 소켓 이벤트를 웹소켓 프레임에서 직접 센다 (socket.io: 42["event",data])
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/socket.io/')) return
    const w = { id: ++r.wsSeq, url: ws.url(), opened: now(), closed: null, events: [] }
    r.ws.push(w)
    ws.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string' || !payload.startsWith('42')) return
      try {
        const arr = JSON.parse(payload.slice(payload.indexOf('[')))
        w.events.push({ t: now(), name: arr[0], data: arr[1] })
      } catch { /* 무시 */ }
    })
    ws.on('close', () => { w.closed = now() })
  })
  P[role] = r
  return r
}

function wsEvents(role, name, since = 0, until = Infinity) {
  const out = []
  for (const w of P[role]?.ws || []) for (const e of w.events) if (e.name === name && e.t >= since && e.t <= until) out.push({ ws: w.id, ...e })
  return out
}

// 부하 조절: 검사 중인 역할만 장면 iframe을 렌더하고 나머지는 rAF를 멈춘다
async function setPaused(role, p) {
  const r = P[role]
  if (!r) return
  r.paused = p
  await Promise.all(r.page.frames().filter((f) => f !== r.page.mainFrame()).map((f) => f.evaluate((v) => window.__pwPause?.(v), p).catch(() => {})))
}
async function focusRole(role) {
  await Promise.all(Object.keys(P).map((k) => setPaused(k, k !== role)))
}
async function wakeAll() {
  await Promise.all(Object.keys(P).map((k) => setPaused(k, false)))
}

// 학생 탭을 배경(숨김)으로 보내고 / 다시 앞으로
async function hideRole(role) {
  const r = P[role]
  if (!r.other || r.other.isClosed()) { r.other = await r.ctx.newPage(); await r.other.goto('about:blank') }
  await r.other.bringToFront()
  r.hidden = true
  for (const f of r.page.frames()) await f.evaluate(() => window.__pwSetHidden?.(true)).catch(() => {})
}
async function showRole(role) {
  const r = P[role]
  await r.page.bringToFront()
  r.hidden = false
  for (const f of r.page.frames().reverse()) await f.evaluate(() => window.__pwSetHidden?.(false)).catch(() => {})
}
async function rafRate(page) {
  return page.evaluate(() => new Promise((res) => {
    let n = 0
    const t0 = performance.now()
    const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res(n) }
    requestAnimationFrame(tick)
    setTimeout(() => res(n), 2500)
  })).catch(() => null)
}
// 숨김 상태에서 시작된 장면: 숨긴 동안의 상태를 기록하고(전제 확인), 다시 보이게 한 뒤 판정한다
async function hiddenProbe(step, role, label) {
  const page = P[role].page
  const st = await page.evaluate((lab) => {
    const el = [...document.querySelectorAll('div')].find((d) => d.textContent.trim() === lab && !d.children.length)
    const box = el?.nextElementSibling
    return { vis: document.visibilityState, iframes: box ? box.querySelectorAll('iframe').length : null, boxText: box?.innerText?.slice(0, 80) }
  }, label).catch((e) => ({ err: e.message }))
  const raf = await rafRate(page)
  const frames = await Promise.all(page.frames().filter((f) => f !== page.mainFrame()).map((f) => f.evaluate(() => ({ hidden: window.__pwIsHidden?.(), canvas: !!document.querySelector('canvas'), scene: !!window.__gsScene })).catch((e) => ({ err: e.message.slice(0, 60) }))))
  const ok = st.vis === 'hidden' && raf !== null && raf < 5 && frames.every((f) => f.hidden === true)
  record(step, role, '숨김 탭 재현 전제(visibilityState=hidden·rAF 정지·iframe도 숨김)', ok, { ...st, rafPerSec: raf, childFrames: frames })
  return st
}

// 단계 끝 — 콘솔 오류·pageerror 0 확인
// 하네스가 일부러 일으킨 오류(종료 뒤 API 찔러보기 등)는 '예상됨'으로 표시해 따로 보인다
function expectErrors(role, step, re, why) {
  for (const e of P[role]?.errors || []) if (e.step === step && (re.test(e.text) || re.test(e.loc || ''))) e.expected = why
}
function errorCell(step, roles) {
  for (const role of roles) {
    const r = P[role]
    if (!r) continue
    const errs = r.errors.filter((e) => e.step === step && !e.expected)
    const exp = r.errors.filter((e) => e.step === step && e.expected)
    const d = {}
    if (errs.length) Object.assign(d, { count: errs.length, errors: errs.slice(0, 6) })
    if (exp.length) d.expected = exp
    record(step, role, '콘솔 오류·pageerror 0', errs.length === 0, d)
  }
}

// 페이지 렌더 부하 참고값 — 1초 동안 requestAnimationFrame 횟수, 장면 iframe 수
const perf = {}
async function measurePerf(step, roles) {
  perf[step] = {}
  await Promise.all(roles.filter((r) => P[r]).map(async (role) => {
    perf[step][role] = await P[role].page.evaluate(() => new Promise((res) => {
      let n = 0
      const t0 = performance.now()
      const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res({ rafPerSec: n, sceneIframes: document.querySelectorAll('iframe[sandbox]').length }) }
      requestAnimationFrame(tick)
      setTimeout(() => res({ rafPerSec: n, sceneIframes: document.querySelectorAll('iframe[sandbox]').length, timeout: true }), 3000)
    })).catch((e) => ({ err: e.message.slice(0, 100) }))
  }))
  log(`perf[${step}]`, JSON.stringify(perf[step]))
}

// ── 페이지 도우미 ────────────────────────────────────────────────────────────
async function bodyText(page) {
  return page.evaluate(() => document.body?.innerText || '').catch(() => '')
}

async function waitText(page, re, timeout = 10000) {
  const src = re instanceof RegExp ? re.source : re.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const flags = re instanceof RegExp ? re.flags : ''
  try {
    await page.waitForFunction(([s, f]) => new RegExp(s, f).test(document.body?.innerText || ''), [src, flags], { timeout, polling: 200 })
    return true
  } catch {
    return false
  }
}

async function shot(role, name) {
  const p = path.join(OUT, `${name}_${role}.png`)
  await P[role]?.page.screenshot({ path: p }).catch(() => {})
  return p
}

async function dismissWelcome(page) {
  const w = page.getByText('화면을 터치하면 시작합니다')
  try {
    if (await w.isVisible({ timeout: 300 })) await w.click({ timeout: 2000 })
  } catch { /* 이미 사라짐 */ }
  await page.waitForFunction(() => !/화면을 터치하면 시작합니다/.test(document.body.innerText), null, { timeout: 6000 }).catch(() => {})
}

// ── 장면 렌더 판정 ───────────────────────────────────────────────────────────
function xq(s) { return `"${s}"` }
function sceneBox(page, label) {
  return page.locator(`xpath=//div[normalize-space(text())=${xq(label)}]/following-sibling::div[1]`).first()
}

async function pixelStats(locator) {
  // locator.screenshot은 '요소 안정' 대기(rAF 2회)가 있어 WebGL 부하가 큰 페이지에서 멈춘다(1차 실행).
  // 화면 영역(clip)을 직접 찍어 같은 결과를 얻는다.
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }))
  const bb = await locator.boundingBox()
  if (!bb || bb.width < 4 || bb.height < 4) throw new Error('iframe 영역 없음 ' + JSON.stringify(bb))
  const page = locator.page()
  const buf = await page.screenshot({ clip: bb, timeout: 15000 })
  const png = PNG.sync.read(buf)
  const { width: W, height: H, data } = png
  const m = 3 // 가장자리 여백은 제외
  const hist = new Map()
  let n = 0
  for (let y = m; y < H - m; y++) {
    for (let x = m; x < W - m; x++) {
      const i = (y * W + x) * 4
      const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)
      hist.set(k, (hist.get(k) || 0) + 1)
      n++
    }
  }
  let domK = 0, domC = 0
  for (const [k, c] of hist) if (c > domC) { domC = c; domK = k }
  const dr = ((domK >> 10) & 31) * 8 + 4, dg = ((domK >> 5) & 31) * 8 + 4, db = (domK & 31) * 8 + 4
  let differ = 0
  for (let y = m; y < H - m; y++) {
    for (let x = m; x < W - m; x++) {
      const i = (y * W + x) * 4
      if (Math.max(Math.abs(data[i] - dr), Math.abs(data[i + 1] - dg), Math.abs(data[i + 2] - db)) > 24) differ++
    }
  }
  const differFrac = differ / Math.max(1, n)
  const domFrac = domC / Math.max(1, n)
  const lightGrey = dr > 190 && dg > 190 && db > 190 && Math.max(dr, dg, db) - Math.min(dr, dg, db) < 16
  return {
    w: W, h: H, dominant: `rgb(${dr},${dg},${db})`, domFrac: +domFrac.toFixed(4), differFrac: +differFrac.toFixed(4),
    greyBlank: lightGrey && differFrac < 0.003,
    rendered: differFrac >= 0.003,
    buf,
  }
}

async function inspectScene(page, label) {
  const box = sceneBox(page, label)
  if (!(await box.count())) return { domOk: false, reason: `'${label}' 칸 없음` }
  const info = await box.evaluate((el) => {
    const ifr = el.querySelectorAll('iframe[sandbox]')
    const r = el.getBoundingClientRect()
    return {
      iframes: ifr.length,
      srcdocLen: ifr[0]?.getAttribute('srcdoc')?.length || 0,
      text: (el.innerText || '').slice(0, 300),
      box: { w: Math.round(r.width), h: Math.round(r.height) },
    }
  }).catch((e) => ({ err: e.message }))
  if (info.err) return { domOk: false, reason: info.err }
  const out = { ...info }
  out.loadingOverlay = /3D 장면 로딩 중/.test(info.text)
  out.errorOverlay = /(오류|못했어요|멈췄어요|실패)/.test(info.text)
  if (info.iframes !== 1) return { ...out, domOk: false, reason: `iframe[sandbox] ${info.iframes}개` }
  if (info.srcdocLen <= 1000) return { ...out, domOk: false, reason: `srcdoc ${info.srcdocLen}자` }
  const h = await box.locator('iframe[sandbox]').elementHandle().catch(() => null)
  const fr = h && (await h.contentFrame().catch(() => null))
  if (!fr) return { ...out, domOk: false, reason: 'contentFrame 없음' }
  out.inner = await fr.evaluate(() => {
    const c = document.querySelector('canvas')
    return {
      canvas: !!c, cw: c?.width || 0, ch: c?.height || 0, ccw: c?.clientWidth || 0, cch: c?.clientHeight || 0,
      scene: !!window.__gsScene, sent: !!window.__gsSent, err: document.getElementById('_error_')?.textContent || null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
    }
  }).catch((e) => ({ evalErr: e.message.slice(0, 200) }))
  const i = out.inner
  if (i.evalErr) return { ...out, domOk: false, reason: 'iframe 평가 실패: ' + i.evalErr }
  if (!i.canvas) return { ...out, domOk: false, reason: 'canvas 없음' }
  if (!(i.cw > 0 && i.ch > 0 && i.ccw > 0 && i.cch > 0)) return { ...out, domOk: false, reason: 'canvas 크기 0' }
  if (!i.scene) return { ...out, domOk: false, reason: '__gsScene 없음' }
  if (i.err) return { ...out, domOk: false, reason: 'iframe 오류: ' + i.err }
  if (out.loadingOverlay) return { ...out, domOk: false, reason: '로딩 오버레이' }
  if (out.errorOverlay) return { ...out, domOk: false, reason: '오류 문구' }
  out.iframeLoc = box.locator('iframe[sandbox]')
  return { ...out, domOk: true }
}

// 장면 렌더 판정 — 시한 내 폴링. 실패 시 스크린샷·DOM 발췌를 남긴다.
async function judgeScene(role, label, step, name, timeout = SCENE_TIMEOUT, note = '') {
  const page = P[role].page
  await focusRole(role)
  const t0 = now()
  let last = null
  let px = null
  while (true) {
    last = await inspectScene(page, label)
    if (last.domOk) {
      px = await pixelStats(last.iframeLoc).catch((e) => ({ err: e.message }))
      if (px.rendered) break
      last.reason = px.err ? '스크린샷 실패: ' + px.err : px.greyBlank ? '회색 공백(픽셀)' : `픽셀 변화 부족(${px.differFrac})`
    }
    if (now() - t0 > timeout) break
    await sleep(400)
  }
  const ok = !!(last.domOk && px?.rendered)
  const tag = `s${step}_${role}_${name}`
  const sceneShot = path.join(OUT, `${tag}_scene.png`)
  if (px?.buf) fs.writeFileSync(sceneShot, px.buf)
  const detail = {
    label, ms: now() - t0, reason: ok ? undefined : last.reason,
    iframes: last.iframes, srcdocLen: last.srcdocLen, inner: last.inner, box: last.box,
    pixels: px && !px.err ? { dominant: px.dominant, domFrac: px.domFrac, differFrac: px.differFrac, greyBlank: px.greyBlank } : px,
    sceneShot: px?.buf ? sceneShot : undefined,
  }
  if (!ok) {
    detail.pageShot = path.join(OUT, `${tag}_FAIL_page.png`)
    await page.screenshot({ path: detail.pageShot }).catch(() => {})
    const box = sceneBox(page, label)
    if (await box.count()) await box.screenshot({ path: path.join(OUT, `${tag}_FAIL_box.png`) }).catch(() => {})
    detail.dom = await box.evaluate((el) => {
      const c = el.parentElement.cloneNode(true)
      c.querySelectorAll('iframe').forEach((f) => f.setAttribute('srcdoc', `[${f.getAttribute('srcdoc')?.length || 0}자 생략]`))
      return c.outerHTML.slice(0, 2000)
    }).catch(() => '(칸 없음) ' + '')
    if (!(await box.count())) detail.dom = (await bodyText(page)).slice(0, 1200)
    detail.recentErrors = P[role].errors.slice(-5)
  }
  record(step, role, `장면 렌더: ${label}${note}`, ok, detail)
  return ok
}

// ── 타이머 ───────────────────────────────────────────────────────────────────
async function teamTimer(page) {
  const t = await bodyText(page)
  const m = t.match(/⏱\s*(\d+):(\d\d)/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
async function teacherTimer(page) {
  const t = await page.locator('aside').innerText().catch(() => '')
  const m = t.match(/(\d+):(\d\d)\s*(남은 시간|곧 마감됩니다)/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

// ── 교사 조작 ────────────────────────────────────────────────────────────────
const CH = {
  'battle-03': { title: '비스듬한 화살표', level: 1, emoji: '↗️' },
  'battle-07': { title: '로켓', level: 2, emoji: '🚀' },
  'battle-11': { title: '블록 피라미드', level: 3, emoji: '🔺' },
  'battle-02': { title: '수박', level: 1, emoji: '🍉' },
}

async function teacherLogin(page, base = BASE) {
  await page.goto(base + '/teacher')
  await page.locator('input[type=password]').fill(PIN)
  await page.getByRole('button', { name: '인증', exact: true }).click()
  await page.getByPlaceholder('예: 1반3교시').waitFor({ timeout: 10000 })
}

async function teacherCreateClass(page, code, buttonName = '수업 시작 (이어가기)') {
  await page.getByPlaceholder('예: 1반3교시').fill(code)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await page.getByText('학생 접속 안내').waitFor({ timeout: 10000 })
  const saved = await page.evaluate(() => {
    const out = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k.startsWith('vpython_teacher_session')) out[k] = localStorage.getItem(k)
    }
    return out
  })
  const v = Object.values(saved).map((s) => { try { return JSON.parse(s) } catch { return null } }).find((x) => x?.teacherCode === code)
  return v?.sessionId
}

async function toBattleTab(page) {
  await page.getByRole('button', { name: '🎮 수업 진행', exact: true }).click()
  await page.locator('aside').waitFor({ timeout: 5000 })
}

async function selectChallenge(page, cid) {
  const { title } = CH[cid]
  await page.locator(`aside button[aria-label^="${title}, 레벨"]`).click()
}

async function startChallenge(page, cid, minutes = 3) {
  await wakeAll() // 시작 순간에는 모든 페이지가 정상 렌더 상태
  await selectChallenge(page, cid)
  if (minutes !== 3) await page.locator(`aside button[aria-label="제한 시간 ${minutes}분"]`).click()
  const t = now()
  await page.locator('aside button', { hasText: '시작하기' }).click()
  const ok = await waitText(page, new RegExp(`${CH[cid].title} — 진행 중`), 8000)
  return { ok, t }
}

async function endChallenge(page, cid) {
  await page.locator('aside button', { hasText: '제출 마감' }).click()
  return waitText(page, new RegExp(`${CH[cid].title} — 마감됨`), 8000)
}

async function nextChallenge(page) {
  await page.locator('aside button', { hasText: '다음 챌린지 선택' }).click()
}

// ── 팀 조작 ──────────────────────────────────────────────────────────────────
async function joinTeam(role, code, students) {
  const page = P[role].page
  await page.goto(P[role].base + '/join')
  await page.getByPlaceholder('선생님이 알려준 코드 입력').fill(code)
  for (let i = 0; i < students.length; i++) {
    await page.getByPlaceholder('학번').nth(i).fill(students[i][0])
    await page.getByPlaceholder('이름').nth(i).fill(students[i][1])
  }
  await page.getByRole('button', { name: /참여하기/ }).click()
  await page.waitForURL(/\/team\/\d+$/, { timeout: 15000 })
  await page.locator('header').waitFor({ timeout: 10000 })
  await dismissWelcome(page)
  const name = (await page.locator('header span').first().innerText()).trim()
  const teamId = Number(page.url().match(/\/team\/(\d+)/)[1])
  P[role].team = { name, teamId }
  return P[role].team
}

const PROMPT_TEXT = '원점에 빨간 구가 있고, 오른쪽 위로 비스듬히 뻗은 노란 화살표가 있다.'

async function submitPrompt(role, text = PROMPT_TEXT) {
  const page = P[role].page
  await setPaused(role, false)
  await page.locator('textarea[placeholder^="예: 원점에"]').fill(text)
  const t = now()
  await page.locator('button.battle-submit').click()
  const ok = await waitText(page, /평가 결과|제출에 실패했어요|채점에 실패했어요/, 45000)
  const txt = await bodyText(page)
  return { ok: ok && /평가 결과/.test(txt), ms: now() - t, failText: /실패했어요/.test(txt) ? txt.match(/⚠️[^\n]*\n[^\n]*/)?.[0] : null }
}

async function submitLabel(page) {
  return page.locator('button.battle-submit').innerText().catch(() => null)
}

// 순위 목록 — 제목 다음 목록의 각 줄 텍스트
async function rankingRows(page, headingRe) {
  return page.evaluate(([s, f]) => {
    const re = new RegExp(s, f)
    const hs = [...document.querySelectorAll('h2,h3')].filter((h) => re.test(h.innerText))
    if (!hs.length) return null
    const h = hs[0]
    let list = h.nextElementSibling
    if (!list || !list.children.length) list = h.parentElement.nextElementSibling
    if (!list) return []
    return [...list.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim())
  }, [headingRe.source, headingRe.flags]).catch(() => null)
}

function checkRankRows(step, role, rows, expect, where) {
  // expect: { [teamName]: 'scored' | 'unsubmitted' }
  if (!rows) {
    record(step, role, `${where} 순위 화면 표시`, false, { rows })
    return false
  }
  let allOk = true
  for (const [name, kind] of Object.entries(expect)) {
    const row = rows.find((r) => r.includes(name))
    let ok
    if (!row) ok = false
    else if (kind === 'unsubmitted') ok = /미제출/.test(row) && !/\d+\s*점/.test(row) && !/[🥇🥈🥉]/u.test(row)
    else ok = /\d+\s*점/.test(row) && !/미제출/.test(row)
    if (!ok) allOk = false
    record(step, role, `${where} 순위: ${name} → ${kind === 'unsubmitted' ? '미제출(메달·점수 없음)' : '점수 표시'}`, ok, { row: row || null, rows })
  }
  return allOk
}

// ── 메인 시나리오 ────────────────────────────────────────────────────────────
async function main() {
  const meta = { ts: TS, base: BASE, distStart: distInfo() }
  meta.mockMode = await fetch(MOCK + '/__stats').then((r) => r.json()).then((d) => d.mode).catch((e) => ({ err: e.message }))
  meta.mockStatsStart = await fetch(MOCK + '/__stats').then((r) => r.json()).then((d) => d.stats).catch(() => null)
  log('dist', JSON.stringify(meta.distStart))
  // 배경 탭 스로틀링을 실제처럼 켠다 (Playwright 기본값은 끈다)
  const browser = await chromium.launch({
    headless: !HEADED,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  })
  meta.browserVersion = browser.version()

  const CODE = `pw-${TS}`
  const SN = TS.slice(-6) // 학번 접미사(실행마다 다르게)
  // 교사·팀 B는 끊을 수 있는 프록시로 접속한다 (10단계 재접속 검사)
  const proxyT = await makeProxy(Number(process.env.PROXY_T || 4122))
  const proxyB = await makeProxy(Number(process.env.PROXY_B || 4121))
  await makeRole(browser, 'T', { base: proxyT.base })
  await makeRole(browser, 'A')
  await makeRole(browser, 'B', { base: proxyB.base })
  await makeRole(browser, 'C')
  await makeRole(browser, 'S')
  const T = P.T.page, S = P.S.page
  let sessionId, sessionId2
  const names = {}

  const step = async (n, fn) => {
    currentStep = n
    log(`── ${n}. ${STEPS[n]} ──`)
    try {
      await fn()
    } catch (e) {
      record(n, '*', '단계 실행 예외', false, { error: String(e?.stack || e).slice(0, 1200) })
      for (const r of Object.keys(P)) await shot(r, `s${n}_EXC`)
    }
    // 단계 끝 전체 스크린샷은 부하가 커서 SHOTS=1일 때만 남긴다 (실패·예외 스크린샷은 항상 남긴다)
    if (process.env.SHOTS === '1') for (const r of Object.keys(P)) await shot(r, `s${n}_end`)
  }

  // ── 준비 + 1. 시작 전 대기 ──
  await step(1, async () => {
    await teacherLogin(T, P.T.base)
    sessionId = await teacherCreateClass(T, CODE)
    meta.sessionId = sessionId
    record(1, 'T', `수업 생성 (${CODE} → session ${sessionId})`, !!sessionId)
    const loaded = await T.evaluate(() => [...document.scripts].map((s) => s.src).filter(Boolean))
    meta.loadedScripts = loaded
    await S.goto(`${BASE}/spectator/${sessionId}`)
    names.A = (await joinTeam('A', CODE, [[`1${SN}1`, '김가나'], [`1${SN}2`, '이다라']])).name
    names.B = (await joinTeam('B', CODE, [[`2${SN}1`, '박마바']])).name
    names.C = (await joinTeam('C', CODE, [[`3${SN}1`, '최사아']])).name
    meta.teams = { ...names }
    for (const r of ['A', 'B', 'C']) {
      const ok = await waitText(P[r].page, '선생님이 챌린지를 시작할 때까지 기다려주세요', 5000)
      record(1, r, '팀 대기 문구', ok)
    }
    record(1, 'S', '관람 대기 문구', await waitText(S, '관람 모드로 참여 중입니다', 5000))
    const tl = await waitText(T, new RegExp([names.A, names.B, names.C].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*')), 8000)
    record(1, 'T', '등록한 팀 목록에 3팀 실시간 표시(접속 안내 탭)', tl)
    await T.getByRole('button', { name: /수업 진행 화면으로/ }).click()
    record(1, 'T', '수업 진행 탭 진입·챌린지 미선택 안내', await waitText(T, '위에서 챌린지를 선택하세요', 5000))
  })
  errorCell(1, ['T', 'A', 'B', 'C', 'S'])

  // ── 2. 챌린지 시작(03) — 새로고침 없이 ──
  let start03
  await step(2, async () => {
    // A·관람은 배경(숨김) 탭인 상태에서 시작 — 오늘 놓친 결함의 재현 조건. B·C는 앞에 둔 채 시작
    await hideRole('A'); await hideRole('S')
    const r = await startChallenge(T, 'battle-03', 5)
    start03 = r.t
    record(2, 'T', "교사 상태 '진행 중'", r.ok)
    await sleep(3000)
    await hiddenProbe(2, 'A', '👁 이 장면을 묘사하세요')
    await hiddenProbe(2, 'S', '목표 장면')
    await showRole('A'); await showRole('S')
    const c = CH['battle-03']
    for (const role of ['A', 'B', 'C']) {
      const page = P[role].page
      await judgeScene(role, '👁 이 장면을 묘사하세요', 2, 'target03', SCENE_TIMEOUT, role === 'A' ? ' (숨김 탭에서 시작→표시)' : ' (보이는 탭)')
      const txt = await bodyText(page)
      record(2, role, '제목·레벨 표시', txt.includes(c.title) && txt.includes(`Level ${c.level}`), { snippet: txt.slice(0, 200) })
      const tm = await teamTimer(page)
      record(2, role, '타이머 표시(≈5:00)', tm !== null && tm > 260 && tm <= 300, { timer: tm })
      record(2, role, 'AI 장면 칸 대기 문구', /프롬프트를 제출하면 AI가 만든 장면이 여기에 표시됩니다/.test(txt))
    }
    await judgeScene('S', '목표 장면', 2, 'target03', SCENE_TIMEOUT, ' (숨김 탭에서 시작→표시)')
    const st = await bodyText(S)
    record(2, 'S', '제목·레벨 표시', st.includes(c.title) && st.includes(`Lv${c.level}`), { snippet: st.slice(0, 200) })
    await judgeScene('T', '목표 장면', 2, 'target03')
    const tt = await teacherTimer(T)
    record(2, 'T', '교사 타이머 표시', tt !== null && tt > 260, { timer: tt })
    await measurePerf(2, ['T', 'A', 'B', 'C', 'S'])
    record(2, 'T', '진행 중에는 결과 공개 버튼 숨김', (await T.getByRole('button', { name: '🎯 결과 공개' }).count()) === 0)
  })
  errorCell(2, ['T', 'A', 'B', 'C', 'S'])

  // ── 3. 제출 ──
  await step(3, async () => {
    const [ra, rb] = await Promise.all([submitPrompt('A'), submitPrompt('B')])
    for (const [role, r] of [['A', ra], ['B', rb]]) {
      record(3, role, '제출 → 평가 결과 표시', r.ok, r)
      const txt = await bodyText(P[role].page)
      record(3, role, '점수·피드백 표시', /평가 결과\s*\n?\s*\d+점/.test(txt) && /부분 간 크기를 비교해 보세요/.test(txt), { snippet: (txt.match(/평가 결과[\s\S]{0,200}/) || [''])[0] })
      await judgeScene(role, '🤖 AI가 만든 장면', 3, 'ai03')
      await judgeScene(role, '👁 이 장면을 묘사하세요', 3, 'target03-after')
    }
    record(3, 'C', 'C 미제출 상태(제출 버튼 활성·AI 칸 대기)', /프롬프트를 제출하면/.test(await bodyText(P.C.page)))
    const ok = await waitText(T, /제출\s*2\s*\/\s*3팀/, 8000)
    record(3, 'T', '교사 제출 현황 2/3팀 실시간 반영', ok, { text: ((await bodyText(T)).match(/제출[\s\S]{0,40}팀/) || [''])[0] })
    record(3, 'T', "교사 '1팀 미제출' 안내", await waitText(T, /1팀 미제출/, 3000))
  })
  errorCell(3, ['T', 'A', 'B', 'C', 'S'])

  // ── 4. 진행 중 새로고침 ──
  await step(4, async () => {
    for (const role of ['A', 'B', 'C']) {
      const page = P[role].page
      const r1 = await teamTimer(page)
      const t1 = now()
      await page.reload()
      await page.locator('header').waitFor({ timeout: 10000 })
      await dismissWelcome(page)
      await judgeScene(role, '👁 이 장면을 묘사하세요', 4, 'target03-reload')
      await waitText(page, /⏱\s*\d+:\d\d/, 5000)
      const r2 = await teamTimer(page)
      const expected = r1 - (now() - t1) / 1000
      record(4, role, '타이머 이어짐(초기화 안 됨)', r2 !== null && Math.abs(r2 - expected) <= 3, { before: r1, after: r2, expected: Math.round(expected) })
      const txt = await bodyText(page)
      record(4, role, '제목 유지', txt.includes(CH['battle-03'].title))
      if (role === 'A') {
        const prompt = await page.locator('textarea[placeholder^="예: 원점에"]').inputValue().catch(() => '')
        record(4, 'A', '프롬프트·평가 결과 복원', prompt === PROMPT_TEXT && /평가 결과/.test(txt), { prompt })
        const replay = page.getByRole('button', { name: /다시 보기/ })
        const has = (await replay.count()) > 0
        record(4, 'A', "AI 장면 '다시 보기' 버튼", has)
        if (has) {
          await replay.click()
          await judgeScene('A', '🤖 AI가 만든 장면', 4, 'ai03-replay')
        }
      }
    }
    await S.reload()
    await judgeScene('S', '목표 장면', 4, 'target03-reload')
    const tt1 = await teacherTimer(T)
    const t1 = now()
    await T.reload()
    const back = await waitText(T, new RegExp(`${CH['battle-03'].title} — 진행 중`), 10000)
    record(4, 'T', "새로고침 뒤 '수업 진행' 탭·진행 중 복원", back)
    await judgeScene('T', '목표 장면', 4, 'target03-reload')
    await waitText(T, /남은 시간|곧 마감/, 4000)
    const tt2 = await teacherTimer(T)
    const exp = tt1 - (now() - t1) / 1000
    record(4, 'T', '교사 타이머 이어짐', tt2 !== null && Math.abs(tt2 - exp) <= 3, { before: tt1, after: tt2, expected: Math.round(exp) })
    record(4, 'T', '제출 현황 유지(2/3팀)', await waitText(T, /제출\s*2\s*\/\s*3팀/, 5000))
  })
  errorCell(4, ['T', 'A', 'B', 'C', 'S'])

  // ── 5. 교사 마감 ──
  await step(5, async () => {
    record(5, 'T', '마감 전 결과 공개 버튼 숨김', (await T.getByRole('button', { name: '🎯 결과 공개' }).count()) === 0)
    record(5, 'T', "'제출 마감' → '마감됨'", await endChallenge(T, 'battle-03'))
    for (const role of ['A', 'B', 'C']) {
      const page = P[role].page
      await page.waitForFunction(() => /제출 마감됨/.test(document.querySelector('button.battle-submit')?.innerText || ''), null, { timeout: 6000 }).catch(() => {})
      const lab = await submitLabel(page)
      const dis = await page.locator('button.battle-submit').isDisabled().catch(() => null)
      record(5, role, "'제출 마감됨'·버튼 비활성", /제출 마감됨/.test(lab || '') && dis === true, { label: lab, disabled: dis })
      record(5, role, '타이머 사라짐', (await teamTimer(page)) === null)
    }
    record(5, 'S', "'제출 마감' 표시", await waitText(S, /제출 마감/, 6000))
    record(5, 'T', '마감 뒤 결과 공개 버튼 보임', await T.getByRole('button', { name: '🎯 결과 공개' }).isVisible().catch(() => false))
  })
  errorCell(5, ['T', 'A', 'B', 'C', 'S'])

  // ── 6. 결과 공개 ──
  await step(6, async () => {
    await T.getByRole('button', { name: '🎯 결과 공개' }).click()
    const expect = { [names.A]: 'scored', [names.B]: 'scored', [names.C]: 'unsubmitted' }
    for (const role of ['A', 'B', 'C']) {
      const page = P[role].page
      await waitText(page, '결과 발표!', 8000)
      checkRankRows(6, role, await rankingRows(page, /결과 발표/), expect, '팀')
    }
    await waitText(S, '🏆 순위', 8000)
    checkRankRows(6, 'S', await rankingRows(S, /🏆 순위/), expect, '관람')
    await waitText(T, /비스듬한 화살표 순위/, 8000)
    checkRankRows(6, 'T', await rankingRows(T, /순위$/), expect, '교사')
    // 새로고침 → 순위 화면 유지
    for (const role of ['A', 'B', 'C']) {
      const page = P[role].page
      await page.reload()
      await page.locator('header').waitFor({ timeout: 10000 })
      await dismissWelcome(page)
      const ok = await waitText(page, '결과 발표!', 6000)
      record(6, role, '새로고침 뒤 순위 화면 유지', ok, ok ? {} : { text: (await bodyText(page)).slice(0, 300) })
      if (ok) checkRankRows(6, role, await rankingRows(page, /결과 발표/), expect, '팀(새로고침 후)')
    }
    await S.reload()
    const sok = await waitText(S, '🏆 순위', 6000)
    record(6, 'S', '새로고침 뒤 순위 화면 유지', sok, sok ? {} : { text: (await bodyText(S)).slice(0, 300) })
    await T.reload()
    await waitText(T, /마감됨|진행 중|위에서 챌린지를 선택/, 10000)
    const tok = await waitText(T, /비스듬한 화살표 순위/, 6000)
    record(6, 'T', '새로고침 뒤 순위 화면 유지', tok, tok ? {} : { text: (await bodyText(T)).slice(0, 400) })
    record(6, 'T', "새로고침 뒤 '마감됨' 상태 복원", await waitText(T, /비스듬한 화살표 — 마감됨/, 3000))
  })
  errorCell(6, ['T', 'A', 'B', 'C', 'S'])

  // ── 7. 연속 시작 07 → 11 (새로고침 없이) ──
  const checkRoundAll = async (stepNo, cid, tagName, hidden = []) => {
    const c = CH[cid]
    const note = (r) => (hidden.includes(r) ? ' (숨김 탭에서 시작→표시)' : '')
    if (hidden.length) {
      await sleep(3000)
      for (const role of hidden) await hiddenProbe(stepNo, role, role === 'S' || role === 'T' ? '목표 장면' : '👁 이 장면을 묘사하세요')
      for (const role of hidden) await showRole(role)
    }
    for (const role of ['A', 'B', 'C', ...(P.D ? ['D'] : [])]) {
      const page = P[role].page
      const ok = await waitText(page, new RegExp(`Level ${c.level}[\\s\\S]*${c.title}`), 6000)
      record(stepNo, role, `${c.title} 화면 전환(제목·레벨)`, ok, ok ? {} : { text: (await bodyText(page)).slice(0, 300) })
      await judgeScene(role, '👁 이 장면을 묘사하세요', stepNo, tagName, SCENE_TIMEOUT, note(role))
      const tm = await teamTimer(page)
      record(stepNo, role, `${c.title} 타이머 표시`, tm !== null && tm > 0, { timer: tm })
    }
    const sok = await waitText(S, new RegExp(c.title), 6000)
    record(stepNo, 'S', `${c.title} 화면 전환`, sok)
    await judgeScene('S', '목표 장면', stepNo, tagName, SCENE_TIMEOUT, note('S'))
    await judgeScene('T', '목표 장면', stepNo, tagName)
  }
  let start07a
  await step(7, async () => {
    await nextChallenge(T)
    await hideRole('B'); await hideRole('C')
    const r = await startChallenge(T, 'battle-07')
    start07a = r.t
    record(7, 'T', "07 시작 → '진행 중'", r.ok)
    await checkRoundAll(7, 'battle-07', 'target07', ['B', 'C'])
    // 이 라운드에서 A만 제출 (8단계 재출제에서 섞이지 않는지 보기 위함)
    const ra = await submitPrompt('A', '세로로 선 흰 원기둥 위에 빨간 원뿔이 있다.')
    record(7, 'A', '07(1회차) 제출 완료', ra.ok, ra)
    await judgeScene('A', '🤖 AI가 만든 장면', 7, 'ai07')
    record(7, 'T', '07 마감', await endChallenge(T, 'battle-07'))
    await nextChallenge(T)
    for (const role of ['A', 'B', 'C', 'S']) await hideRole(role)
    const r2 = await startChallenge(T, 'battle-11')
    record(7, 'T', "11 시작 → '진행 중'", r2.ok)
    await checkRoundAll(7, 'battle-11', 'target11', ['A', 'B', 'C', 'S'])
    record(7, 'A', '11 전환 뒤 이전 AI 장면·평가 비움', !/평가 결과/.test(await bodyText(P.A.page)) && /프롬프트를 제출하면/.test(await bodyText(P.A.page)))
    record(7, 'T', '11 마감', await endChallenge(T, 'battle-11'))
  })
  errorCell(7, ['T', 'A', 'B', 'C', 'S'])

  // ── 8·9·10. 07 재출제 + 늦은 참가 + 재접속 ──
  await step(8, async () => {
    await nextChallenge(T)
    const r = await startChallenge(T, 'battle-07')
    record(8, 'T', "07 재출제 → '진행 중'", r.ok)
    await checkRoundAll(8, 'battle-07', 'target07-again')
    const aTxt = await bodyText(P.A.page)
    const aPrompt = await P.A.page.locator('textarea[placeholder^="예: 원점에"]').inputValue().catch(() => null)
    record(8, 'A', '재출제 라운드에 지난 라운드 프롬프트·평가 미복원', aPrompt === '' && !/평가 결과/.test(aTxt), { prompt: aPrompt })
  })
  errorCell(8, ['T', 'A', 'B', 'C', 'S'])

  await step(9, async () => {
    await makeRole(browser, 'D')
    const before = await teamTimer(P.A.page)
    names.D = (await joinTeam('D', CODE, [[`4${SN}1`, '정자차']])).name
    meta.teams.D = names.D
    await judgeScene('D', '👁 이 장면을 묘사하세요', 9, 'target07-late')
    const txt = await bodyText(P.D.page)
    record(9, 'D', '늦은 참가: 진행 중 챌린지 제목', txt.includes(CH['battle-07'].title))
    const dt = await teamTimer(P.D.page)
    const at = await teamTimer(P.A.page)
    record(9, 'D', '늦은 참가: 남은 시간(다른 팀과 ±3초)', dt !== null && at !== null && Math.abs(dt - at) <= 3 && dt < 180, { D: dt, A: at, AbeforeJoin: before })
    const tok = await waitText(T, new RegExp(`4\\s*/\\s*\\d+팀 참여 중`), 8000)
    record(9, 'T', '교사 대시보드 4팀 참여 반영', tok, tok ? {} : { text: ((await bodyText(T)).match(/\d+\s*\/?\s*\d*팀 참여 중/) || [''])[0] })
    record(9, 'T', '제출 현황 0/4팀', await waitText(T, /제출\s*0\s*\/\s*4팀/, 5000))
    record(9, 'S', '관람 4팀 참여 중', await waitText(S, '4팀 참여 중', 8000))
  })
  errorCell(9, ['T', 'A', 'B', 'C', 'S', 'D'])

  await step(10, async () => {
    // B 정상 제출 (재출제 라운드 집계용)
    const rb = await submitPrompt('B', '세로로 선 흰 원기둥 위에 빨간 원뿔, 아래에 회색 날개가 있다.')
    record(10, 'B', '재출제 라운드 제출(B)', rb.ok, rb)
    await waitText(T, /제출\s*1\s*\/\s*4팀/, 6000)
    // (a) 교사 연결 실제 차단(프록시 절단) 중 D 제출 → 복귀 후 제출 알림 반영
    const tOff = now()
    proxyT.cut()
    await P.T.ctx.setOffline(true)
    const dSub = submitPrompt('D', '흰 원기둥 몸통, 빨간 원뿔 머리, 회색 날개 셋.')
    await sleep(3000)
    const rd = await dSub
    await sleep(1000)
    await P.T.ctx.setOffline(false)
    proxyT.restore()
    const tOn = now()
    record(10, 'D', '교사 끊김 동안 D 제출 완료', rd.ok, rd)
    const tClosed = P.T.ws.filter((w) => w.closed && w.closed >= tOff && w.closed <= tOn + 500).length
    record(10, 'T', '교사 소켓 실제로 끊김(검사 전제)', tClosed > 0, { wsClosed: tClosed })
    const tGot = await waitText(T, /2\s*\/\s*4팀 제출|제출\s*2\s*\/\s*4팀/, 15000)
    const reopened = P.T.ws.filter((w) => w.opened > tOn).length
    record(10, 'T', '교사 재접속 후 끊김 중 제출 알림 반영(2/4팀)', tGot, {
      text: ((await bodyText(T)).match(/제출[\s\S]{0,30}팀|\d+\s*\/\s*\d+팀 제출/) || [''])[0], wsReopened: reopened,
      submittedEventsAfterRestore: wsEvents('T', 'team:submitted', tOn).length,
      dashboardUpdatesAfterRestore: wsEvents('T', 'dashboard:update', tOn).length,
    })
    // 새로고침하면 반영되는지(서버 데이터는 맞는지) 대조
    if (!tGot) {
      await T.reload({ timeout: 60000 }).catch(() => {})
      await waitText(T, /로켓 — 진행 중/, 20000)
      record(10, 'T', '(대조) 새로고침하면 2/4팀 반영', await waitText(T, /2\s*\/\s*4팀 제출|제출\s*2\s*\/\s*4팀/, 20000), { text: ((await bodyText(T)).match(/제출[\s\S]{0,30}팀/) || [''])[0] })
    }
    // (b) B 연결 실제 차단 중 힌트 → 복귀 후 힌트 표시
    const bOff = now()
    proxyB.cut()
    await P.B.ctx.setOffline(true)
    await sleep(300)
    await T.locator('aside button', { hasText: '힌트 전송' }).click()
    const hintSent = await waitText(T, '힌트 전송됨', 6000)
    record(10, 'T', '힌트 전송(B 끊김 중)', hintSent)
    await sleep(3000)
    await P.B.ctx.setOffline(false)
    proxyB.restore()
    const bOn = now()
    const bClosed = P.B.ws.filter((w) => w.closed && w.closed >= bOff && w.closed <= bOn + 500).length
    record(10, 'B', 'B 소켓 실제로 끊김(검사 전제)', bClosed > 0, { wsClosed: bClosed })
    // 재접속을 기다린다 (socket.io 재연결 지연 최대 5초)
    await P.B.page.waitForFunction(() => true, null, { timeout: 1000 }).catch(() => {})
    const t0r = now()
    while (now() - t0r < 12000 && !P.B.ws.some((w) => w.opened > bOn && !w.closed)) await sleep(250)
    record(10, 'B', 'B 재접속', P.B.ws.some((w) => w.opened > bOn), { ms: now() - t0r })
    const hintOk = await waitText(P.B.page, '💡 힌트:', 8000)
    record(10, 'B', '끊김 3초 후 복귀 → 놓친 힌트 표시', hintOk, { hintEventsAfterRestore: wsEvents('B', 'challenge:hint', bOn).length })
    for (const role of ['A', 'C', 'D']) record(10, role, '힌트 수신(연결 유지 팀)', await waitText(P[role].page, '💡 힌트:', 3000))
    // (c) B 연결 실제 차단 중 마감 → 복귀 후 마감 표시
    const bOff2 = now()
    proxyB.cut()
    await P.B.ctx.setOffline(true)
    await sleep(300)
    record(10, 'T', '마감(B 끊김 중)', await endChallenge(T, 'battle-07'))
    await sleep(3000)
    await P.B.ctx.setOffline(false)
    proxyB.restore()
    const bOn2 = now()
    record(10, 'B', 'B 소켓 실제로 끊김(2차, 검사 전제)', P.B.ws.some((w) => w.closed && w.closed >= bOff2 && w.closed <= bOn2 + 500))
    const bEnd = await P.B.page.waitForFunction(() => /제출 마감됨/.test(document.querySelector('button.battle-submit')?.innerText || ''), null, { timeout: 15000 }).then(() => true).catch(() => false)
    record(10, 'B', '끊김 3초 후 복귀 → 마감 수신', bEnd, { label: await submitLabel(P.B.page), endedEvents: wsEvents('B', 'challenge:ended', bOn2).map((e) => e.data) })
    // 8단계 판정: 이번 라운드만 집계
    await T.getByRole('button', { name: '🎯 결과 공개' }).click()
    const expect = { [names.A]: 'unsubmitted', [names.B]: 'scored', [names.C]: 'unsubmitted', [names.D]: 'scored' }
    for (const role of ['A', 'B', 'C', 'D']) {
      await waitText(P[role].page, '결과 발표!', 8000)
      checkRankRows(8, role, await rankingRows(P[role].page, /결과 발표/), expect, '재출제(이번 라운드만)')
    }
    await waitText(S, '🏆 순위', 8000)
    checkRankRows(8, 'S', await rankingRows(S, /🏆 순위/), expect, '재출제(이번 라운드만)')
    await waitText(T, /로켓 순위/, 8000)
    checkRankRows(8, 'T', await rankingRows(T, /순위$/), expect, '재출제(이번 라운드만)')
  })
  for (const role of ['T', 'B']) expectErrors(role, 10, /WebSocket connection .* failed|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_EMPTY_RESPONSE/, '하네스가 프록시로 연결을 끊어 생긴 소켓 재연결 실패 로그')
  errorCell(10, ['T', 'A', 'B', 'C', 'S', 'D'])

  // ── 11. 타이머 자연 만료 (UI 최소 1분) ──
  await step(11, async () => {
    await nextChallenge(T)
    const r = await startChallenge(T, 'battle-02', 1)
    record(11, 'T', "02 시작(1분) → '진행 중'", r.ok)
    for (const role of ['A', 'B', 'C', 'D']) {
      await waitText(P[role].page, /⏱\s*\d+:\d\d/, 5000)
      const tm = await teamTimer(P[role].page)
      record(11, role, '1분 타이머 표시(≈1:00)', tm !== null && tm > 40 && tm <= 60, { timer: tm })
    }
    await measurePerf(11, ['T', 'A', 'B', 'C', 'S', 'D'])
    await checkRoundAll(11, 'battle-02', 'target02')
    const t0 = r.t
    log('타이머 만료 대기 60초…')
    const roles = ['A', 'B', 'C', 'D']
    await P.A.page.waitForFunction(() => /제출 마감됨/.test(document.querySelector('button.battle-submit')?.innerText || ''), null, { timeout: 75000 }).catch(() => {})
    await sleep(3000)
    for (const role of roles) {
      const lab = await submitLabel(P[role].page)
      record(11, role, "만료 → '제출 마감됨'", /제출 마감됨/.test(lab || ''), { label: lab })
      const ev = wsEvents(role, 'challenge:ended', t0)
      record(11, role, 'challenge:ended 1회 수신', ev.length === 1, { count: ev.length, events: ev.map((e) => ({ ws: e.ws, dt: e.t - t0, data: e.data })) })
    }
    record(11, 'S', "만료 → '제출 마감'", await waitText(S, /제출 마감/, 3000))
    const sev = wsEvents('S', 'challenge:ended', t0)
    record(11, 'S', 'challenge:ended 1회 수신', sev.length === 1, { count: sev.length })
    record(11, 'T', "만료 → '마감됨'", await waitText(T, /수박 — 마감됨/, 5000))
    const tev = wsEvents('T', 'challenge:ended', t0)
    const perWs = {}
    for (const e of tev) perWs[e.ws] = (perWs[e.ws] || 0) + 1
    record(11, 'T', '교사 소켓마다 challenge:ended 1회', Object.values(perWs).length > 0 && Object.values(perWs).every((c) => c === 1), { perWs })
    record(11, 'T', '만료 뒤 결과 공개 버튼 보임', await T.getByRole('button', { name: '🎯 결과 공개' }).isVisible().catch(() => false))
  })
  errorCell(11, ['T', 'A', 'B', 'C', 'S', 'D'])

  // ── 12. 전체 수업 종료 ──
  await step(12, async () => {
    T.once('dialog', (d) => d.accept())
    await T.locator('aside button', { hasText: '전체 수업 종료' }).click()
    const tf = await waitText(T, '🏆 최종 결과', 15000)
    record(12, 'T', '교사 최종 결과 화면', tf)
    const tt = await bodyText(T)
    record(12, 'T', '최종 결과에 챌린지 제목 표시(id 아님)', /비스듬한 화살표/.test(tt) && /로켓/.test(tt) && !/battle-\d\d/.test(tt), { snippet: (tt.match(/최종 결과[\s\S]{0,400}/) || [''])[0] })
    record(12, 'T', "'🏁 수업이 종료되었습니다'·새 수업 준비 버튼", /수업이 종료되었습니다/.test(tt) && /새 수업 준비/.test(tt))
    for (const role of ['A', 'B', 'C', 'D']) {
      const page = P[role].page
      const ok = await waitText(page, '🏆 최종 결과', 8000)
      record(12, role, '팀 최종 결과 화면', ok)
      const txt = await bodyText(page)
      if (role !== 'C') record(12, role, '내 팀 결과에 챌린지 제목 표시', /비스듬한 화살표|로켓/.test(txt) && !/battle-\d\d/.test(txt), { snippet: txt.slice(0, 300) })
      record(12, role, '종료 뒤 제출 입력창·버튼 없음', (await page.locator('textarea[placeholder^="예: 원점에"]').count()) === 0 && (await page.locator('button.battle-submit').count()) === 0)
    }
    record(12, 'S', '관람 종료 안내', await waitText(S, '수업이 종료되었습니다', 8000))
    // 종료 뒤 팀 토큰으로 생성 API 호출 → 거부되어야 한다
    const api = await P.A.page.evaluate(async (teamId) => {
      const token = sessionStorage.getItem(`vpython_team_token:${teamId}`)
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-team-token': token || '' }, body: JSON.stringify({ prompt: '빨간 구', teamId, challengeId: 'battle-02' }) })
      return { status: res.status, body: (await res.text()).slice(0, 200), hadToken: !!token }
    }, P.A.team.teamId)
    record(12, 'A', '종료 뒤 생성 API 거부', api.status >= 400, api)
    await sleep(300)
    expectErrors('A', 12, /\/api\/generate|status of 40[13]/, '하네스가 종료 뒤 생성 API를 일부러 호출')
    // 종료 뒤 팀 화면 새로고침 → 참여 화면 안내
    await P.C.page.reload()
    const cj = await P.C.page.waitForURL(/\/join/, { timeout: 10000 }).then(() => true).catch(() => false)
    const cTxt = await bodyText(P.C.page)
    record(12, 'C', "종료 뒤 새로고침 → /join '수업이 종료되었습니다' 안내", cj && /수업이 종료되었습니다/.test(cTxt), { url: P.C.page.url(), notice: (cTxt.match(/[^\n]*(만료|종료)[^\n]*/) || [''])[0] })
    expectErrors('C', 12, /\/api\/team\//, '종료된 수업의 팀 토큰으로 /api/team 조회 → 401 (위 안내 문구 셀 참고)')
  })
  errorCell(12, ['T', 'A', 'B', 'C', 'S', 'D'])

  // ── 13. 같은 교사 코드로 새 수업 ──
  await step(13, async () => {
    await T.getByRole('button', { name: /새 수업 준비/ }).click()
    await T.getByPlaceholder('예: 1반3교시').waitFor({ timeout: 8000 })
    sessionId2 = await teacherCreateClass(T, CODE)
    meta.sessionId2 = sessionId2
    record(13, 'T', `같은 코드로 새 수업 생성(새 session ${sessionId2})`, !!sessionId2 && sessionId2 !== sessionId, { old: sessionId, new: sessionId2 })
    await S.goto(`${BASE}/spectator/${sessionId2}`)
    names.A2 = (await joinTeam('A', CODE, [[`1${SN}1`, '김가나'], [`1${SN}2`, '이다라']])).name
    names.B2 = (await joinTeam('B', CODE, [[`2${SN}1`, '박마바']])).name
    names.C2 = (await joinTeam('C', CODE, [[`3${SN}1`, '최사아']])).name
    for (const r of ['A', 'B', 'C']) record(13, r, '재등록 후 대기 문구', await waitText(P[r].page, '선생님이 챌린지를 시작할 때까지 기다려주세요', 5000))
    record(13, 'S', '관람 대기 문구', await waitText(S, '관람 모드로 참여 중입니다', 5000))
    record(13, 'S', '관람 3팀 참여 중', await waitText(S, '3팀 참여 중', 6000))
    record(13, 'T', '등록 팀 목록 3팀', await waitText(T, new RegExp([names.A2, names.B2, names.C2].join('[\\s\\S]*')), 8000))
    await T.getByRole('button', { name: /수업 진행 화면으로/ }).click()
    await hideRole('A')
    const r = await startChallenge(T, 'battle-03')
    record(13, 'T', "새 수업 03 시작 → '진행 중'", r.ok)
    await sleep(3000)
    await hiddenProbe(13, 'A', '👁 이 장면을 묘사하세요')
    await showRole('A')
    for (const role of ['A', 'B', 'C']) {
      await judgeScene(role, '👁 이 장면을 묘사하세요', 13, 'target03-c2', SCENE_TIMEOUT, role === 'A' ? ' (숨김 탭에서 시작→표시)' : '')
      const tm = await teamTimer(P[role].page)
      record(13, role, '타이머 표시', tm !== null && tm > 160, { timer: tm })
    }
    await judgeScene('S', '목표 장면', 13, 'target03-c2')
    await judgeScene('T', '목표 장면', 13, 'target03-c2')
    await measurePerf(13, ['T', 'A', 'B', 'C', 'S'])
    record(13, 'T', '새 수업 제출 현황 0/3팀(이전 수업 섞이지 않음)', await waitText(T, /제출\s*0\s*\/\s*3팀/, 6000))
  })
  errorCell(13, ['T', 'A', 'B', 'C', 'S'])

  // ── 15. 모바일 375×812 ──
  await step(15, async () => {
    await makeRole(browser, 'M', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const M = P.M.page
    await M.goto(BASE + '/join')
    await M.getByPlaceholder('선생님이 알려준 코드 입력').waitFor()
    const j = await M.evaluate(() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth }))
    record(15, 'M', '/join 가로 스크롤 없음', j.sw <= j.iw && j.bw <= j.iw, j)
    const jb = await M.getByRole('button', { name: /참여하기/ }).boundingBox()
    record(15, 'M', '/join 참여 버튼 첫 화면 안', !!jb && jb.y + jb.height <= 812, { box: jb })
    await joinTeam('M', CODE, [[`5${SN}1`, '모바일']])
    await judgeScene('M', '👁 이 장면을 묘사하세요', 15, 'target03-mobile')
    await M.evaluate(() => window.scrollTo(0, 0))
    const t = await M.evaluate(() => {
      const b = document.querySelector('button.battle-submit')
      const r = b?.getBoundingClientRect()
      return { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth, ih: innerHeight, btn: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null }
    })
    record(15, 'M', '팀 챌린지 화면 가로 스크롤 없음', t.sw <= t.iw && t.bw <= t.iw, t)
    record(15, 'M', '제출 버튼 첫 화면 안', !!t.btn && t.btn.top >= 0 && t.btn.bottom <= t.ih, t)
    // 모바일 제출까지
    const rm = await submitPrompt('M')
    record(15, 'M', '모바일 제출 → 평가 결과', rm.ok, rm)
    await judgeScene('M', '🤖 AI가 만든 장면', 15, 'ai03-mobile')
    const t2 = await M.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))
    record(15, 'M', '제출 후에도 가로 스크롤 없음', t2.sw <= t2.iw, t2)
  })
  errorCell(15, ['T', 'A', 'B', 'C', 'S', 'M'])

  // ── 14. 연수 입장 ──
  await step(14, async () => {
    await makeRole(browser, 'TR')
    const R = P.TR.page
    await R.goto(BASE + '/training')
    await R.locator('#training-code').fill(TRAINING)
    await R.getByRole('button', { name: '입장하기' }).click()
    const setup = await R.getByPlaceholder('예: 1반3교시').waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
    record(14, 'TR', '연수 입장 → 수업 생성 화면', setup && /\/teacher/.test(R.url()))
    record(14, 'TR', "'연수 모드' 배지", /연수 모드/.test(await bodyText(R)))
    const tcode = `pwt-${TS}`
    await R.getByPlaceholder('예: 1반3교시').fill(tcode)
    await R.getByRole('button', { name: '수업 시작', exact: true }).click()
    const info = await waitText(R, '학생 접속 안내', 10000)
    const txt = await bodyText(R)
    record(14, 'TR', '수업 생성 → 접속 안내 탭에 수업코드', info && txt.includes('수업코드') && txt.includes(tcode), { snippet: (txt.match(/수업코드[\s\S]{0,80}/) || [''])[0] })
    const qr = await R.locator('img[alt="학생 참여 QR코드"]').waitFor({ timeout: 8000 }).then(() => true).catch(() => false)
    record(14, 'TR', '참여 QR 표시', qr)
  })
  errorCell(14, ['TR'])

  // ── 마무리 ──
  meta.perf = perf
  proxyT.close(); proxyB.close()
  meta.distEnd = distInfo()
  meta.distChangedDuringRun = JSON.stringify(meta.distStart) !== JSON.stringify(meta.distEnd)
  meta.mockStatsEnd = await fetch(MOCK + '/__stats').then((r) => r.json()).then((d) => d.stats).catch(() => null)
  const extra = {}
  for (const [role, r] of Object.entries(P)) {
    extra[role] = {
      errors: r.errors, reqFails: r.reqFails, http: r.http,
      ws: r.ws.map((w) => ({ id: w.id, opened: w.opened, closed: w.closed, events: w.events.map((e) => e.name) })),
      team: r.team,
    }
  }
  await browser.close()
  writeReport(meta, extra)
}

function writeReport(meta, extra) {
  const used = ROLES.filter((r) => cells.some((c) => c.role === r))
  const stepNums = Object.keys(STEPS).map(Number).filter((n) => cells.some((c) => c.step === n))
  let md = `# 화면 검증 매트릭스 ${meta.ts}\n\n- BASE ${meta.base}, Chromium ${meta.browserVersion}\n- dist(시작) ${JSON.stringify(meta.distStart.assets?.map((a) => a.f + '@' + a.mtime))}\n- dist 실행 중 변경: ${meta.distChangedDuringRun}\n- 로드한 스크립트 ${JSON.stringify(meta.loadedScripts)}\n\n`
  md += `| 단계 | ${used.join(' | ')} | 예외 |\n|---|${used.map(() => '---').join('|')}|---|\n`
  for (const n of stepNums) {
    const row = used.map((r) => {
      const cs = cells.filter((c) => c.step === n && c.role === r)
      if (!cs.length) return '·'
      const bad = cs.filter((c) => !c.ok).length
      return bad ? `❌ ${bad}/${cs.length}` : `✅ ${cs.length}`
    })
    const ex = cells.filter((c) => c.step === n && c.role === '*')
    md += `| ${n}. ${STEPS[n]} | ${row.join(' | ')} | ${ex.length ? '❌' : ''} |\n`
  }
  md += `\n## 실패 셀\n\n`
  for (const c of cells.filter((x) => !x.ok)) md += `- [${c.step}·${c.role}] ${c.check}\n  - \`${JSON.stringify(c.detail).slice(0, 1500)}\`\n`
  md += `\n## 전체 셀\n\n`
  for (const c of cells) md += `- ${c.ok ? '✅' : '❌'} [${c.step}·${c.role}] ${c.check}\n`
  fs.writeFileSync(path.join(OUT, 'matrix.md'), md)
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ meta, cells, extra }, null, 2))
  const fails = cells.filter((c) => !c.ok).length
  log(`완료: ${cells.length}셀 중 실패 ${fails} → ${OUT}`)
}

process.on('SIGTERM', () => process.exit(143))
main().catch((e) => {
  console.error('치명적 오류', e)
  try { writeReport({ ts: TS, base: BASE, distStart: distInfo(), fatal: String(e?.stack || e) }, {}) } catch { /* 무시 */ }
  process.exit(1)
})
