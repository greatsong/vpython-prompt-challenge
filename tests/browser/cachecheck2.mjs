import { chromium } from 'playwright'
const URL = 'https://vpython-prompt-challenge.fly.dev/spectator/5b9d2413-2511-48f3-b5f6-1afb82597e62'
const b = await chromium.launch(); const ctx = await b.newContext(); const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable')
const req = {}
cdp.on('Network.requestWillBeSent', e => { if (/lib\/glowscript/.test(e.request.url)) req[e.requestId] = { url: e.request.url.split('/').pop(), t0: e.timestamp } })
cdp.on('Network.responseReceived', e => { const r = req[e.requestId]; if (r) { r.cache = e.response.fromDiskCache||e.response.fromMemoryCache; r.enc = e.response.headers['content-encoding']||e.response.headers['Content-Encoding']||'-'; r.status = e.response.status } })
cdp.on('Network.loadingFinished', e => { const r = req[e.requestId]; if (r) { r.bytes = e.encodedDataLength; r.ms = Math.round((e.timestamp - r.t0)*1000) } })
for (const label of ['1회차','2회차']) { await page.goto(URL, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  console.log(label); for (const r of Object.values(req)) console.log('  ', r.url, r.status, 'cache='+r.cache, 'enc='+r.enc, r.bytes+'B', r.ms+'ms'); for (const k in req) delete req[k] }
await b.close()
