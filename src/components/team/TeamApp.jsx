import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createSocket } from '../../utils/socket.js'
import useSessionStore from '../../store/sessionStore.js'
import useTeamStore from '../../store/teamStore.js'
import WaitingScreen from './WaitingScreen.jsx'
import BattleMode from './BattleMode.jsx'

export default function TeamApp() {
  const { teamId } = useParams()
  const socketRef = useRef(null)
  const { mode, setMode, setChallenge, setSession } = useSessionStore()
  const { myTeam, setMyTeam } = useTeamStore()
  const [loading, setLoading] = useState(true)
  const [rankings, setRankings] = useState(null)

  // 팀 정보 로드
  useEffect(() => {
    const init = async () => {
      try {
        // 팀 정보는 팀 ID로 바로 조회
        const res = await fetch(`/api/team/${teamId}`)
        if (res.ok) {
          const team = await res.json()
          setMyTeam(team)

          // 세션 정보도 로드
          const sRes = await fetch(`/api/session/${team.session_id}`)
          if (sRes.ok) {
            const session = await sRes.json()
            setSession({ sessionId: team.session_id, mode: session.mode, sessionNumber: session.session_number })
          }
        }
      } catch (e) {
        console.error(e)
      }
      setLoading(false)
    }
    init()
  }, [teamId])

  // Socket.io 연결
  useEffect(() => {
    if (!myTeam) return

    const socket = createSocket()
    socketRef.current = socket

    socket.emit('team:join', { sessionId: myTeam.session_id, teamId: myTeam.id })

    socket.on('session:mode-change', ({ mode: newMode }) => {
      setMode(newMode)
      setRankings(null)
    })

    socket.on('challenge:started', ({ challengeId }) => {
      // 챌린지 상세 로드
      fetch(`/api/challenges/${challengeId}`)
        .then((r) => r.json())
        .then(setChallenge)
        .catch(console.error)
    })

    socket.on('result:revealed', ({ rankings }) => {
      setRankings(rankings)
    })

    socket.on('challenge:hint', ({ hint }) => {
      // 힌트는 BattleMode 내에서 처리
    })

    return () => socket.disconnect()
  }, [myTeam])

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

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* 팀 헤더 */}
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

      {/* 모드별 컨텐츠 */}
      <main>
        {mode === 'waiting' && <WaitingScreen team={myTeam} />}
        {(mode === 'battle' || mode === 'compare') && (
          <BattleMode team={myTeam} socket={socketRef} rankings={rankings} />
        )}
        {/* 나머지 모드는 Phase 2~4에서 추가 */}
        {mode === 'detective' && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            🔍 코드 탐정 모드 (Session 2 — 곧 추가 예정)
          </div>
        )}
        {mode === 'surgery' && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            ✂️ 코드 수술 모드 (Session 3 — 곧 추가 예정)
          </div>
        )}
        {mode === 'creator' && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            🎨 문제 출제자 모드 (Session 4 — 곧 추가 예정)
          </div>
        )}
      </main>
    </div>
  )
}
