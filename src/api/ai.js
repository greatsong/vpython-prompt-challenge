import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'

const router = Router()

// 요청 헤더 X-API-Key 우선, 없으면 환경변수 사용
function getClient(req) {
  const key = req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY
  return new Anthropic({ apiKey: key })
}

// ── 코드 생성 (Haiku — 빠름, 저렴) ────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  const { prompt, challengeId } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt 필요' })

  try {
    const message = await getClient(req).messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `glow.js 3D 코드 생성기. 설명을 코드로 변환하라.
반드시 코드만 출력. 설명/안내/질문 절대 금지.
아무리 짧은 설명이라도 최선을 다해 코드로 변환하라.

API: sphere({pos:vec(x,y,z), radius:r, color:color.red})
vec(x,y,z), color.red/blue/green/white/black/yellow/orange/cyan/magenta
sphere, box({size:vec(w,h,d)}), cylinder({axis:vec()}), cone, arrow, pyramid, ring, ellipsoid
scene/canvas 선언 불필요.

설명: ${prompt}`,
        },
      ],
    })

    let code = message.content[0].text.trim()
    // 마크다운 코드 블록 제거
    code = code.replace(/^```(?:javascript|js|python)?\n?/m, '').replace(/\n?```$/m, '').trim()
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
    const message = await getClient(req).messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `3D 장면 프롬프트 평가. 학생은 3D 장면을 눈으로 보고 설명한다. 목표 코드와 AI 생성 코드를 비교하라.

중요: 학생은 코드를 볼 수 없고, 렌더링된 3D 장면만 본다.
따라서 정확한 수치(좌표, 크기, 반지름 등)는 알 수 없다.

채점 기준 (시각적 유사도 중심):
- 객체 종류 일치 (sphere/box/cylinder 등) → 매우 중요 (30%)
- 색상 일치 → 중요 (25%)
- 객체 수 일치 → 중요 (20%)
- 상대적 위치/배치 (위/아래/옆 등) → 보통 (15%)
- 상대적 크기 비율 (큰/작은) → 보통 (10%)

감점하지 말 것:
- 절대 크기 차이 (size vec(2,2,2) vs vec(1,1,1)) → 눈으로 구분 불가
- 절대 좌표 차이 (pos vec(0,0,0) vs vec(0,0,0)) → 기본값이면 OK
- 반지름 수치 차이 → 비율만 맞으면 OK

[목표 코드]
${targetCode}

[학생 프롬프트]
${prompt}

[AI가 생성한 코드]
${generatedCode}

JSON만 응답:
{"score":0~100,"ct_scores":{"abstract":0~25,"pattern":0~25,"decomp":0~25,"algorithm":0~25},"feedback":"2줄 피드백","strengths":["잘한 점"],"improvements":["개선할 점"]}`,
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
    const message = await getClient(req).messages.create({
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
    const message = await getClient(req).messages.create({
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
