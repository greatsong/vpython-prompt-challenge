import { useEffect, useMemo, useRef, useState } from 'react'
import useSessionStore from '../../store/sessionStore.js'
import useTeamStore from '../../store/teamStore.js'
import { BATTLE_CHALLENGES } from '../../data/challenges-battle.js'
import { createSocket, emitWithAck } from '../../utils/socket.js'
import { getTeacherToken } from '../../utils/teacherAuth.js'
import {
  loadProgress, saveProgress, clearProgress, addCompleted, mergeCompleted,
} from '../../store/completedChallenges.js'

/**
 * 교사 명령을 보내고 서버가 받아들였는지 확인한다.
 * - ack 콜백 응답: { ok:false, authExpired } 면 실패 (서버 teacherOnly 래퍼가 인증 실패 시 보낸다)
 * - ack가 { ok:true } 이거나, 명령이 처리됐다는 방송(confirmEvent)이 오면 성공
 *   (서버 핸들러가 성공 시 ack를 부르지 않아도 방송으로 확인할 수 있다)
 * - 소켓이 끊겨 있으면 보내지 않는다 (socket.io가 버퍼에 쌓았다가 나중에 보내는 일을 막는다)
 */
function emitConfirmed(socket, event, payload, { confirmEvent = null, timeoutMs = 6000 } = {}) {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) {
      resolve({ ok: false, error: '서버와 연결이 끊겨 있습니다. 잠시 후 다시 시도해 주세요.' })
      return
    }
    let settled = false
    let timer = null
    const onConfirm = () => finish({ ok: true })
    function finish(res) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (confirmEvent) socket.off(confirmEvent, onConfirm)
      resolve(res)
    }
    if (confirmEvent) socket.on(confirmEvent, onConfirm)
    timer = setTimeout(() => {
      finish({ ok: false, timeout: true, error: '서버 응답이 없습니다. 잠시 후 다시 시도해 주세요.' })
    }, timeoutMs)
    socket.emit(event, payload, (res) => {
      // ack 인자 없이 호출되면 성공으로 본다
      finish(res && typeof res === 'object' ? res : { ok: true })
    })
  })
}

// 진행 기록 저장소. 사생활 보호 모드 등에서 접근 자체가 예외를 던질 수 있어 감싼다.
const storage = (() => {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null } catch { return null }
})()

