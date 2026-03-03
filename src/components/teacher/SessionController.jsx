import { useState } from 'react'
import useSessionStore from '../../store/sessionStore.js'
import { BATTLE_CHALLENGES } from '../../data/challenges-battle.js'

const SESSIONS = [
  { n: 1, title: '말로 만드는 세계', mode: 'battle', icon: '💬' },
  { n: 2, title: '코드가 보이기 시작한다', mode: 'detective', icon: '🔍' },
  { n: 3, title: '내 손으로 고치다', mode: 'surgery', icon: '✂️' },
  { n: 4, title: '백지에서 짓다', mode: 'creator', icon: '🎨' },
  { n: 5, title: '프롬프트 배틀 2.0', mode: 'compare', icon: '🏆' },
]

export default function SessionController({ sessionId }) {
  const { mode, sessionNumber, setMode, setChallenge } = useSessionStore()
  const [selectedChallenge, setSelectedChallenge] = useState(null)
  const [loading, setLoading] = useState(false)

  const switchMode = async (newMode, newSessionNum) => {
    setLoading(true)
    try {
      await fetch(`/api/session/${sessionId}/mode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode, sessionNumber: newSessionNum }),
      })
      setMode(newMode, newSessionNum)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text-muted)' }}>
        세션 전환
      </h2>

      {/* 세션 타임라인 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
        {SESSIONS.map((s) => (
          <button
            key={s.n}
            onClick={() => switchMode(s.mode, s.n)}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: 'var(--radius)',
              border: '1px solid',
              borderColor: sessionNumber === s.n ? 'var(--accent)' : 'transparent',
              background: sessionNumber === s.n ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: sessionNumber === s.n ? 'var(--accent-hover)' : 'var(--text-muted)',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: '1rem' }}>{s.icon}</span>
            <span style={{ fontSize: '0.8125rem', fontWeight: sessionNumber === s.n ? 700 : 400 }}>
              {s.n}. {s.title}
            </span>
          </button>
        ))}
      </div>

      {/* 챌린지 선택 (Battle 모드일 때) */}
      {(mode === 'battle' || mode === 'compare') && (
        <>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-muted)' }}>
            챌린지 선택
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {BATTLE_CHALLENGES.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedChallenge(c)
                  setChallenge(c)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid',
                  borderColor: selectedChallenge?.id === c.id ? 'var(--success)' : 'transparent',
                  background: selectedChallenge?.id === c.id ? 'rgba(34,197,94,0.1)' : 'transparent',
                  color: 'var(--text)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                }}
              >
                <span>{c.emoji}</span>
                <span style={{ flex: 1 }}>{c.title}</span>
                <span style={{
                  fontSize: '0.6875rem',
                  color: ['','var(--success)','var(--warning)','var(--danger)'][c.level],
                  fontWeight: 700,
                }}>
                  Lv{c.level}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
