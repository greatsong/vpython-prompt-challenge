import { useState } from 'react'

const LS_API_KEY = 'vpython_api_key'

export default function ClassSetup({ onSessionCreated }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_API_KEY) || '')
  const [teacherCode, setTeacherCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showKey, setShowKey] = useState(false)

  const handleStart = async () => {
    if (!apiKey.trim()) return setError('API 키를 입력해주세요')
    if (!teacherCode.trim()) return setError('수업 코드를 입력해주세요')

    localStorage.setItem(LS_API_KEY, apiKey.trim())

    setLoading(true)
    setError('')

    try {
      const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey.trim(),
      }

      const r1 = await fetch('/api/session/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({ teacherCode }),
      })
      const { sessionId } = await r1.json()

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
          VPython 프롬프트 챌린지
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '28px' }}>
          교사 화면 — 수업 시작 설정
        </p>

        {/* API 키 */}
        <label style={labelStyle}>Anthropic API 키</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            style={{ ...inputStyle, paddingRight: '70px' }}
          />
          <button
            onClick={() => setShowKey(!showKey)}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              padding: '2px 6px',
            }}
          >
            {showKey ? '숨기기' : '보기'}
          </button>
        </div>
        {apiKey && localStorage.getItem(LS_API_KEY) === apiKey && (
          <p style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '4px' }}>
            저장된 키 사용 중
          </p>
        )}

        {/* 수업 코드 */}
        <label style={{ ...labelStyle, marginTop: '16px' }}>수업 코드</label>
        <input
          value={teacherCode}
          onChange={(e) => setTeacherCode(e.target.value)}
          placeholder="예: 1반3교시"
          style={inputStyle}
        />
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          학생들이 이 코드를 입력해서 수업에 참여합니다
        </p>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginTop: '12px' }}>
            {error}
          </p>
        )}

        <button
          onClick={handleStart}
          disabled={loading}
          style={{
            marginTop: '24px',
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
          {loading ? '준비 중...' : '수업 시작'}
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