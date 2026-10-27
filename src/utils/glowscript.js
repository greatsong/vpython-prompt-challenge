/**
 * GlowScript VPython 3.2 HTML 빌더
 * 로컬 번들 + sandbox iframe(srcdoc) 렌더링 + 에러 감지 + 무한 루프 방어
 *
 * 【무한 루프 방어 — 세 겹】
 * AI가 "튀어 오르게" 같은 움직임 요청에 while(true){ rate(100) ... } 코드를 만들면
 * 동기 함수 안에서 끝나지 않아 탭 전체가 멈췄다(같은 출처 iframe은 부모와 스레드를 공유한다).
 *   1) checkCodeSafety — 실행 전 정적 검사. 무한 루프·rate() 호출이 보이면 실행하지 않는다.
 *   2) instrumentLoops — 모든 for/while/do 본문 첫머리에 시간 검사(__gsLoopGuard)를 넣어
 *      정적 검사를 빠져나간 긴 루프도 몇 초 뒤 예외로 끊는다.
 *   3) sandbox="allow-scripts"(allow-same-origin 없음) — 출처를 분리해 부모 DOM·저장소에 손대지
 *      못하게 하고, 브라우저가 별도 프로세스에 둘 수 있게 한다. 러너의 watchdog이 iframe을 제거한다.
 *
 * 【스크립트 블록 분리 원칙】
 * AI가 만든 코드는 반드시 "실행 블록"에만 넣는다.
 * 구문 오류는 실행이 아니라 파싱 시점에 발생하므로, 오류 감지 장치(리스너)를
 * 생성 코드와 같은 <script> 안에 두면 그 블록 전체가 파싱에 실패해
 * 리스너가 등록조차 되지 않는다. 그러면 부모는 아무 메시지도 못 받고
 * 타임아웃으로 처리해, 실제 원인(구문 오류)이 "timeout"으로 둔갑한다.
 *
 *   블록 1 (head)  — 감지 장치. 생성 코드 없음 → 항상 파싱된다.
 *   블록 2 (body)  — 실행 블록. 생성 코드 포함. 끝까지 파싱되면 플래그를 세운다.
 *   블록 3 (body)  — 플래그 확인. 안 서 있으면 "구문 오류"로 보고.
 */

// 서버 origin (로컬 파일 로딩용)
// sandbox iframe은 출처가 opaque라 상대 경로가 통하지 않으므로 반드시 절대 URL로 넣는다.
function getBase() {
  return window.location.origin
}

// 라이브러리 URL 버전 쿼리 — 서버가 /lib/glowscript/*를 1년 immutable 캐시로 주므로
// 파일 내용이 바뀌면 이 값(vite.config.js가 빌드 때 넣는 내용 해시)이 바뀌어 캐시가 무효화된다.
// Vite를 거치지 않는 실행(노드 테스트)에서는 고정 문자열을 쓴다.
const LIB_VERSION = typeof __GLOWSCRIPT_LIB_VERSION__ !== 'undefined' ? __GLOWSCRIPT_LIB_VERSION__ : '2026-10-27'

// 장면 구성에 허용하는 최대 시간(ms). 정지 장면은 보통 수십 ms 안에 끝난다.
export const LOOP_BUDGET_MS = 3000
const LOOP_ERROR_TAG = '__GS_LOOP_TIMEOUT__'

// 움직이는 장면(애니메이션) 안내 문구 — 서버 필터와 같은 문구를 쓴다
export const ANIMATION_GUIDE = '움직이는 장면은 아직 지원하지 않아요. 정지된 장면으로 다시 설명해 보세요.'

/**
 * 코드에서 문자열·주석·정규식 리터럴을 공백으로 지운 "뼈대"를 만든다.
 * 길이와 위치는 원문과 같다. 키워드 검색이 문자열 속 글자에 속지 않게 하는 용도다.
 * 템플릿 리터럴의 ${...} 안쪽은 코드이므로 지우지 않는다.
 * (예전에는 통째로 지워 `${(() => { for (…) {} })()}` 속 반복문에 루프 가드가 들어가지 않았다)
 */
