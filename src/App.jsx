import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import TeacherApp from './components/teacher/TeacherApp.jsx'
import TeamApp from './components/team/TeamApp.jsx'
import JoinPage from './components/JoinPage.jsx'

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

        {/* 루트: 학생용 join 화면으로 */}
        <Route path="/" element={<Navigate to="/join" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
