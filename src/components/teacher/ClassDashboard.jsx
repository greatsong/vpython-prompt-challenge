import { useEffect, useState, useRef } from 'react'
import { createSocket } from '../../utils/socket.js'
import useSessionStore from '../../store/sessionStore.js'
import useTeamStore from '../../store/teamStore.js'
import VPythonRunner from '../shared/VPythonRunner.jsx'
import { generateCode } from '../../utils/claude.js'

export default function ClassDashboard({ sessionId }) {
  const { currentChallenge } = useSessionStore()
  const { teams, setTeams, updateTeamScore } = useTeamStore()
  const socketRef = useRef(null)
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

  const loadTeams = async () => {
    const res = await fetch(`/api/dashboard/${sessionId}`)
    const data = await res.json()
    setTeams(data.teams)
  }

  useEffect(() => {
    loadTeams()
    const socket = createSocket()
    socketRef.current = socket
    socket.emit('teacher:join', { sessionId })
    socket.on('team:submitted', ({ teamId, score }) => {
      updateTeamScore(teamId, score)
    })
    socket.on('dashboard:update', loadTeams)

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

    return () => socket.disconnect()
  }, [sessionId])

  // 채팅 스크롤
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatMessages])

  const handleReveal = () => {
    socketRef.current?.emit('challenge:reveal', {
      sessionId,
      challengeId: currentChallenge?.id,
    })
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
    if (!compareData[team.id]) {
      try {
        const res = await fetch(`/api/dashboard/attempts/${sessionId}/${team.id}`)
        if (res.ok) {
          const data = await res.json()
          setCompareData(prev => ({ ...prev, [team.id]: data }))
        }
      } catch (e) { /* ignore */ }
    }
  }

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            🧠 VPython 프롬프트 챌린지
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
            {teams.length}팀 참여 중
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowChat(!showChat)}
            style={{
              padding: '8px 16px',
              background: showChat ? 'var(--accent)' : 'var(--surface2)',
              color: showChat ? 'white' : 'var(--text)',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '0.875rem',
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
              background: showDemo ? 'var(--warning)' : 'var(--surface2)',
              color: showDemo ? 'white' : 'var(--text)',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            🎬 데모
          </button>
          <a
            href={`/api/export/${sessionId}`}
            style={{
              padding: '8px 16px',
              background: 'var(--surface2)',
              color: 'var(--text)',
              borderRadius: 'var(--radius)',
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            📥 CSV
          </a>
          <button
            onClick={handleReveal}
            style={{
              padding: '8px 16px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            🎯 결과 공개
          </button>
        </div>
      </div>

      {/* 학생 등록 알림 */}
      {recentStudent && (
        <div style={{
          background: 'linear-gradient(135deg, #22c55e, #14b8a6)',
          color: 'white',
          padding: '14px 20px',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '16px',
          fontSize: '1rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'slideUp 0.4s ease-out',
          boxShadow: '0 4px 20px rgba(34, 197, 94, 0.3)',
        }}>
          <span style={{ fontSize: '1.5rem' }}>🎉</span>
          <span>{recentStudent.studentNames.join(', ')}</span>
          <span style={{ opacity: 0.8 }}>→</span>
          <span style={{
            padding: '4px 12px',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '20px',
            fontSize: '0.875rem',
          }}>
            {recentStudent.teamName}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.8125rem', opacity: 0.8 }}>환영!</span>
        </div>
      )}

      {/* 데모 모드 */}
      {showDemo && (
        <div style={{
          background: 'var(--surface)',
          border: '2px solid var(--warning)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          marginBottom: '24px',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px' }}>
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
                background: 'var(--bg)',
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
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: '0.875rem',
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
                  background: 'var(--bg)',
                  padding: '12px',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.75rem',
                  overflow: 'auto',
                  maxHeight: '200px',
                  color: 'var(--success)',
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
          padding: '16px',
          marginBottom: '24px',
          display: 'grid',
          gridTemplateColumns: '1fr 300px',
          gap: '16px',
          alignItems: 'start',
        }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              현재 챌린지 — Lv{currentChallenge.level}
            </p>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>
              {currentChallenge.emoji} {currentChallenge.title}
            </h2>
          </div>
          <VPythonRunner code={currentChallenge.code} height="200px" label="목표 장면" />
        </div>
      )}

      {/* 팀 카드 그리드 */}
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
        💡 팀을 2개 클릭하면 프롬프트를 나란히 비교합니다
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '12px',
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
                padding: '16px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
              }}>
                <div style={{
                  width: '12px', height: '12px', borderRadius: '50%',
                  background: team.color, flexShrink: 0,
                }} />
                <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{team.name}</span>
                {isSelected && <span style={{ fontSize: '0.75rem', color: team.color }}>✓</span>}
              </div>

              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {(team.members || []).join(', ')}
              </div>

              {team.hasSubmitted ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ color: 'var(--success)', fontSize: '0.75rem' }}>✓ 제출</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: team.color }}>
                    {team.latestScore ?? '?'}점
                  </span>
                </div>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  ⋯ 진행 중
                </span>
              )}
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
          padding: '20px',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>
            🔍 프롬프트 비교
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {compareTeams.map(team => {
              const data = compareData[team.id]
              const best = data?.attempts?.sort((a, b) => b.score - a.score)?.[0]
              return (
                <div key={team.id} style={{
                  background: 'var(--bg)',
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
          padding: '20px',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px' }}>
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
                background: 'var(--bg)',
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