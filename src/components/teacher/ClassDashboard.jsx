import { useEffect, useState, useRef } from 'react'
import { createSocket } from '../../utils/socket.js'
import useSessionStore from '../../store/sessionStore.js'
import useTeamStore from '../../store/teamStore.js'
import VPythonRunner from '../shared/VPythonRunner.jsx'
import { generateCode } from '../../utils/claude.js'
import { teacherFetch, clearTeacherToken, getTeacherToken } from '../../utils/teacherAuth.js'
import { BATTLE_CHALLENGES } from '../../data/challenges-battle.js'

// 챌린지 id → 제목 (최종 결과에 id 대신 제목을 보여 준다)
const CHALLENGE_TITLES = Object.fromEntries(BATTLE_CHALLENGES.map((c) => [c.id, `${c.emoji || ''} ${c.title}`.trim()]))
function challengeTitle(id) {
  return CHALLENGE_TITLES[id] || id
}

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

// 팀 카드의 현재 라운드 상태.
// hasSubmitted·latestScore는 서버가 현재 챌린지의 이번 라운드(challenge_rounds 시작 시각 이후)만 집계한 값이다.
//  'submitted' 이번 라운드에 제출함 → 점수 표시
//  'writing'   미제출 + 진행 중 → 작성 중
//  'missed'    미제출 + 마감 → 미제출(점수 없음)
//  'idle'      챌린지를 시작하기 전 → 대기 중
// dataFresh: 화면의 teams가 지금 챌린지 기준으로 다시 불러온 값인지. 아니면 제출 여부를 믿지 않는다.
function teamRoundState(team, challengeStatus, dataFresh = true) {
  if (challengeStatus === 'idle') return 'idle'
  if (dataFresh && team?.hasSubmitted) return 'submitted'
  if (challengeStatus === 'running') return 'writing'
  if (challengeStatus === 'ended') return 'missed'
  return 'idle'
}

// 카드 보조 줄의 "지난 라운드 최고 점수".
// 서버의 previousBest(이번 라운드를 뺀 모든 시도의 최고점)를 우선 쓰고,
// 이전 서버 응답에는 없으므로 perChallenge에서 현재 챌린지를 뺀 최고점으로 대신한다.
// 시작 전(idle)에는 이번 라운드라고 볼 회차가 없으므로 그 회차 점수도 지난 기록에 넣는다.
function previousBestScore(team, includeCurrentRound, currentChallengeId) {
  let best = null
  const take = (v) => {
    if (typeof v === 'number' && Number.isFinite(v) && (best === null || v > best)) best = v
  }
  if (team && 'previousBest' in team) {
    take(team.previousBest)
  } else {
    for (const pc of team?.perChallenge || []) {
      if (pc.challenge_id !== currentChallengeId) take(pc.score)
    }
  }
  if (includeCurrentRound && team?.hasSubmitted) take(team.latestScore)
  return best
}

// TeacherApp의 인증 플래그 키 (TeacherApp.jsx의 AUTH_KEY와 같아야 한다)
const TEACHER_AUTH_KEY = 'vpython_teacher_auth'

