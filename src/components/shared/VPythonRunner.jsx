import { useEffect, useRef, useState, useCallback } from 'react'
import { buildGlowScriptHTML, checkCodeSafety, ANIMATION_GUIDE } from '../../utils/glowscript.js'

// 탭이 숨겨져 있는지 (다른 탭을 보고 있거나 창이 가려진 상태)
function isPageHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

// 주 입력 장치가 손가락(터치)인지 — 회전 안내 문구를 기기에 맞춰 바꾼다
function isCoarsePointer() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

/**
 * 에러 종류별 학생 안내 문구.
 * 'syntax'는 AI가 만든 코드 자체가 깨진 경우라 네트워크 안내를 하면 안 된다.
 */
const ERROR_GUIDE = {
  syntax: 'AI가 만든 코드에 문법 오류가 있어 3D 장면을 실행하지 못했어요. 설명을 조금 더 간결하게 나눠서 다시 시도해보세요.',
  runtime: '3D 장면을 그리는 중에 오류가 났어요. 설명을 조금 더 간결하게 다듬어 다시 시도해보세요.',
  resource: '3D 라이브러리를 불러오지 못했어요. 네트워크 상태를 확인하고 다시 시도해주세요.',
  timeout: '3D 장면이 제시간에 그려지지 않아 실행을 멈췄어요. 네트워크 상태를 확인하고 다시 시도해주세요.',
  // 실행 전 정적 검사에서 걸린 코드 (무한 루프·rate 애니메이션)
  animation: ANIMATION_GUIDE,
  // 실행 중 루프 가드에 걸린 코드 (끝나지 않는 반복)
  loop: '반복이 끝나지 않는 코드라 실행을 멈췄어요. ' + ANIMATION_GUIDE,
}

// 같은 코드를 다시 실행해도 결과가 같은 오류 — 재시도 버튼을 숨긴다
const NON_RETRYABLE = new Set(['syntax', 'animation', 'loop'])

// watchdog: 이 시간 안에 iframe이 ready/error를 보내지 않으면 iframe을 제거한다.
// 탭이 백그라운드(hidden)일 때는 브라우저가 타이머·렌더링을 늦추므로 시간을 재지 않는다.
const WATCHDOG_MS = 8000

/**
 * VPythonRunner
 * GlowScript 3.2 코드를 sandbox iframe(srcdoc)으로 렌더링
 * - sandbox="allow-scripts" (allow-same-origin 없음) — 생성 코드를 부모 출처와 분리
 * - 실행 전 정적 검사 (무한 루프·rate 애니메이션은 실행하지 않음)
 * - watchdog (8초, 탭이 보일 때만 측정) — 응답이 없으면 iframe을 제거
 * - postMessage 기반 에러 감지 (구문 / 실행 / 리소스 / 타임아웃 / 루프 구분)
 * - 재시도 버튼
 *
 * Props:
 *   code      string  — VPython 코드
 *   width     string  — 기본 '100%'
 *   height    string  — 기본 '300px'
 *   label     string  — 상단 레이블 (선택)
 *   autoRun   bool    — 코드 변경 시 자동 재실행 (기본 true).
 *                       false이고 코드가 있으면 "다시 보기" 버튼을 보여 주고 눌렀을 때만 실행한다.
 *   onError   func    — 에러 콜백 (선택). { kind, message, guide } 를 받는다.
 *   onReady   func    — 렌더링 성공 콜백 (선택). 부모가 실패 안내를 거둘 때 쓴다.
 */
