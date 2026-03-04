import { useState, useEffect } from 'react'
import ClassSetup from './ClassSetup.jsx'
import SessionController from './SessionController.jsx'
import ClassDashboard from './ClassDashboard.jsx'
import TeacherGuide from './TeacherGuide.jsx'

export default function TeacherApp() {
  const [sessionId, setSessionId] = useState(null)
  const [tab, setTab] = useState('info')

  const joinUrl = `${window.location.origin}/join`

  if (!sessionId) {
    return <ClassSetup onSessionCreated={setSessionId} />
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* 상단 바 */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        height: '52px',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-muted)' }}>
          🧠 VPython
        </span>

        <div style={{ display: 'flex', gap: '4px' }}>
          {[['info', '🔗 접속 안내'], ['battle', '🎮 수업 진행'], ['guide', '📖 안내서']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius)',
                border: 'none',
                background: tab === key ? 'var(--accent)' : 'transparent',
                color: tab === key ? 'white' : 'var(--text-muted)',
                fontWeight: tab === key ? 600 : 400,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>학생 접속:</span>
          <code
            onClick={() => navigator.clipboard?.writeText(joinUrl)}
            title="클릭하여 복사"
            style={{
              padding: '4px 10px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              fontSize: '0.8125rem',
              color: 'var(--accent-hover)',
              cursor: 'pointer',
            }}
          >
            {joinUrl}
          </code>
        </div>
      </header>

      {/* 접속 안내 탭 */}
      {tab === 'info' && (
        <div style={{ padding: '32px', maxWidth: '720px', margin: '0 auto', width: '100%' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '20px' }}>
            학생 접속 안내
          </h2>

          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            marginBottom: '24px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
              아래 주소를 칠판에 적거나 공유하세요
            </p>
            <div style={{
              fontSize: '1.375rem',
              fontWeight: 700,
              color: 'var(--accent-hover)',
              marginBottom: '14px',
              wordBreak: 'break-all',
            }}>
              {joinUrl}
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(joinUrl)}
              style={{
                padding: '8px 24px',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              📋 복사
            </button>
          </div>

          <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '12px' }}>
            팀 구성 — 학생이 접속 후 자기 팀 이름 클릭
          </p>
          <TeamList sessionId={sessionId} />

          <button
            onClick={() => setTab('battle')}
            style={{
              marginTop: '24px',
              width: '100%',
              padding: '12px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🎮 수업 진행 화면으로 →
          </button>
        </div>
      )}

      {/* 안내서 탭 */}
      {tab === 'guide' && <TeacherGuide />}

      {/* 수업 진행 탭 */}
      {tab === 'battle' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr',
          flex: 1,
          overflow: 'hidden',
        }}>
          <aside style={{
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            overflowY: 'auto',
          }}>
            <SessionController sessionId={sessionId} />
          </aside>
          <main style={{ overflowY: 'auto', padding: '24px' }}>
            <ClassDashboard sessionId={sessionId} />
          </main>
        </div>
      )}
    </div>
  )
}

function TeamList({ sessionId }) {
  const [teams, setTeams] = useState([])

  useEffect(() => {
    fetch(`/api/dashboard/${sessionId}`)
      .then((r) => r.json())
      .then((d) => setTeams(d.teams || []))
      .catch(() => {})
  }, [sessionId])

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
      gap: '8px',
    }}>
      {teams.map((t) => (
        <div
          key={t.id}
          style={{
            padding: '10px 12px',
            background: 'var(--surface)',
            border: `1px solid ${t.color}`,
            borderRadius: 'var(--radius)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t.name}</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            {(t.members || []).join(' · ')}
          </div>
        </div>
      ))}
    </div>
  )
}