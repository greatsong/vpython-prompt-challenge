/**
 * 생성 코드 정적 필터 — AI가 만든 glow.js 코드에 반복 실행·외부 통신·탈출 시도가 섞였는지 본다.
 *
 * 생성 코드는 학생 브라우저의 sandbox iframe(allow-scripts만)에서 실행되므로 1차 방어는 iframe이다.
 * 이 필터는 그 앞의 2차 방어선이다. 무한 루프는 sandbox로 막을 수 없어 탭이 멈추고,
 * 학생 프롬프트로 AI를 꾀어 통신·저장소 접근 코드를 만들게 하는 시도도 여기서 걸러낸다.
 *
 * 수업 장면은 정지 장면만 만든다. 반복 배치용 for(초기값; 조건; 증감)는 허용한다.
 */

const RULES = [
  { label: 'while 반복문', re: /\bwhile\s*\(/ },
  { label: '조건 없는 for 반복문', re: /\bfor\s*\([^;)]*;\s*;/ },
  { label: 'rate()', re: /\brate\s*\(/ },
  { label: 'sleep()', re: /\bsleep\s*\(/ },
  { label: 'setInterval', re: /\bsetInterval\b/ },
  { label: 'setTimeout', re: /\bsetTimeout\b/ },
  { label: 'requestAnimationFrame', re: /\brequestAnimationFrame\b/ },
  { label: 'fetch()', re: /\bfetch\s*\(/ },
  { label: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
  { label: 'WebSocket', re: /\bWebSocket\b/ },
  { label: 'localStorage', re: /\blocalStorage\b/ },
  { label: 'sessionStorage', re: /\bsessionStorage\b/ },
  { label: 'document.cookie', re: /\bdocument\s*\.\s*cookie\b/ },
  // top·parent는 "상판(top)" 같은 변수 이름으로도 쓰이므로 창 객체로 쓰는 형태만 막는다
  {
    label: 'parent/top 창 접근',
    re: /(?<![\w$.])(?:parent|top)\s*(?:\.\s*(?:location|document|window|frames|postMessage|open|close|eval|parent|top|opener)\b|\[\s*['"`])/,
  },
  { label: 'window.parent/top/opener', re: /\bwindow\s*\.\s*(?:parent|top|opener)\b/ },
  { label: 'window.open', re: /\bwindow\s*\.\s*open\b/ },
  { label: 'import()', re: /\bimport\s*\(/ },
  { label: 'eval()', re: /\beval\s*\(/ },
  { label: 'new Function', re: /\bnew\s+Function\b/ },
  // new 없이 부르거나(Function("…")()) 별칭으로 옮겨도(const f = Function) 같은 문자열 실행기다.
  // 문자열 속 반복문은 루프 가드가 볼 수 없으므로 이름 자체를 막는다 (myFunction 같은 이름은 통과)
  { label: 'Function()', re: /(?<![\w$])Function(?![\w$])/ },
  { label: 'constructor 접근', re: /\bconstructor\b/ },
]

/** 걸린 규칙의 이름 목록. 비어 있으면 통과 */
export function findForbiddenPatterns(code) {
  const text = String(code || '')
  return RULES.filter((rule) => rule.re.test(text)).map((rule) => rule.label)
}

export const STATIC_SCENE_MESSAGE = '움직이는 장면은 아직 지원하지 않아요. 정지된 장면으로 설명해 보세요'
