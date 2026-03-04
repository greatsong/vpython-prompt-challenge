import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const LS_TEACHER_CODE = 'vpython_teacher_code'

const WELCOME_EMOJIS = ['🎉', '🚀', '⭐', '🔥', '💎', '🌟', '✨', '🎯', '🧠', '💡']
const CONFETTI_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4']

function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2 + Math.random() * 2,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + Math.random() * 8,
  }))

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 999, overflow: 'hidden' }}>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: 0,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: p.color,
            borderRadius: p.id % 3 === 0 ? '50%' : '2px',
            animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  )
}

export default function JoinPage() {
  const navigate = useNavigate()
  const [teacherCode, setTeacherCode] = useState(() => localStorage.getItem(LS_TEACHER_CODE) || '')
  const [studentNumber, setStudentNumber] = useState('')
  const [studentName, setStudentName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [welcome, setWelcome] = useState(null) // { teamId, teamName, emoji }

  const handleJoin = async () => {
    if (!teacherCode.trim()) return setError('수업코드를 입력해주세요')
    if (!studentNumber.trim()) return setError('학번을 입력해주세요')
    if (!studentName.trim()) return setError('이름을 입력해주세요')

    setLoading(true)
    setError('')
    localStorage.setItem(LS_TEACHER_CODE, teacherCode.trim())

    try {
      const res = await fetch('/api/session/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherCode: teacherCode.trim(),
          studentNumber: studentNumber.trim(),
          studentName: studentName.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '등록 실패')
        setLoading(false)
        return
      }

      if (data.alreadyRegistered) {
        navigate(`/team/${data.teamId}`)
        return
      }

      // 환영 화면 표시 후 이동
      const emoji = WELCOME_EMOJIS[Math.floor(Math.random() * WELCOME_EMOJIS.length)]
      setWelcome({ teamId: data.teamId, emoji })
      setTimeout(() => navigate(`/team/${data.teamId}`), 2500)
    } catch (e) {
      setError('서버 연결 실패. 새로고침 후 다시 시도해주세요.')
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleJoin()
  }

  // 환영 화면
  if (welcome) {
    return (
      <>
        <Confetti />
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          gap: '16px',
        }}>
          <div style={{
            fontSize: '4rem',
            animation: 'bounceIn 0.6s ease-out',
          }}>
            {welcome.emoji}
          </div>
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            animation: 'slideUp 0.5s 0.3s ease-out both',
          }}>
            환영합니다, {studentName}!
          </h1>
          <p style={{
            color: 'var(--text-muted)',
            fontSize: '1rem',
            animation: 'slideUp 0.5s 0.5s ease-out both',
          }}>
            잠시 후 팀 화면으로 이동합니다...
          </p>
          <div style={{
            marginTop: '8px',
            padding: '10px 24px',
            background: 'var(--accent)',
            borderRadius: 'var(--radius-lg)',
            fontSize: '0.875rem',
            fontWeight: 600,
            animation: 'slideUp 0.5s 0.7s ease-out both, pulse 1.5s 1.2s ease-in-out infinite',
          }}>
            준비되셨나요? 🧠
          </div>
        </div>
      </>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        animation: 'fadeIn 0.4s ease-out',
      }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '6px', textAlign: 'center' }}>
          🧠 VPython 프롬프트 챌린지
        </h1>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '28px', fontSize: '0.875rem' }}>
          학번과 이름을 입력하고 참여하세요
        </p>

        {/* 수업코드 */}
        <label style={labelStyle}>수업코드</label>
        <input
          value={teacherCode}
          onChange={(e) => setTeacherCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="선생님이 알려준 코드 입력"
          style={inputStyle}
          autoFocus
        />

        {/* 학번 */}
        <label style={{ ...labelStyle, marginTop: '16px' }}>학번</label>
        <input
          value={studentNumber}
          onChange={(e) => setStudentNumber(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="예: 10101"
          style={inputStyle}
          inputMode="numeric"
        />

        {/* 이름 */}
        <label style={{ ...labelStyle, marginTop: '16px' }}>이름</label>
        <input
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="예: 김철수"
          style={inputStyle}
        />

        {error && (
          <p style={{
            color: 'var(--danger)',
            fontSize: '0.875rem',
            marginTop: '12px',
            animation: 'fadeIn 0.3s',
          }}>
            {error}
          </p>
        )}

        <button
          onClick={handleJoin}
          disabled={loading}
          style={{
            marginTop: '24px',
            width: '100%',
            padding: '14px',
            background: loading ? 'var(--surface2)' : 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: '1.0625rem',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s, transform 0.1s',
          }}
          onMouseDown={(e) => !loading && (e.currentTarget.style.transform = 'scale(0.97)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {loading ? '참여 중...' : '🚀 참여하기'}
        </button>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: '6px',
  letterSpacing: '0.05em',
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  fontSize: '1rem',
  outline: 'none',
}