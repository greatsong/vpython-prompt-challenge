# VPython 프롬프트 챌린지 — 개발 기록

> 최종 업데이트: 2026-10-27

## 프로젝트 개요

**VPython 프롬프트 챌린지**는 고등학교 1학년 정보 교과를 위한 실시간 대전형 AI 프롬프트 교육 플랫폼입니다.

학생들이 3D 장면을 자연어로 묘사하면, AI(Claude)가 VPython 코드를 생성하고 자동 평가합니다.

### 핵심 흐름

```
학생이 3D 장면을 보고 → 자연어 프롬프트 작성 →
Claude Sonnet 5.5가 VPython 코드 생성 → GlowScript 3D 렌더링 →
Claude Sonnet 5.5가 원본 대비 평가 (100점 만점 + CT 점수)
```

### 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | React 18 + Vite + Zustand |
| 백엔드 | Express + Socket.io |
| 데이터베이스 | SQLite (better-sqlite3, WAL 모드) |
| AI | Anthropic Claude API (생성·채점·분석 모두 `claude-sonnet-5-5`, 모델 ID는 `src/api/ai.js` 상단 상수 `MODEL_GENERATE`·`MODEL_EVALUATE`·`MODEL_ANALYZE`) |
| 3D 렌더링 | GlowScript/VPython 3.2 (Blob URL iframe) |
| 배포 | Fly.io (도쿄 리전, 영구 볼륨) |

### 배포 정보

- **URL**: https://vpython-prompt-challenge.fly.dev
- **포트**: 4009
- **리전**: nrt (도쿄)
- **볼륨**: `vpython_data` → `/data` (SQLite DB 영구 저장)

---

## 챌린지 구성 (15종)

| 레벨 | 개수 | 테마 | 핵심 CT 요소 |
|------|------|------|-------------|
| Lv1 정밀 묘사 | 3개 | 단일 도형 정확히 기술 | 추상화 |
| Lv2 분해와 재조합 | 5개 | 복합 도형 분리 기술 | 분해 |
| Lv3 반복 패턴 | 7개 | for문·좌표 패턴 유도 | 패턴인식, 알고리즘 |

---

## 주요 기능

### 교사 화면
- **수업 생성**: 수업 코드(6자리) + QR 코드 자동 생성
- **챌린지 제어**: 시작/종료, 타이머(1·2·3·5분), 힌트 전송
- **실시간 대시보드**: 팀별 제출 현황, 점수, 이전 챌린지 뱃지
- **결과 공개**: 챌린지별 순위 발표 + 전체 종합 순위
- **비교 모드**: 2팀 프롬프트 나란히 비교 + 3D 결과물 대비
- **채팅 모니터링**: 전체 학생 채팅 실시간 감시
- **데모 모드**: 교사가 프롬프트 시연
- **CSV 내보내기**: 챌린지별 + 최종 종합 결과

### 학생 화면
- **2인 1팀**: 동시 등록 방식 (최대 15팀)
- **3D 비교 뷰**: 목표 장면 vs AI 생성 장면 나란히 표시
- **프롬프트 입력**: 자연어로 묘사 → AI 코드 생성 → 자동 평가
- **실시간 타이머**: 남은 시간 표시, 30초 이하 시 경고
- **평가 결과**: 점수 + CT 점수(추상화/패턴/분해/알고리즘) + 피드백
- **시도 기록**: 최근 5회 시도 히스토리

### 관람 모드
- 15팀 초과 접속 시 자동 전환
- 실시간 순위 + 채팅 관람

---

## 버그 수정 기록

### 1. 학생 화면 실행 버튼 제거
- **파일**: `VPythonRunner.jsx`
- **내용**: `autoRun={false}`일 때 표시되던 "▶ 실행" 버튼 블록(구 105~121행) 삭제
- **이유**: 학생이 직접 실행할 필요 없이 자동 실행으로 충분

### 2. 타이머 옵션 변경
- **파일**: `SessionController.jsx`
- **내용**: [0, 3, 5, 7, 10]분 → **[1, 2, 3, 5]분**, 기본값 5분 → **3분**
- **이유**: 수업 운영에 맞는 시간 범위로 조정

### 3. 교사 대시보드 점수 미표시 (Stale Closure 버그)
- **파일**: `ClassDashboard.jsx`
- **증상**: 학생이 제출했는데 교사 화면에 "미제출"로 표시
- **원인**: Socket 이벤트 핸들러가 `loadTeams`를 캡처할 때 `currentChallenge`가 `null`인 초기 상태의 클로저를 사용
- **해결**: `challengeIdRef = useRef(null)` 패턴으로 항상 최신 challengeId 참조
  ```js
  // Before: loadTeams()가 클로저에 캡처된 null challengeId 사용
  // After: challengeIdRef.current로 항상 최신 값 읽기
  ```

