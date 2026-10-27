/**
 * 문제별 평가 루브릭 — **서버 전용**
 *
 * ⚠️ 이 파일은 절대 src/components/ 아래에서 import 하지 말 것.
 *    anchors(만점 모범답안 프롬프트)와 elements[].desc(요소별 정답 힌트)가 들어 있어
 *    클라이언트 번들에 포함되면 학생이 23개 문제의 모범답안을 그대로 읽을 수 있다.
 *    클라이언트가 필요로 하는 카테고리 만점은 /api/evaluate 응답의
 *    category_max / ct_max 필드로 내려보낸다.
 *
 * 5축 평가 프레임워크
 *   structure  구조·분해  — 부분 명명, 부분-전체 관계, 반복 규칙, 대칭·순서 같은 구조적 규칙
 *   spatial    공간 관계  — 방향, 배치, 접합, 정면/측면, 수직/수평, 내부/외부
 *   proportion 비율       — 부분 간 상대적 크기, 길이, 두께, 납작함, 크기 감소/증가
 *   shape      도형 종류  — 어떤 기본 도형(구/상자/원뿔 등)으로 표현할지
 *   color      색         — 색상 언급 (유사어 관대)
 *   CT         사고력 보너스 15점 — 규칙 기반 결정적 채점 (src/api/ctScore.js)
 *
 * 축별 배점은 문제마다 다르다. 고정 비율(25/25/20/10/5)이 아니라
 * 그 장면에서 실제로 관찰 가능한 것에 맞춰 요소 배점을 배분한다.
 *   Lv1(도형 1개)  — structure 축 없음. spatial/proportion/shape 중심
 *   Lv2(분해)      — structure/spatial/proportion 고르게
 *   Lv3(반복 패턴) — structure(패턴 규칙) 강화
 *   Lv4~5(복합)    — 분해 + 패턴 + 비율 복합
 * 요소 배점 합계는 항상 85점이고, 여기에 CT 15점을 더해 100점이 된다.
 *
 * 요소 작성 규칙 (2026-08 감사 반영)
 *   1. **관측 가능한 것만 요소로 둔다.** 3D 화면을 보고 학생이 실제로 언급할 이유가
 *      있는 특징이어야 한다. ("동일 평면 배치", "블록 크기가 모두 같음"처럼
 *      당연해서 아무도 쓰지 않을 특징은 요소에서 뺐다.)
 *   2. **TOP 앵커는 모든 카테고리를 커버해야 한다.** 공식 모범답안이 어떤 축에서
 *      0점을 받으면 그 축의 요소나 앵커 둘 중 하나가 잘못된 것이다.
 *   3. anchors[].score는 채점기의 보정 기준점이다. 실제 합산과 ±10 이상 벌어지면
 *      요소 배점이나 앵커 문장을 다시 손봐야 한다.
 *
 * 2026-10-27 검토 반영 (Codex·Argon 독립 검토 대조)
 *   4. **기본 카메라(정면, 최종 반영 후 약 12° 위에서 내려다봄)에서 보이는 것만 요소로 둔다.** 바닥에 눕힌 판·수평 고리처럼
 *      옆면만 보이는 장면은 목표 코드를 고쳤다(06·10·12·15). 개수처럼 정면에서 세기 어려운 요소는
 *      근사치에 부분점수를 준다(10·14·23).
 *   5. **요소 이름은 학생 문장에 그대로 나올 법한 말을 피한다.** 형식 게이트(formatGate.js)가 요소 이름
 *      3개 이상이 프롬프트에 들어 있으면 항목 나열로 판정하므로, '청록색'·'위로 쌓임' 같은 이름은
 *      정상 묘사를 게이트에 걸리게 했다. 색 요소는 '색(청록)' 꼴로 바꿨다.
 *      (최종 반영: 게이트는 완결 문장이 2개 이상이면 요소명 규칙을 적용하지 않고,
 *       4자 미만 이름과 '~색'으로 끝나는 이름은 세지 않는다)
 *   6. 중간 앵커는 실제 요소 합산이 앵커 점수와 ±10 안에 들도록 문장을 다시 썼다
 *      (예전 문장 다수는 실제 합산 20~35점짜리여서 채점기가 약한 답을 50점대로 끌어올렸다).
 *
 * 구조:
 *   elements[]  — 필수 요소 (name, desc, weight, category)
 *   ct          — CT 사고력 보너스 (focus, maxPoints, criteria) — 규칙 기반 채점
 *   anchors[]   — 점수 앵커 (score, prompt) 3단계
 */

