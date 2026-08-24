import { useEffect, useRef, useState, useCallback } from 'react'
import { createBlobURL, revokeBlobURL } from '../../utils/glowscript.js'

/**
 * 에러 종류별 학생 안내 문구.
 * 'syntax'는 AI가 만든 코드 자체가 깨진 경우라 네트워크 안내를 하면 안 된다.
 */
const ERROR_GUIDE = {
  syntax: 'AI가 만든 코드에 문법 오류가 있어 3D 장면을 실행하지 못했어요. 설명을 조금 더 간결하게 나눠서 다시 시도해보세요.',
  runtime: '3D 장면을 그리는 중에 오류가 났어요. 설명을 조금 더 간결하게 다듬어 다시 시도해보세요.',
  resource: '3D 라이브러리를 불러오지 못했어요. 네트워크 상태를 확인하고 다시 시도해주세요.',
  timeout: '3D 장면을 불러오는 데 시간이 너무 오래 걸려요. 네트워크 상태를 확인하고 다시 시도해주세요.',
}

/**
 * VPythonRunner
 * GlowScript 3.2 코드를 Blob URL iframe으로 렌더링
 * - 로딩 타임아웃 감지 (8초)
 * - postMessage 기반 에러 감지 (구문 오류 / 실행 오류 / 리소스 / 타임아웃 구분)
 * - 재시도 버튼
 *
 * Props:
 *   code      string  — VPython 코드
 *   width     string  — 기본 '100%'
 *   height    string  — 기본 '300px'
 *   label     string  — 상단 레이블 (선택)
 *   autoRun   bool    — 코드 변경 시 자동 재실행 (기본 true)
 *   onError   func    — 에러 콜백 (선택). { kind, message, guide } 를 받는다.
 *   onReady   func    — 렌더링 성공 콜백 (선택). 부모가 실패 안내를 거둘 때 쓴다.
 */
export default function VPythonRunner({
  code,
  width = '100%',
  height = '300px',
  label,
  autoRun = true,
  onError,
  onReady,
}) {
  const blobRef = useRef(null)
  const timerRef = useRef(null)
  const iframeRef = useRef(null)
  // status를 setTimeout 안에서 읽으면 클로저에 갇힌 옛 값을 보게 된다.
  // (이 때문에 타임아웃 판정이 엉뚱하게 동작했다)
  const statusRef = useRef('idle')
  // onError는 부모가 렌더할 때마다 새 함수가 되기 쉽다(예: prompt 상태에 의존).
  // 콜백에 직접 물리면 글자를 칠 때마다 iframe이 다시 로드되므로 ref로 받는다.
  const onErrorRef = useRef(onError)
  const onReadyRef = useRef(onReady)
  useEffect(() => { onErrorRef.current = onError }, [onError])
  useEffect(() => { onReadyRef.current = onReady }, [onReady])

  const [src, setSrc] = useState(null)
  const [error, setError] = useState(null)
  const [errorKind, setErrorKind] = useState(null) // syntax | runtime | resource | timeout
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [retryCount, setRetryCount] = useState(0)

  const applyStatus = useCallback((next) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const reportError = useCallback((kind, rawMessage) => {
    const guide = ERROR_GUIDE[kind] || ERROR_GUIDE.runtime
    applyStatus('error')
    setErrorKind(kind)
    setError(guide)
    onErrorRef.current?.({ kind, message: rawMessage || guide, guide })
  }, [applyStatus])

  const run = useCallback((c) => {
    if (!c?.trim()) return
    setError(null)
    setErrorKind(null)
    applyStatus('loading')

    // 기존 Blob URL 해제
    if (blobRef.current) revokeBlobURL(blobRef.current)
    // 타이머 정리
    if (timerRef.current) clearTimeout(timerRef.current)

    try {
      const url = createBlobURL(c)
      blobRef.current = url
      setSrc(url)

      // 8초 타임아웃 — 렌더링 성공/실패 메시지가 둘 다 안 오면 에러 처리
      timerRef.current = setTimeout(() => {
        if (statusRef.current === 'loading') {
          reportError('timeout', 'timeout')
        }
      }, 8000)
    } catch (e) {
      reportError('runtime', e.message)
    }
  }, [applyStatus, reportError])

  // postMessage 이벤트 수신
  useEffect(() => {
    const handleMessage = (e) => {
      if (!e.data?.type?.startsWith('glowscript:')) return
      // 내 iframe이 보낸 메시지만 처리한다.
      // (한 화면에 여러 Runner가 있으면 목표 장면 칸에 AI 장면의 오류가 뜨는 문제가 있었다)
      const mine = iframeRef.current?.contentWindow
      if (!mine || e.source !== mine) return

      if (e.data.type === 'glowscript:ready') {
        applyStatus('ready')
        setError(null)
        setErrorKind(null)
        if (timerRef.current) clearTimeout(timerRef.current)
        onReadyRef.current?.()
      } else if (e.data.type === 'glowscript:error') {
        if (timerRef.current) clearTimeout(timerRef.current)
        reportError(e.data.kind || 'runtime', e.data.message)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [applyStatus, reportError])

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
            {/* 구문 오류는 같은 코드를 다시 그려도 결과가 같으므로 재시도 버튼을 숨긴다 */}
            {errorKind !== 'syntax' && (
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
            )}
            {errorKind !== 'syntax' && retryCount > 0 && (
              <span style={{ color: '#64748b', fontSize: '0.6875rem', marginTop: '6px' }}>
                {retryCount}회 재시도
              </span>
            )}
          </div>
        )}

        {src && (
          <iframe
            key={src}
            ref={iframeRef}
            src={src}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="VPython Scene"
          />
        )}
      </div>
    </div>
  )
}
