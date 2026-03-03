export default function WaitingScreen({ team }) {
  return (
    <div style={{
      minHeight: 'calc(100vh - 53px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      padding: '32px',
    }}>
      <div style={{
        width: '80px', height: '80px',
        background: team.color,
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2rem',
        boxShadow: `0 0 30px ${team.color}66`,
        animation: 'pulse 2s ease-in-out infinite',
      }}>
        ⏳
      </div>

      <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>준비 완료!</h2>
      <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
        선생님이 수업을 시작하면 자동으로 화면이 전환됩니다.
      </p>

      <div style={{
        marginTop: '16px',
        padding: '16px 24px',
        background: 'var(--surface)',
        border: `1px solid ${team.color}`,
        borderRadius: 'var(--radius-lg)',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '4px' }}>우리 팀</p>
        <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>{team.name}</p>
        <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
          {(team.members || []).join(' & ')}
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  )
}
