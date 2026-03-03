import { useEffect, useState, useRef } from 'react'
import { createSocket } from '../../utils/socket.js'
import useSessionStore from '../../store/sessionStore.js'
import useTeamStore from '../../store/teamStore.js'
import VPythonRunner from '../shared/VPythonRunner.jsx'

export default function ClassDashboard({ sessionId }) {
  const { currentChallenge, mode, sessionNumber } = useSessionStore()
  const { teams, setTeams, updateTeamScore } = useTeamStore()
  const socketRef = useRef(null)
  const [mirrorTeam, setMirrorTeam] = useState(null)

  // 초기 팀 목록 로드
  const loadTeams = async () => {
    const res = await fetch(`/api/dashboard/${sessionId}`)
    const data = await res.json()
    setTeams(data.teams)
  }

  // Socket.io 연결
  useEffect(() => {
    loadTeams()

    const socket = createSocket()
    socketRef.current = socket

    socket.emit('teacher:join', { sessionId })

    socket.on('team:submitted', ({ teamId, score }) => {
      updateTeamScore(teamId, score)
    })

    socket.on('dashboard:update', loadTeams)

    return () => socket.disconnect()
  }, [sessionId])

  const handleReveal = () => {
    socketRef.current?.emit('challenge:reveal', { sessionId })
  }

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            🧠 VPython 프롬프트 챌린지
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
            Session {sessionNumber} · {mode} 모드 · {teams.length}팀 참여 중
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <a
            href={`/api/export/${sessionId}`}
            style={{
              padding: '8px 16px',
              background: 'var(--surface2)',
              color: 'var(--text)',
              borderRadius: 'var(--radius)',
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            📥 CSV 내보내기
          </a>
          <button
            onClick={handleReveal}
            style={{
              padding: '8px 16px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            🎯 결과 공개
          </button>
        </div>
      </div>

      {/* 현재 챌린지 + 목표 장면 */}
      {currentChallenge && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
          marginBottom: '24px',
          display: 'grid',
          gridTemplateColumns: '1fr 300px',
          gap: '16px',
          alignItems: 'start',
        }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              현재 챌린지 — Lv{currentChallenge.level}
            </p>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>
              {currentChallenge.emoji} {currentChallenge.title}
            </h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
              {currentChallenge.description}
            </p>
            {currentChallenge.hint && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--warning)', marginTop: '8px' }}>
                💡 힌트: {currentChallenge.hint}
              </p>
            )}
          </div>
          <VPythonRunner code={currentChallenge.code} height="200px" label="목표 장면" />
        </div>
      )}

      {/* 팀 카드 그리드 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '12px',
      }}>
        {teams.map((team) => (
          <div
            key={team.id}
            onClick={() => setMirrorTeam(mirrorTeam?.id === team.id ? null : team)}
            style={{
              background: 'var(--surface)',
              border: `2px solid ${mirrorTeam?.id === team.id ? team.color : 'var(--border)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
            }}>
              <div style={{
                width: '12px', height: '12px', borderRadius: '50%',
                background: team.color, flexShrink: 0,
              }} />
              <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{team.name}</span>
            </div>

            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {(team.members || []).join(', ')}
            </div>

            {team.hasSubmitted ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ color: 'var(--success)', fontSize: '0.75rem' }}>✓ 제출</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: team.color }}>
                  {team.latestScore ?? '?'}점
                </span>
              </div>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                ⋯ 진행 중
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 팀 미러 (클릭한 팀 상세) */}
      {mirrorTeam && (
        <div style={{
          marginTop: '24px',
          background: 'var(--surface)',
          border: `1px solid ${mirrorTeam.color}`,
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
        }}>
          <h3 style={{ marginBottom: '12px' }}>
            📡 {mirrorTeam.name} 팀 미러링
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            팀원들의 화면을 실시간으로 확인하려면 팀 URL을 직접 열어주세요.
          </p>
          <code style={{
            display: 'block',
            marginTop: '8px',
            padding: '8px 12px',
            background: 'var(--bg)',
            borderRadius: 'var(--radius)',
            fontSize: '0.875rem',
            color: 'var(--accent-hover)',
          }}>
            http://localhost:4008/team/{mirrorTeam.id}
          </code>
        </div>
      )}
    </div>
  )
}
