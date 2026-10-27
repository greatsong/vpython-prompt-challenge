/**
 * Evaluation prompt regression harness.
 *
 * Default mode is free: it validates rubric/anchor coverage only.
 * Live mode calls the local server's single-evaluation endpoint repeatedly:
 *
 *   npm run test:evaluation
 *   node tests/eval-regression.mjs --live --teacher-pin=123456 --repeat=3 --limit=6
 *   node tests/eval-regression.mjs --live --teacher-token=... --repeat=3 --challenge=battle-04
 *   node tests/eval-regression.mjs --live --teacher-pin=123456 --repeat=3 --limit=6 --no-cache
 *
 * --no-cache sends `x-eval-nocache: 1`. With a teacher token the server then skips
 * the evaluation cache (no read, no write), so repeated runs measure the real
 * score spread (std) instead of replaying the first cached score.
 *
 * Use --all in live mode to run every rubric anchor. Without --all or --limit,
 * live mode intentionally samples the first 6 cases to avoid surprise API cost.
 */

import { RUBRICS } from '../src/server-data/rubrics.js'
import { BATTLE_CHALLENGES } from '../src/server-data/challenges.js'

const args = process.argv.slice(2)

function hasFlag(name) {
  return args.includes(`--${name}`)
}

function getArg(name, fallback = null) {
  const prefix = `--${name}=`
  const match = args.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

function numberArg(name, fallback) {
  const value = Number(getArg(name, fallback))
  return Number.isFinite(value) ? value : fallback
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function stddev(values) {
  if (values.length <= 1) return 0
  const avg = average(values)
  const variance = average(values.map((value) => (value - avg) ** 2))
  return Math.sqrt(variance)
}

async function runLimited(tasks, concurrency) {
  const queue = [...tasks]
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const task = queue.shift()
      await task()
    }
  })
  await Promise.all(workers)
}

const live = hasFlag('live')
const noCache = hasFlag('no-cache')
const all = hasFlag('all')
const base = getArg('base', process.env.EVAL_TEST_BASE || 'http://localhost:4009')
const repeat = Math.max(1, numberArg('repeat', 1))
const concurrency = Math.max(1, numberArg('concurrency', 2))
const tolerance = Math.max(0, numberArg('tolerance', 12))
const maxStd = Math.max(0, numberArg('max-std', 8))
const challengeFilter = getArg('challenge')
let teacherToken = getArg('teacher-token', process.env.EVAL_TEST_TEACHER_TOKEN || null)
const teacherPin = getArg('teacher-pin', process.env.EVAL_TEST_TEACHER_PIN || null)
const limitArg = getArg('limit')
const limit = limitArg === null ? null : Math.max(1, Number(limitArg))

const challengeById = new Map(BATTLE_CHALLENGES.map((challenge) => [challenge.id, challenge]))
const structuralFailures = []

const cases = Object.entries(RUBRICS).flatMap(([challengeId, rubric]) => {
  const challenge = challengeById.get(challengeId)
  const elementTotal = rubric.elements.reduce((sum, element) => sum + element.weight, 0)
  const total = elementTotal + (rubric.ct?.maxPoints || 0)

  if (!challenge) structuralFailures.push(`${challengeId}: missing challenge`)
  if (total !== 100) structuralFailures.push(`${challengeId}: total=${total}, expected=100`)
  for (const element of rubric.elements) {
    if (!element.name || !element.category || !Number.isFinite(element.weight)) {
      structuralFailures.push(`${challengeId}: invalid element ${JSON.stringify(element)}`)
    }
  }

  return rubric.anchors.map((anchor, index) => ({
    id: `${challengeId}#${index + 1}`,
    challengeId,
    prompt: anchor.prompt,
    expected: anchor.score,
    targetCode: challenge?.code || '',
  }))
})
  .filter((testCase) => !challengeFilter || testCase.challengeId === challengeFilter)