export const RUBRICS = {
  // ═══════════════════════════════════════════════════════════
  // Level 1: 정밀 묘사 (도형 1개) — spatial/proportion 중심
  // ═══════════════════════════════════════════════════════════

  'battle-01': {
    elements: [
      { name: '세워진 방향', desc: '세워져 있다/수직/정면을 향한다', weight: 20, category: 'spatial' },
      { name: '고리 평면', desc: '바닥에 눕혀져 있지 않다/앞뒤로 향한다', weight: 10, category: 'spatial' },
      { name: '중앙 위치', desc: '중앙에/가운데', weight: 10, category: 'spatial' },
      // 감사 지적: proportion 25점이 2요소뿐이라 부분점수가 {0,6,6.5,12,...}로 뚝뚝 끊겼다.
      // 3요소로 쪼개 중간 점수가 촘촘하게 나오도록 했다.
      { name: '두께 얇음', desc: '얇은/가느다란/두께 언급', weight: 8, category: 'proportion' },
      { name: '반지름 큼', desc: '크다/반지름이 큼/꽤 넓다', weight: 9, category: 'proportion' },
      { name: '두께 대비 크기', desc: '두께에 비해 지름이 훨씬 크다/가늘고 큰 고리라는 비 언급', weight: 8, category: 'proportion' },
      { name: '고리 도형', desc: '고리/링/도넛 형태 언급', weight: 15, category: 'shape' },
      { name: '색(청록)', desc: '청록/시안/하늘색 계열', weight: 5, category: 'color' },
    ],
    ct: { focus: '추상화', maxPoints: 15,
      criteria: '눈에 보이는 형태를 방향·크기 같은 속성 언어로 재구성하는 능력' },
    anchors: [
      { score: 93, prompt: '중앙에 청록색 고리가 하나 있다. 바닥에 눕혀진 게 아니라 수직으로 세워져 있다. 테두리 두께는 아주 얇고, 그에 비해 고리의 지름은 훨씬 크다.' },
      { score: 52, prompt: '청록색 고리가 하나 세워져 있다.' },
      { score: 20, prompt: '포탈' },
    ],
  },

  'battle-02': {
    elements: [
      { name: '가로 방향 긺', desc: '가로로 길다/옆으로 넓다/한 방향이 더 길다', weight: 22, category: 'proportion' },
      { name: '납작함', desc: '납작하다/위아래로 짧다/찌그러진', weight: 14, category: 'proportion' },
      { name: '구가 아님', desc: '완전한 구가 아니다/비율 차이 명시', weight: 4, category: 'proportion' },
      { name: '장축 수평', desc: '가로로 누워있다/수평 방향', weight: 15, category: 'spatial' },
      { name: '타원체 도형', desc: '타원/타원체/럭비공/달걀 형태', weight: 25, category: 'shape' },
      { name: '색(초록)', desc: '초록/녹색', weight: 5, category: 'color' },
    ],
    ct: { focus: '추상화', maxPoints: 15,
      criteria: '구와 타원체의 차이를 비율 언어로 정확히 서술하는 능력' },
    anchors: [
      { score: 93, prompt: '중앙에 초록색 타원체가 가로로 누워 있다. 완전한 구가 아니라 가로 방향으로 더 길고 위아래로는 약간 납작한 형태이다.' },
      { score: 50, prompt: '초록색 타원체가 하나 있다. 공보다 길쭉하다.' },
      { score: 20, prompt: '수박' },
    ],
  },

  'battle-03': {
    elements: [
      { name: '대각선 방향', desc: '대각선/비스듬/사선', weight: 18, category: 'spatial' },
      { name: '왼쪽 아래 시작', desc: '왼쪽 아래에서/아래쪽에서 출발', weight: 12, category: 'spatial' },
      { name: '오른쪽 위 향함', desc: '오른쪽 위를 향해/우상향', weight: 10, category: 'spatial' },
      { name: '화살표 길이', desc: '길게 뻗은/길이감 언급', weight: 10, category: 'proportion' },
      { name: '화살표 도형', desc: '화살표/화살/arrow', weight: 25, category: 'shape' },
      { name: '화살촉 방향성', desc: '뾰족한 끝이 어느 방향/화살촉 언급', weight: 5, category: 'shape' },
      { name: '색(자홍)', desc: '자홍/마젠타/분홍 계열', weight: 5, category: 'color' },
    ],
    ct: { focus: '추상화', maxPoints: 15,
      criteria: '방향을 두 축(시작-끝)의 공간 관계로 분해하여 서술하는 능력' },
    anchors: [
      // 감사 지적: 기존 TOP 앵커에 길이 언급이 없어 proportion 0/10이었다. "길게"를 넣어 보강.
      { score: 93, prompt: '자홍색 화살표가 하나 있다. 왼쪽 아래에서 오른쪽 위를 향해 대각선으로 길게 뻗어 있고, 뾰족한 화살촉이 오른쪽 위 끝에 있다.' },
      { score: 52, prompt: '분홍색 화살표가 비스듬하게 놓여 있다.' },
      { score: 20, prompt: '화살표' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // Level 2: 분해와 재조합 — structure/spatial/proportion 중심
  // ═══════════════════════════════════════════════════════════

  'battle-04': {
    elements: [
      { name: '줄기-갓 분해', desc: '줄기와 갓 두 부분으로 나눠서 설명', weight: 12, category: 'structure' },
      { name: '줄기 부분 명명', desc: '줄기/기둥/아래 부분 언급', weight: 7, category: 'structure' },
      { name: '갓 부분 명명', desc: '갓/머리/위 부분 언급', weight: 6, category: 'structure' },
      { name: '위아래 관계', desc: '줄기 위에 갓이 얹혀/올려져', weight: 15, category: 'spatial' },
      { name: '줄기 수직', desc: '줄기가 세로로 서 있다', weight: 10, category: 'spatial' },
      { name: '줄기 가늘기', desc: '가느다란/얇은/가는 줄기', weight: 8, category: 'proportion' },
      { name: '갓 넓고 납작', desc: '갓이 넓고 납작/편평', weight: 12, category: 'proportion' },
      { name: '줄기 원기둥', desc: '원기둥/기둥 형태', weight: 5, category: 'shape' },
      { name: '갓 타원/반구', desc: '타원체/반구/납작한 구', weight: 5, category: 'shape' },
      { name: '줄기 흰색', desc: '흰색/하얀색', weight: 3, category: 'color' },
      { name: '갓 빨간색', desc: '빨간/빨강', weight: 2, category: 'color' },
    ],
    ct: { focus: '분해', maxPoints: 15,
      criteria: '버섯을 줄기와 갓으로 분해하고 각 부분의 형태·관계를 독립적으로 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '가느다란 흰색 원기둥이 세로로 서 있다. 그 원기둥 위에 빨간색으로 넓고 납작한 타원체가 버섯 갓처럼 얹혀 있다.' },
      { score: 52, prompt: '흰 기둥 위에 빨간 갓이 얹혀 있다. 버섯 모양이다.' },
      { score: 20, prompt: '버섯' },
    ],
  },

  'battle-05': {
    elements: [
      { name: '부분 분해(원뿔2+구)', desc: '원뿔 두 개와 가운데 구로 나눠서 설명', weight: 15, category: 'structure' },
      { name: '꼭짓점 맞닿음 규칙', desc: '꼭짓점끼리/좁은 부분이 만남', weight: 10, category: 'structure' },
      { name: '위 원뿔 아래 향함', desc: '위쪽 원뿔이 아래를 향함/넓은 면이 위', weight: 10, category: 'spatial' },
      { name: '아래 원뿔 위 향함', desc: '아래 원뿔이 위를 향함/넓은 면이 아래', weight: 10, category: 'spatial' },
      { name: '구의 중앙 위치', desc: '구가 가운데에/맞닿는 지점에', weight: 5, category: 'spatial' },
      { name: '구 작음', desc: '작은/조그만 구', weight: 10, category: 'proportion' },
      { name: '원뿔 크기 관계', desc: '두 원뿔이 비슷한 크기/위아래 대칭', weight: 10, category: 'proportion' },
      { name: '원뿔·구 구분', desc: '원뿔과 구를 명확히 구분', weight: 10, category: 'shape' },
      { name: '원뿔 청록', desc: '청록/시안', weight: 3, category: 'color' },
      { name: '구 노란색', desc: '노란/노랑', weight: 2, category: 'color' },
    ],
    ct: { focus: '분해', maxPoints: 15,
      criteria: '모래시계를 원뿔+구로 분해하고, 원뿔의 방향성을 체계적으로 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '크기가 비슷한 청록색 원뿔 두 개가 위아래로 대칭을 이룬다. 위쪽 원뿔은 넓은 부분이 위에 있고 아래로 좁아진다. 아래쪽 원뿔은 넓은 부분이 아래에 있고 위로 좁아진다. 두 꼭짓점이 가운데서 만난다. 만나는 지점에 작은 노란색 구가 있다.' },
      { score: 55, prompt: '원뿔 두 개가 위아래로 꼭짓점을 맞대고 있고, 가운데에 작은 공이 있다.' },
      { score: 20, prompt: '모래시계' },
    ],
  },

  'battle-06': {
    elements: [
      { name: '구-고리 분해', desc: '구와 고리 두 부분으로 나눠 설명', weight: 12, category: 'structure' },
      { name: '감싸는 관계', desc: '고리가 구를 감싸다/둘러싸다', weight: 10, category: 'structure' },
      { name: '고리 기울기', desc: '고리가 가로로 놓여 있고 앞쪽이 아래로 약간 기울어 있다(비스듬히/살짝 기울어진). "수평으로 놓여 있다"만 쓰면 2/3', weight: 15, category: 'spatial' },
      { name: '고리가 구 주변', desc: '구를 중심으로/구 주위에', weight: 10, category: 'spatial' },
      { name: '고리가 구보다 큼', desc: '고리가 구보다 크다/넓다', weight: 20, category: 'proportion' },
      { name: '구·고리 구분', desc: '구와 고리를 구분해서 명명', weight: 10, category: 'shape' },
      { name: '구 노란색', desc: '노란/노랑', weight: 4, category: 'color' },
      { name: '고리 주황색', desc: '주황/오렌지', weight: 4, category: 'color' },
    ],
    ct: { focus: '분해', maxPoints: 15,
      criteria: '토성을 구+고리로 분해하고, 고리의 방향과 크기 관계를 서술하는 능력' },
    anchors: [
      { score: 93, prompt: '중앙에 노란색 구가 있다. 그 구를 감싸는 주황색 고리가 가로로 놓여 있고, 앞쪽이 아래로 약간 기울어 있다. 고리는 구보다 훨씬 크다.' },
      { score: 50, prompt: '노란 공을 주황색 고리가 둘러싸고 있다.' },
      { score: 20, prompt: '토성' },
    ],
  },

  'battle-07': {
    elements: [
      { name: '세 부분 분해', desc: '머리/동체/화염 3부분으로 나눠 설명', weight: 15, category: 'structure' },
      { name: '위-가운데-아래 순서', desc: '위에서 아래로 머리-동체-화염 배치 규칙', weight: 10, category: 'structure' },
      { name: '머리 원뿔 위 향함', desc: '머리는 위쪽, 뾰족한 끝이 위', weight: 8, category: 'spatial' },
      { name: '화염 원뿔 아래 향함', desc: '화염은 아래쪽, 뾰족한 끝이 아래', weight: 8, category: 'spatial' },
      { name: '동체 세로 기립', desc: '동체가 세로로 서 있다', weight: 5, category: 'spatial' },
      { name: '동체 길쭉함', desc: '동체가 길쭉하다/세로로 긺', weight: 7, category: 'proportion' },
      { name: '머리·화염 크기', desc: '머리·화염 원뿔이 동체보다 짧다/굵기는 동체와 같다 등 크기 비교', weight: 8, category: 'proportion' },
      { name: '원기둥·원뿔 구분', desc: '동체 원기둥, 머리·화염 원뿔로 구분', weight: 10, category: 'shape' },
      { name: '동체 파란색', desc: '파란/파랑', weight: 5, category: 'color' },
      { name: '머리 빨간색', desc: '빨간/빨강', weight: 5, category: 'color' },
      { name: '화염 주황색', desc: '주황/오렌지', weight: 4, category: 'color' },
    ],
    ct: { focus: '분해', maxPoints: 15,
      criteria: '로켓을 세 부분으로 분해하고 각 부분의 도형·방향·위치를 체계적으로 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '길쭉한 파란색 원기둥이 세로로 서 있다. 그 위에 원기둥과 굵기가 같고 길이는 더 짧은 빨간색 원뿔이 뾰족한 끝을 위로 하고 얹혀 있다. 원기둥 아래에는 주황색 원뿔이 뾰족한 끝을 아래로 향한다.' },
      { score: 52, prompt: '파란 기둥 위에 빨간 뿔이 있고, 아래에 주황 뿔이 있다.' },
      { score: 20, prompt: '로켓' },
    ],
  },

  'battle-08': {
    elements: [
      { name: '상판·다리·사과 분해', desc: '상판, 다리, 사과 세 부분 구분', weight: 10, category: 'structure' },
      { name: '다리 4개 규칙', desc: '다리가 4개/네 다리', weight: 10, category: 'structure' },
      { name: '수직 계층 관계', desc: '다리→상판→사과 위아래 층 구조', weight: 10, category: 'structure' },
      { name: '다리가 상판 받침', desc: '다리가 상판 아래/상판을 받치다', weight: 8, category: 'spatial' },
      { name: '사과가 상판 위', desc: '사과가 상판 위에 놓여', weight: 8, category: 'spatial' },
      { name: '다리 네 모서리', desc: '다리가 네 모서리에/네 귀에', weight: 5, category: 'spatial' },
      { name: '상판 넓고 납작', desc: '넓고 납작한/얇은 판', weight: 7, category: 'proportion' },
      { name: '다리 가느다람', desc: '가느다란/얇은 다리', weight: 8, category: 'proportion' },
      { name: '상판·다리·사과 도형', desc: '상자/원기둥/구로 표현', weight: 10, category: 'shape' },
      { name: '갈색', desc: '탁자 갈색/나무색', weight: 5, category: 'color' },
      { name: '사과 빨간', desc: '사과 빨간/빨강', weight: 4, category: 'color' },
    ],
    ct: { focus: '분해', maxPoints: 15,
      criteria: '탁자를 상판+다리로 분해하고, 사과와의 공간 관계까지 체계적으로 서술하는 능력' },
    anchors: [
      { score: 93, prompt: '갈색의 넓고 납작한 상자가 탁자 상판이다. 상판 네 모서리 아래에 갈색의 가느다란 원기둥 4개가 다리로 세워져 있다. 상판 위 가운데에 빨간색 작은 구가 사과처럼 놓여 있다.' },
      { score: 55, prompt: '갈색 탁자 상판 아래에 다리가 있고, 상판 위에 빨간 사과가 놓여 있다.' },
      { score: 25, prompt: '탁자와 사과' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // Level 3: 반복 패턴 — structure(패턴 규칙) 강화
  // ═══════════════════════════════════════════════════════════

  'battle-09': {
    elements: [
      { name: '6개 계단 패턴', desc: '6개가 계단처럼 배치된다는 규칙', weight: 15, category: 'structure' },
      { name: '한 칸씩 규칙', desc: '한 칸씩 올라감/일정한 간격 증가', weight: 15, category: 'structure' },
      { name: '왼→오, 아래→위 방향', desc: '왼쪽 아래에서 오른쪽 위로', weight: 15, category: 'spatial' },
      { name: '단차 방향', desc: '단계별로 수직·수평 이동이 결합', weight: 10, category: 'spatial' },
      { name: '상자 납작함', desc: '납작한/얇은 단', weight: 10, category: 'proportion' },
      { name: '상자 도형', desc: '상자/직육면체/블록', weight: 10, category: 'shape' },
      { name: '개수 정확', desc: '6개/여섯 개', weight: 5, category: 'shape' },
      { name: '색(빨강)', desc: '빨간/빨강', weight: 5, category: 'color' },
    ],
    ct: { focus: '패턴+알고리즘', maxPoints: 15,
      criteria: '계단의 반복 규칙(한 칸씩 위+오른쪽)을 패턴으로 인식하고 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '빨간색 납작한 상자 6개가 계단처럼 배치되어 있다. 왼쪽 아래에서 시작해서 오른쪽 위로 한 칸씩 올라간다.' },
      // 감사 지적: 기존 MID 앵커('빨간 상자 여러 개가 계단 모양이다')는 실제 배점상 25점짜리였다.
      // 50점대를 대표하도록 방향 서술을 넣어 현실화했다.
      { score: 52, prompt: '빨간 상자 여러 개가 왼쪽 아래에서 오른쪽 위로 계단처럼 이어져 있다.' },
      { score: 20, prompt: '계단' },
    ],
  },

  'battle-10': {
    elements: [
      { name: '원형 배치 규칙', desc: '원을 그리며/원형으로 둘레 배치', weight: 18, category: 'structure' },
      { name: '균등 간격 규칙', desc: '균등하게/같은 간격으로', weight: 12, category: 'structure' },
      // 2026-10-27: '12개 배열'과 '개수 정확'(shape 5)이 같은 사실을 두 번 셌고, 수직 기둥은 원 중심을
      // '향하지' 않는다. 개수 중복분은 '기둥 높이 같음'으로, '원 중심 향함'은 '가운데 빈 둘레 배치'로 바꿨다.
      { name: '12개 배열', desc: '12개/열두 개 만점, 10~14개 근사치는 2/3, "여러 개"만 쓰면 1/3', weight: 10, category: 'structure' },
      { name: '세워져 있음', desc: '수직으로 서 있다', weight: 10, category: 'spatial' },
      { name: '가운데 빈 둘레 배치', desc: '기둥이 둘레에만 있고 가운데는 비어 있다', weight: 5, category: 'spatial' },
      { name: '가느다람', desc: '가느다란/얇은 기둥', weight: 10, category: 'proportion' },
      { name: '기둥 높이 같음', desc: '모든 기둥의 높이가 같다', weight: 5, category: 'proportion' },
      { name: '원기둥 도형', desc: '원기둥/기둥/막대', weight: 10, category: 'shape' },
      { name: '색(노랑)', desc: '노란/노랑', weight: 5, category: 'color' },
    ],
    ct: { focus: '패턴+알고리즘', maxPoints: 15,
      criteria: '원형 배치의 반복 규칙(개수, 등간격, 원 반지름)을 패턴으로 인식하고 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '높이가 모두 같은 노란색 가느다란 원기둥 12개가 원을 그리면서 균등한 간격으로 세워져 있다. 기둥은 원의 둘레에만 있고 가운데는 비어 있다.' },
      { score: 50, prompt: '노란 기둥 여러 개가 원을 그리며 세로로 서 있다.' },
      { score: 20, prompt: '울타리' },
    ],
  },

  'battle-11': {
    elements: [
      { name: '층 수(3층)', desc: '3층/세 층으로 쌓임', weight: 15, category: 'structure' },
      { name: '3-2-1 감소 규칙', desc: '아래 3, 가운데 2, 위 1 개수 규칙', weight: 15, category: 'structure' },
      { name: '층별 색상 변화', desc: '층마다 다른 색', weight: 10, category: 'structure' },
      { name: '중심 정렬 배치', desc: '가운데 정렬/위로 갈수록 안쪽', weight: 10, category: 'spatial' },
      { name: '쌓는 방향(아래→위)', desc: '아래→위로 쌓임', weight: 5, category: 'spatial' },
      // 감사 지적: 기존 '각 블록 비슷한 크기'는 관측할 이유가 없는 요소라 아무도 쓰지 않았다
      // (TOP 앵커조차 proportion 0/5). 실제로 눈에 보이는 "위층이 더 좁다"로 교체.
      { name: '위층이 더 좁음', desc: '위로 갈수록 층의 폭이 줄어든다/위층이 아래층보다 좁다', weight: 5, category: 'proportion' },
      { name: '정육면체 도형', desc: '정육면체/상자/블록', weight: 10, category: 'shape' },
      { name: '주황·청록·자홍', desc: '세 색 모두 언급', weight: 15, category: 'color' },
    ],
    ct: { focus: '패턴+분해', maxPoints: 15,
      criteria: '피라미드의 층별 규칙(개수 감소, 색상 변화, 정렬)을 패턴으로 인식하고 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '정육면체 블록이 피라미드처럼 쌓여 있다. 맨 아래층에 주황색 3개, 가운데층에 청록색 2개, 꼭대기에 자홍색 1개. 위로 올라갈수록 층의 폭이 하나씩 좁아지고 가운데 정렬이다.' },
      { score: 55, prompt: '블록이 피라미드처럼 위로 갈수록 적게 쌓여 있다. 층마다 색이 다르다.' },
      { score: 20, prompt: '피라미드' },
    ],
  },

  'battle-12': {
    elements: [
      { name: '4x4 격자 규칙', desc: '4x4/4줄 4칸/16개 격자', weight: 15, category: 'structure' },
      { name: '번갈아 색상 규칙', desc: '흰-검이 한 칸씩 교대로', weight: 20, category: 'structure' },
      { name: '다음 줄 반대 시작', desc: '다음 줄은 반대 색으로 시작', weight: 10, category: 'structure' },
      // 2026-10-27: 판을 바닥(y=0)에 눕히면 정면 카메라에서 옆면 한 줄만 보여 격자를 관찰할 수 없었다.
      // 판을 정면을 향해 세웠고, 그 방향 서술을 요소로 둔다. 칸 사이 0.1 간격이 있으므로 "빈틈없이"는 뺐다.
      // '16칸 명시'(shape 5)는 '4x4'와 같은 사실이라 없애고, 관찰 가능한 '칸 크기 같음'으로 옮겼다.
      { name: '판이 세워짐', desc: '판 전체가 세로로 세워져 정면을 향한다(벽에 걸린 것처럼)', weight: 8, category: 'spatial' },
      { name: '줄·칸 정렬', desc: '가로세로 줄을 맞춰 일정한 간격으로 나란히 배열', weight: 5, category: 'spatial' },
      { name: '칸 크기 같음', desc: '모든 칸이 같은 크기의 정사각형', weight: 5, category: 'proportion' },
      { name: '상자 도형', desc: '정사각형/납작한 상자/타일', weight: 12, category: 'shape' },
      { name: '흰-검 사용', desc: '흰색과 검은색 두 색', weight: 10, category: 'color' },
    ],
    ct: { focus: '알고리즘+패턴', maxPoints: 15,
      criteria: '체스판의 색상 교차 규칙을 정확히 인식하고, 격자 크기와 배치 규칙을 알고리즘적으로 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '크기가 같은 납작한 정사각형 상자 16개가 4줄 4칸 격자로, 좁은 간격을 두고 줄을 맞춰 세로로 세워져 정면을 향한다. 같은 줄에서 흰색과 검은색이 한 칸씩 번갈아 나오고, 다음 줄은 반대 색으로 시작한다.' },
      { score: 52, prompt: '흰색과 검은색 사각형이 4줄 4칸 격자로 세워져 있다.' },
      { score: 20, prompt: '체스판' },
    ],
  },

  'battle-13': {
    elements: [
      { name: '6x6 격자', desc: '6x6/6행 6열/36개', weight: 12, category: 'structure' },
      { name: '행별 단일 색 규칙', desc: '한 행은 한 가지 색/행마다 색이 다름', weight: 15, category: 'structure' },
      { name: '무지개 순서', desc: '빨-주-노-초-파-자홍 순서 규칙(마지막을 보라/분홍이라 해도 인정)', weight: 13, category: 'structure' },
      // 감사 지적: color 20점은 "색 이름만 나열해도 22점"이 나오게 만들었다.
      // color를 8점으로 낮추고 남는 배점을 spatial/proportion으로 옮겼다.
      { name: '격자 정렬', desc: '줄 맞춰/행과 열이 정렬된 격자', weight: 12, category: 'spatial' },
      { name: '아래→위 행 순서', desc: '아래 행부터 위 행으로 색이 바뀌는 순서', weight: 5, category: 'spatial' },
      { name: '구 크기 균일', desc: '모든 구가 같은 크기다/크기 차이가 없다', weight: 10, category: 'proportion' },
      { name: '구 도형', desc: '구/공/구슬', weight: 10, category: 'shape' },
      { name: '6색 무지개', desc: '빨강·주황·노랑·초록·파랑·자홍 다수 언급', weight: 8, category: 'color' },
    ],
    ct: { focus: '패턴+알고리즘', maxPoints: 15,
      criteria: '격자 배치 규칙과 행별 색상 순서 패턴을 정확히 인식하고 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '크기가 모두 같은 구 36개가 6행 6열 격자로 줄을 맞춰 배열되어 있다. 각 행이 아래부터 위로 빨강, 주황, 노랑, 초록, 파랑, 자홍 순서로 무지개 색이다.' },
      { score: 55, prompt: '구가 6줄 6칸 격자로 놓여 있고, 줄마다 색이 다르다.' },
      { score: 20, prompt: '구슬 커튼' },
    ],
  },

  'battle-14': {
    elements: [
      { name: '나선형 경로', desc: '나선/헬릭스/스프링 경로', weight: 20, category: 'structure' },
      { name: '회전+상승 결합 규칙', desc: '회전하면서 동시에 위로 이동', weight: 15, category: 'structure' },
      // 2026-10-27: 정면에서 30개를 세기는 어렵다. 세 바퀴·일정한 간격처럼 패턴으로 쓴 개수 정보도 인정한다.
      { name: '30개 배열', desc: '30개 또는 약 세 바퀴 만점, "구가 많다/수십 개"는 1/3', weight: 5, category: 'structure' },
      { name: '상승 방향', desc: '아래→위로 상승', weight: 10, category: 'spatial' },
      { name: '원형 회전 경로', desc: '원/나선형으로 도는 경로', weight: 10, category: 'spatial' },
      { name: '구 작음', desc: '작은/조그만 구', weight: 10, category: 'proportion' },
      { name: '구 도형', desc: '구/공', weight: 10, category: 'shape' },
      { name: '색(청록)', desc: '청록/시안', weight: 5, category: 'color' },
    ],
    ct: { focus: '패턴+알고리즘', maxPoints: 15,
      criteria: '나선 경로의 본질(회전+상승 결합)을 인식하고, 개별 나열이 아닌 전체 패턴으로 서술하는 능력' },
    anchors: [
      { score: 90, prompt: '청록색 작은 구 30개가 나선형으로 배치되어 있다. 아래에서 위로 올라가면서 원을 그리듯 빙글빙글 회전하는 경로를 따른다.' },
      { score: 55, prompt: '파란 공들이 빙글빙글 올라간다' },
      { score: 20, prompt: '나선 탑' },
    ],
  },

  'battle-15': {
    elements: [
      { name: '층 수(4층)', desc: '4층/네 층으로 쌓임', weight: 10, category: 'structure' },
      { name: '4x4→3x3→2x2→1 규칙', desc: '층마다 한 변씩 줄어드는 규칙', weight: 20, category: 'structure' },
      { name: '3D 입체 배치', desc: '가로세로 모두/입체적 3D', weight: 10, category: 'structure' },
      { name: '중심 정렬 배치', desc: '위로 갈수록 안쪽/중심 정렬', weight: 10, category: 'spatial' },
      { name: '각 층 크기 비교', desc: '층 간 크기 차이 명시', weight: 10, category: 'proportion' },
      { name: '정육면체 도형', desc: '정육면체/상자/큐브', weight: 10, category: 'shape' },
      { name: '피라미드 전체 형태', desc: '피라미드/위로 갈수록 작아짐', weight: 10, category: 'shape' },
      { name: '색(주황)', desc: '주황/오렌지', weight: 5, category: 'color' },
    ],
    ct: { focus: '패턴+알고리즘', maxPoints: 15,
      criteria: '3D 피라미드의 층별 감소 규칙(4x4→3x3→2x2→1)을 인식하고, 입체 구조를 서술하는 능력' },
    anchors: [
      { score: 90, prompt: '주황색 정육면체 블록이 가로세로 모두 있는 입체 피라미드로 쌓여 있다. 맨 아래층은 가로 4개 세로 4개, 그 위층은 가로 3개 세로 3개, 그 위는 2개씩, 꼭대기는 1개다. 총 4층이고 위로 갈수록 중심 쪽으로 좁아진다.' },
      { score: 55, prompt: '주황 블록이 피라미드처럼 4층으로 쌓여 있고, 위로 갈수록 작아진다.' },
      { score: 20, prompt: '3D 피라미드' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // Level 4: 복합 구조 — 분해/공간/비율 고르게
  // ═══════════════════════════════════════════════════════════

  'battle-16': {
    elements: [
      { name: '몸통 3구 분해', desc: '아래-중간-위 구 3개로 분해', weight: 10, category: 'structure' },
      { name: '얼굴 부분 분해', desc: '코·눈·모자 등 얼굴 요소 분해', weight: 15, category: 'structure' },
      { name: '수직 쌓임', desc: '세로로 쌓임/아래→위', weight: 10, category: 'spatial' },
      { name: '눈·코·모자 위치', desc: '머리 위에 모자, 정면에 눈/코', weight: 10, category: 'spatial' },
      { name: '코 앞으로 돌출', desc: '코가 앞쪽으로 튀어나옴', weight: 5, category: 'spatial' },
      { name: '아래→위 크기 감소', desc: '아래 큰 구, 위 작은 구 순', weight: 15, category: 'proportion' },
      { name: '코·눈·모자 크기', desc: '작은 코/눈/모자 비율 언급', weight: 5, category: 'proportion' },
      { name: '구·원뿔·원기둥', desc: '구/원뿔/원기둥 조합', weight: 10, category: 'shape' },
      { name: '색상(흰/주황/검)', desc: '몸통 흰, 코 주황, 눈·모자 검', weight: 5, category: 'color' },
    ],
    ct: { focus: '분해+추상화', maxPoints: 15,
      criteria: '눈사람을 기본 도형으로 분해하고 각 부분의 위치·크기·색을 독립적으로 서술하는 능력' },
    anchors: [
      { score: 93, prompt: '흰색 구 3개가 아래부터 큰-중간-작은 순서로 쌓여 있다. 가장 위 구 앞쪽에 주황색 작은 원뿔이 코처럼 돌출되어 있고, 코 위쪽에 검은 작은 구 2개가 눈이다. 머리 꼭대기에 검은 원기둥이 모자처럼 얹혀 있다.' },
      { score: 50, prompt: '흰 공 3개가 쌓여있고 코랑 모자가 있다' },
      { score: 20, prompt: '눈사람' },
    ],
  },

  'battle-17': {
    elements: [
      { name: '본체·불·기둥 분해', desc: '본체, 불, 기둥 세 부분 구분', weight: 12, category: 'structure' },
      { name: '3색 불 순서 규칙', desc: '위→아래 빨·노·초 순서', weight: 15, category: 'structure' },
      { name: '불 3개 세로 배열', desc: '세 구가 세로로 나란히', weight: 12, category: 'spatial' },
      { name: '본체 앞면/내부에 불', desc: '본체 앞면에 불이 박혀 있다/살짝 튀어나와 있다', weight: 8, category: 'spatial' },
      { name: '기둥 아래 받침', desc: '본체 아래 기둥이 받침', weight: 5, category: 'spatial' },
      { name: '본체 세로 긺', desc: '본체가 세로로 긺', weight: 7, category: 'proportion' },
      { name: '불 크기 비율', desc: '불이 본체보다 작은', weight: 3, category: 'proportion' },
      { name: '상자·구·기둥 구분', desc: '상자/구/원기둥 명명', weight: 10, category: 'shape' },
      { name: '검·빨·노·초 색상', desc: '네 색 모두 언급', weight: 13, category: 'color' },
    ],
    ct: { focus: '분해+추상화', maxPoints: 15,
      criteria: '신호등을 본체, 불, 기둥으로 분해하고 내부/외부 공간 관계를 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '세로로 길쭉한 검은 직사각형 상자가 본체이다. 본체 앞면에 본체보다 훨씬 작은 빨간, 노란, 초록 구가 위에서부터 세로로 나란히 박혀 있다. 본체 아래에 회색 원기둥이 기둥으로 서 있다.' },
      { score: 55, prompt: '검은 상자에 빨강, 노랑, 초록 불이 위에서부터 차례로 붙어 있다.' },
      { score: 20, prompt: '신호등' },
    ],
  },

  'battle-18': {
    elements: [
      { name: '건물 5개 분해', desc: '건물이 5개임을 언급하고, 특징 있는 건물 둘 이상을 구분하여 설명', weight: 8, category: 'structure' },
      // 2026-10-27: 3분 안에 다섯 건물을 모두 쓰기는 어렵다. 가장 높은·가장 낮은 건물처럼
      // 특징 건물을 짚어 비교하면 만점을 준다. 다섯 개를 모두 쓰라고 요구하지 않는다.
      { name: '각 건물 개별 속성 규칙', desc: '가장 높은/가장 낮은/가장 넓은 건물을 색이나 위치로 짚어 비교. "모두 다르다"만 쓰면 1/3', weight: 15, category: 'structure' },
      { name: '일렬 배치 관계', desc: '옆으로 나란히/일렬로', weight: 10, category: 'spatial' },
      { name: '바닥 맞춤 배치', desc: '바닥에 서 있는/아랫면이 맞춰져 있다', weight: 5, category: 'spatial' },
      { name: '높이 차이', desc: '높이가 다른/높낮이 다양', weight: 15, category: 'proportion' },
      { name: '너비 차이', desc: '너비/두께가 다른', weight: 10, category: 'proportion' },
      { name: '상자 도형', desc: '상자/직육면체', weight: 7, category: 'shape' },
      { name: '색상 2종 이상', desc: '여러 색상 사용', weight: 8, category: 'color' },
      { name: '구체적 색상', desc: '파랑/청록/회색/흰/주황 등 명시', weight: 7, category: 'color' },
    ],
    ct: { focus: '분해+추상화', maxPoints: 15,
      criteria: '유사하지만 다른 5개 건물의 차이점(높이, 너비, 색상)을 비교하며 체계적으로 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '상자 5개가 아랫면을 맞춰 옆으로 나란히 서 있다. 왼쪽부터 파란색, 청록색, 회색, 흰색, 주황색 순서다. 네 번째 흰색 건물이 가장 좁고 가장 높으며, 맨 오른쪽 주황색 건물이 가장 넓고 가장 낮다. 다섯 개 모두 높이와 너비가 서로 다르다.' },
      { score: 50, prompt: '높이가 다른 파란색과 주황색 상자 여러 개가 나란히 있다.' },
      { score: 20, prompt: '건물들' },
    ],
  },

  'battle-19': {
    elements: [
      { name: '받침·막대·추 분해', desc: '받침, 막대, 추 세 부분 구분', weight: 12, category: 'structure' },
      { name: '비대칭 구조 규칙', desc: '좌우가 다른 비대칭 저울이라는 규칙', weight: 10, category: 'structure' },
      { name: '받침 위에 막대', desc: '받침 위에 막대가 걸침', weight: 10, category: 'spatial' },
      { name: '막대 양 끝에 추', desc: '막대 양쪽 끝에 추 매달림', weight: 10, category: 'spatial' },
      { name: '수평 막대', desc: '막대가 수평으로 걸침', weight: 5, category: 'spatial' },
      { name: '추 한쪽이 더 큼', desc: '한 추가 다른 추보다 크다', weight: 15, category: 'proportion' },
      { name: '받침·막대 비율', desc: '받침 크기와 막대 길이 비교', weight: 5, category: 'proportion' },
      { name: '원뿔·원기둥·구 구분', desc: '받침 원뿔, 막대 원기둥, 추 구', weight: 10, category: 'shape' },
      { name: '양쪽 추 색', desc: '왼쪽(큰) 구는 파랑, 오른쪽(작은) 구는 빨강. 좌우를 바꿔 쓰면 0, 색만 쓰면 1/3', weight: 8, category: 'color' },
    ],
    ct: { focus: '분해+추상화', maxPoints: 15,
      criteria: '저울을 받침+막대+추로 분해하고, 비대칭 구조의 공간 관계를 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '가운데에 노란 원뿔이 꼭짓점을 위로 하고 서 있다. 그 위에 원뿔보다 훨씬 긴 회색 원기둥이 수평으로 걸쳐 있다. 막대 왼쪽 끝에 큰 파란 구, 오른쪽 끝에 작은 빨간 구가 달려 있어 좌우가 비대칭이다.' },
      { score: 50, prompt: '세모 받침 위에 막대가 가로로 놓여 있고, 양쪽 끝에 공이 달려 있다.' },
      { score: 20, prompt: '저울' },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // Level 5: 극한 도전 — 분해+패턴+비율 복합
  // ═══════════════════════════════════════════════════════════

  'battle-20': {
    elements: [
      { name: '줄기·꽃잎·꽃술 분해', desc: '세 부분을 개별적으로 묘사', weight: 12, category: 'structure' },
      { name: '꽃잎 원형 배치 규칙', desc: '꽃잎이 꽃술을 중심으로 방사형/원형 배치(정면을 향함)', weight: 15, category: 'structure' },
      { name: '꽃잎 5개 규칙', desc: '5개/다섯 장의 꽃잎', weight: 8, category: 'structure' },
      { name: '줄기 수직', desc: '줄기가 세로로 서 있다', weight: 5, category: 'spatial' },
      { name: '꽃이 줄기 위', desc: '줄기 꼭대기/위에 꽃', weight: 5, category: 'spatial' },
      { name: '꽃술이 꽃잎 중심', desc: '꽃술이 꽃잎 가운데', weight: 5, category: 'spatial' },
      { name: '줄기 가늘기', desc: '가느다란 줄기', weight: 5, category: 'proportion' },
      { name: '꽃잎 길쭉함', desc: '꽃잎이 길쭉하다/납작하다/타원 모양', weight: 5, category: 'proportion' },
      { name: '꽃술 작음', desc: '작은 꽃술', weight: 5, category: 'proportion' },
      { name: '원기둥·타원·구 구분', desc: '세 도형 조합', weight: 10, category: 'shape' },
      { name: '초록·자홍·노랑', desc: '세 색 모두 언급', weight: 10, category: 'color' },
    ],
    ct: { focus: '분해+패턴', maxPoints: 15,
      criteria: '꽃을 줄기·꽃잎·꽃술로 분해하고, 꽃잎의 원형 배치 패턴을 인식하여 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '초록색 가느다란 원기둥이 줄기로 세로로 서 있다. 줄기 꼭대기에 노란색 작은 구가 꽃술로 있고, 자홍색 길쭉한 타원체 5개가 꽃술을 중심으로 바깥쪽을 향해 원형으로 퍼져 정면을 향한 꽃잎을 이룬다.' },
      // 감사 지적: 기존 MID 앵커('초록 줄기 위에 분홍 꽃잎과 노란 가운데')는 실제 배점상 24점짜리였다.
      // 50점대를 대표하도록 방향·배치 서술을 넣어 현실화했다.
      { score: 50, prompt: '초록 줄기가 세로로 서 있고 그 위에 분홍 꽃잎이 둥글게 퍼져 있다. 꽃잎 가운데는 노랗다.' },
      { score: 20, prompt: '꽃' },
    ],
  },

  'battle-21': {
    elements: [
      { name: '머리·눈·입·안테나 분해', desc: '4 부분을 개별적으로 묘사', weight: 15, category: 'structure' },
      { name: '좌우 대칭 규칙', desc: '눈/안테나 등이 좌우 대칭', weight: 12, category: 'structure' },
      { name: '눈이 머리 앞면 상단', desc: '눈이 앞쪽 위에 좌우로', weight: 8, category: 'spatial' },
      { name: '입이 눈 아래', desc: '입이 눈보다 아래/정면 하단', weight: 5, category: 'spatial' },
      { name: '안테나 머리 위 양쪽', desc: '머리 위 양옆에 안테나', weight: 10, category: 'spatial' },
      { name: '눈·입 작음', desc: '눈/입이 머리에 비해 작음', weight: 5, category: 'proportion' },
      { name: '머리 큼', desc: '머리가 제일 큼', weight: 5, category: 'proportion' },
      { name: '상자·구·원기둥 조합', desc: '머리 상자, 눈 구, 안테나 원기둥', weight: 10, category: 'shape' },
      { name: '안테나 2개 + 끝 장식', desc: '안테나 2개와 끝 장식 언급', weight: 5, category: 'shape' },
      { name: '색상(머리/눈/입)', desc: '세 부분 색상 최소 2색 이상', weight: 10, category: 'color' },
    ],
    ct: { focus: '분해+추상화', maxPoints: 15,
      criteria: '얼굴을 머리/눈/입/안테나로 분해하고 좌우 대칭 구조와 앞뒤 관계를 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '가장 큰 회색 상자가 머리이다. 머리 앞면 위쪽에 머리보다 훨씬 작은 노란 구 2개가 좌우 대칭으로 눈이다. 눈 아래에 빨간 납작한 작은 상자가 입이다. 머리 위 양쪽에 회색 원기둥 2개가 안테나로 올라가고, 각 끝에 빨간 작은 구가 달려있다.' },
      { score: 55, prompt: '네모난 회색 머리 앞에 노란 눈 2개와 빨간 입이 있고, 머리 위에 안테나 2개가 있다.' },
      { score: 20, prompt: '로봇 얼굴' },
    ],
  },

  'battle-22': {
    elements: [
      { name: '중심·결합봉·말단 분해', desc: '중심 구/결합봉/말단 구 세 역할 구분', weight: 15, category: 'structure' },
      { name: '3방향 결합 규칙', desc: '세 방향으로 뻗는 규칙', weight: 15, category: 'structure' },
      { name: '3D 방향성', desc: '위/아래/앞/옆 등 3차원 방향. 아래쪽 봉이 앞으로 기운 것을 쓰면 만점, "아래"만 쓰면 2/3', weight: 10, category: 'structure' },
      { name: '각 결합봉 방향', desc: '각 봉이 향하는 방향 구체화', weight: 10, category: 'spatial' },
      { name: '말단 구가 봉 끝', desc: '작은 구가 봉 끝에 부착', weight: 5, category: 'spatial' },
      { name: '중심 > 말단 크기', desc: '중심 구가 말단보다 크다', weight: 10, category: 'proportion' },
      { name: '구·원기둥 구분', desc: '구와 원기둥(봉) 구분', weight: 8, category: 'shape' },
      { name: '색상(빨·회·파·초)', desc: '중심 빨강, 봉 회색, 위쪽 두 말단 파랑, 아래쪽 말단 초록. 말단 색이 서로 다르다는 언급 포함', weight: 12, category: 'color' },
    ],
    ct: { focus: '분해+추상화', maxPoints: 15,
      criteria: '분자 모형의 중심-결합-말단 구조를 분해하고, 3차원 방향성을 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '큰 빨간 구가 중심에 있다. 중심에서 세 방향으로 가느다란 회색 원기둥이 결합봉처럼 뻗어 있다. 하나는 오른쪽 위, 하나는 왼쪽 위, 하나는 아래 앞쪽을 향한다. 위쪽 두 봉 끝에는 중심보다 작은 파란색 구가, 아래쪽 봉 끝에는 같은 크기의 초록색 구가 달려 있다.' },
      { score: 50, prompt: '큰 빨간 공에서 막대가 여러 방향으로 나와서 끝에 작은 공이 있다' },
      { score: 20, prompt: '분자 모형' },
    ],
  },

  'battle-23': {
    elements: [
      { name: '기둥·지붕·좌석 분해', desc: '세 역할로 구분해서 설명', weight: 12, category: 'structure' },
      { name: '좌석 원형 배치', desc: '좌석이 원형으로/둘레에 배치', weight: 15, category: 'structure' },
      { name: '좌석 개수·균등 간격', desc: '같은 간격 언급 + 개수(8개 만점, 6~10개 근사치는 2/3, "여러 개"는 1/3)', weight: 10, category: 'structure' },
      { name: '기둥 위에 지붕', desc: '기둥 위에 지붕 덮임', weight: 8, category: 'spatial' },
      { name: '기둥 주위에 좌석', desc: '좌석이 기둥을 둘러쌈', weight: 10, category: 'spatial' },
      { name: '지붕 덮는 크기', desc: '지붕이 좌석들을 덮을 만큼 넓음', weight: 5, category: 'proportion' },
      { name: '좌석 작음', desc: '좌석이 지붕보다 훨씬 작음', weight: 5, category: 'proportion' },
      { name: '원기둥·원뿔·구 구분', desc: '세 도형 조합', weight: 10, category: 'shape' },
      { name: '색상 2종 이상', desc: '여러 색상 사용', weight: 10, category: 'color' },
    ],
    ct: { focus: '분해+패턴', maxPoints: 15,
      criteria: '회전목마를 중심기둥/지붕/좌석으로 분해하고, 좌석의 원형 배치 패턴을 인식하여 서술하는 능력' },
    anchors: [
      { score: 92, prompt: '가운데에 노란 원기둥이 세로로 서 있다. 원기둥 위에 좌석들을 모두 덮을 만큼 넓은 빨간 원뿔이 지붕처럼 얹혀 있다. 기둥 주위에 지붕보다 훨씬 작은 파란 구 8개가 원형으로 같은 간격으로 배치되어 좌석이다.' },
      { score: 60, prompt: '가운데 기둥 위에 지붕이 있고, 기둥 둘레에 공 여러 개가 둥글게 놓여 있다.' },
      { score: 20, prompt: '회전목마' },
    ],
  },
}
