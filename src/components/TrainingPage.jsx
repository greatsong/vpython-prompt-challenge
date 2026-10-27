import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { setTeacherToken, setTeacherScope } from '../utils/teacherAuth.js'

// TeacherApp.jsx의 PIN 로그인과 같은 키 — 교사 화면이 이 값을 함께 확인한다
const AUTH_KEY = 'vpython_teacher_auth'

// 연수 참가자 식별자 — 같은 브라우저로 다시 들어오면 서버가 같은 사람으로 보고 자기 수업을 이어 준다.
// 토큰은 입장할 때마다 새로 받지만 이 값은 localStorage에 남아 재입장 후에도 그대로다.
const TRAINEE_KEY = 'vpython_trainee_id'

function getTraineeId() {
  try {
    let id = localStorage.getItem(TRAINEE_KEY)
    if (!id) {
      id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
      localStorage.setItem(TRAINEE_KEY, id)
    }
    return id
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등) — 식별자 없이 입장한다
    return undefined
  }
}

// QR로 들어오면 주소의 ?code= 값을 입장 코드로 채운다
function codeFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('code')?.trim() || ''
  } catch {
    return ''
  }
}

/**
 * 교사 연수 입장 화면 (/training)
 *
 * 운영 PIN 대신 연수용 입장 코드로 교사 토큰(scope: 'training')을 받아
 * 교사 화면(/teacher)의 수업 생성 단계로 보낸다. 토큰 저장·검증은 교사 화면과 같은 방식을 쓴다.
 */
export default function TrainingPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState(codeFromUrl)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const autoTried = useRef(false)

  const submit = async (value) => {
    const trimmed = (value ?? code).trim()
    if (!trimmed) return setError('입장 코드를 입력해 주세요')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed, traineeId: getTraineeId() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.token) {
        setTeacherToken(data.token)
        setTeacherScope(data.scope || 'training')
        sessionStorage.setItem(AUTH_KEY, Date.now().toString())
        // 저장된 수업은 지우지 않는다 — 같은 traineeId면 서버가 자기 수업으로 이어 준다.
        // 접근할 수 없는 수업이면 교사 화면의 복원 단계가 안내 후 정리한다.
        navigate('/teacher', { replace: true })
        return
      }
      setError(data.error || `입장하지 못했습니다 (HTTP ${res.status})`)
    } catch {
      setError('서버 연결 오류')
    }
    setLoading(false)
  }

  // ?code= 로 들어오면 한 번 자동 제출한다. 실패하면 입력 화면에 남는다.
  useEffect(() => {
    if (autoTried.current) return
    autoTried.current = true
    const initial = codeFromUrl()
    if (initial) submit(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        maxWidth: '380px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        padding: '32px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🎓</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '24px' }}>
          교사 연수 입장
        </h1>

        <label
          htmlFor="training-code"
          style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textAlign: 'left' }}
        >
          입장 코드
        </label>
        <input
          id="training-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && submit()}
          placeholder="입장 코드"
          maxLength={64}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: '100%',
            padding: '14px 16px',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            fontSize: '1.125rem',
            textAlign: 'center',
            fontWeight: 700,
            outline: 'none',
          }}
        />

        {error && (
          <p style={{ color: 'var(--danger-text)', fontSize: '0.8125rem', marginTop: '10px' }}>
            {error}
          </p>
        )}

        <button
          onClick={() => submit()}
          disabled={loading}
          style={{
            marginTop: '16px',
            width: '100%',
            padding: '12px',
            background: loading ? 'var(--surface2)' : 'var(--btn-primary-bg)',
            color: loading ? 'var(--text-muted)' : 'var(--btn-primary-text)',
            border: 'none',
            borderRadius: 'var(--radius-btn)',
            boxShadow: loading ? 'none' : '0 6px 18px var(--shadow)',
            fontSize: '1rem',
            fontWeight: 800,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '확인 중...' : '입장하기'}
        </button>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '20px', lineHeight: 1.6 }}>
          학생 역할로 참여하려면 <Link to="/join" style={{ color: 'var(--accent-text)', fontWeight: 700 }}>/join</Link> 에서 수업코드를 입력하세요
        </p>
      </div>
    </div>
  )
}