export function codeSkeleton(code) {
  const src = String(code ?? '')
  const out = src.split('')
  const n = src.length
  let i = 0
  let lastSig = '' // 마지막 의미 있는 문자 (정규식/나눗셈 구분용)
  // 열려 있는 템플릿 ${...}마다 그 안의 중괄호 깊이를 쌓는다
  const templateDepths = []
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== '\n') out[k] = ' '
    }
  }
  // from 위치(여는 백틱 다음 또는 ${...}를 닫는 } 다음)부터 템플릿 문자열 부분을 지운다.
  // ${를 만나면 그 뒤를 코드로 읽도록 돌아가고, 닫는 백틱을 만나면 템플릿이 끝난다.
  const scanTemplate = (from) => {
    let j = from
    while (j < n) {
      if (src[j] === '\\') { j += 2; continue }
      if (src[j] === '`') { blank(from, j + 1); lastSig = 'a'; return j + 1 }
      if (src[j] === '$' && src[j + 1] === '{') {
        blank(from, j + 2)
        templateDepths.push(0)
        lastSig = '{'
        return j + 2
      }
      j++
    }
    blank(from, n)
    return n
  }
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      let j = i + 2
      while (j < n && src[j] !== '\n') j++
      blank(i, j); i = j; continue
    }
    if (c === '/' && d === '*') {
      let j = src.indexOf('*/', i + 2)
      j = j < 0 ? n : j + 2
      blank(i, j); i = j; continue
    }
    if (c === '`') {
      blank(i, i + 1)
      i = scanTemplate(i + 1)
      continue
    }
    if (templateDepths.length && (c === '{' || c === '}')) {
      const top = templateDepths.length - 1
      if (c === '{') {
        templateDepths[top]++
      } else if (templateDepths[top] === 0) {
        // ${...}를 닫는 } — 템플릿 문자열 부분으로 돌아간다
        templateDepths.pop()
        blank(i, i + 1)
        i = scanTemplate(i + 1)
        continue
      } else {
        templateDepths[top]--
      }
      lastSig = c
      i++
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++
        else if (src[j] === '\n') break
        j++
      }
      j = Math.min(n, j + 1)
      blank(i, j); i = j; lastSig = 'a'; continue
    }
    if (c === '/' && (lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig))) {
      // 정규식 리터럴
      let j = i + 1
      let inClass = false
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '[') inClass = true
        else if (src[j] === ']') inClass = false
        else if (src[j] === '/' && !inClass) break
        j++
      }
      j = Math.min(n, j + 1)
      while (j < n && /[a-z]/i.test(src[j])) j++
      blank(i, j); i = j; lastSig = 'a'; continue
    }
    if (!/\s/.test(c)) lastSig = /[\w$]/.test(c) ? 'a' : c
    i++
  }
  return out.join('')
}

