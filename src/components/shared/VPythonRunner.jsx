import { useEffect, useRef, useState, useCallback } from 'react'
import { createBlobURL, revokeBlobURL } from '../../utils/glowscript.js'

/**
 * VPythonRunner
 * GlowScript 3.2 코드를 Blob URL iframe으로 렌더링
 * - 로딩 타임아웃 감지 (8초)
 * - postMessage 기반 에러 감지
 * - 재시도 버튼
 *
 * Props:
 *   code      string  — VPython 코드
 *   width     string  — 기본 '100%'
 *   height    string  — 기본 '300px'
 *   label     string  — 상단 레이블 (선택)
 *   autoRun   bool    — 코드 변경 시 자동 재실행 (기본 true)
 *   onError   func    — 에러 콜백 (선택)
 */
export default function VPythonRunner({
  code,
  width = '100%',
  height = '300px',
  label,
  autoRun = true,
  onError,
}) {
  const blobRef = useRef(null)
  const timerRef = useRef(null)
  const [src, setSrc] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [retryCount, setRetryCount] = useState(0)

  const run = useCallback((c) => {
    if (!c?.trim()) return
    setError(null)
    setStatus('loading')

    // 기존 Blob URL 해제
    if (blobRef.current) revokeBlobURL(blobRef.current)
    // 타이머 정리
    if (timerRef.current) clearTimeout(timerRef.current)

    try {
      const url = createBlobURL(c)
      blobRef.current = url
      setSrc(url)

      // 8초 타임아웃 — 렌더링 성공 메시지 안 오면 에러 처리
      timerRef.current = setTimeout(() => {
        if (status === 'loading') {
          setStatus('error')
          setError('렌더링 시간이 초과되었습니다. 네트워크를 확인하세요.')
          onError?.('timeout')
        }
      }, 8000)
    } catch (e) {
      setError(e.message)
      setStatus('error')
      onError?.(e.message)
    }
  }, [onError])

  // postMessage 이벤트 수신
  useEffect(() => {
    const handleMessage = (e) => {
      if (!e.data?.type?.startsWith('glowscript:')) return
      // 현재 iframe의 메시지인지 확인 (blob URL이 같을 때)
      if (e.data.type === 'glowscript:ready') {
        setStatus('ready')
        setError(null)
        if (timerRef.current) clearTimeout(timerRef.current)
      } else if (e.data.type === 'glowscript:error') {
        setStatus('error')
        setError(e.data.message || '렌더링 중 오류가 발생했습니다')
        if (timerRef.current) clearTimeout(timerRef.current)
        onError?.(e.data.message)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onError])

  useEffect(() => {
    if (autoRun && code) run(code)
    if (!code) {
      setStatus('idle')
      setSrc(null)
      setError(null)
    }
  }, [code, autoRun, run])

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (blobRef.current) revokeBlobURL(blobRef.current)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleRetry = () => {
    setRetryCount(prev => prev + 1)
    run(code)
  }

  return (
    <div style={{ width }}>
      {label && (
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          marginBottom: '4px',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          {label}
        </div>
      )}

      <div style={{
        background: '#1a1a2e',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        position: 'relative',
        height,
      }}>
        {/* 대기 상태 */}
        {status === 'idle' && !src && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: '0.875rem',
          }}>
            프롬프트를 제출하면 AI가 만든 장면이 여기에 표시됩니다
          </div>
        )}

        {/* 로딩 표시 */}
        {status === 'loading' && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(26, 26, 46, 0.85)',
          }}>
            <div style={{
              width: '28px', height: '28px',
              border: '3px solid rgba(99, 102, 241, 0.3)',
              borderTopColor: '#6366f1',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '8px' }}>
              3D 장면 로딩 중...
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* 에러 + 재시도 */}
        {status === 'error' && error && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 3,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(26, 26, 46, 0.95)',
            padding: '16px',
            textAlign: 'center',
          }}>
            <div style={{ color: '#f87171', fontSize: '0.8125rem', marginBottom: '12px', lineHeight: 1.5 }}>
              {error}
            </div>
            <button
              onClick={handleRetry}
              style={{
                padding: '8px 20px',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              다시 시도
            </button>
            {retryCount > 0 && (
              <span style={{ color: '#64748b', fontSize: '0.6875rem', marginTop: '6px' }}>
                {retryCount}회 재시도
              </span>
            )}
          </div>
        )}

        {src && (
          <iframe
            key={src}
            src={src}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="VPython Scene"
          />
        )}
      </div>
    </div>
  )
}
