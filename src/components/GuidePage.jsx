import { useNavigate } from 'react-router-dom'
import TeacherGuide from './teacher/TeacherGuide.jsx'

export default function GuidePage() {
  const navigate = useNavigate()

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
        <span style={{
          padding: '6px 14px',
          borderRadius: 'var(--radius)',
          background: 'var(--accent)',
          color: 'white',
          fontWeight: 600,
          fontSize: '0.875rem',
        }}>
          📖 교사 안내서
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            onClick={() => navigate('/teacher')}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--accent)',
              background: 'transparent',
              color: 'var(--accent-hover)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            수업 시작하기 →
          </button>
        </div>
      </header>

      {/* 안내서 본문 */}
      <TeacherGuide />
    </div>
  )
}
