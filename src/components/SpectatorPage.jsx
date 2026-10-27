import { useEffect, useRef, useState } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { createSocket } from '../utils/socket.js'
import VPythonRunner from './shared/VPythonRunner.jsx'
import ChatPanel from './shared/ChatPanel.jsx'

// 순위 응답의 미제출 판정.
// 서버가 submitted 필드를 주면 그것을 따르고, 없으면(예전 응답) prompt·generated_code가 모두 없는지로 가린다.
// 미제출 팀도 서버는 0점을 넣어 보내므로 점수로는 가릴 수 없다.
function isUnsubmitted(r) {
  if (!r) return false
  if (r.submitted === false) return true
  if (r.submitted === true) return false
  return r.prompt == null && r.generated_code == null
}

// 화면에 보일 순위 — 제출한 팀끼리만 번호를 매긴다(미제출은 null). 서버가 rank를 주면 그 값을 쓴다.
function displayRanks(rankings) {
  let n = 0
  return (rankings || []).map((r) => {
    if (isUnsubmitted(r)) return null
    n = Number.isInteger(r.rank) ? r.rank : n + 1
    return n
  })
}

// 공개된 결과를 탭에 보관해 두었다가, 새로고침 뒤 서버가 마감 상태(resumed)를 알려 오면 순위 화면을 다시 그린다.
// 팀 화면과 같은 방식이다. 새 챌린지가 시작되면 그 수업의 보관분을 지운다.
const REVEALED_KEY_PREFIX = 'vpython_spectator_revealed'
const REVEALED_TTL_MS = 3 * 60 * 60 * 1000

function saveRevealed(sessionId, challengeId, rankings) {
  if (!sessionId || !challengeId || !Array.isArray(rankings)) return
  try {
    sessionStorage.setItem(`${REVEALED_KEY_PREFIX}:${sessionId}:${challengeId}`, JSON.stringify({ rankings, ts: Date.now() }))
  } catch { /* 저장소를 못 쓰면 복원만 포기한다 */ }
}