export default function ClassDashboard({ sessionId, onAuthExpired }) {
  const { currentChallenge, setSubmissionProgress, challengeStatus } = useSessionStore()
  const { teams, setTeams } = useTeamStore()
  const socketRef = useRef(null)
  const challengeIdRef = useRef(null)
  // 팀 정원 (서버의 MAX_TEAMS). 헤더에 "N / M팀" 형태로 함께 보여준다.
  const [maxTeams, setMaxTeams] = useState(null)
  // 지금 화면에 올라와 있는 teams 데이터가 어느 챌린지 기준인지.
  // 챌린지를 바꾼 직후에는 아직 이전 챌린지 응답이 남아 있을 수 있어,
  // 이 값이 currentChallenge와 일치할 때만 진행 현황을 집계한다.
  const [loadedChallengeId, setLoadedChallengeId] = useState(null)
  // 데모 모드
  const [showDemo, setShowDemo] = useState(false)
  const [demoPrompt, setDemoPrompt] = useState('')
  const [demoCode, setDemoCode] = useState(null)
  const [demoLoading, setDemoLoading] = useState(false)
  // 비교 모드
  const [compareTeams, setCompareTeams] = useState([])
  const [compareData, setCompareData] = useState({})

  // 최근 등록 학생 알림
  const [recentStudent, setRecentStudent] = useState(null)
  // 채팅 모니터링
  const [showChat, setShowChat] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const chatScrollRef = useRef(null)

  // 챌린지별 순위표
  const [challengeRankings, setChallengeRankings] = useState(null)
  // setTimeout 안에서 최신 값을 읽기 위한 ref (클로저에 갇힌 옛 값 방지)
  const challengeRankingsRef = useRef(null)
  useEffect(() => { challengeRankingsRef.current = challengeRankings }, [challengeRankings])
  // 최종 결과
  const [finalResults, setFinalResults] = useState(null)
  // 교사 토큰 만료 — 화면을 지우지 않고 다시 로그인하라는 안내를 띄운다
  const [authExpired, setAuthExpired] = useState(false)
  // 목표 장면 코드 — 챌린지 목록(/api/challenges, 클라이언트 번들)에는 정답 코드가 없어서
  // 단건 조회(/api/challenges/:id)로 따로 받아 온다
  const [targetCode, setTargetCode] = useState(null)

  const markAuthExpired = () => {
    setAuthExpired(true)
  }

  // 다시 로그인 — TeacherApp은 이 컴포넌트에서 고칠 수 없으므로,
  // 부모가 콜백을 넘겼으면 그것을 쓰고 아니면 토큰을 지운 뒤 새로고침해 로그인 화면으로 돌아간다
  const handleRelogin = () => {
    if (onAuthExpired) {
      onAuthExpired()
      return
    }
    clearTeacherToken()
    try { sessionStorage.removeItem(TEACHER_AUTH_KEY) } catch { /* 무시 */ }
    window.location.reload()
  }

  const loadTeams = async () => {
    const cid = challengeIdRef.current
    const url = cid
      ? `/api/dashboard/${sessionId}?challengeId=${cid}`
      : `/api/dashboard/${sessionId}`
    let res
    let data
    try {
      res = await teacherFetch(url)
      if (res.status === 401) {
        markAuthExpired()
        return
      }
      if (!res.ok) return // 일시적 서버 오류 — 기존 화면을 유지하고 다음 갱신을 기다린다
      data = await res.json()
    } catch (e) {
      console.error('[ClassDashboard] 팀 현황 조회 실패', e)
      return
    }
    // 응답이 오는 사이에 챌린지가 바뀌었으면 이전 라운드 데이터이므로 버린다
    if (challengeIdRef.current !== cid) return
    setAuthExpired(false)
    setTeams(Array.isArray(data?.teams) ? data.teams : [])
    setLoadedChallengeId(cid)
    if (data?.maxTeams) setMaxTeams(data.maxTeams)
  }

  const downloadCsv = async (url, filename) => {
    let res
    try {
      res = await teacherFetch(url)
    } catch {
      return
    }
    if (res.status === 401) {
      markAuthExpired()
      return
    }
    if (!res.ok) return
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
  }

  // ref 업데이트 + loadTeams를 하나의 useEffect로 합쳐서 순서 보장
  useEffect(() => {
    challengeIdRef.current = currentChallenge?.id ?? null
    // 새 챌린지로 넘어가면 진행 현황을 즉시 0으로 되돌린다 (이전 라운드 집계가 남지 않도록)
    setLoadedChallengeId(null)
    loadTeams()
    // 새 챌린지 시작 시 순위표 닫기 + 비교 초기화
    setChallengeRankings(null)
    setCompareTeams([])
    setCompareData({})
  }, [currentChallenge?.id])

  // 목표 장면 코드 조회 — 응답이 늦게 와도 지금 챌린지와 같을 때만 반영한다
  useEffect(() => {
    const cid = currentChallenge?.id
    setTargetCode(currentChallenge?.code || null)
    if (!cid || currentChallenge?.code) return
    let cancelled = false
    fetch(`/api/challenges/${encodeURIComponent(cid)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || data.id !== cid) return
        setTargetCode(data.code || null)
      })
      .catch(() => { /* 목표 장면만 비워 둔다 */ })
    return () => { cancelled = true }
  }, [currentChallenge?.id])

  useEffect(() => {
    const socket = createSocket({ teacher: true })
    socketRef.current = socket
    // token을 함께 보내 auth:teacher 도착 순서와 상관없이 바로 교사 방에 들어간다
    const join = () => {
      const token = getTeacherToken()
      socket.emit('teacher:join', token ? { sessionId, token } : { sessionId }, (res) => {
        if (res && res.ok === false && res.authExpired) markAuthExpired()
      })
    }
    join()

    // 재연결 시 방 재참여 (배포/네트워크 끊김 후 복구)
    socket.on('connect', join)

    // 소켓 이벤트에서 loadTeams 호출 시 challengeIdRef로 최신 값 사용
    // team:submitted는 { teamId, score }만 담는다 — 상세 평가는 loadTeams로 다시 읽는다
    socket.on('team:submitted', () => loadTeams())
    socket.on('dashboard:update', () => loadTeams())

    // 학생 등록 실시간 알림
    socket.on('student:registered', ({ studentNames, team }) => {
      setRecentStudent({ studentNames, teamName: team.name })
      loadTeams()
      setTimeout(() => setRecentStudent(null), 4000)
    })

    // 전체 채팅 모니터링
    socket.on('chat:all', (msg) => {
      setChatMessages((prev) => [...prev.slice(-99), msg])
    })

    // 결과 공개 → 교사 화면에도 순위 표시
    socket.on('result:revealed', ({ rankings }) => {
      setChallengeRankings(rankings)
    })

    // 최종 종료
    socket.on('session:final-ended', ({ rankings, challengeCount }) => {
      setFinalResults({ rankings, challengeCount })
      // 자동 다운로드
      setTimeout(() => {
        downloadCsv(`/api/export/final/${sessionId}`, `final-results-${sessionId}.csv`)
      }, 500)
    })

    return () => socket.disconnect()
  }, [sessionId])

  // 채팅 스크롤
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatMessages])

  // ── 현재 챌린지 제출 진행 현황 집계 ─────────────────────────────────────
  // 관람자는 teams 테이블에 들어가지 않으므로 teams.length가 곧 실제 참여 팀 수다.
  // hasSubmitted는 서버가 challengeId로 필터링해 내려준 값이라 이전 챌린지 제출은 섞이지 않는다.
  const activeTeamCount = teams.length
  const submittedCount = teams.filter((t) => t.hasSubmitted).length
  const pendingCount = Math.max(0, activeTeamCount - submittedCount)
  // 지금 진행 중인 챌린지 기준의 데이터가 실제로 로드됐을 때만 집계를 신뢰한다
  const progressReady = !!currentChallenge && loadedChallengeId === currentChallenge.id
  const allSubmitted = progressReady && activeTeamCount > 0 && pendingCount === 0

  // 형제 컴포넌트(SessionController)가 경고를 띄울 수 있도록 store에 공유
  useEffect(() => {
    setSubmissionProgress(
      progressReady
        ? { challengeId: currentChallenge.id, submitted: submittedCount, total: activeTeamCount }
        : { challengeId: null, submitted: 0, total: 0 }
    )
  }, [progressReady, currentChallenge?.id, submittedCount, activeTeamCount])

  const handleReveal = () => {
    const cid = currentChallenge?.id
    // 인증이 만료됐으면 서버가 ack로 알려 준다
    socketRef.current?.emit('challenge:reveal', { sessionId, challengeId: cid }, (res) => {
      if (res && res.ok === false && res.authExpired) markAuthExpired()
    })
    // 소켓 이벤트 수신 실패 대비: 직접 API로 순위 조회
    // (ref로 최신 값을 읽는다 — 상태를 직접 읽으면 클릭 당시의 null에 갇혀 늘 다시 조회했다)
    setTimeout(async () => {
      if (challengeRankingsRef.current) return
      try {
        const url = cid
          ? `/api/dashboard/rankings/${sessionId}?challengeId=${cid}`
          : `/api/dashboard/rankings/${sessionId}`
        const res = await teacherFetch(url)
        if (res.status === 401) {
          markAuthExpired()
          return
        }
        if (res.ok) {
          const data = await res.json()
          if (data.rankings && !challengeRankingsRef.current) setChallengeRankings(data.rankings)
        }
      } catch { /* ignore */ }
    }, 1000)
  }

  // 데모: 프롬프트 → AI 코드 생성
  const runDemo = async () => {
    if (!demoPrompt.trim()) return
    setDemoLoading(true)
    try {
      const { code } = await generateCode(demoPrompt)
      setDemoCode(code)
    } catch (e) {
      setDemoCode('// 오류: ' + e.message)
    }
    setDemoLoading(false)
  }

  // 비교: 팀 클릭 시 비교 대상에 추가/제거
  const toggleCompare = async (team) => {
    const existing = compareTeams.find(t => t.id === team.id)
    if (existing) {
      setCompareTeams(compareTeams.filter(t => t.id !== team.id))
      return
    }
    if (compareTeams.length >= 2) {
      setCompareTeams([compareTeams[1], team])
    } else {
      setCompareTeams([...compareTeams, team])
    }
    // 현재 챌린지 기준으로 시도 데이터 로드
    try {
      const cid = currentChallenge?.id
      const url = cid
        ? `/api/dashboard/attempts/${sessionId}/${team.id}?challengeId=${cid}`
        : `/api/dashboard/attempts/${sessionId}/${team.id}`
      const res = await teacherFetch(url)
      if (res.status === 401) {
        markAuthExpired()
        return
      }
      if (res.ok) {
        const data = await res.json()
        setCompareData(prev => ({ ...prev, [team.id]: data }))
      }
    } catch (e) { /* ignore */ }
  }

  // ── 최종 결과 화면 ──────────────────────────────────────────────────────
  if (finalResults) {
    const { rankings, challengeCount } = finalResults
    return (
      <div>
        <div style={{
          textAlign: 'center',
          padding: '32px 20px',
          background: 'linear-gradient(135deg, #FFF3CC, #FFFCF3)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-md)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '24px',
        }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '8px' }}>
            🏆 최종 결과
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {(rankings || []).length}팀 · {challengeCount}개 챌린지 종합
          </p>
        </div>

        {/* 종합 순위표 */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '24px',
          marginBottom: '24px',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '16px' }}>
            종합 순위
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rankings.map((r, i) => (
              <div
                key={r.teamId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '12px 16px',
                  background: i === 0
                    ? 'var(--card)'
                    : i === 1
                      ? '#F5F6F8'
                      : i === 2
                        ? '#FBF0E6'
                        : i % 2 === 0 ? 'var(--card2)' : 'var(--surface)',
                  border: `1px solid ${i < 3 ? ['var(--gold)', '#B9BFC8', '#D9A27A'][i] : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                }}
              >
                <span style={{ fontSize: '1.25rem', width: '36px', textAlign: 'center' }}>
                  {['🥇', '🥈', '🥉'][i] || `${i + 1}`}
                </span>
                <div style={{
                  width: '14px', height: '14px', borderRadius: '50%',
                  background: r.teamColor, flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{r.teamName}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '8px' }}>
                    {(r.members || []).join(', ')}
                  </span>
                </div>
                <span style={{
                  fontSize: '1.5rem', fontWeight: 800,
                  color: 'var(--accent-text)',
                }}>
                  {r.totalScore}점
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 팀별 상세 (프롬프트 + 피드백) */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '24px',
          marginBottom: '24px',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '16px' }}>
            팀별 프롬프트 & 피드백
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {rankings.map((r, i) => (
              <details key={r.teamId} open={i < 3} style={{
                background: 'var(--card2)',
                borderRadius: 'var(--radius)',
                border: `1px solid ${r.teamColor}33`,
                overflow: 'hidden',
              }}>
                <summary style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}>
                  <span>{['🥇', '🥈', '🥉'][i] || `${i + 1}위`}</span>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: r.teamColor,
                  }} />
                  <span>{r.teamName}</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 800, color: r.teamColor }}>
                    {r.totalScore}점
                  </span>
                </summary>
                <div style={{ padding: '0 16px 16px' }}>
                  {r.challengeResults.map((cr) => (
                    <div key={cr.challengeId} style={{
                      padding: '10px 12px',
                      marginTop: '8px',
                      background: 'var(--surface)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        marginBottom: '6px',
                      }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                          {challengeTitle(cr.challengeId)}
                        </span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 800, color: cr.prompt ? 'var(--accent-text)' : 'var(--text-muted)' }}>
                          {cr.prompt ? `${cr.score}점` : '미제출'}
                        </span>
                      </div>
                      {cr.prompt ? (
                        <>
                          <div style={{
                            fontSize: '0.8125rem',
                            lineHeight: 1.6,
                            padding: '8px 10px',
                            background: 'var(--card2)',
                            borderRadius: 'var(--radius)',
                            marginBottom: '6px',
                            borderLeft: `3px solid ${r.teamColor}`,
                          }}>
                            {cr.prompt}
                          </div>
                          {cr.feedback && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              💬 {cr.feedback}
                            </p>
                          )}
                          {cr.strengths?.length > 0 && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--success-text)', marginTop: '4px' }}>
                              ✨ {cr.strengths.join(' / ')}
                            </p>
                          )}
                        </>
                      ) : (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>미제출</p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* 수동 다운로드 버튼 */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => downloadCsv(`/api/export/final/${sessionId}`, `final-results-${sessionId}.csv`)}
            style={{
              display: 'inline-block',
              padding: '12px 32px',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              borderRadius: 'var(--radius-btn)',
              boxShadow: '0 6px 18px var(--shadow)',
              border: 'none',
              fontSize: '0.9375rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            📥 결과 CSV 다운로드
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* 교사 로그인 만료 안내 — 예전에는 응답 오류로 화면 전체가 하얗게 사라졌다 */}
      {authExpired && (
        <div role="alert" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          padding: '14px 18px',
          marginBottom: '16px',
          background: 'var(--danger-bg)',
          border: '2px solid var(--danger)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <span style={{ fontWeight: 700, flex: 1, color: 'var(--danger-text)' }}>
            ⚠️ 로그인이 만료되었습니다. 다시 로그인해 주세요.
          </span>
          <button
            onClick={handleRelogin}
            style={{
              padding: '8px 16px',
              background: 'var(--danger-text)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-btn)',
              fontSize: '0.875rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            다시 로그인
          </button>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
            🧠 VPython 프롬프트 챌린지
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
            {maxTeams ? `${teams.length} / ${maxTeams}팀 참여 중` : `${teams.length}팀 참여 중`}
            {maxTeams && teams.length >= maxTeams && (
              <span style={{ color: 'var(--warning-text)', background: 'var(--warning-bg)', padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontWeight: 700, marginLeft: '8px' }}>
                ⚠️ 정원 마감 — 이후 참여자는 관람 모드로 들어갑니다
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowChat(!showChat)}
            style={{
              padding: '8px 16px',
              background: showChat ? 'var(--btn-primary-bg)' : '#fff',
              color: showChat ? 'var(--btn-primary-text)' : 'var(--text)',
              border: `1.5px solid ${showChat ? 'var(--gold)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-btn)',
              fontSize: '0.875rem',
              fontWeight: showChat ? 800 : 600,
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            💬 채팅
            {chatMessages.length > 0 && !showChat && (
              <span style={{
                position: 'absolute', top: '-4px', right: '-4px',
                width: '10px', height: '10px', borderRadius: '50%',
                background: 'var(--danger)',
              }} />
            )}
          </button>
          <button
            onClick={() => { setShowDemo(!showDemo); setCompareTeams([]) }}
            style={{
              padding: '8px 16px',
              background: showDemo ? '#FDD98A' : '#fff',
              color: 'var(--text)',
              border: `1.5px solid ${showDemo ? 'var(--gold)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-btn)',
              fontSize: '0.875rem',
              fontWeight: showDemo ? 800 : 600,
              cursor: 'pointer',
            }}
          >
            🎬 데모
          </button>
          <button
            onClick={() => downloadCsv(`/api/export/${sessionId}`, `session-${sessionId}.csv`)}
            style={{
              padding: '8px 16px',
              background: '#fff',
              color: 'var(--text)',
              borderRadius: 'var(--radius-btn)',
              border: '1.5px solid var(--border)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📥 CSV
          </button>
          {/* 결과 공개는 제출이 마감된 뒤에만 — 진행 중에 공개하면 서버가 진행 중 라운드를 지워 타이머가 사라진다 */}
          {currentChallenge && challengeStatus === 'ended' && (
            <button
              onClick={handleReveal}
              style={{
                padding: '8px 16px',
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
                border: 'none',
                borderRadius: 'var(--radius-btn)',
                boxShadow: '0 6px 18px var(--shadow)',
                fontSize: '0.875rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              🎯 결과 공개
            </button>
          )}
        </div>
      </div>

      {/* 라운드 진행 현황 — 지금 챌린지에 몇 팀이 제출을 마쳤는지 한눈에 */}
      {progressReady && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap',
          padding: '16px 20px',
          marginBottom: '16px',
          background: allSubmitted ? 'var(--success-bg)' : 'var(--warning-bg)',
          border: `2px solid ${allSubmitted ? 'var(--success)' : 'var(--gold)'}`,
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              제출
            </span>
            <span style={{
              fontSize: '2rem',
              fontWeight: 800,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              color: allSubmitted ? 'var(--success-text)' : 'var(--accent-text)',
            }}>
              {submittedCount}
            </span>
            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              / {activeTeamCount}팀
            </span>
          </div>

          {/* 진행 막대 */}
          <div style={{
            flex: 1,
            minWidth: '140px',
            height: '10px',
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: '999px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: activeTeamCount > 0 ? `${(submittedCount / activeTeamCount) * 100}%` : '0%',
              height: '100%',
              background: allSubmitted ? 'var(--success)' : 'var(--warning)',
              transition: 'width 0.3s ease-out',
            }} />
          </div>

          <span style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: allSubmitted ? 'var(--success-text)' : 'var(--warning-text)',
          }}>
            {activeTeamCount === 0
              ? '아직 참여한 팀이 없습니다'
              : allSubmitted
                ? '✓ 전원 제출 완료 — 결과 공개해도 됩니다'
                : submittedCount === 0
                  ? `⏳ 아직 제출한 팀이 없습니다 — ${pendingCount}팀 대기`
                  : `⏳ ${pendingCount}팀 미제출`}
          </span>
        </div>
      )}

      {/* 학생 등록 알림 */}
      {recentStudent && (
        <div style={{
          background: 'var(--success-bg)',
          color: 'var(--success-text)',
          border: '1.5px solid var(--success)',
          padding: '14px 20px',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '16px',
          fontSize: '1rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'slideUp 0.4s ease-out',
          boxShadow: '0 6px 18px rgba(46, 158, 91, 0.18)',
        }}>
          <span style={{ fontSize: '1.5rem' }}>🎉</span>
          <span>{recentStudent.studentNames.join(', ')}</span>
          <span style={{ opacity: 0.8 }}>→</span>
          <span style={{
            padding: '4px 12px',
            background: '#fff',
            border: '1px solid var(--success)',
            borderRadius: 'var(--radius-pill)',
            fontSize: '0.875rem',
          }}>
            {recentStudent.teamName}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.8125rem', opacity: 0.8 }}>환영!</span>
        </div>
      )}

      {/* 챌린지별 순위표 (결과 공개 후) */}
      {challengeRankings && (
        <div style={{
          background: 'var(--surface)',
          border: '2px solid var(--gold)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '24px',
          marginBottom: '24px',
          animation: 'slideUp 0.4s ease-out',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '16px',
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
              🎯 {currentChallenge?.title || '챌린지'} 순위
            </h3>
            <button
              onClick={() => setChallengeRankings(null)}
              style={{
                padding: '4px 12px',
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-pill)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              닫기
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(() => {
              const ranks = displayRanks(challengeRankings)
              return challengeRankings.map((r, i) => {
                const unsubmitted = isUnsubmitted(r)
                const rank = ranks[i]
                return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  background: rank === 1 ? 'var(--card)' : i % 2 === 0 ? 'var(--card2)' : 'var(--surface)',
                  border: `1px solid ${rank === 1 ? 'var(--gold)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                }}
              >
                {/* 미제출 팀은 메달·순위 번호 없이 '미제출'로만 표시하고 점수 칸은 비운다 */}
                {unsubmitted ? (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, minWidth: '28px', textAlign: 'center', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    미제출
                  </span>
                ) : (
                  <span style={{ fontSize: '1.125rem', width: '28px', textAlign: 'center' }}>
                    {['🥇', '🥈', '🥉'][rank - 1] || `${rank}`}
                  </span>
                )}
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: r.color, flexShrink: 0,
                }} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: '0.875rem' }}>{r.name}</span>
                {!unsubmitted && (
                  <span style={{
                    fontSize: '1.125rem', fontWeight: 800,
                    color: r.score > 0 ? 'var(--accent-text)' : 'var(--text-muted)',
                  }}>
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

      {/* 데모 모드 */}
      {showDemo && (
        <div style={{
          background: 'var(--surface)',
          border: '2px solid var(--gold)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '24px',
          marginBottom: '24px',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '12px' }}>
            🎬 교사 데모 — 프롬프트를 입력하면 AI가 3D 장면을 생성합니다
          </h3>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input
              value={demoPrompt}
              onChange={e => setDemoPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runDemo()}
              placeholder="예: 신호등 만들어줘"
              style={{
                flex: 1,
                padding: '10px 14px',
                background: 'var(--card2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
                fontSize: '1rem',
              }}
            />
            <button
              onClick={runDemo}
              disabled={demoLoading}
              style={{
                padding: '10px 20px',
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
                border: 'none',
                borderRadius: 'var(--radius-btn)',
                fontSize: '0.875rem',
                fontWeight: 800,
                cursor: 'pointer',
                opacity: demoLoading ? 0.6 : 1,
              }}
            >
              {demoLoading ? '생성 중...' : '🚀 실행'}
            </button>
          </div>
          {demoCode && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>AI가 생성한 코드</p>
                <pre style={{
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  padding: '12px',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.75rem',
                  overflow: 'auto',
                  maxHeight: '200px',
                  color: 'var(--success-text)',
                }}>{demoCode}</pre>
              </div>
              <VPythonRunner code={demoCode} height="250px" label="AI 결과" />
            </div>
          )}
        </div>
      )}

      {/* 현재 챌린지 + 목표 장면 */}
      {currentChallenge && !showDemo && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '20px',
          marginBottom: '24px',
          display: 'grid',
          gridTemplateColumns: '1fr 300px',
          gap: '16px',
          alignItems: 'start',
        }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--accent-text)', fontWeight: 700, marginBottom: '4px' }}>
              현재 챌린지 — Lv{currentChallenge.level}
            </p>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 800 }}>
              {currentChallenge.emoji} {currentChallenge.title}
            </h2>
          </div>
          <VPythonRunner code={targetCode} height="200px" label="목표 장면" />
        </div>
      )}

      {/* 팀 카드 그리드 */}
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
        💡 팀을 2개 클릭하면 프롬프트를 나란히 비교합니다
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '14px',
      }}>
        {teams.map((team) => {
          const isSelected = compareTeams.some(t => t.id === team.id)
          return (
            <div
              key={team.id}
              onClick={() => toggleCompare(team)}
              style={{
                background: 'var(--surface)',
                border: `2px solid ${isSelected ? team.color : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                padding: '16px',
                cursor: 'pointer',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
              }}>
                <div style={{
                  width: '12px', height: '12px', borderRadius: '50%',
                  background: team.color, flexShrink: 0,
                }} />
                <span style={{ fontWeight: 800, fontSize: '0.9375rem' }}>{team.name}</span>
                {isSelected && <span style={{ fontSize: '0.75rem', color: team.color }}>✓</span>}
              </div>

              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {(team.members || []).join(', ')}
              </div>

              {/* 현재 라운드 상태 — 제출함: 점수 / 미제출+진행 중: 작성 중 / 미제출+마감: 미제출.
                  이전 라운드 점수는 상태 줄에 섞지 않고 아래 보조 줄로만 보여 준다 */}
              {(() => {
                const state = teamRoundState(team, challengeStatus, progressReady)
                const prevBest = previousBestScore(team, state === 'idle', currentChallenge?.id)
                return (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '24px' }}>
                      {state === 'submitted' && (
                        <>
                          <span style={{ color: 'var(--success-text)', background: 'var(--success-bg)', padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: '0.7rem', fontWeight: 700 }}>✓ 제출 완료</span>
                          <span style={{ fontSize: '1.125rem', fontWeight: 800, color: team.color }}>
                            {team.latestScore}점
                          </span>
                        </>
                      )}
                      {state === 'writing' && (
                        <span style={{ color: 'var(--accent-text)', background: 'var(--card)', border: '1px solid var(--gold)', padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: '0.7rem', fontWeight: 700 }}>✏️ 작성 중</span>
                      )}
                      {state === 'missed' && (
                        <span style={{ color: 'var(--text-muted)', background: 'var(--surface2)', padding: '1px 8px', borderRadius: 'var(--radius-pill)', fontSize: '0.7rem', fontWeight: 700 }}>미제출</span>
                      )}
                      {state === 'idle' && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>⋯ 대기 중</span>
                      )}
                    </div>
                    {prevBest !== null && (
                      <div style={{ marginTop: '4px', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                        지난 라운드 최고 {prevBest}점
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      {/* 두 팀 프롬프트 비교 */}
      {compareTeams.length === 2 && (
        <div style={{
          marginTop: '24px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '24px',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '16px' }}>
            🔍 프롬프트 비교
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {compareTeams.map(team => {
              const data = compareData[team.id]
              // 상태 배열을 직접 정렬하면 렌더 중에 state가 바뀐다 — 복사본을 정렬한다
              const best = data?.attempts ? [...data.attempts].sort((a, b) => b.score - a.score)[0] : undefined
              return (
                <div key={team.id} style={{
                  background: 'var(--card2)',
                  borderRadius: 'var(--radius)',
                  padding: '16px',
                  border: `2px solid ${team.color}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <div style={{
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: team.color,
                    }} />
                    <span style={{ fontWeight: 700 }}>{team.name}</span>
                    {best && (
                      <span style={{ marginLeft: 'auto', fontWeight: 800, color: team.color }}>
                        {best.score}점
                      </span>
                    )}
                  </div>

                  {best ? (
                    <>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        프롬프트 (최고점 기준)
                      </p>
                      <div style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        padding: '12px',
                        borderRadius: 'var(--radius)',
                        fontSize: '0.875rem',
                        lineHeight: 1.6,
                        marginBottom: '12px',
                      }}>
                        {best.prompt}
                      </div>
                      <VPythonRunner code={best.generated_code} height="180px" label="AI 결과" />
                    </>
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      아직 제출 데이터가 없습니다
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {/* 전체 채팅 모니터링 패널 */}
      {showChat && (
        <div style={{
          marginTop: '24px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          padding: '24px',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '12px' }}>
            💬 전체 채팅 모니터링
          </h3>
          <div
            ref={chatScrollRef}
            style={{
              maxHeight: '300px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {chatMessages.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', textAlign: 'center', padding: '20px' }}>
                아직 채팅 메시지가 없습니다
              </p>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '6px 10px',
                background: i % 2 === 0 ? 'var(--card2)' : 'var(--surface)',
                borderRadius: 'var(--radius)',
                borderLeft: `3px solid ${msg.teamColor || 'var(--border)'}`,
              }}>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: msg.teamColor || 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  minWidth: '80px',
                }}>
                  {msg.teamName}
                </span>
                <span style={{ fontSize: '0.8125rem', flex: 1 }}>{msg.message}</span>
                <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(msg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
