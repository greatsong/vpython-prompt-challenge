/**
 * Session 1 & 5 — 프롬프트 배틀 챌린지 뱅크
 * Level 1~5 (프롬프트 정확도가 점수에 직접 반영)
 * glow.js JavaScript API 형식
 *
 * 교육 설계 원칙:
 *   Level 1 — 도형 1개를 정밀하게 묘사 (추상화 훈련) + shapes 힌트 제공
 *   Level 2 — 현실 사물을 도형으로 분해 (분해 훈련) + 간략 설명만
 *   Level 3 — 반복·규칙 장면을 패턴으로 기술 (알고리즘 훈련) + 간략 설명만
 *   Level 4 — 복합 구조, 힌트 없이 3D 뷰만 보고 (분해+추상화 심화)
 *   Level 5 — 극한 도전, 힌트 없이 복합 구조+패턴 (종합)
 *
 * shapes 필드:
 *   Level 1 — 도형 종류 + 개수 제공 (워밍업)
 *   Level 2~5 — null (학생이 스스로 파악해야 함)
 *
 * description 필드:
 *   Level 1 — 상세 설명 (가이드)
 *   Level 2~3 — 간략 설명 (방향만 제시)
 *   Level 4~5 — null (3D 뷰만 보고 파악)
 *
 * ⚠️ 정답 코드(code)는 이 파일에 없다.
 *    클라이언트 번들에 통째로 들어가면 학생이 23개 문제의 정답을 한 번에 읽을 수 있어
 *    서버 전용 모듈 src/server-data/challenge-codes.js 로 분리했다.
 *    서버는 src/server-data/challenges.js 에서 메타데이터 + 코드를 합쳐 쓰고,
 *    클라이언트는 /api/challenges/:id 로 현재 라운드 한 건만 받아 간다.
 */