export default function VPythonRunner({
  code,
  width = '100%',
  height = '300px',
  label,
  loadingText,          // 로딩 중 문구 (선택, 기본 '3D 장면 로딩 중...')
  autoRun = true,
  onError,
  onReady,
}) {
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

  // srcdoc + runId — 같은 코드를 다시 실행해도 key가 바뀌어 iframe이 새로 만들어진다
  const [frame, setFrame] = useState(null) // { html, runId } | null
  const runIdRef = useRef(0)
  // 탭이 숨겨진 동안 들어온 실행 요청 — 탭이 다시 보이면 그때 iframe을 만든다.
  // 숨겨진 탭에서 만든 장면은 탭을 다시 열어도 WebGL 화면이 회색으로 비어 있고 새로고침해야 보였다.
  const deferredCodeRef = useRef(null)
  // 장면을 그리는 도중(loading)에 탭이 숨겨졌는지 — 보이게 되면 같은 코드로 다시 그린다
  const rerunOnVisibleRef = useRef(false)
  const lastRunCodeRef = useRef(null)
  const [error, setError] = useState(null)
  const [errorKind, setErrorKind] = useState(null) // syntax | runtime | resource | timeout | animation | loop
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [retryCount, setRetryCount] = useState(0)
  // 터치 기기 여부 — 마우스를 연결하거나 떼면 바뀔 수 있어 변경도 따라간다
  const [coarsePointer, setCoarsePointer] = useState(isCoarsePointer)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    let mq
    try { mq = window.matchMedia('(pointer: coarse)') } catch { return undefined }
    const onChange = () => setCoarsePointer(mq.matches)
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    if (typeof mq.addListener === 'function') {
      mq.addListener(onChange)
      return () => mq.removeListener(onChange)
    }
    return undefined
  }, [])

  const applyStatus = useCallback((next) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const clearWatchdog = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const reportError = useCallback((kind, rawMessage, { removeFrame = false } = {}) => {
    const guide = ERROR_GUIDE[kind] || ERROR_GUIDE.runtime
    clearWatchdog()
    // 멈췄을 수 있는 iframe은 문서에서 떼어 내 실행을 끝낸다
    if (removeFrame) setFrame(null)
    applyStatus('error')
    setErrorKind(kind)
    setError(guide)
    onErrorRef.current?.({ kind, message: rawMessage || guide, guide })
  }, [applyStatus, clearWatchdog])

  // watchdog 시작 — 탭이 숨겨져 있으면 보류하고, 보이게 되면 visibilitychange에서 다시 건다
  const armWatchdog = useCallback(() => {
    clearWatchdog()
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (statusRef.current === 'loading') {
        reportError('timeout', 'timeout', { removeFrame: true })
      }
    }, WATCHDOG_MS)
  }, [clearWatchdog, reportError])

  const run = useCallback((c) => {
    if (!c?.trim()) return
    setError(null)
    setErrorKind(null)
    clearWatchdog()

    // 실행 전 정적 검사 — 걸리면 iframe을 만들지 않는다
    const safety = checkCodeSafety(c)
    if (!safety.ok) {
      setFrame(null)
      reportError('animation', safety.reason)
      return
    }

    applyStatus('loading')
    lastRunCodeRef.current = c
    rerunOnVisibleRef.current = false
    // 숨겨진 탭에서는 iframe을 만들지 않는다 (교사가 챌린지를 시작할 때 학생이 다른 탭을 보고 있던 경우)
    if (isPageHidden()) {
      deferredCodeRef.current = c
      setFrame(null)
      return
    }
    deferredCodeRef.current = null
    try {
      runIdRef.current += 1
      setFrame({ html: buildGlowScriptHTML(c), runId: runIdRef.current })
      armWatchdog()
    } catch (e) {
      reportError('runtime', e.message)
    }
  }, [applyStatus, reportError, armWatchdog, clearWatchdog])

  // 탭이 다시 보이면: 숨겨진 동안 미룬 장면을 지금 만들고, 그리다가 숨겨진 장면은 다시 그린다.
  // 로딩 중인 장면의 watchdog도 새로 건다 (백그라운드 오발동 방지)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clearWatchdog()
        if (statusRef.current === 'loading' && !deferredCodeRef.current) rerunOnVisibleRef.current = true
        return
      }
      const pending = deferredCodeRef.current || (rerunOnVisibleRef.current ? lastRunCodeRef.current : null)
      if (pending) {
        run(pending)
      } else if (statusRef.current === 'loading') {
        armWatchdog()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [armWatchdog, clearWatchdog, run])

  // postMessage 이벤트 수신
  useEffect(() => {
    const handleMessage = (e) => {
      if (!e.data?.type?.startsWith?.('glowscript:')) return
      // 내 iframe이 보낸 메시지만 처리한다.
      // (한 화면에 여러 Runner가 있으면 목표 장면 칸에 AI 장면의 오류가 뜨는 문제가 있었다)
      // sandbox iframe은 출처가 opaque("null")라 origin 대신 source로만 구분한다.
      const mine = iframeRef.current?.contentWindow
      if (!mine || e.source !== mine) return

      if (e.data.type === 'glowscript:ready') {
        // 숨겨진 상태에서 끝난 장면은 보이게 될 때 한 번 더 그린다 (rerunOnVisibleRef 유지)
        if (!isPageHidden()) rerunOnVisibleRef.current = false
        clearWatchdog()
        applyStatus('ready')
        setError(null)
        setErrorKind(null)
        onReadyRef.current?.()
      } else if (e.data.type === 'glowscript:error') {
        const kind = e.data.kind || 'runtime'
        // 루프 가드에 걸린 iframe은 떼어 낸다
        reportError(kind, e.data.message, { removeFrame: kind === 'loop' })
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [applyStatus, reportError, clearWatchdog])

  useEffect(() => {
    if (autoRun && code) {
      run(code)
      return
    }
    // 코드가 비었거나(다음 챌린지 등) 자동 실행이 꺼졌으면 이전 장면·오류 상태를 모두 초기화한다
    deferredCodeRef.current = null
    rerunOnVisibleRef.current = false
    clearWatchdog()
    applyStatus('idle')
    setFrame(null)
    setError(null)
    setErrorKind(null)
    setRetryCount(0)
  }, [code, autoRun, run, applyStatus, clearWatchdog])

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
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
          color: 'var(--text)',
          marginBottom: '6px',
          fontWeight: 800,
          letterSpacing: '0.02em',
        }}>
          {label}
        </div>
      )}

      <div style={{
        // 3D 장면(캔버스)은 어두울 수 있어 카드처럼 테두리·둥근 모서리·그림자로 감싼다
        background: 'var(--card2)',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        position: 'relative',
        height,
      }}>
        {/* 수동 실행 대기 — 새로고침으로 복원된 코드는 자동 실행하지 않는다 */}
        {status === 'idle' && !frame && !autoRun && code && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', gap: '8px',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: '0.8125rem', textAlign: 'center', padding: '12px',
          }}>
            <span>이전에 만든 장면이 있어요</span>
            <button
              onClick={() => run(code)}
              style={{
                padding: '8px 20px',
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
                border: 'none',
                borderRadius: 'var(--radius-btn)',
                boxShadow: '0 4px 12px var(--shadow)',
                fontSize: '0.8125rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ▶ 다시 보기
            </button>
          </div>
        )}

        {/* 대기 상태 */}
        {status === 'idle' && !frame && !(!autoRun && code) && (
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
            background: 'rgba(255, 252, 243, 0.9)',
          }}>
            <div style={{
              width: '28px', height: '28px',
              border: '3px solid rgba(244, 180, 0, 0.25)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '8px' }}>
              {loadingText || '3D 장면 로딩 중...'}
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
            background: 'rgba(255, 252, 243, 0.97)',
            padding: '16px',
            textAlign: 'center',
          }}>
            <div style={{ color: 'var(--danger-text)', fontSize: '0.8125rem', marginBottom: '12px', lineHeight: 1.5 }}>
              {error}
            </div>
            {/* 구문 오류·애니메이션·끝나지 않는 루프는 같은 코드를 다시 그려도 결과가 같으므로 재시도 버튼을 숨긴다 */}
            {!NON_RETRYABLE.has(errorKind) && (
            <button
              onClick={handleRetry}
              style={{
                padding: '8px 20px',
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
                border: 'none',
                borderRadius: 'var(--radius-btn)',
                boxShadow: '0 4px 12px var(--shadow)',
                fontSize: '0.8125rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              다시 시도
            </button>
            )}
            {!NON_RETRYABLE.has(errorKind) && retryCount > 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', marginTop: '6px' }}>
                {retryCount}회 재시도
              </span>
            )}
          </div>
        )}

        {frame && (
          <iframe
            key={frame.runId}
            ref={iframeRef}
            srcDoc={frame.html}
            // allow-same-origin은 절대 넣지 않는다 — 넣으면 생성 코드가 부모 페이지에 접근할 수 있다
            sandbox="allow-scripts"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="VPython Scene"
          />
        )}
      </div>
      {/* 앞뒤 깊이는 기본 카메라(정면에서 약간 위)만으로 보기 어려울 수 있어, 회전 방법을 장면 아래에 안내한다 */}
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px', lineHeight: 1.4, wordBreak: 'keep-all' }}>
        {coarsePointer
          ? '한 손가락으로 끌어 회전, 두 손가락으로 확대·축소'
          : '오른쪽 버튼이나 Ctrl을 누른 채 끌면 회전, 휠로 확대·축소 (맥 트랙패드: Ctrl+클릭한 채 끌기)'}
      </div>
    </div>
  )
}
