import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import useSessionStore from '../../store/sessionStore.js'
import useTeamStore from '../../store/teamStore.js'
import VPythonRunner from '../shared/VPythonRunner.jsx'
import { generateCode, evaluatePrompt, saveAttempt } from '../../utils/claude.js'

// sessionStorage 키
const STORAGE_KEY = 'vpython_battle_state'

// 자동 재생성 상한.
// 코드가 토큰 한도로 잘린 경우엔 다시 만들어도 또 잘리므로, 무한 재시도를 막는다.
const MAX_RENDER_RETRY = 2

// 이전 코드와 오류 메시지를 함께 보내 "고쳐서 다시 만들기"가 통하는 오류 종류.
// 네트워크·리소스 문제는 코드 탓이 아니라 repair를 보내도 의미가 없다.
const REPAIRABLE_ERROR_KINDS = new Set(['syntax', 'runtime'])

// 카테고리 표시 순서
const SCORE_CATEGORIES = [
  { key: 'structure', label: '구조·분해', icon: '🧩' },
  { key: 'spatial', label: '공간 관계', icon: '📐' },
  { key: 'proportion', label: '비율', icon: '⚖️' },
  { key: 'shape', label: '도형 종류', icon: '🔷' },
  { key: 'color', label: '색', icon: '🎨' },
]

// 서버가 category_max를 아직 안 내려줄 때 쓰는 5축 기본 배점.
// 챌린지별 정답 정보가 아니라 평가 프레임워크의 일반 비중이라 노출돼도 힌트가 되지 않는다.
const FALLBACK_CATEGORY_MAX = { structure: 25, spatial: 25, proportion: 20, shape: 10, color: 5 }

// 라운드 키 — 같은 챌린지를 다시 시작해도 이전 라운드 내용이 남지 않도록
// challengeId와 시작 시각(startedAt)을 함께 식별자로 쓴다.
function roundKey(challengeId, startedAt) {
  return `${challengeId}@${startedAt ?? 0}`
}

function saveState(key, data) {
  try {
    const all = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}')
    all[key] = { ...data, ts: Date.now() }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

function loadState(key) {
  try {
    const all = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}')
    const saved = all[key]
    // 30분 이내 데이터만 복원
    if (saved && Date.now() - saved.ts < 30 * 60 * 1000) return saved
  } catch { /* ignore */ }
  return null
}

// 현재 라운드가 아닌 캐시는 버린다 (같은 챌린지의 지난 라운드 포함)
function pruneOtherRounds(currentKey) {
  try {
    const all = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}')
    if (!all[currentKey]) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({}))
      return
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ [currentKey]: all[currentKey] }))
  } catch { /* ignore */ }
}

