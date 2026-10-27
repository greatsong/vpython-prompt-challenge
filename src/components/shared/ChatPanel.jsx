import { useState, useEffect, useRef } from 'react'

// 서버 MAX_CHAT_LENGTH와 같다 — 서버도 자르지만 입력 단계에서 먼저 맞춘다
const MAX_CHAT_LENGTH = 500

// 보낸 사람·팀 이름·색은 서버가 소켓의 입장 정보로 정한다. 여기서는 sessionId와 message만 보낸다.
// teamName·members는 "내가 보낸 메시지" 판별(서버의 sender 규칙과 같은 값)에만 쓴다.
export default function ChatPanel({ socket, sessionId, teamName, teamColor, members }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [unread, setUnread] = useState(0)
  const scrollRef = useRef(null)
  const sender = (members || []).join(' · ') || teamName
  // 소켓 인스턴스(권장) 또는 ref를 모두 받는다.
  // ref.current를 effect 의존성으로 쓰면 연결 직후 리스너가 붙지 않으므로 인스턴스를 꺼내 쓴다.
  const s = socket && typeof socket.emit === 'function' ? socket : socket?.current || null
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open }, [open])

  useEffect(() => {
    if (!s) return

    const handleMsg = (msg) => {
      setMessages((prev) => [...prev.slice(-199), msg])
      if (!openRef.current) setUnread((u) => u + 1)
    }

    s.on('chat:all', handleMsg)
    return () => s.off('chat:all', handleMsg)
  }, [s])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  const handleSend = () => {
    const text = input.trim().slice(0, MAX_CHAT_LENGTH)
    if (!s || !text) return
    s.emit('chat:all', { sessionId, message: text }, (res) => {
      // 너무 빠르게 보냈거나 입장 전이라 거절되면 입력창에 되돌려 다시 보낼 수 있게 한다
      if (res && res.ok === false) {
        console.warn('[ChatPanel] 전송 거절:', res.error)
        setInput((cur) => cur || text)
      }
    })
    setInput('')
  }

  if (!open) {
    return (
      <button
        className="chat-fab"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `전체 채팅 열기, 읽지 않은 메시지 ${unread}개` : '전체 채팅 열기'}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 50,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--btn-primary-bg)',
          color: 'var(--btn-primary-text)',
          border: '3px solid #fff',
          fontSize: '1.5rem',
          cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(180, 140, 20, 0.35)',
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
            background: 'var(--danger-text)',
            color: '#fff',
            border: '2px solid #fff',
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
      boxShadow: '0 12px 36px rgba(180, 140, 20, 0.22)',
      animation: 'slideUp 0.3s ease-out',
      overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '10px 16px',
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
      }}>
        <span style={{ fontWeight: 800, fontSize: '0.875rem' }}>💬 전체 채팅</span>
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
                background: isMe ? '#FDD98A' : 'var(--card2)',
                color: 'var(--text)',
                border: isMe ? '1px solid #F6C75A' : '1px solid var(--border)',
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
                opacity: 0.85,
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
          onChange={(e) => setInput(e.target.value.slice(0, MAX_CHAT_LENGTH))}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          maxLength={MAX_CHAT_LENGTH}
          placeholder="메시지 입력..."
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'var(--card2)',
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
            background: input.trim() ? 'var(--btn-primary-bg)' : 'var(--surface2)',
            color: input.trim() ? 'var(--btn-primary-text)' : 'var(--text-muted)',
            border: 'none',
            borderRadius: 'var(--radius-btn)',
            fontSize: '0.875rem',
            fontWeight: 800,
            cursor: input.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          ↑
        </button>
      </div>
    </div>
  )
}
