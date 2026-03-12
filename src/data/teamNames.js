// 팀 이름 랜덤 생성기 — 형용사 + 캐릭터/동물
// 형식: "졸린 카피바라", "열정적인 춘식이", "차분한 꼬부기"

export const ADJECTIVES = [
  '열정적인', '차분한', '졸린', '배고픈',
  '신나는', '엉뚱한', '수줍은', '날카로운',
  '느긋한', '진지한', '장난스러운', '설레는',
  '씩씩한', '궁금한', '당당한', '부끄러운',
  '용감한', '신중한', '활기찬', '조용한',
  '피곤한', '들뜬', '허기진', '겁많은',
]

export const CHARACTERS = [
  // 동물
  '카피바라', '수달', '레서판다', '알파카',
  '미어캣', '플라밍고', '악어', '나무늘보',
  '북극곰', '문어', '펭귄', '두더지',

  // 포켓몬
  '꼬부기', '피카츄', '잠만보', '파이리',
  '메타몽', '이상해씨', '토게피', '마자용',

  // 카카오 프렌즈
  '춘식이', '라이언', '어피치', '무지',
  '콘', '프로도',
]

/**
 * 중복 없는 랜덤 팀 이름 생성
 * @param {string[]} existingNames - 이미 사용 중인 팀 이름 목록
 * @returns {string} 예: "졸린 카피바라"
 */
export function generateTeamName(existingNames = []) {
  const maxAttempts = 100
  for (let i = 0; i < maxAttempts; i++) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
    const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]
    const name = `${adj} ${char}`
    if (!existingNames.includes(name)) return name
  }
  // 극히 드문 경우: 번호 붙여서 반환
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]
  return `${adj} ${char} ${Date.now() % 1000}`
}
