import { useEffect, useRef, useState } from 'react'
import useSessionStore from '../../store/sessionStore.js'
import { BATTLE_CHALLENGES } from '../../data/challenges-battle.js'
import { createSocket, emitWithAck } from '../../utils/socket.js'

export default function SessionController({ sessionId, onFinalEnd, onAuthExpired }) {
  const { currentChallenge, setChallenge, submissionProgress } = useSessionStore()
  const [selectedId, setSelectedId] = useState(null)
  // 'idle' | 'running' | 'ended'
  const [status, setStatus] = useState('idle')
  const [hintSent, setHintSent] = useState(false)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const socketRef = useRef(null)
  const selectedIdRef = useRef(null)
  const [completedIds, setCompletedIds] = useState([])

  // 타이머
  const [timerMinutes, setTimerMinutes] = useState(3)
  const [remainingSeconds, setRemainingSeconds] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const socket = createSocket({ teacher: true })
    socketRef.current = socket
    // 최초 + 재접속 시마다 방 재입장. 서버는 auth:teacher 이전에 도착한 join을 보류하고 인증 후 소급 적용한다.
    const rejoin = () => socket.emit('teacher:join', { sessionId })
    if (socket.connected) rejoin()
    socket.on('connect', rejoin)

    // 진행 중 챌린지 복구 — 새로고침·재접속 시 서버가 현재 라운드를 되돌려준다
    socket.on('challenge:started', ({ challengeId, timeLimit, resumed } = {}) => {
      if (!resumed) return
      const c = BATTLE_CHALLENGES.find(ch => ch.id === challengeId)
      if (!c) return
      setSelectedId(c.id)
      selectedIdRef.current = c.id
      setChallenge(c)
      setStatus('running')
      setError('')
      if (timeLimit > 0) startTimer(timeLimit)
    })

    // 서버 자동 종료 수신
    socket.on('challenge:ended', ({ autoEnded } = {}) => {
      if (autoEnded) {
        setStatus('ended')
        const currentId = selectedIdRef.current
        setCompletedIds(prev => {
          if (currentId && !prev.includes(currentId)) return [...prev, currentId]
          return prev
        })
        stopTimer()
      }
    })

    return () => socket.disconnect()
  }, [sessionId])

  // 타이머 카운트다운
  const startTimer = (seconds) => {
    stopTimer()
    if (!seconds || seconds <= 0) return
    setRemainingSeconds(seconds)
    const startedAt = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      const remaining = Math.max(0, seconds - elapsed)
      setRemainingSeconds(remaining)
      if (remaining <= 0) {
        stopTimer()
      }
    }, 1000)
  }

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRemainingSeconds(null)
  }

  useEffect(() => {
    return () => stopTimer()
  }, [])

  const selectChallenge = (c) => {
    if (status === 'running') return
    setSelectedId(c.id)
    selectedIdRef.current = c.id
    setChallenge(c)
    setHintSent(false)
    setError('')
  }

  // 서버 ack를 받은 뒤에만 '진행 중'으로 전환한다.
  // (이전에는 emit 직후 바로 running이 되어, 서버가 조용히 거부하면
  //  교사 화면만 진행 중이고 학생은 아무 것도 못 받는 상태가 됐다.)
  const startChallenge = async () => {
    const c = BATTLE_CHALLENGES.find(ch => ch.id === selectedId)
    if (!c || starting) return
    setStarting(true)
    setError('')
    const timeLimitSec = timerMinutes > 0 ? timerMinutes * 60 : 0

    const res = await emitWithAck(socketRef.current, 'challenge:start', {
      sessionId,
      challengeId: c.id,
      timeLimit: timeLimitSec,
    })
    setStarting(false)

    if (!res.ok) {
      setError(res.error || '챌린지를 시작하지 못했습니다')
      if (res.authExpired && onAuthExpired) onAuthExpired()
      return
    }

    setStatus('running')
    if (timeLimitSec > 0) startTimer(timeLimitSec)
  }

  const endChallenge = () => {
    setStatus('ended')
    setCompletedIds(prev => [...prev, selectedId])
    stopTimer()
    socketRef.current?.emit('challenge:end', { sessionId })
  }

  const nextChallenge = () => {
    setStatus('idle')
    setSelectedId(null)
    selectedIdRef.current = null
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

  const handleFinalEnd = () => {
    socketRef.current?.emit('session:final-end', { sessionId })
    if (onFinalEnd) onFinalEnd()
  }

  const selected = BATTLE_CHALLENGES.find(ch => ch.id === selectedId)

  // 대시보드가 집계한 현재 챌린지 제출 현황. 챌린지 id가 일치할 때만 쓴다.
  const progressMatches =
    submissionProgress.challengeId && submissionProgress.challengeId === selectedId
  const pendingTeams = progressMatches
    ? Math.max(0, submissionProgress.total - submissionProgress.submitted)
    : 0

  // 아직 평가가 안 끝난 팀이 있으면 안내만 한다 (버튼은 막지 않는다 — 교사가 의도적으로 넘길 수 있어야 한다)
  const pendingNotice = pendingTeams > 0 && (
    <p style={{
      padding: '8px 10px',
      background: 'rgba(245,158,11,0.12)',
      border: '1px solid var(--warning)',
      borderRadius: 'var(--radius)',
      color: 'var(--warning)',
      fontSize: '0.6875rem',
      fontWeight: 600,
      lineHeight: 1.5,
      textAlign: 'center',
    }}>
      ⚠️ {submissionProgress.submitted} / {submissionProgress.total}팀 제출 —
      아직 {pendingTeams}팀이 평가 처리 중입니다.
      지금 넘기면 이 팀들의 결과가 빠질 수 있어요.
    </p>
  )

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── 상단: 챌린지 목록 (스크롤) ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 16px 8px' }}>
        <h2 style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-muted)' }}>
          챌린지 선택
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
                  gap: '6px',
                  padding: '6px 8px',
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
                <span style={{ fontSize: '0.875rem' }}>{isCompleted ? '\u2705' : c.emoji}</span>
                <span style={{ flex: 1 }}>{c.title}</span>
                <span style={{
                  fontSize: '0.625rem',
                  color: [
                    '',
                    'var(--success)',   // Lv1
                    'var(--warning)',   // Lv2
                    'var(--danger)',    // Lv3
                    '#9333ea',         // Lv4 보라
                    '#dc2626',         // Lv5 빨강
                  ][c.level] || 'var(--text-muted)',
                  fontWeight: 700,
                }}>
                  {'★'.repeat(Math.min(c.level, 5))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 하단: 액션 영역 (고정) ── */}
      <div style={{
        flexShrink: 0,
        padding: '12px 16px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        {/* 시작 전: 타이머 설정 + 시작 버튼 */}
        {selected && status === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                ⏱ 제한 시간
              </p>
              <div style={{ display: 'flex', gap: '3px' }}>
                {[1, 2, 3, 5].map(m => (
                  <button
                    key={m}
                    onClick={() => setTimerMinutes(m)}
                    style={{
                      flex: 1,
                      padding: '5px 2px',
                      background: timerMinutes === m ? 'var(--accent)' : 'var(--surface2)',
                      color: timerMinutes === m ? 'white' : 'var(--text)',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      fontSize: '0.6875rem',
                      fontWeight: timerMinutes === m ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {`${m}분`}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={startChallenge}
              disabled={starting}
              style={{
                width: '100%',
                padding: '10px',
                background: starting ? 'var(--surface2)' : 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: starting ? 'not-allowed' : 'pointer',
              }}
            >
              {starting ? '시작하는 중...' : `${selected.emoji} 시작하기`}
            </button>
          </div>
        )}

        {/* 시작 실패 등 오류 안내 */}
        {error && (
          <p style={{
            marginTop: '8px',
            padding: '8px 10px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            color: 'var(--danger)',
            fontSize: '0.75rem',
            fontWeight: 600,
            textAlign: 'center',
          }}>
            {error}
          </p>
        )}

        {/* 진행 중 */}
        {status === 'running' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* 타이머 카운트다운 */}
            {remainingSeconds !== null && (
              <div style={{
                textAlign: 'center',
                padding: '10px',
                background: remainingSeconds <= 30
                  ? 'rgba(239,68,68,0.1)'
                  : 'rgba(99,102,241,0.1)',
                border: `1px solid ${remainingSeconds <= 30 ? 'var(--danger)' : 'var(--accent)'}`,
                borderRadius: 'var(--radius)',
              }}>
                <div style={{
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  color: remainingSeconds <= 30 ? 'var(--danger)' : 'var(--accent)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatTime(remainingSeconds)}
                </div>
                <p style={{
                  fontSize: '0.625rem',
                  color: 'var(--text-muted)',
                  marginTop: '2px',
                }}>
                  {remainingSeconds <= 30 ? '곧 마감됩니다!' : '남은 시간'}
                </p>
              </div>
            )}

            <div style={{
              padding: '8px 10px',
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid var(--success)',
              borderRadius: 'var(--radius)',
              color: 'var(--success)',
              fontSize: '0.75rem',
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
                  padding: '8px',
                  background: hintSent ? 'var(--surface2)' : 'rgba(234,179,8,0.15)',
                  border: `1px solid ${hintSent ? 'var(--border)' : 'var(--warning)'}`,
                  borderRadius: 'var(--radius)',
                  color: hintSent ? 'var(--text-muted)' : 'var(--warning)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: hintSent ? 'default' : 'pointer',
                }}
              >
                {hintSent ? '\u2705 힌트 전송됨' : '\uD83D\uDCA1 힌트 전송'}
              </button>
            )}

            {pendingNotice}

            <button
              onClick={endChallenge}
              style={{
                width: '100%',
                padding: '10px',
                background: 'var(--danger)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              제출 마감
            </button>
          </div>
        )}

        {/* 마감됨 */}
        {status === 'ended' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{
              padding: '8px 10px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius)',
              color: 'var(--danger)',
              fontSize: '0.75rem',
              fontWeight: 600,
              textAlign: 'center',
            }}>
              {selected?.emoji} {selected?.title} — 마감됨
            </div>
            {pendingNotice}
            <button
              onClick={nextChallenge}
              style={{
                width: '100%',
                padding: '10px',
                background: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              다음 챌린지 선택
            </button>
          </div>
        )}

        {/* 챌린지 미선택 시 안내 */}
        {!selected && status === 'idle' && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            위에서 챌린지를 선택하세요
          </p>
        )}

        {/* 전체 수업 종료 */}
        {completedIds.length > 0 && status !== 'running' && (
          <button
            onClick={handleFinalEnd}
            style={{
              width: '100%',
              marginTop: '10px',
              padding: '10px',
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '0.8125rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🏁 전체 수업 종료 ({completedIds.length}개 완료)
          </button>
        )}
      </div>
    </div>
  )
}
