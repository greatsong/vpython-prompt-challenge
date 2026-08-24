import { io } from 'socket.io-client'
import { getTeacherToken } from './teacherAuth.js'

/**
 * 환경에 따라 올바른 Socket.io 서버에 연결
 * - 개발: Vite 프록시 → Express 4009
 * - 프로덕션(단일 서버): 같은 origin
 *
 * teacher=true 이면 연결 직후 교사 토큰을 서버에 전달해 교사 권한 이벤트를 해금한다.
 */
export function createSocket({ teacher = false } = {}) {
  const socket = io(window.location.origin, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  })
  if (teacher) {
    const token = getTeacherToken()
    const sendAuth = () => {
      if (token) socket.emit('auth:teacher', { token })
    }
    if (socket.connected) sendAuth()
    else socket.on('connect', sendAuth)
  }
  return socket
}

/**
 * ack 콜백을 받는 emit — 서버 응답을 Promise로 돌려준다.
 * 서버가 응답하지 않거나 소켓이 끊겼으면 timeoutMs 후 { ok: false, error, timeout: true }로 resolve.
 */
export function emitWithAck(socket, event, payload, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, error: '서버에 연결되어 있지 않습니다' })
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ ok: false, error: '서버 응답이 없습니다. 잠시 후 다시 시도해주세요.', timeout: true })
    }, timeoutMs)

    socket.emit(event, payload, (res) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(res || { ok: false, error: '서버 응답이 비어 있습니다' })
    })
  })
}
