import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createSocket } from '../utils/socket.js'
import VPythonRunner from './shared/VPythonRunner.jsx'
import ChatPanel from './shared/ChatPanel.jsx'

export default function SpectatorPage() {
  const { sessionId } = useParams()
  const socketRef = useRef(null)
  const [teams, setTeams] = useState([])
  const [challenge, setChallenge] = useState(null)
  const [rankings, setRankings] = useState(null)

  const loadTeams = async () => {
    try {
      const res = await fetch(`/api/dashboard/${sessionId}`)
      if (res.ok) {
        const data = await res.json()
        setTeams(data.teams || [])
      }
    } catch (e) { /* ignore */ }
  }

  useEffect(() => {
    loadTeams()
    const socket = createSocket()
    socketRef.current = socket
    socket.emit('team:join', { sessionId, teamId: 'spectator' })

    socket.on('challenge:started', ({ challengeId }) => {
      fetch(`/api/challenges/${challengeId}`)
        .then((r) => r.json())
        .then(setChallenge)
        .catch(console.error)
    })

    socket.on('dashboard:update', loadTeams)

    socket.on('result:revealed', ({ rankings: r }) => {
      setRankings(r)
    })

    return () => socket.disconnect()
  }, [sessionId])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* 헤더 */}
      <header style={{
        padding: '12px 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <span style={{
          padding: '4px 10px',
          background: '#64748b',
          borderRadius: '20px',
          fontSize: '0.75rem',
          fontWeight: 700,
        }}>
          관람 모드
        </span>
        <span style={{ fontWeight: 700 }}>VPython 프롬프트 챌린지</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginLeft: 'auto' }}>
          {teams.length}팀 참여 중
        </span>
      </header>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 20px' }}>
        {/* 현재 챌린지 */}
        {challenge && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            marginBottom: '24px',
          }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              현재 챌린지 — Lv{challenge.level}
            </p>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '12px' }}>
              {challenge.emoji} {challenge.title}
            </h2>
            <VPythonRunner code={challenge.code} height="250px" label="목표 장면" />
          </div>
        )}

        {!challenge && !rankings && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--text-muted)',
          }}>
            <p style={{ fontSize: '2rem', marginBottom: '12px' }}>👀</p>
            <p style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '8px' }}>
              관람 모드로 참여 중입니다
            </p>
            <p style={{ fontSize: '0.875rem' }}>
              선생님이 챌린지를 시작하면 여기서 실시간으로 볼 수 있어요
            </p>
          </div>
        )}

        {/* 결과 공개 시 순위 */}
        {rankings && rankings.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px',
            marginBottom: '24px',
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>
              🏆 순위
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {rankings.map((r, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  background: 'var(--bg)',
                  borderRadius: 'var(--radius)',
                  borderLeft: `3px solid ${r.color}`,
                }}>
                  <span style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    width: '30px',
                    textAlign: 'center',
                    color: i === 0 ? '#eab308' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7f32' : 'var(--text-muted)',
                  }}>
                    {i + 1}
                  </span>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: r.color,
                  }} />
                  <span style={{ fontWeight: 600, flex: 1 }}>{r.name}</span>
                  <span style={{ fontWeight: 800, color: r.color, fontSize: '1.125rem' }}>
                    {r.score}점
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 팀 현황 카드 */}
        <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
          참여 팀 현황
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '10px',
        }}>
          {teams.map((team) => (
            <div key={team.id} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: team.color,
                }} />
                <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{team.name}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {(team.members || []).join(', ')}
              </div>
              {team.hasSubmitted && (
                <div style={{
                  marginTop: '6px',
                  fontSize: '1rem',
                  fontWeight: 800,
                  color: team.color,
                }}>
                  {team.latestScore ?? '?'}점
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 채팅 (관람자도 참여 가능) */}
      <ChatPanel
        socket={socketRef}
        sessionId={sessionId}
        teamName="관람자"
        teamColor="#64748b"
        members={[]}
      />
    </div>
  )
}
