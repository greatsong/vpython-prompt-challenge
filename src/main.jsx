import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

/**
 * 화면 전체 오류 경계.
 * 렌더 중 예외가 나면 React는 화면을 통째로 지워 흰 화면만 남긴다.
 * 수업 중에는 원인을 알 수 없으니, 안내 문구와 새로고침 버튼을 보여 준다.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] 화면 오류', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '24px',
        textAlign: 'center',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}>
        <div style={{ fontSize: '2rem' }}>⚠️</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>화면을 표시하는 중에 문제가 생겼어요</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
          새로고침하면 대부분 해결됩니다. 작성하던 내용은 이 탭에 저장되어 있어요.
          <br />
          계속 같은 화면이 나오면 선생님께 알려 주세요.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '8px',
            padding: '12px 28px',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-text)',
            border: 'none',
            borderRadius: 'var(--radius-btn)',
            boxShadow: '0 6px 18px var(--shadow)',
            fontSize: '1rem',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          🔄 새로고침
        </button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