export const BATTLE_CHALLENGES = [
  // ─── Level 1: 정밀 묘사 — 도형 하나, shapes 힌트 제공 ─────────────────
  {
    id: 'battle-01',
    level: 1,
    emoji: '🌀',
    title: '포탈',
    description: '허공에 세워진 청록색 고리 — 게임 속 포탈처럼 보인다',
    shapes: ['고리(ring)'],
    ct: ['추상화'],
    hint: '이 고리가 바닥에 놓여 있나요, 세워져 있나요? 방향을 잘 관찰하세요',
  },
  {
    id: 'battle-02',
    level: 1,
    emoji: '🍉',
    title: '수박',
    description: '가로로 넓고 약간 납작한 초록색 타원체',
    shapes: ['타원체(ellipsoid)'],
    ct: ['추상화'],
    hint: '완전한 구와 어떻게 다른지 관찰하세요. 어느 방향이 더 긴가요?',
  },
  {
    id: 'battle-03',
    level: 1,
    emoji: '↗️',
    title: '비스듬한 화살표',
    description: '왼쪽 아래에서 오른쪽 위로 대각선으로 뻗은 자홍색 화살표',
    shapes: ['화살표(arrow)'],
    ct: ['추상화'],
    hint: '화살표가 어디에서 시작해서 어느 방향으로 뻗어 있는지, 색상은 무엇인지 정확히 묘사하세요',
  },

  // ─── Level 2: 분해와 재조합 — shapes 힌트 없음, 간략 설명만 ────────────
  {
    id: 'battle-04',
    level: 2,
    emoji: '🍄',
    title: '버섯',
    description: '버섯 한 송이',
    shapes: null,
    ct: ['분해'],
    hint: '줄기와 갓을 각각 어떤 도형으로 표현할지 생각해보세요',
  },
  {
    id: 'battle-05',
    level: 2,
    emoji: '⏳',
    title: '모래시계',
    description: '모래시계',
    shapes: null,
    ct: ['분해', '추상화'],
    hint: '넓은 부분과 좁은 부분의 방향을 잘 관찰하세요',
  },
  {
    id: 'battle-06',
    level: 2,
    emoji: '🪐',
    title: '토성',
    description: '행성 하나',
    shapes: null,
    ct: ['분해'],
    hint: '본체와 그 주위의 것을 따로 묘사하세요',
  },
  {
    id: 'battle-07',
    level: 2,
    emoji: '🚀',
    title: '로켓',
    description: '서 있는 로켓',
    shapes: null,
    ct: ['분해'],
    hint: '위-중간-아래 각 부분의 도형과 색상을 설명하세요',
  },
  {
    id: 'battle-08',
    level: 2,
    emoji: '🍎',
    title: '탁자 위 사과',
    description: '탁자 위에 과일이 놓여 있다',
    shapes: null,
    ct: ['분해', '추상화'],
    hint: '탁자를 부품별로 나눠서 각각 설명하세요',
  },

  // ─── Level 3: 반복 패턴 — shapes 힌트 없음, 간략 설명만 ────────────────
  {
    id: 'battle-09',
    level: 3,
    emoji: '🪜',
    title: '계단',
    description: '올라가는 계단',
    shapes: null,
    ct: ['패턴인식', '알고리즘'],
    hint: '한 칸의 모양과, 전체가 어떤 규칙으로 이어지는지 설명하세요',
  },
  {
    id: 'battle-10',
    level: 3,
    emoji: '🏟️',
    title: '원형 울타리',
    description: '울타리',
    shapes: null,
    ct: ['패턴인식', '알고리즘'],
    hint: '기둥 하나의 생김새와 전체 배치 패턴을 설명하세요',
  },
  {
    id: 'battle-11',
    level: 3,
    emoji: '🔺',
    title: '블록 피라미드',
    description: '블록으로 쌓은 피라미드',
    shapes: null,
    ct: ['패턴인식', '알고리즘', '분해'],
    hint: '각 층의 블록 수, 색상, 배치 규칙을 설명하세요',
  },
  {
    id: 'battle-12',
    level: 3,
    emoji: '♟️',
    title: '체스판',
    description: '체스판',
    shapes: null,
    ct: ['알고리즘', '패턴인식'],
    hint: '칸의 크기와 전체 배치, 색상 배치 규칙을 설명하세요',
  },
  {
    id: 'battle-13',
    level: 3,
    emoji: '🌈',
    title: '구슬 커튼',
    description: '무지개색 구슬 커튼',
    shapes: null,
    ct: ['패턴인식', '알고리즘'],
    hint: '배열의 크기와 각 줄의 색 순서를 설명하세요',
  },
  {
    id: 'battle-14',
    level: 3,
    emoji: '🌪️',
    title: '나선 탑',
    description: '나선형 탑',
    shapes: null,
    ct: ['패턴인식', '알고리즘'],
    hint: '하나하나 나열하지 말고, 전체 경로의 패턴을 설명하세요',
  },
  {
    id: 'battle-15',
    level: 3,
    emoji: '🏛️',
    title: '3D 피라미드',
    description: '입체 피라미드',
    shapes: null,
    ct: ['패턴인식', '알고리즘', '분해'],
    hint: '각 층의 가로x세로 개수가 어떤 규칙으로 줄어드는지 설명하세요',
  },

  // ─── Level 4: 복합 구조 — 힌트 없음, 3D 뷰만 ─────────────────────────
  {
    id: 'battle-16',
    level: 4,
    emoji: '⛄',
    title: '눈사람',
    description: null,
    shapes: null,
    ct: ['분해', '추상화'],
    hint: '전체를 부분별로 나누고, 각 부분의 도형/색/위치를 하나씩 설명하세요',
  },
  {
    id: 'battle-17',
    level: 4,
    emoji: '🚦',
    title: '신호등',
    description: null,
    shapes: null,
    ct: ['분해', '추상화'],
    hint: '전체를 구성 부품으로 나누고, 각 부품의 위치 관계를 설명하세요',
  },
  {
    id: 'battle-18',
    level: 4,
    emoji: '🏙️',
    title: '도시 스카이라인',
    description: null,
    shapes: null,
    ct: ['분해', '추상화'],
    hint: '각 건물의 높이, 너비, 색상을 비교하며 왼쪽부터 순서대로 설명하세요',
  },
  {
    id: 'battle-19',
    level: 4,
    emoji: '⚖️',
    title: '균형 저울',
    description: null,
    shapes: null,
    ct: ['분해', '추상화'],
    hint: '받침, 막대, 양쪽 추를 각각 설명하세요. 좌우 차이에 주목하세요',
  },

  // ─── Level 5: 극한 도전 — 힌트 없음, 복합 구조 + 패턴 ─────────────────
  {
    id: 'battle-20',
    level: 5,
    emoji: '🌸',
    title: '꽃',
    description: null,
    shapes: null,
    ct: ['분해', '패턴인식'],
    hint: '줄기, 꽃잎, 꽃술을 각각 설명하세요. 꽃잎의 배치 패턴에 주목하세요',
  },
  {
    id: 'battle-21',
    level: 5,
    emoji: '🤖',
    title: '로봇 얼굴',
    description: null,
    shapes: null,
    ct: ['분해', '추상화'],
    hint: '머리, 눈, 입, 안테나를 각각 설명하세요. 좌우 대칭에 주목하세요',
  },
  {
    id: 'battle-22',
    level: 5,
    emoji: '🧬',
    title: '분자 모형',
    description: null,
    shapes: null,
    ct: ['분해', '추상화'],
    hint: '중심, 결합봉, 끝 원자를 각각 설명하세요. 3차원 방향에 주목하세요',
  },
  {
    id: 'battle-23',
    level: 5,
    emoji: '🎪',
    title: '회전목마',
    description: null,
    shapes: null,
    ct: ['분해', '패턴인식'],
    hint: '중심 기둥, 지붕, 좌석을 각각 설명하세요. 좌석의 배치 패턴에 주목하세요',
  },
]
