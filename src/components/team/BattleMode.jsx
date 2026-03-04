import { useState, useEffect } from 'react'
import useSessionStore from '../../store/sessionStore.js'
import useTeamStore from '../../store/teamStore.js'
import VPythonRunner from '../shared/VPythonRunner.jsx'
import { generateCode, evaluatePrompt, saveAttempt } from '../../utils/claude.js'

export default function BattleMode({ team, socket, rankings }) {
  const { currentChallenge } = useSessionStore()
  const { attempts, addAttempt } = useTeamStore()
  const [prompt, setPrompt] = useState('')
  const [generatedCode, setGeneratedCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [latestEval, setLatestEval] = useState(null)
  const [hint, setHint] = useState('')

  // 서버에서 힌트 수신 (socket)
  useEffect(() => {
    const s = socket?.current
    if (!s) return
    const handler = ({ hint: h }) => setHint(h)
    s.on('challenge:hint', handler)
    return () => s.off('challenge:hint', handler)
  }, [socket?.current])

  // 챌린지 바뀌면 초기화
  useEffect(() => {
    setPrompt('')
    setGeneratedCode('')
    setLatestEval(null)
    setHint('')
  }, [currentChallenge?.id])

  const handleSubmit = async () => {
    if (!prompt.trim() || !currentChallenge) return
    setLoading(true)

    try {
      // 1. 코드 생성
      const { code } = await generateCode(prompt)
      setGeneratedCode(code)

      // 2. 평가
      const evalResult = await evaluatePrompt({
        prompt,
        generatedCode: code,
        targetCode: currentChallenge.code,
        sessionNumber: 1,
      })
      setLatestEval(evalResult)

      // 3. 저장
      await saveAttempt({
        teamId: team.id,
        sessionNumber: 1,
        challengeId: currentChallenge.id,
        prompt,
        generatedCode: code,
        score: evalResult.score,
        ctScores: evalResult.ct_scores,
        evaluation: evalResult,
      })

      addAttempt({ prompt, code, score: evalResult.score, challenge: currentChallenge })

      // 4. 서버에 점수 전송
      socket?.current?.emit('team:score-update', {
        sessionId: team.session_id,
        teamId: team.id,
        score: evalResult.score,
        evaluation: evalResult,
      })
    } catch (e) {
      console.error(e)
      alert('오류: ' + e.message)
    }

    setLoading(false)
  }

  // 결과 공개 화면
  if (rankings) {
    return (
      <div style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', textAlign: 'center' }}>
          🎯 결과 발표!
        </h2>
        <div style={{ maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rankings.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '12px 16px',
                background: i === 0 ? 'rgba(234,179,8,0.15)' : 'var(--surface)',
                border: `1px solid ${i === 0 ? '#eab308' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
              }}
            >
              <span style={{ fontSize: '1.25rem', width: '32px', textAlign: 'center' }}>
                {['🥇','🥈','🥉'][i] || `${i+1}`}
              </span>
              <span style={{ flex: 1, fontWeight: 600 }}>{r.name}</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#eab308' }}>
                {r.score}점
              </span>
            </div>
          ))}
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
      {/* 챌린지 제목 */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
      }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
          Level {currentChallenge.level} 챌린지
        </p>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>
          {currentChallenge.emoji} {currentChallenge.title}
        </h2>
        {hint && (
          <p style={{ marginTop: '8px', fontSize: '0.875rem', color: 'var(--warning)' }}>
            💡 힌트: {hint}
          </p>
        )}
      </div>

      {/* 3D 장면 비교 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <VPythonRunner
          code={currentChallenge.code}
          height="240px"
          label="👁 이 장면을 묘사하세요"
        />
        <VPythonRunner
          code={generatedCode}
          height="240px"
          label="🤖 AI가 만든 장면"
          autoRun={!!generatedCode}
        />
      </div>

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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Ctrl+Enter로 제출
          </span>
          <button
            onClick={handleSubmit}
            disabled={loading || !prompt.trim()}
            style={{
              padding: '10px 24px',
              background: loading ? 'var(--surface2)' : 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '0.9375rem',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '생성 중...' : '🚀 제출'}
          </button>
        </div>
      </div>

      {/* 평가 결과 */}
      {latestEval && (
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

          {/* CT 점수 바 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            {[
              { key: 'abstract', label: '추상화' },
              { key: 'pattern', label: '패턴인식' },
              { key: 'decomp', label: '분해' },
              { key: 'algorithm', label: '알고리즘' },
            ].map(({ key, label }) => (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '3px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span>{latestEval.ct_scores?.[key] ?? 0}/25</span>
                </div>
                <div style={{ height: '4px', background: 'var(--surface2)', borderRadius: '2px' }}>
                  <div style={{
                    height: '100%',
                    width: `${((latestEval.ct_scores?.[key] ?? 0) / 25) * 100}%`,
                    background: 'var(--accent)',
                    borderRadius: '2px',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>

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