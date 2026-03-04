import { useEffect, useState } from 'react'

/**
 * QRDisplay
 * 팀 구성 완료 후 전체 팀 QR코드를 한 화면에 표시
 * 교사가 프로젝터로 보여주면 학생들이 스캔하여 팀 화면 접속
 */
export default function QRDisplay({ sessionId, teams, onEnterClass }) {
  const [qrMap, setQrMap] = useState({})   // { teamId: dataURL }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      // 팀별 QR 생성
      const entries = await Promise.all(
        teams.map(async (team) => {
          const res = await fetch(`/api/session/${sessionId}/qr?teamId=${team.id}`)
          const { qr } = await res.json()
          return [team.id, qr]
        })
      )
      setQrMap(Object.fromEntries(entries))
      setLoading(false)
    }
    init()
  }, [sessionId, teams])

  if (loading) {
    return (
      <div style={centerStyle}>
        <p style={{ color: 'var(--text-muted)' }}>QR 코드 생성 중...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>팀 접속 QR코드</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
            각 팀이 QR코드를 스캔하거나 아래 주소로 직접 접속하세요
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* 직접 접속 주소 */}
          <div style={{
            padding: '8px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
          }}>
            {window.location.origin}/team/<span style={{ color: 'var(--accent-hover)' }}>팀번호</span>
          </div>
          <button
            onClick={onEnterClass}
            style={{
              padding: '10px 20px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.9375rem',
            }}
          >
            수업 시작 →
          </button>
        </div>
      </div>

      {/* QR 그리드 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '12px',
      }}>
        {teams.map((team) => (
          <div
            key={team.id}
            style={{
              background: 'var(--surface)',
              border: `2px solid ${team.color}`,
              borderRadius: 'var(--radius-lg)',
              padding: '12px',
              textAlign: 'center',
            }}
          >
            {/* 팀 이름 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px', marginBottom: '8px',
            }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: team.color, flexShrink: 0,
              }} />
              <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{team.name}</span>
            </div>

            {/* 팀원 */}
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
              {(team.members || []).join(' · ')}
            </p>

            {/* QR 코드 */}
            {qrMap[team.id] ? (
              <img
                src={qrMap[team.id]}
                alt={`${team.name} QR`}
                style={{
                  width: '100%',
                  maxWidth: '120px',
                  borderRadius: '6px',
                  background: 'white',
                  padding: '4px',
                }}
              />
            ) : (
              <div style={{
                width: '120px', height: '120px',
                background: 'var(--surface2)',
                borderRadius: '6px',
                margin: '0 auto',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>생성 중</span>
              </div>
            )}

            {/* 팀 번호 (직접 입력용) */}
            <p style={{
              marginTop: '8px',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              fontFamily: 'monospace',
            }}>
              /team/{team.id}
            </p>
          </div>
        ))}
      </div>

      {/* WiFi 실패 플랜B 안내 */}
      <div style={{
        marginTop: '24px',
        padding: '12px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        fontSize: '0.8125rem',
        color: 'var(--text-muted)',
      }}>
        💡 <strong>접속 불가 시</strong>: 칠판에 <code style={{ color: 'var(--accent-hover)' }}>{window.location.origin}</code> 와 팀 번호를 기재하거나, 교사 핫스팟(VPython-Class)으로 연결 후 재시도
      </div>
    </div>
  )
}

const centerStyle = {
  height: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