### 4. 두번째 챌린지 점수 미표시 (useEffect 순서 문제)
- **파일**: `ClassDashboard.jsx`
- **증상**: 첫번째 챌린지 점수는 정상, 두번째 챌린지 점수 안 뜸
- **원인**: `challengeIdRef` 업데이트와 `loadTeams()` 호출이 **별도 useEffect**에 있어 실행 순서 미보장. React가 `loadTeams()`를 먼저 실행하면 이전 챌린지 ID로 데이터를 가져옴
- **해결**: 두 useEffect를 하나로 합침 — ref를 먼저 업데이트한 후 loadTeams 호출
  ```js
  useEffect(() => {
    challengeIdRef.current = currentChallenge?.id ?? null  // 먼저!
    loadTeams()  // 그 다음!
    setChallengeRankings(null)
    setCompareTeams([])
    setCompareData({})
  }, [currentChallenge?.id])
  ```

### 5. SessionController의 Stale Closure
- **파일**: `SessionController.jsx`
- **증상**: 챌린지 자동 종료 시 `selectedId`가 null
- **해결**: `selectedIdRef = useRef(null)` 패턴으로 `challenge:ended` 핸들러에서 최신 값 사용

### 6. 전체 수업 종료 미작동
- **파일**: `server.js`
- **증상**: "전체 수업 종료" 버튼이 작동 안 함
- **원인**: DB가 비어있어 (영구 볼륨 미설정) 0팀·0챌린지로 처리됨
- **해결**:
  1. `session:final-end` 핸들러에 try-catch + 로그 추가
  2. DB에 `sessions.status = 'ended'` 업데이트
  3. `session:ended` 이벤트 발송으로 학생 화면 리디렉트

### 7. FOREIGN KEY 제약 조건 오류 (500 에러)
- **파일**: `dashboard.js` (POST /api/attempts)
- **증상**: 학생 제출 시 Internal Server Error
- **원인**: 배포마다 DB가 초기화되어 이전 세션의 teamId가 존재하지 않음
- **해결**:
  1. try-catch 추가
  2. 팀 존재 여부 확인 (`404` 반환)
  3. 세션 상태 확인 (`410` 반환 — 종료된 수업)
  4. **근본 해결**: Fly.io 영구 볼륨 추가

### 8. AI 평가 JSON 파싱 오류
- **파일**: `ai.js`
- **증상**: `Expected ',' or '}' after property value in JSON`
- **원인**: Claude가 때때로 불완전한 JSON 반환 (trailing comma, 줄바꿈 등)
- **해결**: `parseAIJson()` 함수 추가
  - 1차: 정규식으로 JSON 블록 추출
  - 2차: trailing comma 제거, 줄바꿈 정리 후 재파싱
  - 3차: 파싱 실패 시 50점 + "다시 제출" 메시지로 폴백

### 9. DB 데이터 유실 (배포 시)
- **파일**: `fly.toml`, `server.js`
- **증상**: 배포할 때마다 DB가 초기화됨
- **해결**:
  1. `fly volumes create vpython_data --size 1 --region nrt`
  2. `fly.toml`에 `[mounts]` 섹션 추가: `source = 'vpython_data'`, `destination = '/data'`
  3. `server.js`에서 DB 경로를 `/data`(운영) 또는 `./db`(개발)로 자동 분기

### 10. 세션 코드 재사용 시 이전 학생 잔류
- **파일**: `TeamApp.jsx`
- **해결**:
  1. 마운트 시 세션 상태 확인 — 종료된 세션이면 `/join`으로 리디렉트
  2. `session:ended` 소켓 이벤트 수신 시 세션 종료 화면 표시

### 11. 2026-10-27 Sonnet 5.5 전환
- **파일**: `src/api/ai.js`, `src/api/evaluationCache.js`, `server.js`, `tests/eval-regression.mjs`
- **배경**: 생성·채점·분석 모두 `claude-sonnet-4-6`이었다. 원래 설계(생성 Haiku, 채점 Sonnet)는 구현되지 않았다.
- **변경**:
  1. 모델 ID를 `ai.js` 상단 상수로 모았다. 다음 전환은 상수 한 줄만 고친다.
  2. `temperature`를 모든 요청에서 뺐다. Sonnet 5.5는 기본값이 아닌 temperature·top_p·top_k를 400으로 거부한다. 같은 답의 같은 점수는 채점 캐시가 보장한다.
  3. effort를 지정했다. 생성·분석은 `low`, 채점은 `medium`이다. 생성은 `thinking: { type: 'between_tools' }`로 생각을 끈다(Sonnet 5.5에서 `disabled`는 400).
  4. 응답은 `type === 'text'` 블록만 읽는다. 앞쪽에 thinking 블록이 올 수 있다.
  5. `stop_reason`이 `refusal`이면 422와 안내 문구를, 채점·분석이 `max_tokens`에서 잘리면 502를 돌려준다. 생성 잘림은 기존 422 안내를 유지한다.
  6. max_tokens를 채점 1500 → 4096, 분석 512 → 2048로 올렸다. 생각 토큰도 max_tokens에 포함된다. 생성은 8192 그대로다.
  7. 코드 펜스 벗기기를 보강했다. 태그가 없거나 다른 태그여도, 펜스 앞에 설명 문장이 있어도 첫 펜스 안쪽을 코드로 잡는다.
  8. `EVAL_CACHE_VERSION`을 `v3-2026-10-sonnet55`로 올리고 캐시 키에 채점 모델·effort 태그를 넣었다.
  9. API 키 검증 호출을 `claude-haiku-5-5`(thinking 끔, max_tokens 10)로 바꿨다.
  10. 교사 토큰과 `x-eval-nocache: 1` 헤더가 함께 오면 채점 캐시를 읽지도 쓰지도 않는다. `tests/eval-regression.mjs --no-cache`로 채점 편차를 측정한다.

