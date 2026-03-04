import { useState, useEffect, useRef } from 'react'

const CHAT_TABS = [
  { key: 'all', label: '전체 채팅', emoji: '🌐' },
  { key: 'team', label: '팀 채팅', emoji: '🤝' },
]

export default function ChatPanel({ socket, sessionId, teamId, teamName, teamColor, members }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('all')
  const [input, setInput] = useState('')
  const [allMessages, setAllMessages] = useState([])
  const [teamMessages, setTeamMessages] = useState([])
  const [unread, setUnread] = useState({ all: 0, team: 0 })
  const scrollRef = useRef(null)
  const sender = (members || []).join(' · ') || teamName

  // 소켓 이벤트 리스너
  useEffect(() => {
    const s = socket?.current
    if (!s) return

    const handleAll = (msg) => {
      setAllMessages((prev) => [...prev, msg])
      if (!open || tab !== 'all') {
        setUnread((u) => ({ ...u, all: u.all + 1 }))
      }
    }

    const handleTeam = (msg) => {
      setTeamMessages((prev) => [...prev, msg])
      if (!open || tab !== 'team') {
        setUnread((u) => ({ ...u, team: u.team + 1 }))
      }
    }

    s.on('chat:all', handleAll)
    s.on('chat:team', handleTeam)
    return () => {
      s.off('chat:all', handleAll)
      s.off('chat:team', handleTeam)
    }
  }, [socket?.current, open, tab])

  // 스크롤 맨 아래로
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [allMessages, teamMessages, tab])

  // 탭 변경 시 unread 리셋
  useEffect(() => {
    if (open) setUnread((u) => ({ ...u, [tab]: 0 }))
  }, [tab, open])

  const handleSend = () => {
    const s = socket?.current
    if (!s || !input.trim()) return

    if (tab === 'all') {
      s.emit('chat:all', {
        sessionId, teamName, teamColor,
        sender, message: input.trim(),
      })
    } else {
      s.emit('chat:team', {
        sessionId, teamId,
        sender, message: input.trim(),
      })
    }
    setInput('')
  }

  const messages = tab === 'all' ? allMessages : teamMessages
  const totalUnread = unread.all + unread.team

  // 닫힌 상태: 플로팅 버튼
  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setUnread((u) => ({ ...u, [tab]: 0 })) }}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 50,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--accent)',
          color: 'white',
          border: 'none',
          fontSize: '1.5rem',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        💬
        {totalUnread > 0 && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: 'var(--danger)',
            color: 'white',
            fontSize: '0.7rem',
            fontWeight: 800,
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'bounceIn 0.3s ease-out',
          }}>
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>
    )
  }

  // 열린 상태: 채팅 패널
  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 50,
      width: '340px',
      height: '440px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      animation: 'slideUp 0.3s ease-out',
      overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '10px 16px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        {CHAT_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '6px 12px',
              background: tab === t.key ? 'var(--accent)' : 'transparent',
              color: tab === t.key ? 'white' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            {t.emoji} {t.label}
            {unread[t.key] > 0 && tab !== t.key && (
              <span style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--danger)',
              }} />
            )}
          </button>
        ))}
        <button
          onClick={() => setOpen(false)}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '1.25rem',
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          ✕
        </button>
      </div>

      {/* 메시지 영역 */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {messages.length === 0 && (
          <p style={{
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.8125rem',
            marginTop: '40px',
          }}>
            {tab === 'all' ? '🌐 전체 학생에게 메시지를 보내보세요!' : '🤝 팀원에게 메시지를 보내보세요!'}
          </p>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.sender === sender
          return (
            <div key={i} style={{
              alignSelf: isMe ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
            }}>
              {/* 보낸 사람 이름 (전체 채팅에서만, 남의 메시지만) */}
              {tab === 'all' && !isMe && (
                <div style={{
                  fontSize: '0.6875rem',
                  color: msg.teamColor || 'var(--text-muted)',
                  fontWeight: 600,
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: msg.teamColor || 'var(--text-muted)',
                    display: 'inline-block',
                  }} />
                  {msg.teamName}
                </div>
              )}
              <div style={{
                padding: '8px 12px',
                background: isMe ? 'var(--accent)' : 'var(--bg)',
                color: isMe ? 'white' : 'var(--text)',
                borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                fontSize: '0.875rem',
                lineHeight: 1.5,
                wordBreak: 'break-word',
              }}>
                {msg.message}
              </div>
              <div style={{
                fontSize: '0.625rem',
                color: 'var(--text-muted)',
                textAlign: isMe ? 'right' : 'left',
                marginTop: '2px',
                opacity: 0.6,
              }}>
                {new Date(msg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )
        })}
      </div>

      {/* 입력 영역 */}
      <div style={{
        padding: '10px 12px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        gap: '8px',
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={tab === 'all' ? '전체에게 메시지...' : '팀에게 메시지...'}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            padding: '8px 14px',
            background: input.trim() ? 'var(--accent)' : 'var(--surface2)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: '0.875rem',
            cursor: input.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          ↑
        </button>
      </div>
    </div>
  )
}
