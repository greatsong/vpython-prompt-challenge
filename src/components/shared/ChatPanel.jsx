import { useState, useEffect, useRef } from 'react'

export default function ChatPanel({ socket, sessionId, teamName, teamColor, members }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [unread, setUnread] = useState(0)
  const scrollRef = useRef(null)
  const sender = (members || []).join(' · ') || teamName

  useEffect(() => {
    const s = socket?.current
    if (!s) return

    const handleMsg = (msg) => {
      setMessages((prev) => [...prev, msg])
      if (!open) setUnread((u) => u + 1)
    }

    s.on('chat:all', handleMsg)
    return () => s.off('chat:all', handleMsg)
  }, [socket?.current, open])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  const handleSend = () => {
    const s = socket?.current
    if (!s || !input.trim()) return
    s.emit('chat:all', {
      sessionId, teamName, teamColor,
      sender, message: input.trim(),
    })
    setInput('')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
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
        {unread > 0 && (
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
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 50,
      width: 'min(340px, calc(100vw - 40px))',
      height: 'min(440px, calc(100vh - 100px))',
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
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>💬 전체 채팅</span>
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

      {/* 메시지 */}
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
            전체 학생에게 메시지를 보내보세요!
          </p>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.sender === sender
          return (
            <div key={i} style={{
              alignSelf: isMe ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
            }}>
              {!isMe && (
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

      {/* 입력 */}
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
          placeholder="메시지 입력..."
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
