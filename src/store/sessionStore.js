import { create } from 'zustand'

const useSessionStore = create((set) => ({
  sessionId: null,
  currentChallenge: null,

  setSession: (data) => set(data),
  setChallenge: (challenge) => set({ currentChallenge: challenge }),
  reset: () => set({ sessionId: null, currentChallenge: null }),
}))

export default useSessionStore