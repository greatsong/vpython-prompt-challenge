import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { createSocket } from '../../utils/socket.js'
import useSessionStore from '../../store/sessionStore.js'
import useTeamStore from '../../store/teamStore.js'
import BattleMode from './BattleMode.jsx'
import ChatPanel from '../shared/ChatPanel.jsx'
import { setTeamToken, teamFetch } from '../../utils/teamAuth.js'

const WELCOME_MESSAGES = [
  '오늘의 챌린지를 정복해보세요!',
  '최고의 프롬프트를 만들어봐요!',
  '3D 세계를 말로 표현해봐요!',
  'AI에게 멋진 명령을 내려보세요!',
  '창의력을 발휘할 시간이에요!',
]

export default function TeamApp() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const socketRef = useRef(null)
  const { setChallenge } = useSessionStore()
  const { myTeam, setMyTeam } = useTeamStore()
  const [loading, setLoading] = useState(true)
  const [rankings, setRankings] = useState(null)
  const [challengeEnded, setChallengeEnded] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [sessionEnded, setSessionEnded] = useState(false)

  // 타이머
  const [remainingSeconds, setRemainingSeconds] = useState(null)
  const timerStartRef = useRef(null)
  const timerIntervalRef = useRef(null)

  // 최종 결과
  const [finalResults, setFinalResults] = useState(null)

  // 현재 라운드 식별자 — 같은 챌린지를 다시 시작해도 새 라운드로 구분된다
  const [roundStartedAt, setRoundStartedAt] = useState(null)

  // 팀 정보 로드 + 세션 상태 확인
  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token')
    if (token) {
      setTeamToken(teamId, token)
      navigate(`/team/${teamId}`, { replace: true })
      return
    }

    const init = async () => {
      try {
        const res = await teamFetch(`/api/team/${teamId}`, teamId)
        if (res.ok) {
          const team = await res.json()
          // 세션 상태 확인 — ended면 /join으로 리다이렉트
          const sessionRes = await fetch(`/api/session/${team.session_id}`)
          if (sessionRes.ok) {
            const session = await sessionRes.json()
            if (session.status === 'ended') {
              navigate('/join', { replace: true })
              return
            }
          }
          setMyTeam(team)
        }
      } catch (e) {
        console.error(e)
      }
      setLoading(false)
    }
    init()
  }, [teamId, location.search])

  // 타이머 시작
  const startCountdown = (seconds) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    if (!seconds || seconds <= 0) {
      setRemainingSeconds(null)
      return
    }
    const startedAt = Date.now()
    timerStartRef.current = { startedAt, timeLimit: seconds }
    setRemainingSeconds(seconds)

    timerIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      const remaining = Math.max(0, seconds - elapsed)
      setRemainingSeconds(remaining)
      if (remaining <= 0) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
    }, 1000)
  }

  const stopCountdown = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    setRemainingSeconds(null)
    timerStartRef.current = null
  }

  useEffect(() => {
    return () => stopCountdown()
  }, [])

  // Socket.io 연결
  useEffect(() => {
    if (!myTeam) return

    const socket = createSocket()
    socketRef.current = socket

    socket.emit('team:join', { sessionId: myTeam.session_id, teamId: myTeam.id })

    socket.on('challenge:started', ({ challengeId, timeLimit, startedAt }) => {
      setChallengeEnded(false)
      setRankings(null)
      setFinalResults(null)
      setRoundStartedAt(startedAt ?? null)
      startCountdown(timeLimit)
      fetch(`/api/challenges/${challengeId}`)
        .then((r) => r.json())
        .then(setChallenge)
        .catch(console.error)
    })

    socket.on('challenge:ended', () => {
      setChallengeEnded(true)
      stopCountdown()
    })

    socket.on('result:revealed', ({ rankings }) => {
      setRankings(rankings)
    })

    socket.on('session:final-ended', ({ rankings, challengeCount }) => {
      setFinalResults({ rankings, challengeCount })
      stopCountdown()
    })

    // 세션 종료 시 일정 시간 후 /join으로 리다이렉트
    socket.on('session:ended', () => {
      setSessionEnded(true)
    })

    return () => socket.disconnect()
  }, [myTeam])

  // 환영 화면 자동 숨김
  useEffect(() => {
    if (!myTeam || !showWelcome) return
    const timer = setTimeout(() => setShowWelcome(false), 4000)
    return () => clearTimeout(timer)
  }, [myTeam, showWelcome])

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>팀 정보 로딩 중...</p>
      </div>
    )
  }

  if (!myTeam) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--danger)' }}>팀을 찾을 수 없습니다. (ID: {teamId})</p>
      </div>
    )
  }

  const welcomeMsg = WELCOME_MESSAGES[Math.floor(myTeam.id % WELCOME_MESSAGES.length)]

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* 팀 환영 오버레이 */}
      {showWelcome && (
        <div
          onClick={() => setShowWelcome(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(15, 23, 42, 0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            cursor: 'pointer',
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: myTeam.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            animation: 'bounceIn 0.6s ease-out',
            boxShadow: `0 0 40px ${myTeam.color}66`,
          }}>
            🧠
          </div>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 800,
            animation: 'slideUp 0.5s 0.2s ease-out both',
          }}>
            {myTeam.name}
          </h1>
          <div style={{
            display: 'flex',
            gap: '8px',
            animation: 'slideUp 0.5s 0.4s ease-out both',
          }}>
            {(myTeam.members || []).map((m, i) => (
              <span key={i} style={{
                padding: '6px 16px',
                background: `${myTeam.color}33`,
                border: `1px solid ${myTeam.color}`,
                borderRadius: '20px',
                fontSize: '1rem',
                fontWeight: 600,
              }}>
                {m}
              </span>
            ))}
          </div>
          <p style={{
            color: 'var(--text-muted)',
            fontSize: '1rem',
            marginTop: '8px',
            animation: 'slideUp 0.5s 0.6s ease-out both',
          }}>
            {welcomeMsg}
          </p>
          <p style={{
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
            marginTop: '16px',
            opacity: 0.6,
            animation: 'slideUp 0.5s 0.8s ease-out both',
          }}>
            화면을 터치하면 시작합니다
          </p>
        </div>
      )}

      <header style={{
        padding: '12px 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: '16px', height: '16px', borderRadius: '50%',
          background: myTeam.color, flexShrink: 0,
        }} />
        <span style={{ fontWeight: 700 }}>{myTeam.name}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          {(myTeam.members || []).join(' · ')}
        </span>
      </header>

      <main>
        <BattleMode
          team={myTeam}
          socket={socketRef}
          rankings={rankings}
          challengeEnded={challengeEnded}
          remainingSeconds={remainingSeconds}
          finalResults={finalResults}
          roundStartedAt={roundStartedAt}
        />
      </main>

      {/* 채팅 패널 */}
      <ChatPanel
        socket={socketRef}
        sessionId={myTeam.session_id}
        teamName={myTeam.name}
        teamColor={myTeam.color}
        members={myTeam.members}
      />
    </div>
  )
}
