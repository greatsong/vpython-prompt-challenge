import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { setTeamToken } from '../utils/teamAuth.js'

const LS_TEACHER_CODE = 'vpython_teacher_code'
// 자동 프리필은 제거. 직전에 쓰던 코드는 힌트 문구로만 노출하고
// 사용자가 명시적으로 클릭해야 복원되도록 한다.

const WELCOME_EMOJIS = ['🎉', '🚀', '⭐', '🔥', '💎', '🌟', '✨', '🎯', '🧠', '💡']
const CONFETTI_COLORS = ['#F4B400', '#E8930C', '#FDD98A', '#2E9E5B', '#4C8DF6', '#F4789B', '#FFC94D', '#8FD3A8']

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

// QR로 들어온 경우 주소에 담긴 수업 코드(?code=)를 그대로 채운다.
// localStorage 프리필과 달리 이 값은 선생님이 방금 띄운 QR에서 온 것이라
// 지난 수업 코드가 남아 학생을 엉뚱한 수업으로 보낼 위험이 없다.
function codeFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('code')?.trim() || ''
  } catch {
    return ''
  }
}

export default function JoinPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [teacherCode, setTeacherCode] = useState(codeFromUrl)
  const [lastTeacherCode] = useState(() => localStorage.getItem(LS_TEACHER_CODE) || '')
  const [s1Number, setS1Number] = useState('')
  const [s1Name, setS1Name] = useState('')
  const [s2Number, setS2Number] = useState('')
  const [s2Name, setS2Name] = useState('')
  const [loading, setLoading] = useState(false)
  // 팀 화면에서 인증이 풀려 돌아온 경우(TeamApp이 state.notice로 넘긴다) 그 이유를 먼저 보여 준다
  const [error, setError] = useState(() => (typeof location.state?.notice === 'string' ? location.state.notice : ''))
  const [welcome, setWelcome] = useState(null)
  // alreadyRegistered 응답을 받았을 때의 선택 상태
  const [existingChoice, setExistingChoice] = useState(null)
  // { sessionId, teamId, spectator, students }
  // 정원 초과로 관람 모드가 됐을 때의 안내 상태 — 조용히 넘기지 않고 반드시 화면에 띄운다
  const [capacityNotice, setCapacityNotice] = useState(null)
  // { sessionId, message, teamCount, maxTeams }

  const submitRegister = async (opts = {}) => {
    const { forceNewTeam = false } = opts
    // 학번은 항상 문자열로 보낸다 (서버는 숫자형 학번을 거부한다 — 앞자리 0이 사라지는 것을 막기 위해)
    const students = [{ studentNumber: String(s1Number).trim(), studentName: String(s1Name).trim() }]
    if (String(s2Number).trim() && String(s2Name).trim()) {
      students.push({ studentNumber: String(s2Number).trim(), studentName: String(s2Name).trim() })
    }

    try {
      const res = await fetch('/api/session/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherCode: teacherCode.trim(), students, forceNewTeam }),
      })
      let data = {}
      try { data = await res.json() } catch { /* 본문이 JSON이 아니면 아래 기본 문구 */ }
      if (!res.ok) {
        // 400: 입력 검증 실패(서버 문구 그대로) · 409: 이미 등록된 학번인데 이름이 다름 · 404: 수업 없음
        const fallback = res.status === 409
          ? '이미 등록된 학번입니다. 이름을 확인하세요'
          : res.status >= 500
            ? '서버가 잠시 불안정합니다. 잠시 후 다시 시도해주세요.'
            : '등록 실패'
        setError(data?.error || fallback)
        setLoading(false)
        setExistingChoice(null)
        return
      }

      if (data.spectator) {
        if (data.alreadyRegistered && !forceNewTeam) {
          setExistingChoice({
            sessionId: data.sessionId,
            teamId: null,
            spectator: true,
            students,
            reason: data.reason,
            message: data.message,
          })
          setLoading(false)
          return
        }
        // 정원 초과로 관람 모드가 된 경우 — 바로 넘기지 않고 사유를 먼저 보여준다
        if (data.reason === 'capacity') {
          setCapacityNotice({
            sessionId: data.sessionId,
            message: data.message || '팀 정원이 모두 찼습니다. 관람 모드로 참여합니다. 선생님께 알려주세요.',
            teamCount: data.teamCount,
            maxTeams: data.maxTeams,
          })
          setLoading(false)
          return
        }
        navigate(`/spectator/${data.sessionId}`)
        return
      }

      if (data.alreadyRegistered && !forceNewTeam) {
        setExistingChoice({
          sessionId: data.sessionId,
          teamId: data.teamId,
          teamToken: data.teamToken,
          spectator: false,
          students,
          // 기존 팀에 새 짝을 더했으면 그 이름, 정원이 차서 못 더했으면 안내 문구
          addedMembers: Array.isArray(data.addedMembers) ? data.addedMembers : [],
          partnerNotAdded: !!data.partnerNotAdded,
          message: data.message,
        })
        setLoading(false)
        return
      }

      const emoji = WELCOME_EMOJIS[Math.floor(Math.random() * WELCOME_EMOJIS.length)]
      const names = students.map(s => s.studentName).join(', ')
      setTeamToken(data.teamId, data.teamToken)
      setWelcome({ teamId: data.teamId, emoji, names })
      setTimeout(() => navigate(`/team/${data.teamId}`), 2500)
    } catch (e) {
      setError('서버 연결 실패. 새로고침 후 다시 시도해주세요.')
      setLoading(false)
      setExistingChoice(null)
    }
  }

  const handleJoin = async () => {
    if (!teacherCode.trim()) return setError('수업코드를 입력해주세요')
    if (!s1Number.trim() || !s1Name.trim()) return setError('팀원 1의 학번과 이름을 입력해주세요')
    // 팀원 2는 둘 다 비어있으면 OK, 하나만 입력하면 경고
    if ((s2Number.trim() && !s2Name.trim()) || (!s2Number.trim() && s2Name.trim()))
      return setError('팀원 2의 학번과 이름을 모두 입력해주세요')
    // 두 팀원의 학번이 같으면 서버에 보내기 전에 막는다
    if (s2Number.trim() && s2Number.trim() === s1Number.trim())
      return setError('두 팀원의 학번이 같습니다. 학번을 확인해주세요')

    setLoading(true)
    setError('')
    localStorage.setItem(LS_TEACHER_CODE, teacherCode.trim())
    await submitRegister()
  }

  // 이전 팀으로 들어가기
  const handleEnterExisting = () => {
    if (!existingChoice) return
    if (existingChoice.spectator) {
      navigate(`/spectator/${existingChoice.sessionId}`, {
        state: { reason: existingChoice.reason, message: existingChoice.message },
      })
    } else {
      setTeamToken(existingChoice.teamId, existingChoice.teamToken)
      navigate(`/team/${existingChoice.teamId}`)
    }
  }

  // 새 팀으로 새로 등록 (이전 등록 폐기)
  const handleForceNewTeam = async () => {
    setLoading(true)
    setError('')
    await submitRegister({ forceNewTeam: true })
  }

  const handleUseLastCode = () => {
    if (lastTeacherCode) setTeacherCode(lastTeacherCode)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleJoin()
  }

  // 정원 초과 안내 화면 — 관람 모드로 떨어졌다는 사실을 학생이 반드시 보게 한다
  if (capacityNotice) {
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
          maxWidth: '440px',
          background: 'var(--surface)',
          border: '2px solid var(--gold)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '28px',
          animation: 'fadeIn 0.4s ease-out',
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            background: '#FDD98A',
            color: 'var(--warning-text)',
            borderRadius: 'var(--radius-pill)',
            fontSize: '0.75rem',
            fontWeight: 800,
            marginBottom: '14px',
          }}>
            ⚠️ 정원 초과
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '10px' }}>
            팀을 더 만들 수 없어요
          </h2>
          <p style={{ color: 'var(--text)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '8px' }}>
            {capacityNotice.message}
          </p>
          {capacityNotice.maxTeams != null && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '20px' }}>
              현재 {capacityNotice.teamCount ?? capacityNotice.maxTeams} / {capacityNotice.maxTeams}팀
            </p>
          )}
          <button
            onClick={() => navigate(`/spectator/${capacityNotice.sessionId}`, {
              state: { reason: 'capacity', message: capacityNotice.message },
            })}
            style={{
              width: '100%',
              padding: '13px',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              border: 'none',
              borderRadius: 'var(--radius-btn)',
              boxShadow: '0 6px 18px var(--shadow)',
              fontSize: '1rem',
              fontWeight: 800,
              cursor: 'pointer',
              marginBottom: '10px',
            }}
          >
            👀 관람 모드로 들어가기
          </button>
          <button
            onClick={() => { setCapacityNotice(null); setLoading(false) }}
            style={{
              width: '100%',
              padding: '10px',
              background: 'none',
              color: 'var(--text-muted)',
              border: 'none',
              fontSize: '0.8125rem',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            돌아가서 다시 시도하기
          </button>
        </div>
      </div>
    )
  }

  // 이미 등록된 학번일 때 — 이전 팀 / 새 팀 선택 화면
  if (existingChoice) {
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
          maxWidth: '440px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '28px',
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>
            이미 이 수업에 등록되어 있어요
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '20px' }}>
            같은 학번이 이미 등록된 기록이 있습니다. 어떻게 진행할까요?
          </p>
          {existingChoice.spectator && existingChoice.reason === 'capacity' && (
            <div style={{
              padding: '12px 14px',
              background: 'var(--warning-bg)',
              border: '1px solid var(--gold)',
              color: 'var(--warning-text)',
              borderRadius: 'var(--radius)',
              fontSize: '0.8125rem',
              lineHeight: 1.5,
              marginBottom: '16px',
            }}>
              ⚠️ {existingChoice.message || '정원 초과로 관람 모드입니다. 선생님께 알려주세요.'}
            </div>
          )}
          {!existingChoice.spectator && existingChoice.addedMembers?.length > 0 && (
            <div style={{
              padding: '12px 14px',
              background: 'var(--warning-bg)',
              border: '1px solid var(--gold)',
              color: 'var(--warning-text)',
              borderRadius: 'var(--radius)',
              fontSize: '0.8125rem',
              lineHeight: 1.5,
              marginBottom: '16px',
            }}>
              ✅ {existingChoice.addedMembers.join(', ')} 학생을 이전 팀에 함께 넣었어요.
            </div>
          )}
          {!existingChoice.spectator && existingChoice.partnerNotAdded && (
            <div style={{
              padding: '12px 14px',
              background: 'var(--warning-bg)',
              border: '1px solid var(--gold)',
              color: 'var(--warning-text)',
              borderRadius: 'var(--radius)',
              fontSize: '0.8125rem',
              lineHeight: 1.5,
              marginBottom: '16px',
            }}>
              ⚠️ {existingChoice.message || '기존 팀이 이미 가득 차서 새 짝을 넣지 못했습니다. 함께하려면 새 팀으로 시작하세요.'}
            </div>
          )}
          <button
            onClick={handleEnterExisting}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              border: 'none',
              borderRadius: 'var(--radius-btn)',
              boxShadow: '0 6px 18px var(--shadow)',
              fontSize: '1rem',
              fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '10px',
            }}
          >
            {existingChoice.spectator ? '관람자로 들어가기' : '이전 팀으로 들어가기'}
          </button>
          <button
            onClick={handleForceNewTeam}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: '#fff',
              color: 'var(--accent-text)',
              border: '1.5px solid var(--gold)',
              borderRadius: 'var(--radius-btn)',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '10px',
            }}
          >
            {loading ? '만드는 중...' : '새 팀으로 새로 시작하기'}
          </button>
          <button
            onClick={() => { setExistingChoice(null); setLoading(false) }}
            style={{
              width: '100%',
              padding: '10px',
              background: 'none',
              color: 'var(--text-muted)',
              border: 'none',
              fontSize: '0.8125rem',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            취소하고 수업코드 다시 확인
          </button>
        </div>
      </div>
    )
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
            환영합니다, {welcome.names}!
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
            background: '#FDD98A',
            color: 'var(--text)',
            borderRadius: 'var(--radius-pill)',
            boxShadow: 'var(--shadow-sm)',
            fontSize: '0.875rem',
            fontWeight: 800,
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
        maxWidth: '420px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        padding: '32px',
        animation: 'fadeIn 0.4s ease-out',
      }}>
        {/* keep-all: 한글이 어절 중간에서 잘려 "챌린 / 지"가 되던 것을 막는다.
            clamp: 좁은 화면(320px)에서는 글자를 줄여 두 줄로 흘러넘치지 않게 한다. */}
        <h1 style={{
          fontSize: 'clamp(1.15rem, 5.5vw, 1.5rem)',
          fontWeight: 800,
          marginBottom: '6px',
          textAlign: 'center',
          wordBreak: 'keep-all',
        }}>
          🧠 VPython 프롬프트 챌린지
        </h1>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '24px', fontSize: '0.875rem' }}>
          2인 1팀으로 참여합니다 (1인 참여도 가능)
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
        {/* QR로 들어와 코드가 이미 채워졌으면 지난 코드 힌트는 숨긴다.
            선생님이 방금 띄운 코드가 옳은데 옛 코드를 권하면 오히려 헷갈린다. */}
        {!codeFromUrl() && lastTeacherCode && lastTeacherCode !== teacherCode && (
          <button
            type="button"
            onClick={handleUseLastCode}
            style={{
              marginTop: '6px',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            지난번 코드 “{lastTeacherCode}” 다시 쓰기
          </button>
        )}

        {/* 팀원 1 (필수) */}
        <div style={{
          marginTop: '20px',
          padding: '16px',
          background: 'var(--card)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            👤 팀원 1
            <span style={{ fontSize: '0.6875rem', fontWeight: 400, color: 'var(--text-muted)' }}>필수</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: '0 0 40%' }}>
              <input
                value={s1Number}
                onChange={(e) => setS1Number(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="학번"
                style={inputStyle}
                inputMode="numeric"
              />
            </div>
            <div style={{ flex: 1 }}>
              <input
                value={s1Name}
                onChange={(e) => setS1Name(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="이름"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* 팀원 2 (선택) */}
        <div style={{
          marginTop: '10px',
          padding: '16px',
          background: 'var(--card2)',
          borderRadius: 'var(--radius)',
          border: '1px dashed var(--border)',
        }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            👤 팀원 2
            <span style={{ fontSize: '0.6875rem', fontWeight: 400, color: 'var(--text-muted)' }}>선택</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: '0 0 40%' }}>
              <input
                value={s2Number}
                onChange={(e) => setS2Number(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="학번"
                style={inputStyle}
                inputMode="numeric"
              />
            </div>
            <div style={{ flex: 1 }}>
              <input
                value={s2Name}
                onChange={(e) => setS2Name(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="이름"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {error && (
          <p style={{
            color: 'var(--danger-text)',
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
            marginTop: '20px',
            width: '100%',
            padding: '14px',
            background: loading ? 'var(--card)' : 'var(--btn-primary-bg)',
            color: loading ? 'var(--text-muted)' : 'var(--btn-primary-text)',
            border: 'none',
            borderRadius: 'var(--radius-btn)',
            boxShadow: loading ? 'none' : '0 6px 18px var(--shadow)',
            fontSize: '1.0625rem',
            fontWeight: 800,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s, transform 0.1s',
          }}
          onMouseDown={(e) => !loading && (e.currentTarget.style.transform = 'scale(0.97)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          {loading ? '참여 중...' : '🚀 참여하기'}
        </button>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <Link
            to="/privacy"
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            개인정보 처리방침
          </Link>
        </div>
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
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  fontSize: '1rem',
  outline: 'none',
  boxSizing: 'border-box',
}