function loadRevealed(sessionId, challengeId) {
  if (!sessionId || !challengeId) return null
  try {
    const saved = JSON.parse(sessionStorage.getItem(`${REVEALED_KEY_PREFIX}:${sessionId}:${challengeId}`) || 'null')
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

export default function SpectatorPage() {
  const { sessionId } = useParams()
  const location = useLocation()
  // JoinPage에서 넘겨준 관람 사유. 'capacity'면 정원 초과로 밀려난 것이므로 경고 배너를 띄운다.
  const capacityReason = location.state?.reason === 'capacity' ? location.state : null
  const socketRef = useRef(null)
  // ChatPanel에 넘길 소켓 인스턴스 (ref만 넘기면 첫 연결 때 리스너가 붙지 않는다)
  const [socket, setSocket] = useState(null)
  const latestChallengeIdRef = useRef(null)
  const [teams, setTeams] = useState([])
  const [challenge, setChallenge] = useState(null)
  const [rankings, setRankings] = useState(null)
  const [challengeEnded, setChallengeEnded] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)

  const loadTeams = async () => {
    try {
      const res = await fetch(`/api/public/dashboard/${sessionId}`)
      if (res.ok) {
        const data = await res.json()
        setTeams(data.teams || [])
      }
    } catch (e) { /* ignore */ }
  }

  useEffect(() => {
    loadTeams()
    const socket = createSocket()
    socketRef.current = socket
    setSocket(socket)
    // 최초 연결 + 재접속 때마다 방에 다시 들어간다 (서버가 진행 중 챌린지를 다시 보내 준다)
    const join = () => {
      socket.emit('team:join', { sessionId, teamId: 'spectator' })
      loadTeams()
    }
    if (socket.connected) join()
    socket.on('connect', join)

    const loadChallenge = (challengeId) => {
      fetch(`/api/challenges/${challengeId}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`챌린지 조회 실패 (${r.status})`))))
        .then((data) => {
          // 연속 시작 이벤트에서 늦게 도착한 이전 응답은 버린다
          if (latestChallengeIdRef.current !== challengeId) return
          setChallenge(data)
        })
        .catch(console.error)
    }

    socket.on('challenge:started', ({ challengeId, challenge } = {}) => {
      latestChallengeIdRef.current = challengeId
      clearRevealed(sessionId)
      setChallengeEnded(false)
      setRankings(null)
      // 시작 이벤트에 챌린지 정보(목표 코드 포함)가 있으면 상세 조회 없이 바로 반영한다
      if (challenge && challenge.id === challengeId && typeof challenge.code === 'string' && challenge.code) {
        setChallenge(challenge)
        return
      }
      loadChallenge(challengeId)
    })

    // 재입장(resumed)이면 마감된 챌린지 id가 함께 온다 — 새로고침 뒤에도 마감 화면·공개 결과를 복원한다
    socket.on('challenge:ended', ({ resumed, challengeId } = {}) => {
      setChallengeEnded(true)
      if (resumed && challengeId) {
        if (latestChallengeIdRef.current !== challengeId) {
          latestChallengeIdRef.current = challengeId
          loadChallenge(challengeId)
        }
        const saved = loadRevealed(sessionId, challengeId)
        if (saved) setRankings(saved)
      }
    })

    socket.on('session:ended', () => {
      setSessionEnded(true)
      setChallengeEnded(true)
    })

    // 관람 입장 거부 — 수업이 없거나 이미 끝났다. 종료 안내를 띄운다
    socket.on('team:join:error', ({ reason } = {}) => {
      if (reason !== 'session_unavailable') return
      setSessionEnded(true)
      setChallengeEnded(true)
    })

    socket.on('dashboard:update', loadTeams)
    // 새 팀 등록(또는 기존 팀에 학생 추가) — 'N팀 참여 중'을 바로 갱신한다
    socket.on('team:registered', loadTeams)

    socket.on('result:revealed', ({ rankings: r }) => {
      setRankings(r)
      saveRevealed(sessionId, latestChallengeIdRef.current, r)
    })

    return () => {
      socket.off('connect', join)
      socket.disconnect()
      setSocket((cur) => (cur === socket ? null : cur))
    }
  }, [sessionId])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* 헤더 */}
      <header style={{
        padding: '12px 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 2px 10px rgba(180, 140, 20, 0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <span style={{
          padding: '4px 12px',
          background: '#FDD98A',
          color: 'var(--text)',
          borderRadius: 'var(--radius-pill)',
          fontSize: '0.75rem',
          fontWeight: 800,
        }}>
          관람 모드
        </span>
        <span style={{ fontWeight: 800 }}>VPython 프롬프트 챌린지</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginLeft: 'auto' }}>
          {teams.length}팀 참여 중
        </span>
      </header>

      {/* 정원 초과 경고 배너 — 학생이 왜 관람 모드인지 계속 보이도록 상단에 고정 노출 */}
      {capacityReason && (
        <div style={{
          background: 'var(--warning-bg)',
          borderBottom: '2px solid var(--gold)',
          color: 'var(--warning-text)',
          padding: '14px 20px',
        }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ fontWeight: 800, fontSize: '0.9375rem', marginBottom: '4px' }}>
              ⚠️ 정원 초과로 관람 모드입니다 — 선생님께 알려주세요
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {capacityReason.message || '팀 정원이 모두 차서 팀을 새로 만들 수 없었습니다.'}
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 20px 96px' }}>
        {/* 수업 종료 안내 */}
        {sessionEnded && (
          <div style={{
            background: 'var(--card)',
            border: '1.5px solid var(--gold)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            marginBottom: '24px',
            textAlign: 'center',
          }}>
            <div style={{ fontWeight: 800, marginBottom: '4px' }}>🏁 수업이 종료되었습니다</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              참여해 주셔서 고맙습니다. 이 창은 닫아도 됩니다.
            </div>
          </div>
        )}

        {/* 현재 챌린지 */}
        {challenge && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            padding: '20px',
            marginBottom: '24px',
          }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--accent-text)', fontWeight: 700, marginBottom: '4px' }}>
              현재 챌린지 — Lv{challenge.level}
              {challengeEnded && (
                <span style={{
                  marginLeft: '8px',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'var(--danger-bg)',
                  color: 'var(--danger-text)',
                  fontWeight: 700,
                }}>
                  제출 마감
                </span>
              )}
            </p>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 800, marginBottom: '12px' }}>
              {challenge.emoji} {challenge.title}
            </h2>
            <VPythonRunner code={challenge.code} height="250px" label="목표 장면" loadingText={`${challenge.title} 문제를 출제 중입니다.`} />
          </div>
        )}

        {!challenge && !rankings && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--text-muted)',
          }}>
            <p style={{ fontSize: '2rem', marginBottom: '12px' }}>👀</p>
            <p style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '8px' }}>
              관람 모드로 참여 중입니다
            </p>
            <p style={{ fontSize: '0.875rem' }}>
              선생님이 챌린지를 시작하면 여기서 실시간으로 볼 수 있어요
            </p>
          </div>
        )}

        {/* 결과 공개 시 순위 */}
        {rankings && rankings.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            padding: '20px',
            marginBottom: '24px',
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '16px' }}>
              🏆 순위
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(() => {
                const ranks = displayRanks(rankings)
                return rankings.map((r, i) => {
                  const unsubmitted = isUnsubmitted(r)
                  const rank = ranks[i]
                  return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  background: i % 2 === 0 ? 'var(--card2)' : 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  borderLeft: `4px solid ${r.color}`,
                }}>
                  {/* 미제출 팀은 순위 번호 없이 '미제출'로만 표시하고 점수 칸은 비운다 */}
                  {unsubmitted ? (
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      minWidth: '30px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}>
                      미제출
                    </span>
                  ) : (
                    <span style={{
                      fontSize: '1.25rem',
                      fontWeight: 800,
                      width: '30px',
                      textAlign: 'center',
                      color: rank === 1 ? 'var(--accent-text)' : rank === 2 ? '#7D8796' : rank === 3 ? '#B5651D' : 'var(--text-muted)',
                    }}>
                      {rank}
                    </span>
                  )}
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: r.color,
                  }} />
                  <span style={{ fontWeight: 600, flex: 1 }}>{r.name}</span>
                  {!unsubmitted && (
                    <span style={{ fontWeight: 800, color: r.color, fontSize: '1.125rem' }}>
                      {r.score}점
                    </span>
                  )}
                </div>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {/* 팀 현황 카드 */}
        <h3 style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '10px' }}>
          참여 팀 현황
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '10px',
        }}>
          {teams.map((team) => (
            <div key={team.id} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-sm)',
              padding: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: team.color,
                }} />
                <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{team.name}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {(team.members || []).join(', ')}
              </div>
              {team.hasSubmitted && (
                <div style={{
                  marginTop: '6px',
                  fontSize: '1rem',
                  fontWeight: 800,
                  color: team.color,
                }}>
                  {team.latestScore ?? '?'}점
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 채팅 (관람자도 참여 가능) */}
      <ChatPanel
        socket={socket}
        sessionId={sessionId}
        teamName="관람자"
        teamColor="#8A7A58"
        members={[]}
      />
    </div>
  )
}