// 실행 전 정적 검사 패턴 (뼈대 문자열 기준)
const UNSAFE_PATTERNS = [
  { re: /(^|[^\w$.])while\s*\(\s*(true|1|!0|!false)\s*\)/, reason: 'while(true) 무한 루프' },
  { re: /(^|[^\w$.])for\s*\(\s*;\s*;\s*\)/, reason: 'for(;;) 무한 루프' },
  { re: /(^|[^\w$.])for\s*\([^;()]*;\s*;/, reason: '조건이 비어 있는 for 루프' },
  { re: /(^|[^\w$.])rate\s*\(/, reason: 'rate() 애니메이션 호출' },
]

/**
 * 생성 코드를 실행해도 되는지 정적으로 검사한다 (순수 함수).
 * 움직이는 장면(rate 호출)·무한 루프는 동기 실행 블록에서 탭을 멈추게 하므로 실행하지 않는다.
 * @returns {{ ok: true } | { ok: false, kind: 'animation', reason: string, guide: string }}
 */
export function checkCodeSafety(code) {
  const sk = codeSkeleton(code)
  for (const { re, reason } of UNSAFE_PATTERNS) {
    if (re.test(sk)) return { ok: false, kind: 'animation', reason, guide: ANIMATION_GUIDE }
  }
  return { ok: true }
}

/**
 * 모든 for / while / do 반복문 본문의 첫머리에 __gsLoopGuard(); 를 넣는다 (순수 함수).
 * 중괄호 본문이 있는 반복문만 다룬다. 줄바꿈을 넣지 않으므로 오류 줄 번호는 그대로다.
 */
// for 머리(open = '(' 위치, close = ')' 위치)에서 깊이 1의 마지막 of 키워드 위치. 없으면 -1
// (for (const of of arr)처럼 of가 이름으로도 쓰일 수 있어 마지막 것을 쓴다. obj.of 같은 속성은 뺀다)
function findTopLevelOf(sk, open, close) {
  let depth = 0
  let found = -1
  for (let k = open; k < close; k++) {
    const c = sk[k]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (depth === 1 && c === 'o' && sk[k + 1] === 'f' &&
      !/[\w$.]/.test(sk[k - 1] || '') && !/[\w$]/.test(sk[k + 2] || '')) {
      found = k
    }
  }
  return found
}

export function instrumentLoops(code) {
  const src = String(code ?? '')
  const sk = codeSkeleton(src)
  const n = sk.length
  const inserts = [] // { pos, text } — 본문 '{' 바로 뒤, 또는 중괄호 없는 본문이면 조건식 앞
  const re = /(^|[^\w$.])(for|while|do)(?![\w$])/g
  let m
  while ((m = re.exec(sk))) {
    const kw = m[2]
    let j = m.index + m[0].length
    while (j < n && /\s/.test(sk[j])) j++
    let condInsert = null
    if (kw !== 'do') {
      if (sk[j] !== '(') continue
      const open = j
      const semis = [] // 괄호 바로 안쪽(깊이 1)의 ';' 위치 — 고전 for의 조건식 범위를 찾는다
      let depth = 0
      for (; j < n; j++) {
        if (sk[j] === '(' || sk[j] === '[' || sk[j] === '{') depth++
        else if (sk[j] === ')' || sk[j] === ']' || sk[j] === '}') {
          depth--
          if (depth === 0) break
        } else if (sk[j] === ';' && depth === 1) semis.push(j)
      }
      if (j >= n) continue
      // 중괄호 없는 본문(for (…) stmt;)은 본문에 넣을 자리가 없으므로 조건식에 넣는다.
      //   while (c) s;            → while (__gsLoopGuard(), c) s;
      //   for (a; c; b) s;        → for (a; __gsLoopGuard(), c; b) s;
      //   for (a; ; b) s;         → for (a; __gsLoopGuard(), true; b) s;   (정적 검사가 먼저 막지만 대비해 둔다)
      //   for (x of it) s;        → for (x of __gsGuardIter(it)) s;         (끝나지 않는 iterator 대비)
      // for…in 은 객체 키를 한 번 도는 유한한 반복이라 건드리지 않는다.
      if (kw === 'while') {
        condInsert = [{ pos: open + 1, text: '__gsLoopGuard(), ' }]
      } else if (semis.length === 2) {
        // 비었는지는 원문으로 본다 — 뼈대는 문자열을 지우므로 for (…; "x"; …)를 빈 조건으로 오판한다.
        // 주석만 있는 조건은 빈 조건이다.
        const condSrc = src.slice(semis[0] + 1, semis[1]).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
        const empty = !condSrc.trim()
        condInsert = [{ pos: semis[0] + 1, text: empty ? '__gsLoopGuard(), true' : '__gsLoopGuard(), ' }]
      } else if (semis.length === 0) {
        const ofPos = findTopLevelOf(sk, open, j)
        if (ofPos >= 0) {
          condInsert = [
            { pos: ofPos + 2, text: ' __gsGuardIter(' },
            { pos: j, text: ')' },
          ]
        }
      }
      j++
      while (j < n && /\s/.test(sk[j])) j++
    }
    if (sk[j] === '{') inserts.push({ pos: j + 1, text: '__gsLoopGuard();' })
    // 빈 본문(for (…);)도 끝나지 않을 수 있으므로 같이 다룬다. do…while의 꼬리 while에 들어가도 무해하다
    else if (condInsert) inserts.push(...condInsert)
  }
  if (inserts.length === 0) return src
  inserts.sort((a, b) => a.pos - b.pos)
  let out = ''
  let prev = 0
  for (const { pos, text } of inserts) {
    out += src.slice(prev, pos) + text
    prev = pos
  }
  return out + src.slice(prev)
}

/**
 * 생성 코드를 <script> 안에 넣기 전에 HTML 파서가 스크립트를 끊는 글자를 바꾼다.
 * 문자열 속 "</script>"가 실행 블록을 일찍 닫으면 뒤쪽 코드가 __main__·루프 가드 밖에서 돈다.
 * JS의 문자열·정규식(u 플래그 포함)·주석 안에서 '<\/'는 '</'와 같은 뜻이다.
 * (String.raw 템플릿만 역슬래시가 남는다. 장면 코드에서는 쓰지 않는 형태라 받아들인다)
 * '<!--'는 바꾸지 않는다 — u 플래그 정규식에서 '\!'는 문법 오류다.
 */
export function escapeForScriptBlock(code) {
  return String(code ?? '')
    .replace(/<\/(script)/gi, '<\\/$1')
}

// 기본 카메라 — 정면에서 약간 위(약 12°)에서 내려다본다.
// 눈높이 정면(forward = (0,0,-1))에서는 바닥에 놓인 배치·앞뒤 깊이(08 탁자 다리, 14 나선, 15 피라미드,
// 22 분자, 23 회전목마)가 겹쳐 보여 관찰이 어려웠다(3-way 검토 권고).
// camera.pos를 직접 정하면 glow가 autoscale을 꺼서 큰 장면이 잘리므로, 방향(forward)만 기울이고
// 거리·범위는 autoscale에 맡긴다. 23개 목표 코드를 glow 3.2 autoscale 계산식으로 투영해 보면
// 화면비 3:4~5:2에서 가장 바깥 점이 가장자리의 83% 안에 든다(정면일 때 88%).
export const DEFAULT_CAMERA_FORWARD = 'vec(0, -0.21, -1)'

// 코드가 카메라를 직접 다루면(scene.camera.* / scene.forward) 기본 카메라를 덮어쓰지 않는다
const CAMERA_OVERRIDE_RE = /(^|[^\w$.])scene\s*\.\s*(camera|forward)(?![\w$])/

/** 코드가 카메라 방향을 스스로 정하는가 (문자열·주석 속 글자는 무시한다) */
export function setsOwnCamera(code) {
  return CAMERA_OVERRIDE_RE.test(codeSkeleton(code))
}

export function buildGlowScriptHTML(code) {
  const base = getBase()
  const cameraSetup = setsOwnCamera(code) ? '' : `scene.forward = ${DEFAULT_CAMERA_FORWARD};`
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #1a1a2e; }
  .glowscript { width: 100% !important; padding: 0 !important; margin: 0 !important; }
  div > canvas { display: block; }
  #_error_ { color: #f87171; font-family: system-ui; font-size: 13px; padding: 16px; text-align: center; }
</style>
<script type="text/javascript">
/* ── 블록 1: 오류 감지 장치 (생성 코드를 포함하지 않는다) ────────────────── */
;(function () {
  window.__gsParsed = false;   // 실행 블록이 끝까지 파싱됐는가
  window.__gsSent = false;     // 부모에 결과를 이미 보냈는가

  // 결과는 딱 한 번만 보고한다 (구문 오류 → 블록 3 재보고 같은 중복 방지)
  function send(msg) {
    if (window.__gsSent) return false;
    window.__gsSent = true;
    try { window.parent.postMessage(msg, '*'); } catch (err) { /* 무시 */ }
    return true;
  }

  window.__gsReady = function () {
    send({ type: 'glowscript:ready' });
  };

  // 루프 가드 — instrumentLoops가 모든 반복문 본문 첫머리에 이 호출을 넣는다.
  // 장면 구성(__main__)이 LOOP_BUDGET_MS를 넘기면 예외로 끊어 탭이 멈추지 않게 한다.
  window.__gsLoopDeadline = 0;
  window.__gsLoopGuard = function () {
    if (window.__gsLoopDeadline && Date.now() > window.__gsLoopDeadline) {
      window.__gsLoopDeadline = 0;
      var err = new Error('${LOOP_ERROR_TAG}');
      err.__gsLoop = true;
      throw err;
    }
  };
  // 중괄호 없는 for…of의 iterable을 감싼다 — next()마다 루프 가드를 거친다 (끝나지 않는 iterator 대비)
  window.__gsGuardIter = function (iterable) {
    var wrapped = {};
    wrapped[Symbol.iterator] = function () {
      var it = iterable[Symbol.iterator]();
      return {
        next: function (v) { window.__gsLoopGuard(); return it.next(v); },
        return: function (v) { return typeof it.return === 'function' ? it.return(v) : { done: true, value: v }; },
      };
    };
    return wrapped;
  };

  // kind: 'syntax' | 'runtime' | 'resource'
  window.__gsError = function (kind, message) {
    if (!send({ type: 'glowscript:error', kind: kind, message: message })) return;
    if (document.body) {
      var el = document.createElement('div');
      el.id = '_error_';
      el.textContent = '렌더링 오류: ' + message;
      document.body.appendChild(el);
    }
  };

  // 라이브러리/스타일 로딩 실패 (라이브러리 태그보다 먼저 등록돼야 잡힌다)
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
      window.__gsError('resource', '3D 라이브러리를 불러오지 못했어요: ' + (t.src || t.href || ''));
    }
  }, true);

  // 스크립트 구문 오류 · 최상위 실행 오류
  // (같은 문서의 다른 <script> 블록에서 난 파싱 오류도 여기로 들어온다)
  window.onerror = function (message, source, lineno, colno, error) {
    var text = String(message || '알 수 없는 오류');
    if ((error && error.__gsLoop) || text.indexOf('${LOOP_ERROR_TAG}') >= 0) {
      window.__gsError('loop', '반복이 끝나지 않아 실행을 멈췄어요.');
      return false;
    }
    var isSyntax = (error && error.name === 'SyntaxError') ||
      /SyntaxError|Unexpected (token|end of input|identifier|string)|Invalid or unexpected token/i.test(text);
    var where = lineno ? ' (' + lineno + '번째 줄 부근)' : '';
    window.__gsError(
      isSyntax ? 'syntax' : 'runtime',
      (isSyntax ? '코드에 문법 오류가 있어요: ' : '실행 중 오류가 발생했어요: ') + text + where
    );
    return false;
  };

  // iframe 크기에 장면을 맞춘다.
  // iframe이 아직 좁을 때 __main__이 실행되면 canvas가 10px짜리로 굳어버리므로,
  // 실행 직후와 크기 변경 때마다 다시 맞춰준다.
  window.__gsFit = function () {
    var s = window.__gsScene;
    if (!s) return;
    try {
      if (window.innerWidth > 0) s.width = window.innerWidth;
      if (window.innerHeight > 0) s.height = window.innerHeight;
    } catch (err) { /* 무시 */ }
  };
  window.addEventListener('resize', function () { window.__gsFit(); });

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Ctrl+드래그(회전)·Shift+드래그(이동)·Alt+드래그(확대) — glow는 수정 키 상태를 이 문서의 keydown으로만 갱신한다.
  // 장면 mousedown은 glow가 preventDefault해 iframe이 키보드 포커스를 받지 못하므로 Ctrl 키 입력이 부모 페이지로 간다.
  // 그래서 마우스 이벤트 자체의 수정 키 값을 glow 처리기보다 먼저(캡처 단계) 옮겨 둔다.
  ['mousedown', 'mousemove'].forEach(function (t) {
    document.addEventListener(t, function (e) {
      var m = window.__gsScene && window.__gsScene.mouse;
      if (m) { m.ctrl = !!e.ctrlKey; m.alt = !!e.altKey; m.shift = !!e.shiftKey; }
    }, true);
  });
})();
<\/script>
</head>
<body>
<div id="glowscript" class="glowscript">
<link type="text/css" href="${base}/lib/glowscript/jquery-ui.custom.css?v=${LIB_VERSION}" rel="stylesheet" />
<link type="text/css" href="${base}/lib/glowscript/ide.css?v=${LIB_VERSION}" rel="stylesheet" />
<script type="text/javascript" src="${base}/lib/glowscript/jquery.min.js?v=${LIB_VERSION}"><\/script>
<script type="text/javascript" src="${base}/lib/glowscript/jquery-ui.custom.min.js?v=${LIB_VERSION}"><\/script>
<script type="text/javascript" src="${base}/lib/glowscript/glow.3.2.min.js?v=${LIB_VERSION}"><\/script>
<script type="text/javascript" src="${base}/lib/glowscript/RSrun.3.2.min.js?v=${LIB_VERSION}"><\/script>
<script type="text/javascript"><!--//--><![CDATA[//><!--
/* ── 블록 2: 실행 블록 (AI 생성 코드 포함) ─────────────────────────────── */
;(function() {
function __main__() {
    var scene = canvas();
    window.__gsScene = scene;
    scene.width = window.innerWidth;
    scene.height = window.innerHeight;
    scene.userspin = true;
    scene.userzoom = true;
    scene.userpan = true;
    ${cameraSetup}
    ${escapeForScriptBlock(instrumentLoops(code))}
}
;$(function(){
  try {
    window.__context = { glowscript_container: $("#glowscript").removeAttr("id") };
    window.__gsLoopDeadline = Date.now() + ${LOOP_BUDGET_MS};
    __main__();
    window.__gsLoopDeadline = 0;
    // 부모 레이아웃이 늦게 잡히는 경우까지 대비해 몇 번 더 맞춘다
    window.__gsFit();
    setTimeout(window.__gsFit, 0);
    setTimeout(window.__gsFit, 300);
    window.__gsReady();
  } catch(e) {
    window.__gsLoopDeadline = 0;
    if (e && e.__gsLoop) {
      window.__gsError('loop', '반복이 끝나지 않아 실행을 멈췄어요.');
    } else {
      window.__gsError('runtime', (e && e.message) ? e.message : String(e));
    }
  }
})})();
/* 여기까지 실행됐다면 이 블록은 구문 오류 없이 파싱된 것이다 */
window.__gsParsed = true;
//--><!]]><\/script>
<script type="text/javascript">
/* ── 블록 3: 파싱 실패 확인 ─────────────────────────────────────────────── */
;(function () {
  if (!window.__gsParsed) {
    window.__gsError('syntax', '생성된 코드에 문법 오류가 있어 3D 장면을 실행하지 못했어요.');
  }
})();
<\/script>
</div>
</body>
</html>`
}

/**
 * 코드를 Blob URL로 변환해서 반환 (호환용. 러너는 이제 srcdoc + sandbox를 쓴다)
 */
export function createBlobURL(code) {
  const html = buildGlowScriptHTML(code)
  const blob = new Blob([html], { type: 'text/html' })
  return URL.createObjectURL(blob)
}

/**
 * 기존 Blob URL 해제 (메모리 누수 방지)
 */
export function revokeBlobURL(url) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}
