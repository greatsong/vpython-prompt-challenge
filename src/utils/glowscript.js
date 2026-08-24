/**
 * GlowScript VPython 3.2 HTML 빌더
 * 로컬 번들 + Blob URL iframe 렌더링 + 에러 감지
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
;(function() {
function __main__() {
    var scene = canvas();
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
    // 렌더링 성공 알림
    window.parent.postMessage({ type: 'glowscript:ready' }, '*');
  } catch(e) {
    // 렌더링 에러 알림
    window.parent.postMessage({ type: 'glowscript:error', message: e.message || String(e) }, '*');
    var el = document.createElement('div');
    el.id = '_error_';
    el.textContent = '렌더링 오류: ' + (e.message || e);
    document.body.appendChild(el);
  }
})})()
// 스크립트 로딩 에러 감지
window.addEventListener('error', function(e) {
  if (e.target && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK')) {
    window.parent.postMessage({
      type: 'glowscript:error',
      message: '리소스 로딩 실패: ' + (e.target.src || e.target.href)
    }, '*');
  }
}, true);
document.addEventListener('contextmenu', function(e){ e.preventDefault(); });
//--><!]]></script>
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
