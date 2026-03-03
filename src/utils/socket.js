import { io } from 'socket.io-client'

/**
 * 환경에 따라 올바른 Socket.io 서버에 연결
 * - 개발: Vite 프록시 → Express 4009
 * - 프로덕션(단일 서버): 같은 origin
 */
export function createSocket() {
  // 개발 환경: Vite가 /socket.io를 4009로 프록시
  // 프로덕션: 같은 origin에 연결
  return io(window.location.origin, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  })
}