---

## 알려진 이슈

### 학생 화면 하얀 화면 (간헐적)

**증상**: 제출 후 학생의 3D 뷰어가 하얀색으로 변하며 아무것도 표시 안 됨

**가능한 원인**:
1. **GlowScript CDN 로딩 실패**: 외부 CDN(glowscript.org)에서 JS/CSS를 로드하므로, 학교 네트워크 환경에서 간헐적으로 리소스 로딩이 실패할 수 있음
2. **AI 생성 코드 오류**: Claude가 생성한 VPython 코드에 문법 오류가 있으면 GlowScript가 조용히 실패하여 빈 화면 표시
3. **WebGL 컨텍스트 소진**: 한 페이지에 목표 장면 + AI 결과 장면 2개의 GlowScript 캔버스가 동시 실행. 모바일이나 저사양 기기에서 WebGL 컨텍스트가 부족할 수 있음

---

## 파일 구조

```
education/
├── server.js                # Express + Socket.io + SQLite 서버
├── fly.toml                 # Fly.io 배포 설정
├── package.json             # 의존성 + 스크립트
├── Dockerfile               # 컨테이너 빌드
├── ANSWER_KEY.md            # 교사용 정답표
├── DEV_LOG.md               # 이 문서
│
├── src/
│   ├── api/
│   │   ├── session.js       # 세션 생성/조회/참가
│   │   ├── challenges.js    # 챌린지 CRUD
│   │   ├── ai.js            # Claude API (코드 생성 + 평가)
│   │   └── dashboard.js     # 대시보드 데이터 + CSV 내보내기
│   │
│   ├── components/
│   │   ├── teacher/
│   │   │   ├── TeacherApp.jsx       # 교사 메인 컨테이너
│   │   │   ├── ClassSetup.jsx       # 수업 생성 (코드, 팀 수)
│   │   │   ├── SessionController.jsx # 챌린지 제어, 타이머
│   │   │   ├── ClassDashboard.jsx   # 실시간 대시보드
│   │   │   ├── QRDisplay.jsx        # QR 코드 표시
│   │   │   └── TeacherGuide.jsx     # 교사 안내서
│   │   │
│   │   ├── team/
│   │   │   ├── TeamApp.jsx          # 학생 메인 컨테이너
│   │   │   ├── BattleMode.jsx       # 프롬프트 입력 + 평가 화면
│   │   │   └── WaitingScreen.jsx    # 대기 화면
│   │   │
│   │   ├── shared/
│   │   │   ├── VPythonRunner.jsx    # GlowScript 3D 렌더러
│   │   │   ├── ChatPanel.jsx        # 채팅 패널
│   │   │   └── CodeEditor.jsx       # 코드 에디터
│   │   │
│   │   ├── JoinPage.jsx             # 수업 참가 페이지
│   │   ├── SpectatorPage.jsx        # 관람 모드
│   │   └── GuidePage.jsx            # 교사 안내 페이지
│   │
│   ├── data/
│   │   ├── challenges-battle.js     # 15개 챌린지 정의
│   │   └── teamNames.js             # 팀명 목록
│   │
│   ├── store/
│   │   ├── sessionStore.js          # 세션 상태 (Zustand)
│   │   └── teamStore.js             # 팀/시도 상태 (Zustand)
│   │
│   └── utils/
│       ├── claude.js                # Anthropic API 래퍼
│       ├── socket.js                # Socket.io 클라이언트
│       └── glowscript.js           # Blob URL 생성/해제
│
└── db/
    └── schema.sql                   # SQLite 스키마
```

---

## 운영 팁

1. **수업 전**: 새 세션 생성 후 QR 코드로 학생 접속
2. **타이머**: 기본 3분, Lv1은 2분, Lv3는 5분 추천
3. **결과 공개**: 각 챌린지 종료 후 "결과 공개" 클릭
4. **최종 종료**: 모든 챌린지 완료 후 "전체 수업 종료" → 자동 CSV 다운로드
5. **네트워크**: GlowScript CDN에 의존하므로 인터넷 연결 필수
