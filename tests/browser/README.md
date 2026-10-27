# 실제 Chromium(Playwright) 화면 검증

내장 브라우저 패널은 숨김 상태라 WebGL·sandbox iframe 동작이 실제와 다릅니다. 화면 전환·렌더 검증은 이 폴더의 스크립트를 실제 Chromium으로 실행합니다.

준비(1회): `npm i -D playwright@1.58.2 && npx playwright install chromium` (프로젝트 의존성에는 넣지 않았음. 2026-10-27에는 스크래치 폴더에 설치해 사용)

- `matrix.mjs` — 상태 전환 전수 검사(교사·팀 3·관람·늦은 참가·모바일·연수 입장, 15단계 × 역할, 347셀). 가짜 Anthropic(`tests`에는 없음, 당시 scratchpad/stab/stabtests/mock-anthropic.mjs 사용)과 격리 서버(`PORT=4120 DB_PATH=... ANTHROPIC_BASE_URL=http://localhost:4092`)를 띄운 뒤 `node matrix.mjs`. 결과는 `results/<UTC>/matrix.md`.
  - 한계: Playwright는 진짜 숨김 탭을 만들 수 없어 "학생 탭 백그라운드에서 시작" 결함은 재현 못 함(실제 Chrome에서 수동 확인 필요). GPU는 SwiftShader.
- `repro10.mjs` — 교사 재접속 후 제출 현황 미갱신 재현.
- `rehearsal.mjs` — 배포본 리허설 녹화(교사 1 + 팀 2, 제출 3회, 영상·스크린샷). 실제 API 호출 6회.
- `cachecheck2.mjs` — 장면 iframe의 라이브러리 요청·캐시·시간 측정.
