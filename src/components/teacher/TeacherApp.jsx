import { useState, useEffect } from 'react'
import ClassSetup from './ClassSetup.jsx'
import SessionController from './SessionController.jsx'
import ClassDashboard from './ClassDashboard.jsx'
import TeacherGuide from './TeacherGuide.jsx'
import { setTeacherToken, getTeacherToken, clearTeacherToken, teacherFetch } from '../../utils/teacherAuth.js'

const AUTH_KEY = 'vpython_teacher_auth'
// 진행 중인 수업 정보 — 새로고침·재접속 후에도 같은 세션으로 복귀하기 위해 localStorage에 보관
const SESSION_KEY = 'vpython_teacher_session'

function loadSavedSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    return saved?.sessionId ? saved : null
  } catch {
    return null
  }
}

function saveSession(sessionId, teacherCode) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId, teacherCode }))
  } catch { /* ignore */ }
}

function clearSavedSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch { /* ignore */ }
}

function TeacherGate({ onAuth }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!pin.trim()) return setError('인증 코드를 입력해주세요')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.token) setTeacherToken(data.token)
        sessionStorage.setItem(AUTH_KEY, Date.now().toString())
        onAuth()
      } else {
        const data = await res.json()
        setError(data.error || '인증 실패')
      }
    } catch {
      setError('서버 연결 오류')
    }
    setLoading(false)
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
        maxWidth: '380px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔐</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '6px' }}>
          교사 인증
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '24px' }}>
          교사용 인증 코드를 입력해주세요
        </p>

        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="인증 코드"
          // 인증 코드는 영문·숫자를 섞어 쓸 수 있고 길이 제한도 서버가 정한다.
          // 여기서 좁게 잘라내면 뒷글자가 조용히 사라져 인증이 실패한다.
          maxLength={64}
          autoFocus
          style={{
            width: '100%',
            padding: '14px 16px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            fontSize: '1.25rem',
            textAlign: 'center',
            letterSpacing: '0.3em',
            fontWeight: 700,
            outline: 'none',
          }}
        />

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginTop: '10px' }}>
            {error}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            marginTop: '16px',
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
          {loading ? '확인 중...' : '인증'}
        </button>
      </div>
    </div>
  )
}

