import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import ClassSetup from './ClassSetup.jsx'
import SessionController from './SessionController.jsx'
import ClassDashboard from './ClassDashboard.jsx'

export default function TeacherApp() {
  const [sessionId, setSessionId] = useState(null)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {!sessionId ? (
        <ClassSetup onSessionCreated={setSessionId} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: '100vh' }}>
          {/* 사이드: 세션 컨트롤러 */}
          <aside style={{
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            overflowY: 'auto',
          }}>
            <SessionController sessionId={sessionId} />
          </aside>

          {/* 메인: 대시보드 */}
          <main style={{ overflowY: 'auto', padding: '24px' }}>
            <ClassDashboard sessionId={sessionId} />
          </main>
        </div>
      )}
    </div>
  )
}