// sessionFinished: 교사 화면이 이미 전체 수업 종료를 기록했는지 (다시 마운트돼도 종료 상태를 유지한다)
export default function SessionController({ sessionId, onFinalEnd, onAuthExpired, sessionFinished = false }) {
  const { currentChallenge, setChallenge, submissionProgress, setChallengeStatus } = useSessionStore()
  const { teams } = useTeamStore()
  // 새로고침·탭 전환으로 다시 마운트돼도 진행 기록이 남도록 sessionStorage에서 복원한다
  const [initialProgress] = useState(() => {
    const p = loadProgress(storage, sessionId)
    // 진행 중이던 챌린지는 서버가 teacher:join 때 resumed로 다시 알려 준다.
    // 알려 주지 않으면 그사이 끝난 것이므로 '마감됨'으로 보여 준다.
    return p.status === 'running' ? { ...p, status: 'ended', completedIds: addCompleted(p.completedIds, p.selectedId) } : p
  })
  const [selectedId, setSelectedId] = useState(initialProgress.selectedId)
  // 'idle' | 'running' | 'ended'
  const [status, setStatus] = useState(initialProgress.status)
  const [hintSent, setHintSent] = useState(false)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  // 마감·힌트·전체 종료 명령을 서버가 확인할 때까지 버튼을 잠근다
  const [pendingAction, setPendingAction] = useState(null) // 'end' | 'hint' | 'final' | null
  const socketRef = useRef(null)
  const selectedIdRef = useRef(initialProgress.selectedId)
  const [completedIds, setCompletedIds] = useState(initialProgress.completedIds)
  // 전체 수업 종료 확인(이 화면의 버튼 또는 다른 탭의 종료 방송) 뒤에는 진행 버튼을 숨긴다
  const [finalEnded, setFinalEnded] = useState(false)
  const sessionClosed = sessionFinished || finalEnded

  // 타이머
  const [timerMinutes, setTimerMinutes] = useState(3)
  const [remainingSeconds, setRemainingSeconds] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const socket = createSocket({ teacher: true })
    socketRef.current = socket
    // 최초 + 재접속 시마다 방 재입장. token을 함께 보내 auth:teacher 도착 순서와 상관없이 바로 인증받는다.
    // (토큰이 없으면 서버가 join을 보류했다가 auth:teacher 뒤에 소급 적용한다)
    const rejoin = () => {
      const token = getTeacherToken()
      socket.emit('teacher:join', token ? { sessionId, token } : { sessionId }, (res) => {
        if (res && res.ok === false && res.authExpired && onAuthExpired) onAuthExpired()
      })
    }
    if (socket.connected) rejoin()
    socket.on('connect', rejoin)

    // 진행 중 챌린지 복구 — 새로고침·재접속 시 서버가 현재 라운드를 되돌려준다
    socket.on('challenge:started', ({ challengeId, timeLimit, resumed } = {}) => {
      if (!resumed) return
      const c = BATTLE_CHALLENGES.find(ch => ch.id === challengeId)
      if (!c) return
      setSelectedId(c.id)
      selectedIdRef.current = c.id
      // 같은 챌린지면 다시 넣지 않는다 (대시보드의 목표 장면이 다시 로드되지 않도록)
      if (useSessionStore.getState().currentChallenge?.id !== c.id) setChallenge(c)
      setStatus('running')
      setError('')
      if (timeLimit > 0) startTimer(timeLimit)
    })

    // 서버 쪽 마감 수신 — 타이머 자동 종료(autoEnded)와 진행 중 결과 공개(revealed) 모두 마감으로 처리한다
    // (결과 공개는 대시보드에서 누르므로 이 화면의 endChallenge를 거치지 않는다)
    // 재입장(resumed): 진행 중인 챌린지가 없고 마지막 챌린지가 마감돼 있으면 서버가 그 챌린지 id와 함께 알려 준다.
    // 다른 탭·새 브라우저처럼 진행 기록이 없는 화면도 '마감됨'으로 복원해 결과 공개를 이어 갈 수 있게 한다.
    socket.on('challenge:ended', ({ autoEnded, revealed, resumed, challengeId } = {}) => {
      if (resumed && challengeId) {
        const c = BATTLE_CHALLENGES.find(ch => ch.id === challengeId)
        if (c) {
          setSelectedId(c.id)
          selectedIdRef.current = c.id
          if (useSessionStore.getState().currentChallenge?.id !== c.id) setChallenge(c)
        }
      }
      if (autoEnded || revealed || resumed) {
        setStatus('ended')
        const currentId = selectedIdRef.current
        setCompletedIds(prev => {
          if (currentId && !prev.includes(currentId)) return [...prev, currentId]
          return prev
        })
        stopTimer()
      }
    })

    // 다른 탭·기기에서 전체 수업을 종료해도 이 사이드바가 종료 상태로 바뀌게 한다
    socket.on('session:final-ended', () => {
      setFinalEnded(true)
      stopTimer()
    })

    return () => socket.disconnect()
  }, [sessionId])

  // 마운트 시 복원한 선택 챌린지를 대시보드(store)에도 알려 준다
  useEffect(() => {
    if (!initialProgress.selectedId) return
    const c = BATTLE_CHALLENGES.find(ch => ch.id === initialProgress.selectedId)
    if (c && useSessionStore.getState().currentChallenge?.id !== c.id) setChallenge(c)
  }, [])

  // 진행 기록 저장 + 형제(ClassDashboard)에 진행 상태 공유
  useEffect(() => {
    saveProgress(storage, sessionId, { completedIds, selectedId, status })
  }, [sessionId, completedIds, selectedId, status])
  useEffect(() => {
    setChallengeStatus(status)
  }, [status])

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
    if (status === 'running' || sessionClosed) return
    // 마감된 챌린지를 둔 채 다른 챌린지를 고르면 바로 '시작 전' 상태로 넘어간다
    if (status === 'ended') setStatus('idle')
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

  // 실패 응답 공통 처리 — 인증 만료면 로그인 화면으로 돌려보낸다
  const handleCommandFailure = (res, fallback) => {
    setError(res.authExpired ? '로그인이 만료되었습니다. 다시 로그인해 주세요.' : (res.error || fallback))
    if (res.authExpired && onAuthExpired) onAuthExpired()
  }

  // 서버가 마감을 확인한 뒤에만 '마감됨'으로 바꾼다
  // (예전에는 인증이 만료돼 서버가 거부해도 교사 화면만 마감된 것처럼 보였다)
  const endChallenge = async () => {
    if (pendingAction) return
    setPendingAction('end')
    setError('')
    const endedId = selectedId
    const res = await emitConfirmed(socketRef.current, 'challenge:end', { sessionId }, { confirmEvent: 'challenge:ended' })
    setPendingAction(null)
    if (!res.ok) {
      handleCommandFailure(res, '제출을 마감하지 못했습니다')
      return
    }
    setStatus('ended')
    setCompletedIds(prev => addCompleted(prev, endedId))
    stopTimer()
  }

  const nextChallenge = () => {
    setStatus('idle')
    setSelectedId(null)
    selectedIdRef.current = null
    setChallenge(null)
    setHintSent(false)
  }

  const sendHint = async () => {
    const c = BATTLE_CHALLENGES.find(ch => ch.id === selectedId)
    if (!c?.hint || pendingAction) return
    setPendingAction('hint')
    setError('')
    const res = await emitConfirmed(socketRef.current, 'challenge:hint', {
      sessionId,
      hint: c.hint,
    }, { confirmEvent: 'challenge:hint' })
    setPendingAction(null)
    if (!res.ok) {
      handleCommandFailure(res, '힌트를 보내지 못했습니다')
      return
    }
    setHintSent(true)
  }

  const handleFinalEnd = async () => {
    if (pendingAction) return
    const ok = window.confirm(
      `전체 수업을 종료할까요?\n\n학생 화면에 최종 결과가 표시되고, 이 수업에서는 더 이상 챌린지를 진행할 수 없습니다.`
    )
    if (!ok) return
    setPendingAction('final')
    setError('')
    const res = await emitConfirmed(socketRef.current, 'session:final-end', { sessionId }, {
      confirmEvent: 'session:final-ended',
      timeoutMs: 15000,
    })
    setPendingAction(null)
    if (!res.ok) {
      handleCommandFailure(res, '수업을 종료하지 못했습니다')
      return
    }
    clearProgress(storage, sessionId)
    setFinalEnded(true)
    stopTimer()
    if (onFinalEnd) onFinalEnd()
  }

  const selected = BATTLE_CHALLENGES.find(ch => ch.id === selectedId)

  // 화면에 보여 줄 완료 목록 — 로컬 기록 + 서버 제출 기록(대시보드가 불러온 teams), 진행 중인 챌린지는 제외
  const displayCompletedIds = useMemo(
    () => mergeCompleted(completedIds, teams, status === 'running' ? selectedId : null),
    [completedIds, teams, status, selectedId]
  )

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
      background: 'var(--warning-bg)',
      border: '1px solid var(--gold)',
      borderRadius: 'var(--radius)',
      color: 'var(--warning-text)',
      fontSize: '0.6875rem',
      fontWeight: 600,
      lineHeight: 1.5,
      textAlign: 'center',
    }}>
      ⚠️ {submissionProgress.submitted} / {submissionProgress.total}팀 제출 —
      {pendingTeams}팀 미제출.
      제출 중인 팀이 있다면 지금 넘길 때 결과가 빠질 수 있어요.
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
        <h2 style={{ fontSize: '0.8125rem', fontWeight: 800, marginBottom: '10px', color: 'var(--text-muted)' }}>
          챌린지 선택
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {BATTLE_CHALLENGES.map((c) => {
            const isCompleted = displayCompletedIds.includes(c.id)
            const isSelected = selectedId === c.id
            const isDisabled = sessionClosed || (status === 'running' && !isSelected)
            return (
              <button
                key={c.id}
                onClick={() => selectChallenge(c)}
                disabled={isDisabled}
                aria-label={`${c.title}, 레벨 ${c.level}${isCompleted ? ', 완료' : ''}${isSelected ? ', 선택됨' : ''}${isDisabled ? (sessionClosed ? ', 수업 종료됨' : ', 진행 중에는 선택할 수 없음') : ''}`}
                aria-pressed={isSelected}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 8px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--gold)' : 'transparent',
                  background: isSelected
                    ? 'var(--card)'
                    : isCompleted
                      ? 'var(--success-bg)'
                      : 'transparent',
                  fontWeight: isSelected ? 700 : 400,
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
                    'var(--success-text)',   // Lv1
                    'var(--warning-text)',   // Lv2
                    'var(--danger-text)',    // Lv3
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
        background: 'var(--card2)',
      }}>
        {/* 전체 수업 종료 뒤 — 다음 챌린지·전체 종료 버튼을 모두 숨기고 상태만 보여 준다 */}
        {sessionClosed && (
          <div role="status" style={{
            padding: '10px 12px',
            background: 'var(--card)',
            border: '1px solid var(--gold)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            fontSize: '0.8125rem',
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.5,
          }}>
            🏁 수업이 종료되었습니다
          </div>
        )}

        {/* 시작 전: 타이머 설정 + 시작 버튼 */}
        {!sessionClosed && selected && status === 'idle' && (
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
                    aria-label={`제한 시간 ${m}분`}
                    aria-pressed={timerMinutes === m}
                    style={{
                      flex: 1,
                      padding: '5px 2px',
                      background: timerMinutes === m ? 'var(--btn-primary-bg)' : '#fff',
                      color: timerMinutes === m ? 'var(--btn-primary-text)' : 'var(--text)',
                      border: `1px solid ${timerMinutes === m ? 'var(--gold)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-pill)',
                      fontSize: '0.6875rem',
                      fontWeight: timerMinutes === m ? 800 : 500,
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
                background: starting ? 'var(--surface2)' : 'var(--btn-primary-bg)',
                color: starting ? 'var(--text-muted)' : 'var(--btn-primary-text)',
                border: 'none',
                borderRadius: 'var(--radius-btn)',
                boxShadow: starting ? 'none' : '0 6px 18px var(--shadow)',
                fontSize: '0.875rem',
                fontWeight: 800,
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
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            color: 'var(--danger-text)',
            fontSize: '0.75rem',
            fontWeight: 600,
            textAlign: 'center',
          }}>
            {error}
          </p>
        )}

        {/* 진행 중 */}
        {!sessionClosed && status === 'running' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* 타이머 카운트다운 */}
            {remainingSeconds !== null && (
              <div style={{
                textAlign: 'center',
                padding: '10px',
                background: remainingSeconds <= 30
                  ? 'var(--danger-bg)'
                  : 'var(--card)',
                border: `1.5px solid ${remainingSeconds <= 30 ? 'var(--danger)' : 'var(--gold)'}`,
                borderRadius: 'var(--radius)',
              }}>
                <div style={{
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  color: remainingSeconds <= 30 ? 'var(--danger-text)' : 'var(--accent-text)',
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
              background: 'var(--success-bg)',
              border: '1px solid var(--success)',
              borderRadius: 'var(--radius)',
              color: 'var(--success-text)',
              fontSize: '0.75rem',
              fontWeight: 600,
              textAlign: 'center',
            }}>
              {selected?.emoji} {selected?.title} — 진행 중
            </div>

            {selected?.hint && (
              <button
                onClick={sendHint}
                disabled={hintSent || !!pendingAction}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: hintSent ? 'var(--surface2)' : '#fff',
                  border: `1.5px solid ${hintSent ? 'var(--border)' : 'var(--gold)'}`,
                  borderRadius: 'var(--radius-btn)',
                  color: hintSent ? 'var(--text-muted)' : 'var(--warning-text)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: hintSent ? 'default' : 'pointer',
                }}
              >
                {hintSent ? '\u2705 힌트 전송됨' : pendingAction === 'hint' ? '전송 중...' : '\uD83D\uDCA1 힌트 전송'}
              </button>
            )}

            {pendingNotice}

            <button
              onClick={endChallenge}
              disabled={!!pendingAction}
              style={{
                width: '100%',
                padding: '10px',
                opacity: pendingAction ? 0.6 : 1,
                background: 'var(--danger-text)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-btn)',
                fontSize: '0.875rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {pendingAction === 'end' ? '마감하는 중...' : '제출 마감'}
            </button>
          </div>
        )}

        {/* 마감됨 */}
        {!sessionClosed && status === 'ended' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{
              padding: '8px 10px',
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius)',
              color: 'var(--danger-text)',
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
                background: '#fff',
                color: 'var(--accent-text)',
                border: '1.5px solid var(--gold)',
                borderRadius: 'var(--radius-btn)',
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
        {!sessionClosed && !selected && status === 'idle' && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            위에서 챌린지를 선택하세요
          </p>
        )}

        {/* 전체 수업 종료 */}
        {!sessionClosed && displayCompletedIds.length > 0 && status !== 'running' && (
          <button
            onClick={handleFinalEnd}
            disabled={!!pendingAction}
            style={{
              opacity: pendingAction ? 0.6 : 1,
              width: '100%',
              marginTop: '10px',
              padding: '10px',
              // 종료 버튼 — 흰 글자 대비를 위해 진한 빨강 단색 (주황→빨강 그라데이션은 주황 쪽이 2.4:1이었다)
              background: 'var(--btn-danger-bg)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-btn)',
              boxShadow: '0 6px 18px var(--shadow)',
              fontSize: '0.8125rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {pendingAction === 'final'
              ? '수업을 종료하는 중...'
              : `🏁 전체 수업 종료 (${displayCompletedIds.length}개 완료)`}
          </button>
        )}
      </div>
    </div>
  )
}
