import { useEffect, useRef, useState } from 'react'
import useSessionStore from '../../store/sessionStore.js'
import { BATTLE_CHALLENGES } from '../../data/challenges-battle.js'
import { createSocket } from '../../utils/socket.js'

export default function SessionController({ sessionId }) {
  const { setChallenge } = useSessionStore()
  const [selectedChallenge, setSelectedChallenge] = useState(null)
  const [pushed, setPushed] = useState(false)
  const socketRef = useRef(null)

  useEffect(() => {
    const socket = createSocket()
    socketRef.current = socket
    socket.emit('teacher:join', { sessionId })
    return () => socket.disconnect()
  }, [sessionId])

  const pushChallenge = (c) => {
    setSelectedChallenge(c)
    setChallenge(c)
    setPushed(false)
    socketRef.current?.emit('challenge:start', {
      sessionId,
      challengeId: c.id,
    })
    setPushed(true)
    setTimeout(() => setPushed(false), 2000)
  }

  const sendHint = () => {
    if (!selectedChallenge?.hint) return
    socketRef.current?.emit('challenge:hint', {
      sessionId,
      hint: selectedChallenge.hint,
    })
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text-muted)' }}>
        챌린지 선택
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
        {BATTLE_CHALLENGES.map((c) => (
          <button
            key={c.id}
            onClick={() => pushChallenge(c)}
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
              color: ['', 'var(--success)', 'var(--warning)', 'var(--danger)'][c.level],
              fontWeight: 700,
            }}>
              Lv{c.level}
            </span>
          </button>
        ))}
      </div>

      {selectedChallenge?.hint && (
        <button
          onClick={sendHint}
          style={{
            width: '100%',
            padding: '10px',
            background: 'rgba(234,179,8,0.15)',
            border: '1px solid var(--warning)',
            borderRadius: 'var(--radius)',
            color: 'var(--warning)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          💡 힌트 전송
        </button>
      )}

      {pushed && (
        <div style={{
          marginTop: '12px',
          padding: '8px 12px',
          background: 'rgba(34,197,94,0.15)',
          border: '1px solid var(--success)',
          borderRadius: 'var(--radius)',
          color: 'var(--success)',
          fontSize: '0.8125rem',
          textAlign: 'center',
        }}>
          ✓ 팀 화면에 전송됨
        </div>
      )}
    </div>
  )
}