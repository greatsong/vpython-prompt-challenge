/**
 * GlowScript VPython 3.2 HTML 빌더
 * Blob URL iframe으로 렌더링
 */

export function buildGlowScriptHTML(code) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>VPython Scene</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1a1a2e; overflow: hidden; }
    canvas { display: block; }
  </style>
</head>
<body>
<script type="text/javascript"
  src="https://www.glowscript.org/lib/GlowScript-3.2-min.js"></script>
<div id="glowscript" class="glowscript">
<script type="text/glowscript" contenteditable="false">
GlowScript 3.2 VPython
${code}
</script>
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
