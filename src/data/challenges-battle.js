/**
 * Session 1 & 5 — 프롬프트 배틀 챌린지 뱅크
 * Level 1~3 (프롬프트 정확도가 점수에 직접 반영)
 * glow.js JavaScript API 형식
 */

export const BATTLE_CHALLENGES = [
  // ─── Level 1: 단일 객체 ─────────────────────────────────────────────────────
  {
    id: 'battle-01',
    level: 1,
    emoji: '🔴',
    title: '빨간 구',
    description: '원점 중앙에 빨간 구 하나',
    code: `sphere({pos: vec(0,0,0), radius: 1, color: color.red});`,
    ct: ['추상화'],
    hint: '물체의 종류, 색상, 위치를 빠짐없이 설명해보세요',
  },
  {
    id: 'battle-02',
    level: 1,
    emoji: '📦',
    title: '파란 상자',
    description: '원점에 파란 정육면체 (한 변의 길이 2)',
    code: `box({pos: vec(0,0,0), size: vec(2,2,2), color: color.blue});`,
    ct: ['추상화'],
    hint: '정육면체인지 직육면체인지, 모양을 구체적으로 묘사해보세요',
  },
  {
    id: 'battle-03',
    level: 1,
    emoji: '🌿',
    title: '초록 원기둥',
    description: '중앙에 세워진 초록 원기둥 (높이 4, 반지름 0.5)',
    code: `cylinder({pos: vec(0,-2,0), axis: vec(0,4,0), radius: 0.5, color: color.green});`,
    ct: ['추상화'],
    hint: '원기둥이 놓인 방향(세로/가로)과 굵기를 묘사해보세요',
  },

  // ─── Level 2: 2~3개 조합 ──────────────────────────────────────────────────
  {
    id: 'battle-04',
    level: 2,
    emoji: '🚦',
    title: '이상한 신호등',
    description: '회색 기둥 위에 노랑-빨강-초록 구가 위에서 아래로 (순서 주의!)',
    code: `cylinder({pos: vec(0,-3,0), axis: vec(0,6,0), radius: 0.3, color: vec(0.3,0.3,0.3)});
sphere({pos: vec(0,2,0), radius: 0.5, color: color.yellow});
sphere({pos: vec(0,1,0), radius: 0.5, color: color.red});
sphere({pos: vec(0,0,0), radius: 0.5, color: color.green});`,
    ct: ['분해'],
    hint: '구가 몇 개인지, 각 색상이 위에서 아래로 어떤 순서인지 정확히 설명하세요',
  },
  {
    id: 'battle-05',
    level: 2,
    emoji: '⛄',
    title: '눈사람',
    description: '아래에 큰 흰 구, 위에 작은 흰 구 (머리와 몸)',
    code: `sphere({pos: vec(0,-1,0), radius: 1.2, color: color.white});
sphere({pos: vec(0,1.4,0), radius: 0.8, color: color.white});`,
    ct: ['분해'],
    hint: '두 구의 크기 차이와 위아래 관계를 설명하세요',
  },
  {
    id: 'battle-06',
    level: 2,
    emoji: '🏠',
    title: '집',
    description: '흰 벽(상자) 위에 빨간 삼각형 지붕(피라미드)',
    code: `box({pos: vec(0,0,0), size: vec(3,2,3), color: color.white});
pyramid({pos: vec(-1.5,1,1.5), size: vec(3,1.5,3), color: color.red});`,
    ct: ['분해'],
    hint: '벽과 지붕을 각각 어떤 도형으로 표현할지 생각해보세요',
  },
  {
    id: 'battle-07',
    level: 2,
    emoji: '🌍',
    title: '지구와 달',
    description: '큰 파란 구(지구) 옆에 작은 회색 구(달)',
    code: `sphere({pos: vec(0,0,0), radius: 2, color: color.blue});
sphere({pos: vec(4,0,0), radius: 0.6, color: vec(0.5,0.5,0.5)});`,
    ct: ['추상화'],
    hint: '두 구의 크기 비율과 서로의 거리 관계를 묘사하세요',
  },

  // ─── Session 1 시나리오 전용 ──────────────────────────────────────────────
  {
    id: 'battle-flower',
    level: 2,
    emoji: '🌸',
    title: '꽃',
    description: '노란 중심 구 + 분홍 꽃잎 6개 (원형 배치) + 초록 줄기',
    code: `// 줄기
cylinder({pos: vec(0,-3,0), axis: vec(0,3,0), radius: 0.15, color: color.green});
// 중심
sphere({pos: vec(0,0.5,0), radius: 0.4, color: color.yellow});
// 꽃잎 6개 (60도 간격)
for (var i = 0; i < 6; i++) {
    var angle = i * Math.PI / 3;
    ellipsoid({pos: vec(Math.cos(angle)*1.2, 0.5+Math.sin(angle)*1.2, 0),
               size: vec(0.8, 0.4, 0.3), color: vec(1, 0.5, 0.7)});
}`,
    ct: ['패턴인식', '분해'],
    hint: '꽃잎이 몇 개이고 어떤 모양으로 배치되어 있는지, 중심과 줄기를 각각 묘사하세요',
  },
  {
    id: 'battle-forest',
    level: 3,
    emoji: '🌲',
    title: '숲',
    description: '나무 5그루 — 갈색 기둥(원기둥) + 초록 잎(구), 가로로 나란히',
    code: `var positions = [-4, -2, 0, 2, 4];
for (var i = 0; i < 5; i++) {
    // 나무 기둥
    cylinder({pos: vec(positions[i], -1.5, 0), axis: vec(0, 2, 0),
              radius: 0.2, color: vec(0.5, 0.3, 0.1)});
    // 나무 잎
    sphere({pos: vec(positions[i], 1.2, 0), radius: 0.8, color: color.green});
}`,
    ct: ['추상화', '알고리즘'],
    hint: '"나무 하나"가 어떤 도형으로 구성되는지 먼저 정의한 뒤, 몇 그루가 어떻게 배치되는지 설명하세요',
  },

  // ─── Level 3: 반복 패턴 ──────────────────────────────────────────────────
  {
    id: 'battle-08',
    level: 3,
    emoji: '🌈',
    title: '무지개 줄',
    description: '7개의 구가 가로로 나란히, 무지개색으로',
    code: `var colors = [color.red, color.orange, color.yellow, color.green,
          color.cyan, color.blue, color.magenta];
for (var i = 0; i < 7; i++) {
    sphere({pos: vec(i*1.5-4.5, 0, 0), radius: 0.5, color: colors[i]});
}`,
    ct: ['패턴인식', '알고리즘'],
    hint: '구의 개수, 배열 방향, 각 구의 색상 순서를 빠짐없이 나열하세요',
  },
  {
    id: 'battle-09',
    level: 3,
    emoji: '🎯',
    title: '과녁',
    description: '동심원 4개 (바깥부터 흰-파랑-흰-빨)로 된 과녁',
    code: `var ringColors = [color.white, color.blue, color.white, color.red];
for (var i = 0; i < 4; i++) {
    cylinder({pos: vec(0,0,(i-2)*0.1), axis: vec(0,0,0.1),
             radius: (4-i)*0.8, color: ringColors[i]});
}`,
    ct: ['패턴인식'],
    hint: '원이 몇 겹인지, 바깥에서 안쪽으로 색상 순서를 정확히 설명하세요',
  },
  {
    id: 'battle-10',
    level: 3,
    emoji: '🧱',
    title: '벽돌 벽',
    description: '5×3 격자로 배치된 빨간 벽돌들',
    code: `for (var row = 0; row < 3; row++) {
    for (var col = 0; col < 5; col++) {
        box({pos: vec(col*2.2-4.4, row*1.2, 0),
            size: vec(2, 1, 0.5), color: color.red});
    }
}`,
    ct: ['알고리즘', '분해'],
    hint: '가로 몇 개, 세로 몇 줄인지, 벽돌의 모양과 배치 패턴을 설명하세요',
  },
]