import { useEffect, useRef, useState } from 'react'
import { createBlobURL, revokeBlobURL } from '../../utils/glowscript.js'

/**
 * VPythonRunner
 * GlowScript 3.2 코드를 Blob URL iframe으로 렌더링
 *
 * Props:
 *   code      string  — VPython 코드
 *   width     string  — 기본 '100%'
 *   height    string  — 기본 '300px'
 *   label     string  — 상단 레이블 (선택)
 *   autoRun   bool    — 코드 변경 시 자동 재실행 (기본 true)
 */
export default function VPythonRunner({
  code,
  width = '100%',
  height = '300px',
  label,
  autoRun = true,
}) {
  const blobRef = useRef(null)
  const [src, setSrc] = useState(null)
  const [error, setError] = useState(null)

  const run = (c) => {
    if (!c?.trim()) return
    setError(null)
    try {
      // 기존 Blob URL 해제
      if (blobRef.current) revokeBlobURL(blobRef.current)
      const url = createBlobURL(c)
      blobRef.current = url
      setSrc(url)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    if (autoRun) run(code)
  }, [code, autoRun])

  // 컴포넌트 언마운트 시 Blob URL 해제
  useEffect(() => {
    return () => {
      if (blobRef.current) revokeBlobURL(blobRef.current)
    }
  }, [])

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
        {!src && !error && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: '0.875rem',
          }}>
            프롬프트를 제출하면 AI가 만든 장면이 여기에 표시됩니다
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--danger)', fontSize: '0.875rem', padding: '16px',
            textAlign: 'center',
          }}>
            ⚠ {error}
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

      {!autoRun && (
        <button
          onClick={() => run(code)}
          style={{
            marginTop: '8px',
            padding: '6px 16px',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          ▶ 실행
        </button>
      )}
    </div>
  )
}
