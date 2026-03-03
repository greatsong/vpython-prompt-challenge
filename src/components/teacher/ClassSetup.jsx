import { useState } from 'react'

export default function ClassSetup({ onSessionCreated }) {
  const [teacherCode, setTeacherCode] = useState('')
  const [studentText, setStudentText] = useState('')
  const [sessionNumber, setSessionNumber] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const SESSION_LABELS = [
    '', '1. 말로 만드는 세계', '2. 코드가 보이기 시작한다',
    '3. 내 손으로 고치다', '4. 백지에서 짓다', '5. 프롬프트 배틀 2.0',
  ]

  const handleStart = async () => {
    if (!teacherCode.trim()) return setError('수업 코드를 입력해주세요')
    const students = studentText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (students.length < 2) return setError('학생 명단을 2명 이상 입력해주세요')

    setLoading(true)
    setError('')

    try {
      // 세션 생성
      const r1 = await fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherCode, sessionNumber }),
      })
      const { sessionId } = await r1.json()

      // 팀 자동 구성
      await fetch(`/api/session/${sessionId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students }),
      })

      onSessionCreated(sessionId)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
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
        maxWidth: '480px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
      }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>
          🧠 VPython 프롬프트 챌린지
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '28px' }}>
          교사 화면 — 수업 시작 설정
        </p>

        {/* 수업 코드 */}
        <label style={labelStyle}>수업 코드</label>
        <input
          value={teacherCode}
          onChange={(e) => setTeacherCode(e.target.value)}
          placeholder="예: 1반3교시"
          style={inputStyle}
        />

        {/* 세션 선택 */}
        <label style={{ ...labelStyle, marginTop: '16px' }}>세션 선택</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
          {[1,2,3,4,5].map((n) => (
            <button
              key={n}
              onClick={() => setSessionNumber(n)}
              style={{
                padding: '8px 4px',
                borderRadius: 'var(--radius)',
                border: '1px solid',
                borderColor: sessionNumber === n ? 'var(--accent)' : 'var(--border)',
                background: sessionNumber === n ? 'var(--accent)' : 'transparent',
                color: sessionNumber === n ? 'white' : 'var(--text-muted)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
          {SESSION_LABELS[sessionNumber]}
        </p>

        {/* 학생 명단 */}
        <label style={{ ...labelStyle, marginTop: '16px' }}>학생 명단</label>
        <textarea
          value={studentText}
          onChange={(e) => setStudentText(e.target.value)}
          placeholder={'이름을 한 줄에 한 명씩 입력\n예:\n김철수\n이영희\n박민준\n...'}
          rows={10}
          style={{
            ...inputStyle,
            resize: 'vertical',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
          }}
        />
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          {studentText.split('\n').filter((s) => s.trim()).length}명 입력됨 →{' '}
          {Math.floor(studentText.split('\n').filter((s) => s.trim()).length / 2)}팀 구성 예정
        </p>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginTop: '12px' }}>
            ⚠ {error}
          </p>
        )}

        <button
          onClick={handleStart}
          disabled={loading}
          style={{
            marginTop: '20px',
            width: '100%',
            padding: '12px',
            background: loading ? 'var(--surface2)' : 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '세션 생성 중...' : '🚀 수업 시작'}
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
  padding: '10px 12px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  fontSize: '0.9375rem',
  outline: 'none',
}