export default function TeacherApp() {
  // 'checking' | 'authed' | 'unauthed'
  // sessionStorage 타임스탬프만으로는 서버 재시작·토큰 만료를 알 수 없으므로
  // 마운트 시 /api/auth/verify로 실제 토큰 유효성을 확인한다.
  const [authState, setAuthState] = useState('checking')
  const [sessionId, setSessionId] = useState(null)
  const [restoringSession, setRestoringSession] = useState(true)
  const [sessionFinished, setSessionFinished] = useState(false)
  const [tab, setTab] = useState('info')

  const handleAuthExpired = () => {
    clearTeacherToken()
    sessionStorage.removeItem(AUTH_KEY)
    setAuthState('unauthed')
  }

  // 1) 토큰 실검증
  useEffect(() => {
    let cancelled = false
    const verify = async () => {
      if (!getTeacherToken()) {
        clearTeacherToken()
        sessionStorage.removeItem(AUTH_KEY)
        if (!cancelled) setAuthState('unauthed')
        return
      }
      try {
        const res = await teacherFetch('/api/auth/verify')
        if (cancelled) return
        if (res.ok) {
          setAuthState('authed')
        } else {
          clearTeacherToken()
          sessionStorage.removeItem(AUTH_KEY)
          setAuthState('unauthed')
        }
      } catch {
        if (!cancelled) {
          clearTeacherToken()
          sessionStorage.removeItem(AUTH_KEY)
          setAuthState('unauthed')
        }
      }
    }
    verify()
    return () => { cancelled = true }
  }, [])

  // 2) 인증 후 저장된 수업 복귀
  useEffect(() => {
    if (authState !== 'authed') {
      if (authState === 'unauthed') setRestoringSession(false)
      return
    }
    let cancelled = false
    const restore = async () => {
      const saved = loadSavedSession()
      if (!saved) {
        if (!cancelled) setRestoringSession(false)
        return
      }
      try {
        const res = await fetch(`/api/session/${saved.sessionId}`)
        if (cancelled) return
        if (res.ok) {
          const session = await res.json()
          if (session.status !== 'ended') {
            setSessionId(saved.sessionId)
            setRestoringSession(false)
            return
          }
        }
      } catch { /* 네트워크 오류 시에도 설정 화면으로 */ }
      if (cancelled) return
      clearSavedSession()
      setRestoringSession(false)
    }
    restore()
    return () => { cancelled = true }
  }, [authState])

  const joinUrl = `${window.location.origin}/join`

  // 학생이 휴대폰으로 스캔할 QR — 수업 코드가 담겨 있어 코드 입력 단계가 사라진다
  const [joinQr, setJoinQr] = useState(null)
  useEffect(() => {
    if (!sessionId) { setJoinQr(null); return }
    let cancelled = false
    teacherFetch(`/api/session/${sessionId}/join-qr`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.qr) setJoinQr(d) })
      .catch(() => { /* QR을 못 만들어도 주소 안내는 그대로 쓸 수 있다 */ })
    return () => { cancelled = true }
  }, [sessionId])

  const handleSessionCreated = ({ sessionId: id, teacherCode }) => {
    if (!id) return
    saveSession(id, teacherCode)
    setSessionId(id)
    setTab('info')
  }

  // 전체 수업 종료 — 저장된 수업 정보를 즉시 지운다.
  // 대시보드는 최종 순위 표시·CSV 자동 다운로드를 끝내야 하므로 화면은 유지하고,
  // 상단의 '새 수업 준비' 버튼으로 설정 화면에 복귀한다.
  const handleFinalEnd = () => {
    clearSavedSession()
    setSessionFinished(true)
  }

  const handleNewClass = () => {
    clearSavedSession()
    setSessionFinished(false)
    setSessionId(null)
    setTab('info')
  }

  if (authState === 'checking' || (authState === 'authed' && restoringSession)) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: 'var(--text-muted)',
      }}>
        확인 중...
      </div>
    )
  }

  if (authState !== 'authed') {
    return <TeacherGate onAuth={() => { setRestoringSession(true); setAuthState('authed') }} />
  }

  if (!sessionId) {
    return <ClassSetup onSessionCreated={handleSessionCreated} onAuthExpired={handleAuthExpired} />
  }

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
          {sessionFinished && (
            <button
              onClick={handleNewClass}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius)',
                border: 'none',
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              🆕 새 수업 준비
            </button>
          )}
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
        <div style={{ padding: '32px', maxWidth: '720px', margin: '0 auto', width: '100%', overflowY: 'auto', flex: 1, minHeight: 0 }}>
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
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              휴대폰 카메라로 QR을 비추면 수업 코드까지 자동으로 입력됩니다
            </p>

            {/* QR — 교실 뒤에서도 읽히도록 크게. 어두운 테마에서도 스캔되게 흰 바탕을 깐다 */}
            {joinQr ? (
              <img
                src={joinQr.qr}
                alt="학생 참여 QR코드"
                style={{
                  width: 'min(260px, 60vw)',
                  aspectRatio: '1 / 1',
                  display: 'block',
                  margin: '0 auto 14px',
                  background: '#fff',
                  padding: '10px',
                  borderRadius: 'var(--radius)',
                }}
              />
            ) : (
              <div style={{
                width: 'min(260px, 60vw)',
                aspectRatio: '1 / 1',
                margin: '0 auto 14px',
                background: 'var(--surface2)',
                borderRadius: 'var(--radius)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8125rem', color: 'var(--text-muted)',
              }}>
                QR 생성 중…
              </div>
            )}

            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              카메라가 안 되면 아래 주소로 직접 접속하세요
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
          minHeight: 0,
          overflow: 'hidden',
        }}>
          <aside style={{
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            overflowY: 'auto',
            minHeight: 0,
          }}>
            <SessionController
              sessionId={sessionId}
              onFinalEnd={handleFinalEnd}
              onAuthExpired={handleAuthExpired}
            />
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
    teacherFetch(`/api/dashboard/${sessionId}`)
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