let selectedCases = cases
if (live && !all && limit === null) {
  selectedCases = cases.slice(0, 6)
} else if (limit !== null) {
  selectedCases = cases.slice(0, limit)
}

console.log(`rubrics=${Object.keys(RUBRICS).length} cases=${cases.length}`)
if (challengeFilter) console.log(`challenge=${challengeFilter} selected=${selectedCases.length}`)

if (structuralFailures.length > 0) {
  console.error('\nStructural failures:')
  for (const failure of structuralFailures) console.error(`- ${failure}`)
  process.exit(1)
}

if (!live) {
  console.log('dry-run ok: use --live to call /api/evaluate repeatedly')
  process.exit(0)
}

if (selectedCases.length === 0) {
  console.error('no cases selected')
  process.exit(1)
}

console.log(`live base=${base} repeat=${repeat} concurrency=${concurrency} selected=${selectedCases.length}`)
console.log(`thresholds tolerance=±${tolerance} maxStd=${maxStd}`)
console.log(`cache=${noCache ? 'bypass (x-eval-nocache: 1)' : 'on (repeats after the first may be cache hits)'}`)

if (!teacherToken && teacherPin) {
  const auth = await fetch(`${base}/api/auth/teacher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: teacherPin }),
  })
  const data = await auth.json().catch(() => ({}))
  if (!auth.ok || !data.token) {
    console.error('teacher auth failed: pass --teacher-token or a valid --teacher-pin')
    process.exit(1)
  }
  teacherToken = data.token
}

if (!teacherToken) {
  console.error('live mode requires --teacher-token, --teacher-pin, EVAL_TEST_TEACHER_TOKEN, or EVAL_TEST_TEACHER_PIN')
  process.exit(1)
}

async function evaluate(testCase) {
  const res = await fetch(`${base}/api/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-teacher-token': teacherToken,
      ...(noCache ? { 'x-eval-nocache': '1' } : {}),
    },
    body: JSON.stringify({
      prompt: testCase.prompt,
      generatedCode: '',
      targetCode: testCase.targetCode,
      challengeId: testCase.challengeId,
      sessionNumber: 1,
    }),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 180)}`)

  const data = JSON.parse(text)
  if (data.failed) throw new Error(`evaluation failed: ${data.feedback || ''}`)
  return {
    score: Number(data.score),
    feedback: data.feedback || '',
    cached: data.cached === true,
  }
}

const results = new Map(selectedCases.map((testCase) => [
  testCase.id,
  { testCase, scores: [], errors: [], cachedHits: 0 },
]))

const tasks = []
for (const testCase of selectedCases) {
  for (let i = 0; i < repeat; i += 1) {
    tasks.push(async () => {
      const bucket = results.get(testCase.id)
      try {
        const data = await evaluate(testCase)
        bucket.scores.push(data.score)
        if (data.cached) bucket.cachedHits += 1
      } catch (err) {
        bucket.errors.push(err.message)
      }
    })
  }
}

await runLimited(tasks, concurrency)

let failed = 0
for (const { testCase, scores, errors, cachedHits } of results.values()) {
  if (errors.length > 0 || scores.length === 0) {
    failed += 1
    console.log(`FAIL ${testCase.id} expected=${testCase.expected} errors=${errors.join(' | ')}`)
    continue
  }

  const avg = average(scores)
  const spread = stddev(scores)
  const delta = avg - testCase.expected
  const ok = Math.abs(delta) <= tolerance && spread <= maxStd
  if (!ok) failed += 1

  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${testCase.id} expected=${testCase.expected} ` +
    `scores=[${scores.join(',')}] avg=${avg.toFixed(1)} delta=${delta.toFixed(1)} std=${spread.toFixed(1)} ` +
    `cached=${cachedHits}/${scores.length}`
  )
}

console.log(`\nsummary passed=${selectedCases.length - failed} failed=${failed}`)
process.exit(failed > 0 ? 1 : 0)
