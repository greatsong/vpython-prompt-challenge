import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import TeacherApp from './components/teacher/TeacherApp.jsx'
import TeamApp from './components/team/TeamApp.jsx'
import JoinPage from './components/JoinPage.jsx'
import SpectatorPage from './components/SpectatorPage.jsx'
import GuidePage from './components/GuidePage.jsx'
import PrivacyPage from './components/PrivacyPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 교사 화면 */}
        <Route path="/teacher/*" element={<TeacherApp />} />

        {/* 팀 선택 화면 (학생 접속점) */}
        <Route path="/join" element={<JoinPage />} />

        {/* 팀 화면 */}
        <Route path="/team/:teamId" element={<TeamApp />} />

        {/* 교사 안내서 (로그인 없이 접근 가능) */}
        <Route path="/guide" element={<GuidePage />} />

        {/* 개인정보 처리방침 */}
        <Route path="/privacy" element={<PrivacyPage />} />

        {/* 관람 모드 */}
        <Route path="/spectator/:sessionId" element={<SpectatorPage />} />

        {/* 루트: 학생용 join 화면으로 */}
        <Route path="/" element={<Navigate to="/join" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
