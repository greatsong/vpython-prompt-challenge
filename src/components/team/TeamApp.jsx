import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { createSocket } from '../../utils/socket.js'
import useSessionStore from '../../store/sessionStore.js'
import useTeamStore from '../../store/teamStore.js'
import BattleMode from './BattleMode.jsx'
import ChatPanel from '../shared/ChatPanel.jsx'
import { setTeamToken, getTeamToken, teamFetch } from '../../utils/teamAuth.js'

// 팀 인증이 풀렸거나(토큰 없음·무효) 수업이 끝났을 때 참여 화면에 띄울 안내
const REJOIN_NOTICE = '팀 인증이 만료되었습니다. 다시 참여해 주세요.'
const SESSION_ENDED_NOTICE = '수업이 종료되었습니다. 새 수업코드로 다시 참여해 주세요.'

// 공개된 결과(result:revealed)를 탭에 보관하는 키 — 결과 공개 뒤 새로고침해도 순위 화면을 다시 그린다.
// 키는 수업·챌린지 단위다. 새 챌린지가 시작되면(같은 챌린지 재시작 포함) 그 수업의 보관분을 모두 지운다.
const REVEALED_KEY_PREFIX = 'vpython_revealed'
const REVEALED_TTL_MS = 3 * 60 * 60 * 1000

function revealedKey(sessionId, challengeId) {
  return `${REVEALED_KEY_PREFIX}:${sessionId}:${challengeId}`
}

function saveRevealed(sessionId, challengeId, rankings) {
  if (sessionId == null || !challengeId || !Array.isArray(rankings)) return
  try {
    sessionStorage.setItem(revealedKey(sessionId, challengeId), JSON.stringify({ rankings, ts: Date.now() }))
  } catch { /* 저장소를 못 쓰면 복원만 포기한다 */ }
}

function loadRevealed(sessionId, challengeId) {
  if (sessionId == null || !challengeId) return null
  try {
    const raw = sessionStorage.getItem(revealedKey(sessionId, challengeId))
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!saved || !Array.isArray(saved.rankings) || Date.now() - (saved.ts || 0) > REVEALED_TTL_MS) return null
    return saved.rankings
  } catch {
    return null
  }
}

function clearRevealed(sessionId) {
  try {
    const prefix = `${REVEALED_KEY_PREFIX}:${sessionId}:`
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(prefix)) sessionStorage.removeItem(k)
    }
  } catch { /* 무시 */ }
}

const WELCOME_MESSAGES = [
  '오늘의 챌린지를 정복해보세요!',
  '최고의 프롬프트를 만들어봐요!',
  '3D 세계를 말로 표현해봐요!',
  'AI에게 멋진 명령을 내려보세요!',
  '창의력을 발휘할 시간이에요!',
]

