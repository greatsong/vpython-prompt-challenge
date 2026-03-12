import { useEffect, useRef, useState } from 'react'
import useSessionStore from '../../store/sessionStore.js'
import { BATTLE_CHALLENGES } from '../../data/challenges-battle.js'
import { createSocket } from '../../utils/socket.js'

export default function SessionController({ sessionId }) {
  const { currentChallenge, setChallenge } = useSessionStore()
  const [selectedId, setSelectedId] = useState(null)
  // 'idle' | 'running' | 'ended'
  const [status, setStatus] = useState('idle')
  const [hintSent, setHintSent] = useState(false)
  const socketRef = useRef(null)
  const [completedIds, setCompletedIds] = useState([])

  useEffect(() => {
    const socket = createSocket()
    socketRef.current = socket
    socket.emit('teacher:join', { sessionId })
    return () => socket.disconnect()
  }, [sessionId])

  const selectChallenge = (c) => {
    if (status === 'running') return // 진행 중에는 변경 불가
    setSelectedId(c.id)
    setChallenge(c)
    setHintSent(false)
  }

  const startChallenge = () => {
    const c = BATTLE_CHALLENGES.find(ch => ch.id === selectedId)
    if (!c) return
    setStatus('running')
    socketRef.current?.emit('challenge:start', {
      sessionId,
      challengeId: c.id,
    })
  }

  const endChallenge = () => {
    setStatus('ended')
    setCompletedIds(prev => [...prev, selectedId])
    socketRef.current?.emit('challenge:end', { sessionId })
  }

  const nextChallenge = () => {
    setStatus('idle')
    setSelectedId(null)
    setChallenge(null)
    setHintSent(false)
  }

  const sendHint = () => {
    const c = BATTLE_CHALLENGES.find(ch => ch.id === selectedId)
    if (!c?.hint) return
    socketRef.current?.emit('challenge:hint', {
      sessionId,
      hint: c.hint,
    })
    setHintSent(true)
  }

  const selected = BATTLE_CHALLENGES.find(ch => ch.id === selectedId)

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text-muted)' }}>
        챌린지 선택
      </h2>

      {/* 챌린지 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
        {BATTLE_CHALLENGES.map((c) => {
          const isCompleted = completedIds.includes(c.id)
          const isSelected = selectedId === c.id
          const isDisabled = status === 'running' && !isSelected
          return (
            <button
              key={c.id}
              onClick={() => selectChallenge(c)}
              disabled={isDisabled}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: 'var(--radius)',
                border: '1px solid',
                borderColor: isSelected ? 'var(--accent)' : 'transparent',
                background: isSelected
                  ? 'rgba(99,102,241,0.1)'
                  : isCompleted
                    ? 'rgba(34,197,94,0.05)'
                    : 'transparent',
                color: isDisabled ? 'var(--text-muted)' : 'var(--text)',
                textAlign: 'left',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontSize: '0.8125rem',
                opacity: isDisabled ? 0.5 : 1,
              }}
            >
              <span>{isCompleted ? '\u2705' : c.emoji}</span>
              <span style={{ flex: 1 }}>{c.title}</span>
              <span style={{
                fontSize: '0.6875rem',
                color: ['', 'var(--success)', 'var(--warning)', 'var(--danger)'][c.level],
                fontWeight: 700,
              }}>
                Lv{c.level}
              </span>
            </button>
          )
        })}
      </div>

      {/* 시작/종료/다음 버튼 */}
      {selected && status === 'idle' && (
        <button
          onClick={startChallenge}
          style={{
            width: '100%',
            padding: '12px',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: '0.9375rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {selected.emoji} 시작하기
        </button>
      )}

      {status === 'running' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{
            padding: '10px 14px',
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid var(--success)',
            borderRadius: 'var(--radius)',
            color: 'var(--success)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            textAlign: 'center',
          }}>
            {selected?.emoji} {selected?.title} — 진행 중
          </div>

          {selected?.hint && (
            <button
              onClick={sendHint}
              disabled={hintSent}
              style={{
                width: '100%',
                padding: '10px',
                background: hintSent ? 'var(--surface2)' : 'rgba(234,179,8,0.15)',
                border: `1px solid ${hintSent ? 'var(--border)' : 'var(--warning)'}`,
                borderRadius: 'var(--radius)',
                color: hintSent ? 'var(--text-muted)' : 'var(--warning)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: hintSent ? 'default' : 'pointer',
              }}
            >
              {hintSent ? '\u2705 힌트 전송됨' : '\uD83D\uDCA1 힌트 전송'}
            </button>
          )}

          <button
            onClick={endChallenge}
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--danger)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '0.9375rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            제출 마감
          </button>
        </div>
      )}

      {status === 'ended' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            color: 'var(--danger)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            textAlign: 'center',
          }}>
            {selected?.emoji} {selected?.title} — 마감됨
          </div>
          <button
            onClick={nextChallenge}
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              fontSize: '0.9375rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            다음 챌린지 선택
          </button>
        </div>
      )}
    </div>
  )
}