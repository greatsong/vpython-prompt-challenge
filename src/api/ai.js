import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'

const router = Router()
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── 코드 생성 (Haiku — 빠름, 저렴) ────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  const { prompt, challengeId } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt 필요' })

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `당신은 GlowScript Web VPython 3.2 코드 생성기입니다.
아래 설명을 GlowScript VPython 코드로 변환해주세요.

규칙:
- GlowScript 3.2 VPython 문법만 사용
- scene 설정 불필요 (자동 생성됨)
- import 문 불필요
- 코드만 출력 (설명 없이)
- 한국어 주석 허용

설명: ${prompt}`,
        },
      ],
    })

    const code = message.content[0].text.trim()
    res.json({ code })
  } catch (err) {
    console.error('[generate]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── 프롬프트 평가 (Sonnet — 정확함) ──────────────────────────────────────────
router.post('/evaluate', async (req, res) => {
  const { prompt, generatedCode, targetCode, sessionNumber = 1 } = req.body

  if (!prompt || !generatedCode || !targetCode)
    return res.status(400).json({ error: 'prompt, generatedCode, targetCode 필요' })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `VPython 프롬프트 품질을 평가해주세요.

[목표 코드]
${targetCode}

[학생 프롬프트]
${prompt}

[AI가 생성한 코드]
${generatedCode}

다음 JSON 형식으로만 응답해주세요:
{
  "score": 0~100,
  "ct_scores": {
    "abstract": 0~25,
    "pattern": 0~25,
    "decomp": 0~25,
    "algorithm": 0~25
  },
  "feedback": "간략한 피드백 (2줄 이내)",
  "strengths": ["잘한 점 1~2가지"],
  "improvements": ["개선할 점 1~2가지"]
}`,
        },
      ],
    })

    const raw = message.content[0].text.trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON 파싱 실패')

    const evaluation = JSON.parse(jsonMatch[0])
    res.json(evaluation)
  } catch (err) {
    console.error('[evaluate]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── 문제 품질 분석 (Session 4) ────────────────────────────────────────────────
router.post('/analyze-problem', async (req, res) => {
  const { code, title, difficulty } = req.body
  if (!code) return res.status(400).json({ error: 'code 필요' })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `이 VPython 코드로 만든 문제의 품질을 분석해주세요.

[코드]
${code}

[제목] ${title || '미입력'}
[학생 설정 난이도] ${difficulty || '기본'}

다음 JSON 형식으로만 응답해주세요:
{
  "estimated_difficulty": "기본|중급|도전",
  "ct_elements_detected": ["추상화"|"패턴인식"|"분해"|"알고리즘"],
  "prompt_difficulty": "★~★★★★ (프롬프트로 설명하기 어려운 정도)",
  "suggestion": "개선 제안 (1~2줄)"
}`,
        },
      ],
    })

    const raw = message.content[0].text.trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON 파싱 실패')

    res.json(JSON.parse(jsonMatch[0]))
  } catch (err) {
    console.error('[analyze-problem]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── 출제팀 평가 (Session 5) ───────────────────────────────────────────────────
router.post('/evaluate-problem-quality', async (req, res) => {
  const { problemCode, solverPrompt, solverScore } = req.body

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `VPython 출제 문제의 품질을 평가해주세요.

[문제 코드]
${problemCode}

[풀이팀 프롬프트]
${solverPrompt}

[풀이팀 점수] ${solverScore}점

다음 JSON 형식으로만 응답해주세요:
{
  "quality_score": 0~100,
  "breakdown": {
    "ct_included": 0~30,
    "difficulty": 0~25,
    "clarity": 0~25,
    "uniqueness": 0~20
  },
  "feedback": "출제팀에게 주는 피드백 (2줄)",
  "deductions": ["감점 이유들"]
}`,
        },
      ],
    })

    const raw = message.content[0].text.trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON 파싱 실패')

    res.json(JSON.parse(jsonMatch[0]))
  } catch (err) {
    console.error('[evaluate-problem-quality]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
