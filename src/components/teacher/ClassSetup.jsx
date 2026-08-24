import { useState, useEffect, useRef } from 'react'
import { teacherFetch } from '../../utils/teacherAuth.js'

export default function ClassSetup({ onSessionCreated, onAuthExpired }) {
  const [teacherCode, setTeacherCode] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyStatus, setApiKeyStatus] = useState('unchecked') // unchecked | checking | valid | error
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // 수업 화면으로 넘어가는 중에는 버튼을 다시 열지 않는다
  const transitioningRef = useRef(false)

  // 서버에 이미 API 키가 설정되어 있는지 확인
  useEffect(() => {
    fetch('/api/config/apikey/status')
      .then(r => r.json())
      .then(({ configured }) => {
        setApiKeyConfigured(configured)
        if (configured) setApiKeyStatus('valid')
      })
      .catch(() => {})
  }, [])

  const handleValidateKey = async () => {
    if (!apiKey.trim()) return setError('API 키를 입력해주세요')

    setApiKeyStatus('checking')
    setError('')

    try {
      const res = await teacherFetch('/api/config/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      const data = await res.json()

      if (res.ok) {
        setApiKeyStatus('valid')
        setApiKeyConfigured(true)
        if (data.warning) setError(data.warning)
      } else {
        setApiKeyStatus('error')
        setError(data.error || 'API 키 검증 실패')
      }
    } catch (e) {
      setApiKeyStatus('error')
      setError('서버 연결 실패: ' + e.message)
    }
  }

  // forceNew=true면 같은 수업 코드의 기존 세션을 종료하고 완전히 새로 시작한다.
  const handleStart = async ({ forceNew = false } = {}) => {
    if (!teacherCode.trim()) return setError('수업 코드를 입력해주세요')
    if (apiKeyStatus !== 'valid') return setError('먼저 API 키를 설정해주세요')

    if (forceNew) {
      const ok = window.confirm(
        '새 수업으로 시작하면 같은 수업 코드의 기존 세션이 종료되고 팀 구성도 초기화됩니다.\n계속할까요?'
      )
      if (!ok) return
    }

    setLoading(true)
    setError('')
    setNotice('')

    try {
      const r1 = await teacherFetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherCode: teacherCode.trim(), forceNew }),
      })

      if (!r1.ok) {
        if (r1.status === 401) {
          setError('인증이 만료되었습니다. 다시 로그인해주세요')
          if (onAuthExpired) onAuthExpired()
          return
        }
        const data = await r1.json().catch(() => ({}))
        setError(data.error || `수업을 시작하지 못했습니다 (HTTP ${r1.status})`)
        return
      }

      const data = await r1.json().catch(() => ({}))
      if (!data.sessionId) {
        setError('서버가 수업 정보를 돌려주지 않았습니다. 다시 시도해주세요.')
        return
      }

      const payload = { sessionId: data.sessionId, teacherCode: data.teacherCode || teacherCode.trim() }
      if (data.resumed) {
        // 이어가기임을 교사가 인지할 수 있도록 잠깐 안내한 뒤 진행
        // (안내를 보여주는 동안 버튼은 계속 잠가둔다)
        transitioningRef.current = true
        setNotice(`기존 수업을 이어갑니다 (팀 ${data.teamCount ?? 0}팀 유지)`)
        setTimeout(() => onSessionCreated(payload), 1200)
        return
      }
      transitioningRef.current = true
      onSessionCreated(payload)
    } catch (e) {
      setError('서버 연결 실패: ' + e.message)
    } finally {
      if (!transitioningRef.current) setLoading(false)
    }
  }

  const keyStatusIcon = {
    unchecked: '',
    checking: '...',
    valid: '\u2705',
    error: '\u274C',
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

        {/* Claude API 키 */}
        <label style={labelStyle}>
          Claude API 키 {keyStatusIcon[apiKeyStatus]}
        </label>
        {apiKeyConfigured && apiKeyStatus === 'valid' && !apiKey ? (
          <div style={{
            padding: '10px 12px',
            background: 'var(--bg)',
            border: '1px solid #22c55e',
            borderRadius: 'var(--radius)',
            fontSize: '0.875rem',
            color: '#22c55e',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>API 키 설정됨</span>
            <button
              onClick={() => { setApiKeyConfigured(false); setApiKeyStatus('unchecked') }}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline',
              }}
            >
              변경
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setApiKeyStatus('unchecked') }}
              placeholder="sk-ant-..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={handleValidateKey}
              disabled={apiKeyStatus === 'checking'}
              style={{
                padding: '10px 16px',
                background: apiKeyStatus === 'checking' ? 'var(--surface2)' : 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: apiKeyStatus === 'checking' ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {apiKeyStatus === 'checking' ? '확인 중...' : '확인'}
            </button>
          </div>
        )}
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          Anthropic Claude API 키 (console.anthropic.com에서 발급)
        </p>

        {/* 구분선 */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0' }} />

        {/* 수업 코드 */}
        <label style={labelStyle}>수업 코드</label>
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

        {notice && (
          <p style={{ color: 'var(--success)', fontSize: '0.875rem', marginTop: '12px' }}>
            {notice}
          </p>
        )}

        <button
          onClick={() => handleStart()}
          disabled={loading || apiKeyStatus !== 'valid'}
          style={{
            marginTop: '24px',
            width: '100%',
            padding: '12px',
            background: (loading || apiKeyStatus !== 'valid') ? 'var(--surface2)' : 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: (loading || apiKeyStatus !== 'valid') ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '준비 중...' : apiKeyStatus !== 'valid' ? 'API 키를 먼저 설정하세요' : '수업 시작 (이어가기)'}
        </button>

        <button
          onClick={() => handleStart({ forceNew: true })}
          disabled={loading || apiKeyStatus !== 'valid'}
          style={{
            marginTop: '8px',
            width: '100%',
            padding: '10px',
            background: 'transparent',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: (loading || apiKeyStatus !== 'valid') ? 'not-allowed' : 'pointer',
          }}
        >
          새 수업으로 시작 (기존 세션 초기화)
        </button>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'center' }}>
          같은 수업 코드로 시작하면 기존 수업과 팀 구성을 그대로 이어갑니다
        </p>
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