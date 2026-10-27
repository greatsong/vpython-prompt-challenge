import { useNavigate } from 'react-router-dom'
import TeacherGuide from './teacher/TeacherGuide.jsx'

export default function GuidePage() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* 상단 바 */}
      <header className="guide-header" style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        height: '52px',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--text)' }}>
          🧠 VPython
        </span>
        <span style={{
          padding: '5px 14px',
          borderRadius: 'var(--radius-pill)',
          background: '#FDD98A',
          color: 'var(--text)',
          fontWeight: 800,
          fontSize: '0.875rem',
        }}>
          📖 교사 안내서
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            onClick={() => navigate('/training')}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-btn)',
              border: '1.5px solid var(--border)',
              background: '#fff',
              color: 'var(--text)',
              fontSize: '0.8125rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🎓 연수 입장
          </button>
          <button
            onClick={() => navigate('/teacher')}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-btn)',
              border: '1.5px solid var(--gold)',
              background: '#fff',
              color: 'var(--accent-text)',
              fontSize: '0.8125rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            수업 시작하기 →
          </button>
        </div>
      </header>

      {/* 안내서 본문 — 로그인 없이 보는 공개 안내서는 연수 섹션부터 연다 */}
      <TeacherGuide audience="public" />
    </div>
  )
}
