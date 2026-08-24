/**
 * 챌린지 정답 코드 — **서버 전용**
 *
 * 정답 코드가 클라이언트 번들에 통째로 들어가면 학생이 23개 문제의 정답을
 * 한 번에 읽을 수 있으므로 메타데이터와 분리했다.
 * 클라이언트는 src/data/challenges-battle.js(코드 없음)만 번들에 포함하고,
 * 실제 코드는 /api/challenges/:id 로 현재 라운드 한 건만 받아 간다.
 *
 * ⚠️ 이 파일은 절대 src/components/ 아래에서 import 하지 말 것.
 */

export const CHALLENGE_CODES = {
  "battle-01": `ring({pos: vec(0,0,0), axis: vec(0,0,1), radius: 2, thickness: 0.3, color: color.cyan});`,

  "battle-02": `ellipsoid({pos: vec(0,0,0), size: vec(3,2,2), color: color.green});`,

  "battle-03": `arrow({pos: vec(-2,-2,0), axis: vec(4,4,0), shaftwidth: 0.3, color: color.magenta});`,

  "battle-04": `cylinder({pos: vec(0,-2,0), axis: vec(0,2.5,0), radius: 0.35, color: color.white});
ellipsoid({pos: vec(0,0.8,0), size: vec(2.5,0.8,2.5), color: color.red});`,

  "battle-05": `cone({pos: vec(0,2.5,0), axis: vec(0,-2.5,0), radius: 1.5, color: color.cyan});
cone({pos: vec(0,-2.5,0), axis: vec(0,2.5,0), radius: 1.5, color: color.cyan});
sphere({pos: vec(0,0,0), radius: 0.3, color: color.yellow});`,

  "battle-06": `sphere({pos: vec(0,0,0), radius: 1.5, color: color.yellow});
ring({pos: vec(0,0,0), axis: vec(0,1,0), radius: 2.8, thickness: 0.15, color: color.orange});`,

  "battle-07": `cylinder({pos: vec(0,-1,0), axis: vec(0,3,0), radius: 0.7, color: color.blue});
cone({pos: vec(0,2,0), axis: vec(0,1.5,0), radius: 0.7, color: color.red});
cone({pos: vec(0,-1,0), axis: vec(0,-1.2,0), radius: 0.7, color: color.orange});`,

  "battle-08": `box({pos: vec(0,0,0), size: vec(4,0.3,3), color: vec(0.6,0.3,0.1)});
cylinder({pos: vec(-1.5,-2,1), axis: vec(0,2,0), radius: 0.15, color: vec(0.6,0.3,0.1)});
cylinder({pos: vec(1.5,-2,1), axis: vec(0,2,0), radius: 0.15, color: vec(0.6,0.3,0.1)});
cylinder({pos: vec(-1.5,-2,-1), axis: vec(0,2,0), radius: 0.15, color: vec(0.6,0.3,0.1)});
cylinder({pos: vec(1.5,-2,-1), axis: vec(0,2,0), radius: 0.15, color: vec(0.6,0.3,0.1)});
sphere({pos: vec(0,0.55,0), radius: 0.4, color: color.red});`,

  "battle-09": `for (var i = 0; i < 6; i++) {
    box({pos: vec(i*1.2-3, i*0.6-1.5, 0), size: vec(1, 0.5, 2), color: color.red});
}`,

  "battle-10": `for (var i = 0; i < 12; i++) {
    var angle = i * Math.PI * 2 / 12;
    cylinder({pos: vec(Math.cos(angle)*3, -1, Math.sin(angle)*3),
              axis: vec(0,2,0), radius: 0.15, color: color.yellow});
}`,

  "battle-11": `var rowColors = [color.orange, color.cyan, color.magenta];
for (var row = 0; row < 3; row++) {
    var count = 3 - row;
    for (var i = 0; i < count; i++) {
        box({pos: vec((i - (count-1)/2)*1.2, row*1.1, 0),
             size: vec(1, 1, 1), color: rowColors[row]});
    }
}`,

  "battle-12": `for (var row = 0; row < 4; row++) {
    for (var col = 0; col < 4; col++) {
        var c = (row + col) % 2 === 0 ? color.white : color.black;
        box({pos: vec(col*1.1-1.65, 0, row*1.1-1.65), size: vec(1,0.2,1), color: c});
    }
}`,

  "battle-13": `var rowColors = [color.red, color.orange, color.yellow, color.green, color.blue, color.magenta];
for (var row = 0; row < 6; row++) {
    for (var col = 0; col < 6; col++) {
        sphere({pos: vec(col*1.2-3, row*1.2-3, 0), radius: 0.4, color: rowColors[row]});
    }
}`,

  "battle-14": `for (var i = 0; i < 30; i++) {
    var angle = i * Math.PI / 5;
    var y = i * 0.3 - 4.5;
    sphere({pos: vec(Math.cos(angle)*2, y, Math.sin(angle)*2), radius: 0.25, color: color.cyan});
}`,

  "battle-15": `for (var layer = 0; layer < 4; layer++) {
    var size = 4 - layer;
    for (var x = 0; x < size; x++) {
        for (var z = 0; z < size; z++) {
            box({pos: vec((x-(size-1)/2)*1.1, layer*1.1, (z-(size-1)/2)*1.1),
                 size: vec(1, 1, 1), color: color.orange});
        }
    }
}`,

  "battle-16": `sphere({pos: vec(0,-2,0), radius: 1.5, color: color.white});
sphere({pos: vec(0,0,0), radius: 1.1, color: color.white});
sphere({pos: vec(0,1.7,0), radius: 0.8, color: color.white});
cone({pos: vec(0,1.7,0), axis: vec(0,0,0.7), radius: 0.12, color: color.orange});
sphere({pos: vec(-0.25,1.95,0.65), radius: 0.08, color: color.black});
sphere({pos: vec(0.25,1.95,0.65), radius: 0.08, color: color.black});
cylinder({pos: vec(0,2.35,0), axis: vec(0,0.6,0), radius: 0.55, color: color.black});`,

  "battle-17": `box({pos: vec(0,0,0), size: vec(1.2,3.5,0.8), color: vec(0.15,0.15,0.15)});
sphere({pos: vec(0,1,0.35), radius: 0.35, color: color.red});
sphere({pos: vec(0,0,0.35), radius: 0.35, color: color.yellow});
sphere({pos: vec(0,-1,0.35), radius: 0.35, color: color.green});
cylinder({pos: vec(0,-3.5,0), axis: vec(0,1.75,0), radius: 0.12, color: vec(0.3,0.3,0.3)});`,

  "battle-18": `box({pos: vec(-4,0,0), size: vec(1.5,4,1.5), color: color.blue});
box({pos: vec(-2,1.5,0), size: vec(1.2,7,1.2), color: color.cyan});
box({pos: vec(0,0.5,0), size: vec(1.8,5,1.8), color: vec(0.5,0.5,0.5)});
box({pos: vec(2,2,0), size: vec(1,8,1), color: color.white});
box({pos: vec(4,-0.5,0), size: vec(2,3,2), color: color.orange});`,

  "battle-19": `cone({pos: vec(0,-2,0), axis: vec(0,2,0), radius: 1, color: color.yellow});
cylinder({pos: vec(0,0,0), axis: vec(4,0,0), radius: 0.1, color: vec(0.5,0.5,0.5)});
cylinder({pos: vec(0,0,0), axis: vec(-4,0,0), radius: 0.1, color: vec(0.5,0.5,0.5)});
sphere({pos: vec(4,0,0), radius: 0.6, color: color.red});
sphere({pos: vec(-4,0,0), radius: 0.9, color: color.blue});`,

  "battle-20": `cylinder({pos: vec(0,-3,0), axis: vec(0,3,0), radius: 0.1, color: color.green});
for (var i = 0; i < 5; i++) {
    var a = i * Math.PI * 2 / 5;
    ellipsoid({pos: vec(Math.cos(a)*0.8, 0.5+Math.sin(a)*0.3, Math.sin(a)*0.8),
               size: vec(0.8, 0.3, 0.4), color: color.magenta});
}
sphere({pos: vec(0,0.5,0), radius: 0.3, color: color.yellow});`,

  "battle-21": `box({pos: vec(0,0,0), size: vec(3,2.5,2), color: vec(0.6,0.6,0.7)});
sphere({pos: vec(-0.6,0.3,0.9), radius: 0.3, color: color.yellow});
sphere({pos: vec(0.6,0.3,0.9), radius: 0.3, color: color.yellow});
box({pos: vec(0,-0.5,0.95), size: vec(1,0.2,0.1), color: color.red});
cylinder({pos: vec(-0.7,1.25,0), axis: vec(0,1,0), radius: 0.08, color: vec(0.6,0.6,0.7)});
cylinder({pos: vec(0.7,1.25,0), axis: vec(0,1,0), radius: 0.08, color: vec(0.6,0.6,0.7)});
sphere({pos: vec(-0.7,2.25,0), radius: 0.15, color: color.red});
sphere({pos: vec(0.7,2.25,0), radius: 0.15, color: color.red});`,

  "battle-22": `sphere({pos: vec(0,0,0), radius: 0.8, color: color.red});
cylinder({pos: vec(0,0,0), axis: vec(2,1,0), radius: 0.1, color: vec(0.5,0.5,0.5)});
sphere({pos: vec(2,1,0), radius: 0.5, color: color.blue});
cylinder({pos: vec(0,0,0), axis: vec(-2,1,0), radius: 0.1, color: vec(0.5,0.5,0.5)});
sphere({pos: vec(-2,1,0), radius: 0.5, color: color.blue});
cylinder({pos: vec(0,0,0), axis: vec(0,-2,1.5), radius: 0.1, color: vec(0.5,0.5,0.5)});
sphere({pos: vec(0,-2,1.5), radius: 0.5, color: color.green});`,

  "battle-23": `cylinder({pos: vec(0,-2,0), axis: vec(0,4,0), radius: 0.3, color: color.yellow});
cone({pos: vec(0,2,0), axis: vec(0,2,0), radius: 3, color: color.red});
for (var i = 0; i < 8; i++) {
    var a = i * Math.PI * 2 / 8;
    sphere({pos: vec(Math.cos(a)*2.2, 0, Math.sin(a)*2.2), radius: 0.35, color: color.blue});
}`,
}
