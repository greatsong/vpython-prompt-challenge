import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * JoinPage — /join
 * 학생이 접속하면 현재 활성 세션의 팀 목록을 보여줌
 * 자기 팀 이름 클릭 → /team/:id 로 이동
 */
export default function JoinPage() {
  const navigate = useNavigate()
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/session/latest/teams')
      .then((r) => r.ok ? r.json() : Promise.reject('세션 없음'))
      .then((data) => { setTeams(data.teams); setLoading(false) })
      .catch((e) => { setError(String(e)); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div style={centerStyle}>
        <p style={{ color: 'var(--text-muted)' }}>팀 목록 불러오는 중...</p>
      </div>
    )
  }

  if (error || teams.length === 0) {
    return (
      <div style={centerStyle}>
        <p style={{ color: 'var(--danger)', marginBottom: '8px' }}>
          아직 수업이 시작되지 않았어요.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          선생님이 수업을 시작한 후 새로고침 해주세요.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '16px', padding: '8px 20px',
            background: 'var(--accent)', color: 'white',
            border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
          }}
        >
          새로고침
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '32px 20px' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '6px', textAlign: 'center' }}>
          🧠 VPython 프롬프트 챌린지
        </h1>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '32px' }}>
          우리 팀 이름을 눌러주세요
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => navigate(`/team/${team.id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '16px 20px',
                background: 'var(--surface)',
                border: `2px solid var(--border)`,
                borderRadius: 'var(--radius-lg)',
                color: 'var(--text)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = team.color
                e.currentTarget.style.background = 'var(--surface2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.background = 'var(--surface)'
              }}
            >
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%',
                background: team.color, flexShrink: 0,
              }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>{team.name}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {(team.members || []).join(' · ')}
                </div>
              </div>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '1.25rem' }}>→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const centerStyle = {
  height: '100vh',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  gap: '8px', padding: '24px',
}
