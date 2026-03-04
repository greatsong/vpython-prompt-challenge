/**
 * Session 1 & 5 — 프롬프트 배틀 챌린지 뱅크
 * Level 1~3 (프롬프트 정확도가 점수에 직접 반영)
 * glow.js JavaScript API 형식
 *
 * 교육 설계 원칙:
 *   Level 1 — 생소한 도형 1개를 정밀하게 묘사 (추상화 훈련)
 *   Level 2 — 현실 사물을 기본 도형으로 분해·재조합 (분해 훈련)
 *   Level 3 — 반복·규칙이 담긴 장면을 패턴으로 기술 (알고리즘 훈련)
 */

export const BATTLE_CHALLENGES = [
  // ─── Level 1: 정밀 묘사 — 도형 하나, 그러나 방향·비율·형태가 핵심 ──────────
  {
    id: 'battle-01',
    level: 1,
    emoji: '🌀',
    title: '포탈',
    description: '허공에 세워진 청록색 고리 — 게임 속 포탈처럼 보인다',
    shapes: ['고리(ring)'],
    code: `ring({pos: vec(0,0,0), axis: vec(0,0,1), radius: 2, thickness: 0.3, color: color.cyan});`,
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
    code: `ellipsoid({pos: vec(0,0,0), size: vec(3,2,2), color: color.green});`,
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
    code: `arrow({pos: vec(-2,-2,0), axis: vec(4,4,0), shaftwidth: 0.3, color: color.magenta});`,
    ct: ['추상화'],
    hint: '화살표가 어디에서 시작해서 어느 방향으로 뻗어 있는지, 색상은 무엇인지 정확히 묘사하세요',
  },

  // ─── Level 2: 분해와 재조합 — 현실 사물을 도형으로 해체하기 ─────────────────
  {
    id: 'battle-04',
    level: 2,
    emoji: '🍄',
    title: '버섯',
    description: '가느다란 흰 줄기 위에 넓고 납작한 빨간 갓이 얹혀 있다',
    shapes: ['원기둥(cylinder) ×1', '타원체(ellipsoid) ×1'],
    code: `cylinder({pos: vec(0,-2,0), axis: vec(0,2.5,0), radius: 0.35, color: color.white});
ellipsoid({pos: vec(0,0.8,0), size: vec(2.5,0.8,2.5), color: color.red});`,
    ct: ['분해'],
    hint: '줄기(아래)와 갓(위)을 각각 어떤 모양으로, 어떤 비율로 표현할지 생각해보세요',
  },
  {
    id: 'battle-05',
    level: 2,
    emoji: '⏳',
    title: '모래시계',
    description: '위아래 두 원뿔이 꼭짓점끼리 맞닿아 있고, 가운데에 작은 노란 구가 있다',
    shapes: ['원뿔(cone) ×2', '구(sphere) ×1'],
    code: `cone({pos: vec(0,2.5,0), axis: vec(0,-2.5,0), radius: 1.5, color: color.cyan});
cone({pos: vec(0,-2.5,0), axis: vec(0,2.5,0), radius: 1.5, color: color.cyan});
sphere({pos: vec(0,0,0), radius: 0.3, color: color.yellow});`,
    ct: ['분해', '추상화'],
    hint: '넓은 부분이 위/아래에 있고 좁은 부분이 가운데서 만납니다. 원뿔의 방향이 핵심!',
  },
  {
    id: 'battle-06',
    level: 2,
    emoji: '🪐',
    title: '토성',
    description: '노란 행성(구) 주위를 주황색 고리가 수평으로 감싸고 있다',
    shapes: ['구(sphere) ×1', '고리(ring) ×1'],
    code: `sphere({pos: vec(0,0,0), radius: 1.5, color: color.yellow});
ring({pos: vec(0,0,0), axis: vec(0,1,0), radius: 2.8, thickness: 0.15, color: color.orange});`,
    ct: ['분해'],
    hint: '행성 본체와 고리를 따로 묘사하세요. 고리의 방향(수평)과 행성 대비 크기 비율이 중요합니다',
  },
  {
    id: 'battle-07',
    level: 2,
    emoji: '🚀',
    title: '로켓',
    description: '파란 원기둥 동체 위에 빨간 원뿔 머리, 아래에 주황색 원뿔 배기화염',
    shapes: ['원기둥(cylinder) ×1', '원뿔(cone) ×2'],
    code: `cylinder({pos: vec(0,-1,0), axis: vec(0,3,0), radius: 0.7, color: color.blue});
cone({pos: vec(0,2,0), axis: vec(0,1.5,0), radius: 0.7, color: color.red});
cone({pos: vec(0,-1,0), axis: vec(0,-1.2,0), radius: 0.7, color: color.orange});`,
    ct: ['분해'],
    hint: '로켓을 위-중간-아래 세 부분으로 나눠 각각의 도형, 색상, 방향을 설명하세요',
  },
  {
    id: 'battle-08',
    level: 2,
    emoji: '🍎',
    title: '탁자 위 사과',
    description: '갈색 탁자(납작한 상판 + 가느다란 다리 4개) 위에 빨간 사과(구)가 놓여 있다',
    shapes: ['상자(box) ×1', '원기둥(cylinder) ×4', '구(sphere) ×1'],
    code: `box({pos: vec(0,0,0), size: vec(4,0.3,3), color: vec(0.6,0.3,0.1)});
cylinder({pos: vec(-1.5,-2,1), axis: vec(0,2,0), radius: 0.15, color: vec(0.6,0.3,0.1)});
cylinder({pos: vec(1.5,-2,1), axis: vec(0,2,0), radius: 0.15, color: vec(0.6,0.3,0.1)});
cylinder({pos: vec(-1.5,-2,-1), axis: vec(0,2,0), radius: 0.15, color: vec(0.6,0.3,0.1)});
cylinder({pos: vec(1.5,-2,-1), axis: vec(0,2,0), radius: 0.15, color: vec(0.6,0.3,0.1)});
sphere({pos: vec(0,0.55,0), radius: 0.4, color: color.red});`,
    ct: ['분해', '추상화'],
    hint: '탁자를 "상판"과 "다리 4개"로 나누고, 그 위의 사과까지 — 총 세 종류의 부품을 각각 설명하세요',
  },

  // ─── Level 3: 반복 패턴 — "하나를 설명하고, 규칙을 말하라" ──────────────────
  {
    id: 'battle-09',
    level: 3,
    emoji: '🪜',
    title: '계단',
    description: '왼쪽 아래에서 오른쪽 위로 올라가는 빨간 계단 6칸',
    shapes: ['상자(box)'],
    code: `for (var i = 0; i < 6; i++) {
    box({pos: vec(i*1.2-3, i*0.6-1.5, 0), size: vec(1, 0.5, 2), color: color.red});
}`,
    ct: ['패턴인식', '알고리즘'],
    hint: '계단 한 칸의 모양을 먼저 묘사한 뒤, 총 몇 칸이 어떤 규칙으로 올라가는지 설명하세요',
  },
  {
    id: 'battle-10',
    level: 3,
    emoji: '🏟️',
    title: '원형 울타리',
    description: '노란 기둥 12개가 원을 그리며 균등하게 세워져 있다',
    shapes: ['원기둥(cylinder)'],
    code: `for (var i = 0; i < 12; i++) {
    var angle = i * Math.PI * 2 / 12;
    cylinder({pos: vec(Math.cos(angle)*3, -1, Math.sin(angle)*3),
              axis: vec(0,2,0), radius: 0.15, color: color.yellow});
}`,
    ct: ['패턴인식', '알고리즘'],
    hint: '기둥 하나의 생김새를 설명한 뒤, 전체 배치 패턴(원형, 개수, 간격)을 설명하세요',
  },
  {
    id: 'battle-11',
    level: 3,
    emoji: '🔺',
    title: '블록 피라미드',
    description: '아래층 주황 3개, 중간층 청록 2개, 꼭대기 자홍 1개 — 블록이 피라미드 형태로 쌓여 있다',
    shapes: ['상자(box)'],
    code: `var rowColors = [color.orange, color.cyan, color.magenta];
for (var row = 0; row < 3; row++) {
    var count = 3 - row;
    for (var i = 0; i < count; i++) {
        box({pos: vec((i - (count-1)/2)*1.2, row*1.1, 0),
             size: vec(1, 1, 1), color: rowColors[row]});
    }
}`,
    ct: ['패턴인식', '알고리즘', '분해'],
    hint: '각 층에 블록이 몇 개인지, 어떤 색인지, 위로 갈수록 어떤 규칙으로 줄어드는지 설명하세요',
  },
  {
    id: 'battle-12',
    level: 3,
    emoji: '♟️',
    title: '체스판',
    description: '4×4 격자로 된 납작한 판 — 흰색과 검은색이 번갈아 배치된다',
    shapes: ['상자(box)'],
    code: `for (var row = 0; row < 4; row++) {
    for (var col = 0; col < 4; col++) {
        var c = (row + col) % 2 === 0 ? color.white : color.black;
        box({pos: vec(col*1.1-1.65, 0, row*1.1-1.65), size: vec(1,0.2,1), color: c});
    }
}`,
    ct: ['알고리즘', '패턴인식'],
    hint: '칸의 모양(납작한 정사각형), 전체 크기(4×4), 색상 배치 규칙(어떤 패턴으로 번갈아가는지)을 설명하세요',
  },

  // ─── Level 3+: 대규모 패턴 — 30개 이상, 패턴의 힘을 체감하기 ────────────────
  {
    id: 'battle-13',
    level: 3,
    emoji: '🌈',
    title: '구슬 커튼',
    description: '6행 6열(36개)의 구가 격자로 배열되어 있다. 각 행이 무지개 색(빨-주-노-초-파-자홍) 순이다',
    shapes: ['구(sphere)'],
    code: `var rowColors = [color.red, color.orange, color.yellow, color.green, color.blue, color.magenta];
for (var row = 0; row < 6; row++) {
    for (var col = 0; col < 6; col++) {
        sphere({pos: vec(col*1.2-3, row*1.2-3, 0), radius: 0.4, color: rowColors[row]});
    }
}`,
    ct: ['패턴인식', '알고리즘'],
    hint: '격자의 행×열 크기, 각 행의 색상 순서를 빠짐없이 나열하세요. 패턴을 발견하면 한 문장으로 줄일 수 있습니다',
  },
  {
    id: 'battle-14',
    level: 3,
    emoji: '🌪️',
    title: '나선 탑',
    description: '청록색 작은 구 30개가 나선형으로 올라가며 배치되어 있다',
    shapes: ['구(sphere)'],
    code: `for (var i = 0; i < 30; i++) {
    var angle = i * Math.PI / 5;
    var y = i * 0.3 - 4.5;
    sphere({pos: vec(Math.cos(angle)*2, y, Math.sin(angle)*2), radius: 0.25, color: color.cyan});
}`,
    ct: ['패턴인식', '알고리즘'],
    hint: '구 하나하나를 나열하지 말고, "어떤 경로를 따라 배치되어 있는지" 전체 패턴을 설명하세요',
  },
  {
    id: 'battle-15',
    level: 3,
    emoji: '🏛️',
    title: '3D 피라미드',
    description: '주황색 정육면체가 피라미드 형태로 쌓여 있다 — 맨 아래 4×4, 그 위 3×3, 2×2, 꼭대기 1개 (총 30개)',
    shapes: ['상자(box)'],
    code: `for (var layer = 0; layer < 4; layer++) {
    var size = 4 - layer;
    for (var x = 0; x < size; x++) {
        for (var z = 0; z < size; z++) {
            box({pos: vec((x-(size-1)/2)*1.1, layer*1.1, (z-(size-1)/2)*1.1),
                 size: vec(1, 1, 1), color: color.orange});
        }
    }
}`,
    ct: ['패턴인식', '알고리즘', '분해'],
    hint: '각 층의 가로×세로 개수가 어떤 규칙으로 줄어드는지, 블록이 어떤 모양인지 설명하세요',
  },
]