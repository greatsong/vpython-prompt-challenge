/**
 * Session 1 & 5 — 프롬프트 배틀 챌린지 뱅크
 * Level 1~3 (프롬프트 정확도가 점수에 직접 반영)
 */

export const BATTLE_CHALLENGES = [
  // ─── Level 1: 단일 객체 ─────────────────────────────────────────────────────
  {
    id: 'battle-01',
    level: 1,
    emoji: '🔴',
    title: '빨간 구',
    description: '원점 중앙에 빨간 구 하나',
    code: `sphere(pos=vector(0,0,0), radius=1, color=color.red)`,
    ct: ['추상화'],
    hint: '위치, 크기, 색상 세 가지를 정확히 명시하면 높은 점수',
  },
  {
    id: 'battle-02',
    level: 1,
    emoji: '📦',
    title: '파란 상자',
    description: '원점에 파란 정육면체 (한 변의 길이 2)',
    code: `box(pos=vector(0,0,0), size=vector(2,2,2), color=color.blue)`,
    ct: ['추상화'],
    hint: 'size는 x/y/z 각 방향의 크기를 vector로 지정',
  },
  {
    id: 'battle-03',
    level: 1,
    emoji: '🌿',
    title: '초록 원기둥',
    description: '중앙에 세워진 초록 원기둥 (높이 4, 반지름 0.5)',
    code: `cylinder(pos=vector(0,-2,0), axis=vector(0,4,0), radius=0.5, color=color.green)`,
    ct: ['추상화'],
    hint: 'cylinder는 pos(시작점)와 axis(방향+길이)로 정의',
  },

  // ─── Level 2: 2~3개 조합 ──────────────────────────────────────────────────
  {
    id: 'battle-04',
    level: 2,
    emoji: '🚦',
    title: '이상한 신호등',
    description: '검은 기둥 위에 노랑-빨강-초록 구가 위에서 아래로 (순서 주의!)',
    code: `cylinder(pos=vector(0,-3,0), axis=vector(0,6,0), radius=0.3, color=color.black)
sphere(pos=vector(0,2,0), radius=0.5, color=color.yellow)
sphere(pos=vector(0,1,0), radius=0.5, color=color.red)
sphere(pos=vector(0,0,0), radius=0.5, color=color.green)`,
    ct: ['분해'],
    hint: '위에서부터 노랑 → 빨강 → 초록 순서. 색 이름을 위치와 함께 정확히 명시해야 합니다',
  },
  {
    id: 'battle-05',
    level: 2,
    emoji: '⛄',
    title: '눈사람',
    description: '아래에 큰 흰 구, 위에 작은 흰 구 (머리와 몸)',
    code: `sphere(pos=vector(0,-1,0), radius=1.2, color=color.white)
sphere(pos=vector(0,1.4,0), radius=0.8, color=color.white)`,
    ct: ['분해'],
    hint: '두 구의 크기 차이와 y 위치가 자연스럽게 이어져야 함',
  },
  {
    id: 'battle-06',
    level: 2,
    emoji: '🏠',
    title: '집',
    description: '흰 벽(상자) 위에 빨간 삼각형 지붕(피라미드)',
    code: `box(pos=vector(0,0,0), size=vector(3,2,3), color=color.white)
pyramid(pos=vector(-1.5,1,1.5), size=vector(3,1.5,3), color=color.red)`,
    ct: ['분해'],
    hint: '피라미드의 pos는 밑면 한쪽 모서리 위치',
  },
  {
    id: 'battle-07',
    level: 2,
    emoji: '🌍',
    title: '지구와 달',
    description: '큰 파란 구(지구) 옆에 작은 회색 구(달)',
    code: `sphere(pos=vector(0,0,0), radius=2, color=color.blue)
sphere(pos=vector(4,0,0), radius=0.6, color=color.gray)`,
    ct: ['추상화'],
    hint: '크기 비율(3배 이상)과 거리가 중요',
  },

  // ─── Level 3: 반복 패턴 ──────────────────────────────────────────────────
  {
    id: 'battle-08',
    level: 3,
    emoji: '🌈',
    title: '무지개 줄',
    description: '7개의 구가 가로로 나란히, 무지개색으로',
    code: `colors = [color.red, color.orange, color.yellow, color.green,
          color.cyan, color.blue, color.magenta]
for i in range(7):
    sphere(pos=vector(i*1.5-4.5, 0, 0), radius=0.5, color=colors[i])`,
    ct: ['패턴인식', '알고리즘'],
    hint: 'for 루프와 색상 배열의 조합',
  },
  {
    id: 'battle-09',
    level: 3,
    emoji: '🎯',
    title: '과녁',
    description: '동심원 4개 (바깥부터 흰-검-흰-빨)로 된 과녁',
    code: `for i, c in enumerate([color.white, color.black, color.white, color.red]):
    cylinder(pos=vector(0,0,(i-2)*0.1), axis=vector(0,0,0.1),
             radius=(4-i)*0.8, color=c)`,
    ct: ['패턴인식'],
    hint: '원기둥을 겹쳐서 동심원 표현, 반지름이 안으로 갈수록 작아짐',
  },
  {
    id: 'battle-10',
    level: 3,
    emoji: '🧱',
    title: '벽돌 벽',
    description: '5×3 격자로 배치된 빨간 벽돌들',
    code: `for row in range(3):
    for col in range(5):
        box(pos=vector(col*2.2-4.4, row*1.2, 0),
            size=vector(2, 1, 0.5), color=color.red)`,
    ct: ['알고리즘', '분해'],
    hint: '이중 for 루프로 행/열 좌표 계산',
  },
]
