/**
 * GlowScript VPython 3.2 HTML 빌더
 * 로컬 번들 + Blob URL iframe 렌더링 + 에러 감지
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
function getBase() {
  return window.location.origin
}

export function buildGlowScriptHTML(code) {
  const base = getBase()
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
})();
<\/script>
</head>
<body>
<div id="glowscript" class="glowscript">
<link type="text/css" href="${base}/lib/glowscript/jquery-ui.custom.css" rel="stylesheet" />
<link type="text/css" href="${base}/lib/glowscript/ide.css" rel="stylesheet" />
<script type="text/javascript" src="${base}/lib/glowscript/jquery.min.js"><\/script>
<script type="text/javascript" src="${base}/lib/glowscript/jquery-ui.custom.min.js"><\/script>
<script type="text/javascript" src="${base}/lib/glowscript/glow.3.2.min.js"><\/script>
<script type="text/javascript" src="${base}/lib/glowscript/RSrun.3.2.min.js"><\/script>
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
    ${code}
}
;$(function(){
  try {
    window.__context = { glowscript_container: $("#glowscript").removeAttr("id") };
    __main__();
    // 부모 레이아웃이 늦게 잡히는 경우까지 대비해 몇 번 더 맞춘다
    window.__gsFit();
    setTimeout(window.__gsFit, 0);
    setTimeout(window.__gsFit, 300);
    window.__gsReady();
  } catch(e) {
    window.__gsError('runtime', (e && e.message) ? e.message : String(e));
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
 * 코드를 Blob URL로 변환해서 반환
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