export default function TeamApp() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const socketRef = useRef(null)
  // 자식(BattleMode·ChatPanel)에 넘길 소켓 인스턴스. ref만 넘기면 연결 직후 자식이 다시 렌더되지 않아
  // 리스너가 붙지 않는 문제가 있었다.
  const [socket, setSocket] = useState(null)
  // 마지막으로 받은 challenge:started의 챌린지 id — 응답 순서가 뒤바뀐 fetch 결과를 버리는 데 쓴다
  const latestChallengeIdRef = useRef(null)
  const { setChallenge } = useSessionStore()
  const { myTeam, setMyTeam } = useTeamStore()
  const [loading, setLoading] = useState(true)
  const [rankings, setRankings] = useState(null)
  const [challengeEnded, setChallengeEnded] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [sessionEnded, setSessionEnded] = useState(false)

  // 타이머
  const [remainingSeconds, setRemainingSeconds] = useState(null)
  const timerStartRef = useRef(null)
  const timerIntervalRef = useRef(null)

  // 최종 결과
  const [finalResults, setFinalResults] = useState(null)

  // 현재 라운드 식별자 — 같은 챌린지를 다시 시작해도 새 라운드로 구분된다
  const [roundStartedAt, setRoundStartedAt] = useState(null)
  // 수업이 끝난 뒤(최종 결과 화면)에는 재접속 입장 실패로 화면을 옮기지 않는다
  const sessionClosedRef = useRef(false)

  // 참여 화면으로 돌려보내며 이유를 함께 넘긴다 (JoinPage가 안내 문구로 보여 준다)
  const goRejoin = (notice) => navigate('/join', { replace: true, state: { notice } })

  // 팀 정보 로드 + 세션 상태 확인
  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token')
    if (token) {
      setTeamToken(teamId, token)
      navigate(`/team/${teamId}`, { replace: true })
      return
    }

    const init = async () => {
      // 이 탭에 팀 토큰이 없으면 소켓 입장도 API 호출도 모두 거부된다 — 바로 참여 화면으로
      if (!getTeamToken(teamId)) {
        goRejoin(REJOIN_NOTICE)
        return
      }
      try {
        const res = await teamFetch(`/api/team/${teamId}`, teamId)
        // 401: 토큰이 무효이거나 수업이 끝나 팀 인증이 풀렸다
        if (res.status === 401) {
          goRejoin(REJOIN_NOTICE)
          return
        }
        if (res.ok) {
          const team = await res.json()
          // 세션 상태 확인 — ended면 /join으로 리다이렉트
          const sessionRes = await fetch(`/api/session/${team.session_id}`)
          if (sessionRes.ok) {
            const session = await sessionRes.json()
            if (session.status === 'ended') {
              goRejoin(SESSION_ENDED_NOTICE)
              return
            }
          }
          setMyTeam(team)
        }
      } catch (e) {
        console.error(e)
      }
      setLoading(false)
    }
    init()
  }, [teamId, location.search])

  // 타이머 시작
  const startCountdown = (seconds) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    if (!seconds || seconds <= 0) {
      setRemainingSeconds(null)
      return
    }
    const startedAt = Date.now()
    timerStartRef.current = { startedAt, timeLimit: seconds }
    setRemainingSeconds(seconds)

    timerIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      const remaining = Math.max(0, seconds - elapsed)
      setRemainingSeconds(remaining)
      if (remaining <= 0) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
    }, 1000)
  }

  const stopCountdown = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    setRemainingSeconds(null)
    timerStartRef.current = null
  }

  useEffect(() => {
    return () => stopCountdown()
  }, [])

  // Socket.io 연결
  useEffect(() => {
    if (!myTeam) return

    const socket = createSocket()
    socketRef.current = socket
    setSocket(socket)

    // 최초 연결 + 재접속 때마다 방에 다시 들어간다.
    // (재접속하면 서버에서는 새 소켓이라 방 정보가 없다. 서버는 입장 때 진행 중 챌린지를 다시 보내 준다)
    // 팀 토큰을 함께 보내야 서버가 방에 넣어 준다. 실패하면 ack({ ok:false })와 team:join:error가 온다.
    const join = () => socket.emit(
      'team:join',
      { sessionId: myTeam.session_id, teamId: myTeam.id, teamToken: getTeamToken(myTeam.id) },
      (res) => {
        if (res && res.ok === false && !sessionClosedRef.current) goRejoin(REJOIN_NOTICE)
      }
    )
    if (socket.connected) join()
    socket.on('connect', join)

    socket.on('team:join:error', ({ reason } = {}) => {
      if (sessionClosedRef.current) return
      goRejoin(reason === 'session_unavailable' ? SESSION_ENDED_NOTICE : REJOIN_NOTICE)
    })

    socket.on('challenge:started', ({ challengeId, timeLimit, startedAt, challenge }) => {
      latestChallengeIdRef.current = challengeId
      // 진행 중인 챌린지가 있으면(재접속 복원 포함) 앞서 공개된 결과는 더 이상 현재 화면이 아니다
      clearRevealed(myTeam.session_id)
      setChallengeEnded(false)
      setRankings(null)
      setFinalResults(null)
      setRoundStartedAt(startedAt ?? null)
      startCountdown(timeLimit)
      // 서버가 시작 이벤트에 챌린지 정보(목표 코드 포함)를 실어 보내면 상세 조회 없이 바로 장면을 만든다
      if (challenge && challenge.id === challengeId && typeof challenge.code === 'string' && challenge.code) {
        setChallenge(challenge)
        return
      }
      // 예전 서버처럼 코드가 없으면 상세 API로 받아 온다
      fetch(`/api/challenges/${challengeId}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`챌린지 조회 실패 (${r.status})`))))
        .then((data) => {
          // 연속으로 시작 이벤트를 받으면 앞선 요청의 응답이 늦게 올 수 있다 — 마지막 이벤트와 같은 것만 반영
          if (latestChallengeIdRef.current !== challengeId) return
          if (data?.id && data.id !== challengeId) return
          setChallenge(data)
        })
        .catch(console.error)
    })

    socket.on('challenge:ended', ({ resumed, challengeId, startedAt } = {}) => {
      setChallengeEnded(true)
      stopCountdown()
      // 서버가 재접속한 소켓에 마감 상태를 다시 알려 줄 때는 챌린지 id가 함께 온다.
      // 새로고침으로 잃은 결과 공개 화면을 이 챌린지의 보관분으로 다시 그린다.
      if (challengeId) latestChallengeIdRef.current = challengeId
      if (resumed && challengeId) {
        // 라운드 키를 맞춰야 이 라운드에 쓴 프롬프트·채점 결과가 '제출 마감됨' 화면에 다시 보인다
        if (startedAt != null) setRoundStartedAt(startedAt)
        // 새로고침 직후에는 챌린지 정보가 비어 있다 — 마감된 챌린지를 불러와 마감 화면으로 보여 준다
        if (useSessionStore.getState().currentChallenge?.id !== challengeId) {
          fetch(`/api/challenges/${challengeId}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`챌린지 조회 실패 (${r.status})`))))
            .then((data) => {
              if (latestChallengeIdRef.current !== challengeId) return
              if (data?.id && data.id !== challengeId) return
              setChallenge(data)
            })
            .catch(console.error)
        }
        const saved = loadRevealed(myTeam.session_id, challengeId)
        if (saved) setRankings(saved)
      }
    })

    socket.on('result:revealed', ({ rankings }) => {
      setRankings(rankings)
      saveRevealed(myTeam.session_id, latestChallengeIdRef.current, rankings)
    })

    socket.on('session:final-ended', ({ rankings, challengeCount }) => {
      sessionClosedRef.current = true
      setFinalResults({ rankings, challengeCount })
      stopCountdown()
    })

    // 세션 종료 시 일정 시간 후 /join으로 리다이렉트
    socket.on('session:ended', () => {
      sessionClosedRef.current = true
      setSessionEnded(true)
    })

    return () => {
      socket.off('connect', join)
      socket.disconnect()
      if (socketRef.current === socket) socketRef.current = null
      setSocket((cur) => (cur === socket ? null : cur))
    }
  }, [myTeam])

  // 환영 화면 자동 숨김
  useEffect(() => {
    if (!myTeam || !showWelcome) return
    const timer = setTimeout(() => setShowWelcome(false), 4000)
    return () => clearTimeout(timer)
  }, [myTeam, showWelcome])

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>팀 정보 로딩 중...</p>
      </div>
    )
  }

  if (!myTeam) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--danger-text)' }}>팀을 찾을 수 없습니다. (ID: {teamId})</p>
      </div>
    )
  }

  const welcomeMsg = WELCOME_MESSAGES[Math.floor(myTeam.id % WELCOME_MESSAGES.length)]

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* 팀 환영 오버레이 */}
      {showWelcome && (
        <div
          onClick={() => setShowWelcome(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(255, 253, 247, 0.97)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            cursor: 'pointer',
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: myTeam.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            animation: 'bounceIn 0.6s ease-out',
            boxShadow: `0 10px 36px ${myTeam.color}55`,
          }}>
            🧠
          </div>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 800,
            animation: 'slideUp 0.5s 0.2s ease-out both',
          }}>
            {myTeam.name}
          </h1>
          <div style={{
            display: 'flex',
            gap: '8px',
            animation: 'slideUp 0.5s 0.4s ease-out both',
          }}>
            {(myTeam.members || []).map((m, i) => (
              <span key={i} style={{
                padding: '6px 16px',
                background: `${myTeam.color}33`,
                border: `1.5px solid ${myTeam.color}`,
                borderRadius: 'var(--radius-pill)',
                fontSize: '1rem',
                fontWeight: 700,
              }}>
                {m}
              </span>
            ))}
          </div>
          <p style={{
            color: 'var(--text-muted)',
            fontSize: '1rem',
            marginTop: '8px',
            animation: 'slideUp 0.5s 0.6s ease-out both',
          }}>
            {welcomeMsg}
          </p>
          <p style={{
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
            marginTop: '16px',
            opacity: 0.85,
            animation: 'slideUp 0.5s 0.8s ease-out both',
          }}>
            화면을 터치하면 시작합니다
          </p>
        </div>
      )}

      <header style={{
        padding: '12px 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 10px rgba(180, 140, 20, 0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: '16px', height: '16px', borderRadius: '50%',
          background: myTeam.color, flexShrink: 0,
        }} />
        <span style={{ fontWeight: 800 }}>{myTeam.name}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          {(myTeam.members || []).join(' · ')}
        </span>
      </header>

      <main>
        <BattleMode
          team={myTeam}
          socket={socket}
          rankings={rankings}
          challengeEnded={challengeEnded}
          remainingSeconds={remainingSeconds}
          finalResults={finalResults}
          roundStartedAt={roundStartedAt}
        />
      </main>

      {/* 채팅 패널 */}
      <ChatPanel
        socket={socket}
        sessionId={myTeam.session_id}
        teamName={myTeam.name}
        teamColor={myTeam.color}
        members={myTeam.members}
      />
    </div>
  )
}
