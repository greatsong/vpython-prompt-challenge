const TOKEN_PREFIX = 'vpython_team_token:'

export function setTeamToken(teamId, token) {
  if (teamId && token) sessionStorage.setItem(`${TOKEN_PREFIX}${teamId}`, token)
}

export function getTeamToken(teamId) {
  if (!teamId) return null
  return sessionStorage.getItem(`${TOKEN_PREFIX}${teamId}`) || null
}

export function teamFetch(url, teamId, options = {}) {
  const token = getTeamToken(teamId)
  const headers = {
    ...(options.headers || {}),
    ...(token ? { 'x-team-token': token } : {}),
  }
  return fetch(url, { ...options, headers })
}
