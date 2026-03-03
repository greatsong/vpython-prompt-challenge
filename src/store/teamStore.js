import { create } from 'zustand'

const useTeamStore = create((set) => ({
  // 전체 팀 목록 (교사 화면용)
  teams: [],
  setTeams: (teams) => set({ teams }),
  updateTeamScore: (teamId, score) =>
    set((state) => ({
      teams: state.teams.map((t) =>
        t.id === teamId ? { ...t, latestScore: score, hasSubmitted: true } : t
      ),
    })),

  // 현재 팀 (팀 화면용)
  myTeam: null,
  setMyTeam: (team) => set({ myTeam: team }),

  // 시도 기록 (팀 화면용)
  attempts: [],
  addAttempt: (attempt) =>
    set((state) => ({ attempts: [attempt, ...state.attempts] })),
  clearAttempts: () => set({ attempts: [] }),
}))

export default useTeamStore
