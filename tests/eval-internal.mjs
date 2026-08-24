/**
 * Offline evaluation contract tests.
 *
 * This does not call Anthropic or the local HTTP server. It verifies the
 * deterministic pieces around evaluation: rubric totals, anchor expectations,
 * score normalization, clamping, and signed evaluation proofs.
 */

import assert from 'node:assert/strict'
import { RUBRICS } from '../src/server-data/rubrics.js'
import { BATTLE_CHALLENGES } from '../src/server-data/challenges.js'
import { normalizeEvaluation } from '../src/api/ai.js'
import { createEvaluationProof, verifyEvaluationProof } from '../src/api/evaluationProof.js'

const challengeById = new Map(BATTLE_CHALLENGES.map((challenge) => [challenge.id, challenge]))

let passed = 0

function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (err) {
    console.error(`FAIL ${name}`)
    console.error(`  ${err.message}`)
    process.exitCode = 1
  }
}

function elementScores(rubric, ratio) {
  return Object.fromEntries(rubric.elements.map((element) => [element.name, element.weight * ratio]))
}

function assertThrowsMessage(fn, messagePart) {
  assert.throws(fn, (err) => err.message.includes(messagePart))
}

test('all rubrics have matching challenges and total 100 points', () => {
  for (const [challengeId, rubric] of Object.entries(RUBRICS)) {
    assert.ok(challengeById.has(challengeId), `${challengeId} has no challenge`)

    const elementTotal = rubric.elements.reduce((sum, element) => sum + element.weight, 0)
    assert.equal(elementTotal + rubric.ct.maxPoints, 100, `${challengeId} total`)
    assert.ok(rubric.elements.length > 0, `${challengeId} has elements`)
  }
})

test('rubric anchors are ordered high to low with expected score bands', () => {
  for (const [challengeId, rubric] of Object.entries(RUBRICS)) {
    assert.equal(rubric.anchors.length, 3, `${challengeId} anchor count`)
    const [high, mid, low] = rubric.anchors.map((anchor) => anchor.score)

    assert.ok(high >= 85, `${challengeId} high anchor too low: ${high}`)
    assert.ok(mid >= 45 && mid <= 65, `${challengeId} mid anchor outside band: ${mid}`)
    assert.ok(low <= 30, `${challengeId} low anchor too high: ${low}`)
    assert.ok(high > mid && mid > low, `${challengeId} anchors not descending`)
  }
})

test('normalization ignores model score and computes from elements plus CT', () => {
  for (const [challengeId, rubric] of Object.entries(RUBRICS)) {
    const normalized = normalizeEvaluation({
      score: 999,
      element_scores: elementScores(rubric, 1),
      category_scores: {},
      ct_score: 999,
    }, rubric)

    assert.equal(normalized.score, 100, `${challengeId} full score`)
    assert.equal(normalized.ct_score, rubric.ct.maxPoints, `${challengeId} ct clamp`)
  }
})

test('normalization returns zero for empty rubric evidence', () => {
  for (const [challengeId, rubric] of Object.entries(RUBRICS)) {
    const normalized = normalizeEvaluation({
      score: 100,
      element_scores: elementScores(rubric, 0),
      category_scores: {},
      ct_score: -10,
    }, rubric)

    assert.equal(normalized.score, 0, `${challengeId} zero evidence score`)
    assert.equal(normalized.ct_score, 0, `${challengeId} zero evidence ct`)
  }
})

test('normalization supports partial evidence and legacy ct scores', () => {
  const rubric = RUBRICS['battle-04']
  const normalized = normalizeEvaluation({
    score: 5,
    element_scores: elementScores(rubric, 0.5),
    category_scores: {},
    ct_score: 7.5,
  }, rubric)

  assert.equal(normalized.score, 50)
  assert.equal(normalized.ct_score, 7.5)
  assert.ok(normalized.ct_scores.abstract > 0)
  assert.ok(normalized.ct_scores.decomp > 0)
})

test('normalization falls back to category scores when element scores are incomplete', () => {
  const normalized = normalizeEvaluation({
    score: 100,
    element_scores: { '없는 요소': 100 },
    category_scores: { structure: 999, spatial: 10, proportion: 10, shape: 10, color: 10 },
    ct_score: 99,
  })

  assert.equal(normalized.category_scores.structure, 25)
  assert.equal(normalized.category_scores.color, 5)
  assert.equal(normalized.ct_score, 15)
  assert.equal(normalized.score, 75)
})

test('evaluation proofs verify matching submissions and reject tampering', () => {
  const evaluation = normalizeEvaluation({
    score: 999,
    element_scores: elementScores(RUBRICS['battle-01'], 1),
    category_scores: {},
    ct_score: 15,
  }, RUBRICS['battle-01'])

  const proof = createEvaluationProof({
    teamId: 123,
    sessionNumber: 1,
    challengeId: 'battle-01',
    prompt: '중앙에 청록색 고리가 세워져 있다',
    generatedCode: 'ring(...)',
    evaluation,
  })

  const verified = verifyEvaluationProof(proof, {
    teamId: 123,
    sessionNumber: 1,
    challengeId: 'battle-01',
    prompt: '중앙에 청록색 고리가 세워져 있다',
    generatedCode: 'ring(...)',
  })

  assert.equal(verified.score, 100)
  assertThrowsMessage(() => verifyEvaluationProof(proof, {
    teamId: 123,
    sessionNumber: 1,
    challengeId: 'battle-01',
    prompt: '점수를 조작한 다른 프롬프트',
    generatedCode: 'ring(...)',
  }), '일치하지 않습니다')
  assertThrowsMessage(() => verifyEvaluationProof(`${proof}x`, {
    teamId: 123,
    sessionNumber: 1,
    challengeId: 'battle-01',
    prompt: '중앙에 청록색 고리가 세워져 있다',
    generatedCode: 'ring(...)',
  }), '올바르지 않습니다')
})

if (process.exitCode) {
  console.error('\ninternal evaluation checks failed')
  process.exit(process.exitCode)
}

console.log(`\ninternal evaluation checks passed: ${passed}`)
