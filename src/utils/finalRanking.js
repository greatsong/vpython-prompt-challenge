// 전체 수업 종료 시 최종 결과(session:final-ended)의 미제출·순위 판정 — 교사 대시보드와 팀 화면이 함께 쓴다.

// 서버가 submitted를 주면 그 값을 따른다.
// 없으면(예전 응답) 챌린지 결과 중 프롬프트가 있는 것이 하나도 없을 때 미제출로 본다.
// 미제출 팀도 서버는 totalScore 0을 넣어 보내므로 점수로는 가릴 수 없다.
export function isFinalUnsubmitted(r) {
  if (!r) return false
  if (r.submitted === false) return true
  if (r.submitted === true) return false
  return !(r.challengeResults || []).some((cr) => cr && cr.prompt)
}

// 화면에 그릴 순서와 순위 번호.
// 제출 팀을 앞에(서버 순서 유지), 미제출 팀을 맨 뒤에 둔다. 순위 번호는 제출 팀끼리만 매기고 미제출은 null.
// 서버가 rank를 주면 그 값을 쓴다.
export function orderFinalRankings(rankings) {
  const list = Array.isArray(rankings) ? rankings : []
  const submitted = list.filter((r) => !isFinalUnsubmitted(r))
  const unsubmitted = list.filter((r) => isFinalUnsubmitted(r))
  let n = 0
  return [
    ...submitted.map((r) => {
      n = Number.isInteger(r.rank) ? r.rank : n + 1
      return { r, rank: n, unsubmitted: false }
    }),
    ...unsubmitted.map((r) => ({ r, rank: null, unsubmitted: true })),
  ]
}
