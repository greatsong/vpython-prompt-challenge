// 10단계 교사 측 대조: 끊김 중 제출 → 복귀 → 새로고침 후 대시보드 표시
import { createRequire } from 'module'; import net from 'net'
const require = createRequire(import.meta.url); const { chromium } = require('playwright')
const B = 'http://localhost:4120'; const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const socks = new Set(); let blocked = false
const srv = net.createServer(c => { if (blocked) return c.destroy(); const u = net.connect(4120, 'localhost'); socks.add(c); socks.add(u); const d = () => { c.destroy(); u.destroy() }; c.on('error', d); u.on('error', d); c.on('close', d); u.on('close', d); c.pipe(u); u.pipe(c) })
await new Promise(r => srv.listen(4126, '127.0.0.1', r))
const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const T = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
const code = 'rp-' + Date.now()
await T.goto('http://localhost:4126/teacher'); await T.locator('input[type=password]').fill('test-pin'); await T.getByRole('button', { name: '인증', exact: true }).click()
await T.getByPlaceholder('예: 1반3교시').fill(code); await T.getByRole('button', { name: '수업 시작 (이어가기)', exact: true }).click(); await T.getByText('학생 접속 안내').waitFor()
const teams = []
for (const n of ['1', '2']) {
  const p = await (await br.newContext()).newPage(); await p.goto(B + '/join')
  await p.getByPlaceholder('선생님이 알려준 코드 입력').fill(code); await p.getByPlaceholder('학번').first().fill('9' + n + Date.now() % 100000); await p.getByPlaceholder('이름').first().fill('학생' + n)
  await p.getByRole('button', { name: /참여하기/ }).click(); await p.waitForURL(/\/team\/\d+$/); await sleep(1500); await p.getByText('화면을 터치하면 시작합니다').click().catch(() => {}); teams.push(p)
}
await T.getByRole('button', { name: /수업 진행 화면으로/ }).click()
await T.locator('aside button[aria-label^="비스듬한 화살표, 레벨"]').click(); await T.locator('aside button', { hasText: '시작하기' }).click(); await sleep(2000)
const prog = async () => ((await T.evaluate(() => document.body.innerText)).match(/제출\s*\d+\s*\/\s*\d+팀/) || ['?'])[0].replace(/\s+/g, ' ')
const sub = async (p) => { await p.locator('textarea[placeholder^="예: 원점에"]').fill('빨간 구 하나와 노란 화살표'); await p.locator('button.battle-submit').click(); await p.waitForFunction(() => /평가 결과/.test(document.body.innerText), null, { timeout: 40000 }) }
await sub(teams[0]); await sleep(1500); console.log('연결 상태 제출 후:', await prog())
blocked = true; for (const s of socks) s.destroy()
await sub(teams[1]); await sleep(1000); blocked = false
await sleep(10000); console.log('끊김 중 제출 → 복귀 10초 후:', await prog())
const t0 = Date.now(); await T.reload(); console.log('reload ms', Date.now() - t0); await sleep(5000); console.log('새로고침 5초 후:', await prog())
await T.screenshot({ path: 'repro10_T.png' })
await br.close(); srv.close()
