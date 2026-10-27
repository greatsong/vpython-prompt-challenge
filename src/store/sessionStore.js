import { create } from 'zustand'

// 현재 챌린지의 제출 집계 초기값.
// ClassDashboard가 계산해 넣고, 형제 컴포넌트인 SessionController가 읽어 경고를 띄운다.
// challengeId가 지금 진행 중인 챌린지와 다르면 이전 라운드의 값이므로 무시해야 한다.
const EMPTY_PROGRESS = { challengeId: null, submitted: 0, total: 0 }

const useSessionStore = create((set) => ({
  sessionId: null,
  currentChallenge: null,
  submissionProgress: EMPTY_PROGRESS,
  // 교사 화면의 현재 챌린지 진행 상태 — 'idle' | 'running' | 'ended'
  // SessionController가 쓰고, 형제인 ClassDashboard가 "결과 공개" 버튼 노출에 쓴다.
  challengeStatus: 'idle',

  setSession: (data) => set(data),
  setChallengeStatus: (status) => set({ challengeStatus: status }),
  // 챌린지가 바뀌면 이전 라운드의 집계가 남지 않도록 함께 초기화한다
  setChallenge: (challenge) => set({ currentChallenge: challenge, submissionProgress: EMPTY_PROGRESS }),
  setSubmissionProgress: (progress) => set({ submissionProgress: progress }),
}))

export default useSessionStore