export default function BattleMode({ team, socket, rankings, challengeEnded, remainingSeconds, finalResults, roundStartedAt }) {
  const { currentChallenge } = useSessionStore()
  const { attempts, addAttempt } = useTeamStore()
  const [prompt, setPrompt] = useState('')
  const [generatedCode, setGeneratedCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPhase, setLoadingPhase] = useState('') // 'generate' | 'evaluate' | ''
  const [latestEval, setLatestEval] = useState(null)
  const [hint, setHint] = useState('')
  // 3D 렌더링 실패 안내 — { kind, guide, exhausted }
  // 채점 실패와는 별개다. 점수를 이미 받았다면 그대로 남겨둔다.
  const [renderError, setRenderError] = useState(null)
  const [submitError, setSubmitError] = useState(null) // { message, phase } — 제출 실패 배너
  const retryRef = useRef(0) // 자동 재생성 횟수
  // 제출 도중 성공한 단계를 기억해 두는 버퍼.
  // 예: 코드 생성은 됐는데 평가가 실패하면, 재시도 시 생성을 건너뛰고 평가부터 이어간다.
  const pendingSubmitRef = useRef(null) // { prompt, code, evalResult }

  // 서버에서 힌트 수신 (socket)
  useEffect(() => {
    const s = socket?.current
    if (!s) return
    const handler = ({ hint: h }) => setHint(h)
    s.on('challenge:hint', handler)
    return () => s.off('challenge:hint', handler)
  }, [socket?.current])

  // 현재 라운드 키 (챌린지 + 시작 시각)
  const currentRoundKey = useMemo(
    () => (currentChallenge?.id ? roundKey(currentChallenge.id, roundStartedAt) : null),
    [currentChallenge?.id, roundStartedAt]
  )

  // 라운드가 바뀌면(챌린지 변경 또는 같은 챌린지 재시작): 초기화 후 같은 라운드 상태만 복원
  useEffect(() => {
    retryRef.current = 0
    setRenderError(null)
    setHint('')
    setSubmitError(null)
    pendingSubmitRef.current = null

    if (!currentRoundKey) {
      setPrompt('')
      setGeneratedCode('')
      setLatestEval(null)
      return
    }

    pruneOtherRounds(currentRoundKey)
    const saved = loadState(currentRoundKey)
    if (saved) {
      setPrompt(saved.prompt || '')
      setGeneratedCode(saved.generatedCode || '')
      setLatestEval(saved.latestEval || null)
    } else {
      setPrompt('')
      setGeneratedCode('')
      setLatestEval(null)
    }
  }, [currentRoundKey])

  // 상태 변경 시 sessionStorage에 저장
  useEffect(() => {
    if (!currentRoundKey) return
    if (prompt || generatedCode || latestEval) {
      saveState(currentRoundKey, { prompt, generatedCode, latestEval })
    }
  }, [prompt, generatedCode, latestEval, currentRoundKey])

  // VPythonRunner 에러 콜백 — 자동 재생성 (MAX_RENDER_RETRY회까지)
  // info: { kind, message, guide } — kind는 syntax | runtime | resource | timeout
  const handleRenderError = useCallback(async (info) => {
    const kind = info?.kind || 'runtime'
    const guide = info?.guide || '3D 화면을 만들지 못했어요.'

    if (!prompt.trim() || !currentChallenge) {
      setRenderError({ kind, guide, exhausted: false })
      return
    }

    // 코드 자체가 문제인 오류(구문·실행)는 "무엇이 왜 실패했는지"를 함께 보내
    // AI가 같은 실수를 반복하지 않게 한다. 네트워크 문제(resource/timeout)는
    // 이전 코드가 원인이 아니므로 그냥 다시 만든다.
    const repair = REPAIRABLE_ERROR_KINDS.has(kind) && generatedCode
      ? { previousCode: generatedCode, errorMessage: info?.message || '' }
      : null

    if (retryRef.current >= MAX_RENDER_RETRY) {
      // 더 만들어봐야 같은 이유로 또 실패한다 (예: 토큰 한도로 코드가 잘리는 경우)
      setRenderError({
        kind,
        guide,
        exhausted: true,
        repairing: !!repair,
      })
      return
    }

    retryRef.current += 1
    // 재생성 중임을 알린다. 성공하면 onReady 콜백이 이 안내를 거둔다.
    setRenderError({ kind, guide, exhausted: false, repairing: !!repair })
    console.log(
      `[BattleMode] 렌더링 에러 감지(${kind}), ${repair ? '오류 정보를 실어' : ''} 자동 재생성 ${retryRef.current}/${MAX_RENDER_RETRY}:`,
      info?.message
    )
    try {
      const { code } = await generateCode(prompt, team.id, repair)
      if (code === generatedCode) {
        // 오류 정보까지 줬는데도 같은 코드가 왔다 — 다시 그려도 결과가 같으므로 멈춘다
        // (토큰 한도로 잘리는 경우가 대표적이다)
        retryRef.current = MAX_RENDER_RETRY
        setRenderError({ kind, guide, exhausted: true, repairing: !!repair })
        return
      }
      setGeneratedCode(code)
    } catch (e) {
      setRenderError({
        kind,
        guide: e?.message || guide,
        exhausted: true,
        repairing: !!repair,
      })
    }
  }, [prompt, currentChallenge, team.id, generatedCode])

  // 렌더링 성공 — 실패 안내를 거둔다
  const handleRenderReady = useCallback(() => {
    setRenderError(null)
  }, [])

  const handleSubmit = async () => {
    if (!prompt.trim() || !currentChallenge) return
    setLoading(true)
    setSubmitError(null)
    setRenderError(null)
    retryRef.current = 0

    // 같은 프롬프트로 재시도하는 경우, 앞서 성공한 단계는 건너뛴다.
    // (평가만 실패했는데 코드 생성을 또 돌려 시간과 호출을 낭비하지 않도록)
    const submittedPrompt = prompt
    const pending =
      pendingSubmitRef.current?.prompt === submittedPrompt
        ? pendingSubmitRef.current
        : { prompt: submittedPrompt }
    pendingSubmitRef.current = pending

    let phase = 'generate'
    try {
      // 1. 코드 생성
      if (!pending.code) {
        setLoadingPhase('generate')
        const { code } = await generateCode(submittedPrompt, team.id)
        pending.code = code
        setGeneratedCode(code)
      } else {
        setGeneratedCode(pending.code)
      }

      // 2. 평가 (루브릭 기반 — challengeId만 전달)
      // 정답 코드(targetCode)는 보내지 않는다. 서버가 challengeId로 직접 조회한다.
      phase = 'evaluate'
      if (!pending.evalResult) {
        setLoadingPhase('evaluate')
        pending.evalResult = await evaluatePrompt({
          prompt: submittedPrompt,
          generatedCode: pending.code,
          challengeId: currentChallenge.id,
          sessionNumber: 1,
          teamId: team.id,
        })
      }
      const evalResult = pending.evalResult

      // 채점 실패 (서버가 HTTP 200 + failed: true 로 알려준다)
      // 가짜 점수를 보여주지 않고, 저장·리더보드 전송도 하지 않는다.
      if (evalResult?.failed) {
        pending.evalResult = null // 재시도 시 채점부터 다시
        setLatestEval(null)
        setSubmitError({ phase: 'grading-failed', message: '채점에 실패했어요. 다시 제출해주세요.' })
        setLoading(false)
        setLoadingPhase('')
        return
      }

      setLatestEval(evalResult)

      // 3. 저장
      phase = 'save'
      setLoadingPhase('save')
      await saveAttempt({
        teamId: team.id,
        sessionNumber: 1,
        challengeId: currentChallenge.id,
        prompt: submittedPrompt,
        generatedCode: pending.code,
        score: evalResult.score,
        ctScores: evalResult.ct_scores,
        evaluation: evalResult,
        evaluationProof: evalResult.evaluationProof,
      })

      addAttempt({ prompt: submittedPrompt, code: pending.code, score: evalResult.score, challenge: currentChallenge })

      // 4. 서버에 점수 전송
      socket?.current?.emit('team:score-update', {
        sessionId: team.session_id,
        teamId: team.id,
        score: evalResult.score,
        evaluation: evalResult,
      })

      // 성공 — 진행 버퍼 비우기
      pendingSubmitRef.current = null
    } catch (e) {
      console.error('[BattleMode] 제출 실패', e)
      // 프롬프트는 절대 지우지 않는다. 배너의 "다시 시도"로 이어서 제출할 수 있다.
      setSubmitError({ phase, message: e?.message || '알 수 없는 오류가 발생했습니다.' })
    }

    setLoading(false)
    setLoadingPhase('')
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // ── 최종 결과 화면 ──────────────────────────────────────────────────────
  if (finalResults) {
    const { rankings: finalRankings, challengeCount } = finalResults
    const myRank = finalRankings.findIndex(r => r.teamId === team.id)
    const myResult = finalRankings[myRank]

    return (
      <div style={{ padding: '24px' }}>
        <div style={{
          textAlign: 'center',
          padding: '24px',
          background: 'linear-gradient(135deg, rgba(234,179,8,0.1), rgba(99,102,241,0.1))',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '20px',
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '8px' }}>
            🏆 최종 결과
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {finalRankings.length}팀 · {challengeCount}개 챌린지 종합
          </p>
        </div>

        {/* 자기 팀 결과 강조 */}
        {myResult && (
          <div style={{
            padding: '20px',
            background: `${team.color}11`,
            border: `2px solid ${team.color}`,
            borderRadius: 'var(--radius-lg)',
            marginBottom: '20px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>
              {['🥇', '🥈', '🥉'][myRank] || `${myRank + 1}위`}
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '4px' }}>
              {team.name}
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: team.color }}>
              {myResult.totalScore}점
            </div>

            {/* 내 팀 프롬프트별 피드백 */}
            {myResult.challengeResults.map((cr) => cr.prompt && (
              <div key={cr.challengeId} style={{
                textAlign: 'left',
                marginTop: '12px',
                padding: '12px',
                background: 'var(--surface)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginBottom: '6px',
                }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    {cr.challengeId}
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--accent)' }}>
                    {cr.score}점
                  </span>
                </div>
                <div style={{
                  fontSize: '0.8125rem',
                  padding: '8px',
                  background: 'var(--bg)',
                  borderRadius: 'var(--radius)',
                  marginBottom: '6px',
                  lineHeight: 1.6,
                }}>
                  {cr.prompt}
                </div>
                {cr.feedback && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    💬 {cr.feedback}
                  </p>
                )}
                {cr.strengths.length > 0 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '4px' }}>
                    ✨ {cr.strengths.join(' / ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 전체 순위 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {finalRankings.map((r, i) => {
            const isMe = r.teamId === team.id
            return (
              <div
                key={r.teamId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  background: isMe
                    ? `${team.color}15`
                    : i === 0
                      ? 'rgba(234,179,8,0.1)'
                      : 'var(--surface)',
                  border: `1px solid ${isMe ? team.color : i === 0 ? '#eab308' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                }}
              >
                <span style={{ fontSize: '1.125rem', width: '28px', textAlign: 'center' }}>
                  {['🥇', '🥈', '🥉'][i] || `${i + 1}`}
                </span>
                <span style={{ flex: 1, fontWeight: isMe ? 800 : 600, fontSize: '0.875rem' }}>
                  {r.teamName} {isMe && '← 우리 팀'}
                </span>
                <span style={{
                  fontSize: '1.125rem', fontWeight: 800,
                  color: isMe ? team.color : '#eab308',
                }}>
                  {r.totalScore}점
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── 챌린지별 결과 공개 화면 ──────────────────────────────────────────────
  if (rankings) {
    return (
      <div style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', textAlign: 'center' }}>
          🎯 결과 발표!
        </h2>
        <div style={{ maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rankings.map((r, i) => {
            const isMe = r.name === team.name
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '12px 16px',
                  background: isMe
                    ? `${team.color}15`
                    : i === 0
                      ? 'rgba(234,179,8,0.15)'
                      : 'var(--surface)',
                  border: `1px solid ${isMe ? team.color : i === 0 ? '#eab308' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                }}
              >
                <span style={{ fontSize: '1.25rem', width: '32px', textAlign: 'center' }}>
                  {['🥇', '🥈', '🥉'][i] || `${i + 1}`}
                </span>
                <span style={{ flex: 1, fontWeight: isMe ? 800 : 600 }}>
                  {r.name} {isMe && '← 우리 팀'}
                </span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#eab308' }}>
                  {r.score}점
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (!currentChallenge) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        선생님이 챌린지를 시작할 때까지 기다려주세요...
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 타이머 */}
      {remainingSeconds !== null && remainingSeconds > 0 && (
        <div style={{
          textAlign: 'center',
          padding: '12px',
          background: remainingSeconds <= 30
            ? 'rgba(239,68,68,0.15)'
            : 'rgba(99,102,241,0.1)',
          border: `1px solid ${remainingSeconds <= 30 ? 'var(--danger)' : 'var(--accent)'}`,
          borderRadius: 'var(--radius)',
          animation: remainingSeconds <= 10 ? 'pulse 1s infinite' : 'none',
        }}>
          <div style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            color: remainingSeconds <= 30 ? 'var(--danger)' : 'var(--accent)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            ⏱ {formatTime(remainingSeconds)}
          </div>
          {remainingSeconds <= 30 && (
            <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '2px' }}>
              서둘러 제출하세요!
            </p>
          )}
        </div>
      )}

      {/* 챌린지 제목 */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
      }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
          {'★'.repeat(currentChallenge.level)} Level {currentChallenge.level}
        </p>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>
          {currentChallenge.emoji} {currentChallenge.title}
        </h2>
        {currentChallenge.shapes && currentChallenge.level <= 1 && (
          <p style={{
            marginTop: '6px',
            fontSize: '0.8125rem',
            color: 'var(--text-muted)',
            background: 'var(--bg)',
            padding: '4px 10px',
            borderRadius: 'var(--radius)',
            display: 'inline-block',
          }}>
            사용된 도형: {currentChallenge.shapes.join(', ')}
          </p>
        )}
        {currentChallenge.description && (
          <p style={{
            marginTop: '6px',
            fontSize: '0.875rem',
            color: 'var(--text-muted)',
          }}>
            {currentChallenge.description}
          </p>
        )}
        {!currentChallenge.description && currentChallenge.level >= 4 && (
          <p style={{
            marginTop: '6px',
            fontSize: '0.8125rem',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
          }}>
            3D 장면을 관찰하고 묘사하세요
          </p>
        )}
        {hint && (
          <p style={{ marginTop: '8px', fontSize: '0.875rem', color: 'var(--warning)' }}>
            💡 힌트: {hint}
          </p>
        )}
      </div>

      {/* 3D 장면 비교 */}
      <div className="scene-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <VPythonRunner
          code={currentChallenge.code}
          height="200px"
          label="👁 이 장면을 묘사하세요"
        />
        <VPythonRunner
          code={generatedCode}
          height="200px"
          label="🤖 AI가 만든 장면"
          autoRun={!!generatedCode}
          onError={handleRenderError}
          onReady={handleRenderReady}
        />
      </div>

      {/* 3D 렌더링 실패 안내 — 채점 결과와는 별개다 */}
      {renderError && (
        <div style={{
          padding: '12px 14px',
          background: 'rgba(234,179,8,0.1)',
          border: '1px solid var(--warning, #eab308)',
          borderRadius: 'var(--radius)',
        }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '4px' }}>
            🖼 3D 화면을 만들지 못했어요
          </div>
          <div style={{ fontSize: '0.8125rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>
            {renderError.guide}
          </div>
          {renderError.exhausted ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              {renderError.repairing
                ? `오류를 알려주며 ${MAX_RENDER_RETRY}번 다시 만들어봤지만 실패했어요.`
                : `${MAX_RENDER_RETRY}번 다시 만들어봤지만 실패했어요.`}
              {' '}설명을 조금 더 간결하게 나눠서 다시 시도해보세요.
              {latestEval ? ' 채점 결과와 점수는 아래에 그대로 남아 있어요.' : ''}
            </div>
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              {renderError.repairing
                ? '오류를 고쳐서 다시 만들고 있어요...'
                : '자동으로 다시 만들고 있어요...'}
              {' '}({retryRef.current}/{MAX_RENDER_RETRY})
            </div>
          )}
        </div>
      )}

      {/* 프롬프트 입력 */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
      }}>
        <label style={{
          display: 'block',
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--text-muted)',
          marginBottom: '8px',
        }}>
          이 장면을 AI에게 설명해주세요
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="예: 원점에 반지름 1의 빨간 구가 있다"
          rows={3}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            fontSize: '0.9375rem',
            resize: 'vertical',
            fontFamily: 'inherit',
            outline: 'none',
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit()
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={loading || !prompt.trim() || challengeEnded}
          style={{
            marginTop: '10px',
            width: '100%',
            padding: '14px 24px',
            background: challengeEnded ? 'var(--surface2)' : loading ? 'var(--surface2)' : 'var(--accent)',
            color: challengeEnded ? 'var(--text-muted)' : 'white',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: '1.0625rem',
            fontWeight: 700,
            cursor: (loading || challengeEnded) ? 'not-allowed' : 'pointer',
          }}
        >
          {challengeEnded
            ? '\u23F9 제출 마감됨'
            : loading
              ? loadingPhase === 'save'
                ? '결과 저장 중...'
                : loadingPhase === 'evaluate'
                  ? '프롬프트 채점 중... (10초쯤 걸려요)'
                  : '3D 장면 생성 중...'
              : submitError
                ? '\uD83D\uDD01 다시 제출'
                : '\uD83D\uDE80 제출'}
        </button>

        {/* 제출 실패 배너 — 프롬프트를 잃지 않고 이어서 재시도할 수 있다 */}
        {submitError && !loading && (
          <div style={{
            marginTop: '10px',
            padding: '12px 14px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid var(--danger, #ef4444)',
            borderRadius: 'var(--radius)',
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '4px' }}>
              {submitError.phase === 'grading-failed' ? '⚠️ 채점에 실패했어요' : '⚠️ 제출에 실패했어요'}
            </div>
            <div style={{ fontSize: '0.8125rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>
              {submitError.message}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              {submitError.phase === 'save'
                ? '채점까지는 끝났어요. 저장만 다시 시도하면 됩니다.'
                : submitError.phase === 'grading-failed'
                  ? '점수는 기록되지 않았어요. 같은 프롬프트로 다시 제출하면 채점부터 이어서 진행합니다.'
                  : submitError.phase === 'evaluate'
                    ? '3D 장면은 만들어졌어요. 채점부터 이어서 다시 시도합니다.'
                    : '작성한 프롬프트는 그대로 남아 있어요.'}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button
                onClick={handleSubmit}
                disabled={challengeEnded}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: challengeEnded ? 'var(--surface2)' : 'var(--accent)',
                  color: challengeEnded ? 'var(--text-muted)' : 'white',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.9375rem',
                  fontWeight: 700,
                  cursor: challengeEnded ? 'not-allowed' : 'pointer',
                }}
              >
                🔁 다시 시도
              </button>
              <button
                onClick={() => setSubmitError(null)}
                style={{
                  padding: '10px 16px',
                  background: 'var(--surface2)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 평가 결과 — failed 응답은 점수가 없으므로 아예 그리지 않는다 */}
      {latestEval && !latestEval.failed && typeof latestEval.score === 'number' && (
        <div style={{
          background: 'var(--surface)',
          border: `1px solid ${latestEval.score >= 80 ? 'var(--success)' : latestEval.score >= 60 ? 'var(--warning)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontWeight: 700 }}>평가 결과</span>
            <span style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--accent-hover)' }}>
              {latestEval.score}점
            </span>
          </div>

          {/* 안내 문구 — 0.6875rem(11px)은 학생 휴대폰에서 읽기 어려워 0.8125rem(13px)으로 키웠다 */}
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '10px', fontStyle: 'italic', lineHeight: 1.5 }}>
            점수는 여러분의 설명 품질을 평가합니다. AI가 만든 3D 결과와는 다를 수 있어요.
          </p>

          {/* 카테고리별 점수 바 — 만점은 서버 응답(category_max)에서 받는다.
              루브릭을 클라이언트에 두면 모범답안까지 번들에 실려 학생이 열람할 수 있다. */}
          {(() => {
            const serverMax = latestEval.category_max
            const hasServerMax = serverMax && typeof serverMax === 'object'
            // 서버가 아직 category_max를 안 주는 경우: 5축 기본 배점으로 대체하고,
            // 점수가 있는 축만 보여준다 (없는 축을 만점만 채워 표시하면 오해를 준다).
            const catMax = hasServerMax ? serverMax : FALLBACK_CATEGORY_MAX
            const visibleCats = SCORE_CATEGORIES.filter(({ key }) => {
              const max = Number(catMax[key]) || 0
              const score = latestEval.category_scores?.[key] ?? 0
              return hasServerMax ? (max > 0 || score > 0) : score > 0
            })
            if (visibleCats.length === 0) return null
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {visibleCats.map(({ key, label, icon }) => {
                  const score = latestEval.category_scores?.[key] ?? 0
                  const max = Number(catMax[key]) || Math.max(score, 10)
                  const pct = Math.min(100, Math.round((score / max) * 100))
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '2px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{icon} {label}</span>
                        <span style={{ fontWeight: 600 }}>{score}/{max}</span>
                      </div>
                      <div style={{ height: '4px', background: 'var(--surface2)', borderRadius: '2px' }}>
                        <div style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--accent)' : 'var(--warning)',
                          borderRadius: '2px',
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* CT 사고력 점수 */}
          {latestEval.ct_score > 0 && (
            <div style={{
              padding: '8px 10px',
              background: 'rgba(99,102,241,0.08)',
              borderRadius: 'var(--radius)',
              marginBottom: '10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>🧠 CT 사고력 보너스</span>
                {/* 만점은 챌린지마다 다르므로 반드시 서버 응답(ct_max)을 쓴다 (하드코딩 금지) */}
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                  {Number(latestEval.ct_max) > 0
                    ? `+${latestEval.ct_score} / ${latestEval.ct_max}점`
                    : `+${latestEval.ct_score}점`}
                </span>
              </div>
            </div>
          )}

          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {latestEval.feedback}
          </p>

          {latestEval.improvements?.length > 0 && (
            <ul style={{ marginTop: '8px', paddingLeft: '16px', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {latestEval.improvements.map((imp, i) => (
                <li key={i}>→ {imp}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 시도 기록 */}
      {attempts.length > 0 && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
        }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>
            시도 기록 ({attempts.length}회)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {attempts.slice(0, 5).map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 10px',
                background: 'var(--bg)',
                borderRadius: 'var(--radius)',
                fontSize: '0.8125rem',
              }}>
                <span style={{ fontWeight: 700, color: 'var(--accent-hover)', width: '32px' }}>
                  {a.score}점
                </span>
                <span style={{ flex: 1, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.prompt}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
