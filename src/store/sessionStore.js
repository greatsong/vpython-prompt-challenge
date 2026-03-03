import { create } from 'zustand'

const useSessionStore = create((set, get) => ({
  // 세션 정보
  sessionId: null,
  teacherCode: '',
  mode: 'battle',           // battle|detective|surgery|creator|compare
  sessionNumber: 1,         // 1~5
  status: 'waiting',        // waiting|active|paused|ended

  // 현재 챌린지
  currentChallenge: null,
  timeLeft: null,

  setSession: (data) => set(data),
  setMode: (mode, sessionNumber) =>
    set({ mode, ...(sessionNumber != null ? { sessionNumber } : {}) }),
  setChallenge: (challenge) => set({ currentChallenge: challenge }),
  setTimeLeft: (t) => set({ timeLeft: t }),
  reset: () =>
    set({
      sessionId: null,
      teacherCode: '',
      mode: 'battle',
      sessionNumber: 1,
      status: 'waiting',
      currentChallenge: null,
      timeLeft: null,
    }),
}))

export default useSessionStore
