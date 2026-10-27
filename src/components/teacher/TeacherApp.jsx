import { useState, useEffect } from 'react'
import ClassSetup from './ClassSetup.jsx'
import SessionController from './SessionController.jsx'
import ClassDashboard from './ClassDashboard.jsx'
import TeacherGuide from './TeacherGuide.jsx'
import { Link } from 'react-router-dom'
import {
  setTeacherToken, getTeacherToken, clearTeacherToken, teacherFetch, setTeacherScope, getTeacherScope,
  loadTeacherSession, saveTeacherSession, clearTeacherSession, migrateLegacyTeacherSession,
} from '../../utils/teacherAuth.js'
import { createSocket } from '../../utils/socket.js'

const AUTH_KEY = 'vpython_teacher_auth'
const INACCESSIBLE_SESSION_NOTICE = '이 수업에 접근할 수 없어 새 수업 준비 화면으로 이동합니다'
// 진행 중인 수업 정보 — 새로고침·재접속 후에도 같은 세션으로 복귀하기 위해 localStorage에 보관한다.
// 저장 키는 토큰 범위별로 나뉜다(vpython_teacher_session:admin / :training). 운영 PIN과 연수 입장을
// 같은 브라우저에서 오가도 서로의 수업을 덮어쓰지 않는다. 범위는 매 호출 시 sessionStorage에서 읽는다.
const loadSavedSession = () => loadTeacherSession(getTeacherScope())
const saveSession = (sessionId, teacherCode) => saveTeacherSession(sessionId, teacherCode, getTeacherScope())
const clearSavedSession = () => clearTeacherSession(getTeacherScope())

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
        // 범위를 바꾸기 전에 예전 공용 키를 운영(admin) 키로 옮겨 둔다
        migrateLegacyTeacherSession()
        setTeacherScope(data.scope || 'admin')
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
        boxShadow: 'var(--shadow-md)',
        padding: '32px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔐</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '6px' }}>
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
            background: 'var(--card2)',
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
          <p style={{ color: 'var(--danger-text)', fontSize: '0.8125rem', marginTop: '10px' }}>
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
          {loading ? '확인 중...' : '인증'}
        </button>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '16px' }}>
          연수 입장 코드를 받으셨다면 <Link to="/training" style={{ color: 'var(--accent-text)', fontWeight: 700 }}>연수 입장</Link>으로 들어오세요
        </p>
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
  // 학생이 입력할 수업코드 — '접속 안내' 탭에 크게 보여준다
  const [teacherCode, setTeacherCode] = useState('')
  const [restoringSession, setRestoringSession] = useState(true)
  const [sessionFinished, setSessionFinished] = useState(false)
  const [tab, setTab] = useState('info')
  // 'admin'(운영 PIN) | 'training'(연수 입장 코드) — verify 응답으로 확정한다
  const [scope, setScope] = useState(getTeacherScope)
  const trainingMode = scope === 'training'
  // 저장된 수업에 접근할 수 없어 수업 준비 화면으로 돌려보낼 때 보여 줄 안내
  const [accessNotice, setAccessNotice] = useState('')

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
          const data = await res.json().catch(() => ({}))
          if (cancelled) return
          const verifiedScope = data.scope || 'admin'
          setTeacherScope(verifiedScope)
          setScope(verifiedScope)
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
        // 교사 토큰을 함께 보내 이 수업을 다룰 수 있는지(canManage)도 받는다.
        // 다른 탭·다른 연수 토큰이 만든 수업이면 복원하지 않고 설정 화면으로 보낸다(403 먹통 방지).
        const res = await teacherFetch(`/api/session/${saved.sessionId}`)
        if (cancelled) return
        if (res.status === 404 || res.status === 403) {
          // 수업이 사라졌거나(서버 초기화 등) 다룰 수 없는 수업 — 안내 후 저장 정보를 지운다
          setAccessNotice(INACCESSIBLE_SESSION_NOTICE)
          clearSavedSession()
          setRestoringSession(false)
          return
        }
        if (res.ok) {
          const session = await res.json()
          if (cancelled) return
          if (session.canManage === false) {
            // 이 토큰(연수 참가자)이 다룰 수 없는 수업이다. 복원하면 교사 API가 모두 403이 되어
            // "QR 생성 중…"에서 멈추므로 안내 후 저장 정보를 지우고 수업 준비 화면으로 보낸다
            setAccessNotice(INACCESSIBLE_SESSION_NOTICE)
            clearSavedSession()
            setRestoringSession(false)
            return
          }
          if (session.status !== 'ended') {
            // 교사 API로 실제 접근이 되는지 대시보드 조회로 한 번 더 확인한다 (canManage를 안 주는 서버 대비)
            const dash = await teacherFetch(`/api/dashboard/${saved.sessionId}`).catch(() => null)
            if (cancelled) return
            if (dash && (dash.status === 403 || dash.status === 404)) {
              setAccessNotice(INACCESSIBLE_SESSION_NOTICE)
              clearSavedSession()
              setRestoringSession(false)
              return
            }
            setSessionId(saved.sessionId)
            setTeacherCode(session.teacher_code || saved.teacherCode || '')
            // 이미 챌린지를 시작한 수업이면 새로고침 뒤 '수업 진행' 탭으로 돌아간다
            if (session.challengeStarted) setTab('battle')
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

  // 수업 화면에 들어온 뒤에 접근이 막힌 경우(토큰이 바뀐 재입장 등) — 안내 후 수업 준비 화면으로 보낸다
  const abandonInaccessibleSession = () => {
    clearSavedSession()
    setAccessNotice(INACCESSIBLE_SESSION_NOTICE)
    setSessionFinished(false)
    setSessionId(null)
    setTeacherCode('')
    setTab('info')
  }

  const joinUrl = `${window.location.origin}/join`

  // 학생이 휴대폰으로 스캔할 QR — 수업 코드가 담겨 있어 코드 입력 단계가 사라진다
  const [joinQr, setJoinQr] = useState(null)
  // QR을 끝내 못 받은 경우 — "QR 생성 중…"에 멈춰 있지 않고 주소·수업코드 안내로 바꾼다
  const [joinQrFailed, setJoinQrFailed] = useState(false)
  useEffect(() => {
    setJoinQrFailed(false)
    if (!sessionId) { setJoinQr(null); return }
    let cancelled = false
    teacherFetch(`/api/session/${sessionId}/join-qr`)
      .then((r) => {
        if (cancelled) return null
        if (r.status === 401) {
          // 토큰 만료 — 교사 인증 화면으로 돌아간다
          handleAuthExpired()
          return null
        }
        if (r.status === 403 || r.status === 404) {
          // 이 수업에 접근할 수 없다 — "QR 생성 중…"에 갇히지 않게 수업 준비 화면으로 보낸다
          abandonInaccessibleSession()
          return null
        }
        if (!r.ok) {
          setJoinQrFailed(true)
          return null
        }
        return r.json()
      })
      .then((d) => {
        if (cancelled || !d) return
        if (d.qr) setJoinQr(d)
        else setJoinQrFailed(true)
        if (d.teacherCode) setTeacherCode(d.teacherCode)
      })
      // QR을 못 만들어도 주소 안내는 그대로 쓸 수 있다
      .catch(() => { if (!cancelled) setJoinQrFailed(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const handleSessionCreated = ({ sessionId: id, teacherCode }) => {
    if (!id) return
    saveSession(id, teacherCode)
    setAccessNotice('')
    setSessionId(id)
    setTeacherCode(teacherCode || '')
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
    setTeacherCode('')
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
    return <TeacherGate onAuth={() => { setScope(getTeacherScope()); setRestoringSession(true); setAuthState('authed') }} />
  }

  if (!sessionId) {
    return <ClassSetup onSessionCreated={handleSessionCreated} onAuthExpired={handleAuthExpired} trainingMode={trainingMode} entryNotice={accessNotice} />
  }

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 상단 바 */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 10px rgba(180, 140, 20, 0.08)',
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
        {trainingMode && (
          <span style={{
            fontSize: '0.6875rem', fontWeight: 800, padding: '2px 10px',
            borderRadius: 'var(--radius-pill)', background: '#FDD98A', color: 'var(--text)',
          }}>
            연수 모드
          </span>
        )}

        <div style={{ display: 'flex', gap: '4px' }}>
          {[['info', '🔗 접속 안내'], ['battle', '🎮 수업 진행'], ['guide', '📖 안내서']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-pill)',
                border: 'none',
                background: tab === key ? '#FDD98A' : 'transparent',
                color: tab === key ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: tab === key ? 800 : 500,
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
                borderRadius: 'var(--radius-btn)',
                border: 'none',
                // 다음 수업으로 넘어가는 주 버튼 — 노란 배경 + 진갈색 글자
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
                fontWeight: 800,
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
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-pill)',
              fontSize: '0.8125rem',
              fontWeight: 700,
              color: 'var(--accent-text)',
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
          <h2 style={{ fontSize: '1.125rem', fontWeight: 800, marginBottom: '20px' }}>
            학생 접속 안내
          </h2>

          {/* 수업코드 — QR을 못 쓰는 학생이 직접 입력하는 값. 교실 뒤에서도 읽히게 크게 보여준다 */}
          {teacherCode && (
            <div style={{
              background: 'var(--card)',
              border: '1.5px solid var(--gold)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-md)',
              padding: '20px 24px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  수업코드
                </p>
                <div style={{
                  fontSize: 'clamp(2rem, 6vw, 3rem)',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: 'var(--text)',
                  wordBreak: 'break-all',
                  lineHeight: 1.2,
                }}>
                  {teacherCode}
                </div>
              </div>
              <CopyButton text={teacherCode} label="📋 코드 복사" />
            </div>
          )}

          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
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
                  border: '1px solid var(--border)',
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
                padding: '16px', textAlign: 'center', lineHeight: 1.5,
              }}>
                {joinQrFailed ? 'QR을 만들지 못했습니다. 아래 주소와 수업코드로 접속하세요' : 'QR 생성 중…'}
              </div>
            )}

            {teacherCode && (
              <p style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '14px' }}>
                수업코드: {teacherCode}
              </p>
            )}

            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              카메라가 안 되면 아래 주소로 직접 접속한 뒤 수업코드를 입력하세요
            </p>
            <div style={{
              fontSize: '1.375rem',
              fontWeight: 800,
              color: 'var(--accent-text)',
              marginBottom: '14px',
              wordBreak: 'break-all',
            }}>
              {joinUrl}
            </div>
            <CopyButton text={joinUrl} label="📋 주소 복사" />
          </div>

          <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '12px' }}>
            등록한 팀 — 학생이 수업코드·학번·이름을 입력하면 팀이 만들어져 여기에 바로 나타납니다
          </p>
          <TeamList sessionId={sessionId} />

          <button
            onClick={() => setTab('battle')}
            style={{
              marginTop: '24px',
              width: '100%',
              padding: '12px',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              border: 'none',
              borderRadius: 'var(--radius-btn)',
              boxShadow: '0 6px 18px var(--shadow)',
              fontSize: '1rem',
              fontWeight: 800,
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
            background: 'var(--card2)',
            borderRight: '1px solid var(--border)',
            overflowY: 'auto',
            minHeight: 0,
          }}>
            <SessionController
              sessionId={sessionId}
              onFinalEnd={handleFinalEnd}
              onAuthExpired={handleAuthExpired}
              sessionFinished={sessionFinished}
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

// 클립보드 복사 버튼 — 복사됐는지 잠깐 알려준다
function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* 복사 권한이 없으면 조용히 넘어간다 */ }
  }
  return (
    <button
      onClick={handleCopy}
      style={{
        padding: '8px 20px',
        background: copied ? 'var(--success-text)' : 'var(--btn-primary-bg)',
        color: copied ? '#fff' : 'var(--btn-primary-text)',
        border: 'none',
        borderRadius: 'var(--radius-btn)',
        boxShadow: '0 4px 12px var(--shadow)',
        fontSize: '0.875rem',
        fontWeight: 800,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? '✅ 복사됨' : label}
    </button>
  )
}

// 등록한 팀 목록 — 학생이 등록할 때마다(student:registered) 소켓으로 바로 갱신한다
function TeamList({ sessionId }) {
  const [teams, setTeams] = useState([])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      teacherFetch(`/api/dashboard/${sessionId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d) setTeams(d.teams || []) })
        .catch(() => {})
    }
    load()

    const socket = createSocket({ teacher: true })
    // token을 함께 보내 auth:teacher 도착 순서와 상관없이 바로 교사 방에 들어간다
    // (SessionController·ClassDashboard와 같은 방식)
    const join = () => {
      const token = getTeacherToken()
      socket.emit('teacher:join', token ? { sessionId, token } : { sessionId })
    }
    join()
    socket.on('connect', join)
    socket.on('student:registered', load)
    socket.on('dashboard:update', load)

    return () => {
      cancelled = true
      socket.disconnect()
    }
  }, [sessionId])

  if (teams.length === 0) {
    return (
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
        아직 등록한 팀이 없습니다.
      </p>
    )
  }

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
            border: `1.5px solid ${t.color}`,
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 800, fontSize: '0.875rem' }}>{t.name}</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            {(t.members || []).join(' · ')}
          </div>
        </div>
      ))}
    </div>
  )
}
