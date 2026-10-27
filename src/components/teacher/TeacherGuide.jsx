import { useState } from 'react'
import { BATTLE_CHALLENGES } from '../../data/challenges-battle.js'
import VPythonRunner from '../shared/VPythonRunner.jsx'
import { generateCode, evaluatePrompt } from '../../utils/claude.js'
import { getTeacherToken } from '../../utils/teacherAuth.js'


// 교사 화면과 /guide에 공통으로 보이는 섹션
const BASE_SECTIONS = [
  { id: 'overview', icon: '🌍', label: '서비스 소개' },
  { id: 'tryit', icon: '🎮', label: '직접 체험하기' },
  { id: 'lesson', icon: '📋', label: '강의안' },
  { id: 'howto', icon: '🚀', label: '수업 진행 방법' },
  { id: 'situations', icon: '🧯', label: '상황별 대처' },
  { id: 'challenges', icon: '🎯', label: '챌린지 구성' },
  { id: 'tips', icon: '💡', label: '운영 팁' },
  { id: 'privacy', icon: '🔒', label: '개인정보 보호' },
  { id: 'faq', icon: '💬', label: 'FAQ' },
]

// 연수용 섹션 — /guide(audience="public")에서는 맨 앞, 교사 화면 탭에서는 맨 뒤
const TRAINING_SECTIONS = [
  { id: 'quickstart', icon: '🎓', label: '연수 빠른 시작' },
  { id: 'trainingplan', icon: '🗓️', label: '연수 운영 순서' },
]

/**
 * audience — 'public'(/guide, 로그인 없이 접근): 연수 섹션을 앞에 두고 '연수 빠른 시작'으로 연다
 *            'teacher'(교사 화면 📖 안내서 탭): 기존처럼 '서비스 소개'로 연다
 */
export default function TeacherGuide({ audience = 'teacher' }) {
  const isPublic = audience === 'public'
  const sections = isPublic ? [...TRAINING_SECTIONS, ...BASE_SECTIONS] : [...BASE_SECTIONS, ...TRAINING_SECTIONS]
  const [activeSection, setActiveSection] = useState(isPublic ? 'quickstart' : 'overview')

  return (
    <div className="tg-layout" style={{ display: 'flex', minHeight: 'calc(100vh - 52px)', background: 'var(--bg)' }}>
      {/* 사이드 내비게이션 — 640px 이하에서는 상단 가로 스크롤 칩으로 바뀐다 (index.css .tg-*) */}
      <nav className="tg-nav" style={{
        width: '210px',
        background: '#fff',
        borderRight: '1px solid var(--border)',
        padding: '24px 0',
        flexShrink: 0,
        overflowY: 'auto',
      }}>
        <div className="tg-nav-title" style={{ padding: '0 20px 20px', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          교사 안내서
        </div>
        {sections.map(s => (
          <button
            key={s.id}
            className={activeSection === s.id ? 'tg-nav-item is-active' : 'tg-nav-item'}
            onClick={() => setActiveSection(s.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '11px 20px',
              border: 'none',
              background: activeSection === s.id ? 'var(--card)' : 'transparent',
              boxShadow: activeSection === s.id ? 'inset 4px 0 0 var(--gold)' : 'none',
              color: activeSection === s.id ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: activeSection === s.id ? 800 : 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
              textAlign: 'left',
              borderRadius: activeSection === s.id ? '0' : '0',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {/* 메인 콘텐츠 */}
      <main className="tg-main" style={{
        flex: 1,
        minWidth: 0,
        overflowY: 'auto',
        padding: '36px 48px',
        maxWidth: '900px',
      }}>
        {activeSection === 'quickstart' && <QuickstartSection />}
        {activeSection === 'trainingplan' && <TrainingPlanSection />}
        {activeSection === 'overview' && <OverviewSection />}
        {activeSection === 'tryit' && <TryItSection />}
        {activeSection === 'lesson' && <LessonPlanSection />}
        {activeSection === 'howto' && <HowtoSection />}
        {activeSection === 'situations' && <SituationsSection />}
        {activeSection === 'challenges' && <ChallengesSection />}
        {activeSection === 'tips' && <TipsSection />}
        {activeSection === 'privacy' && <PrivacySection />}
        {activeSection === 'faq' && <FAQSection />}
      </main>
    </div>
  )
}

/* ─── 안내 문구 (솔라 프로4 집필, 2026-10-27) ───────────────────
 * 키는 설계서의 블록 번호. <b>·<code> 표시는 Rich 컴포넌트가 굵은 글씨·코드로 바꾼다.
 * 문장을 고칠 때는 사실·수치·버튼명만 대조하고 문체는 원고를 따른다. */
const GUIDE_TEXT = {
  1: "연수 참가자는 학생 역할을 맡아 한 팀이 되어 수업을 체험합니다. 휴대폰 또는 노트북 한 대를 준비한 뒤 입장, 팀 등록, 설명 제출, 장면 돌려 보기, 결과 확인 순서로 진행합니다.",
  2: "진행자 화면에 표시된 QR을 휴대폰 카메라로 촬영하면 참가 화면이 열리고 수업코드가 자동으로 입력됩니다. 카메라를 사용할 수 없으면 진행자가 알려 준 주소의 <code>/join</code> 화면에 직접 접속한 뒤 수업코드를 입력합니다.",
  3: "팀원 1의 학번과 이름은 필수이며 팀원 2는 선택입니다. 두 명이 한 팀을 이루고 혼자 참여할 수도 있습니다. 입력을 마친 뒤 <b>참여하기</b> 버튼을 누르면 팀 이름은 자동으로 정해집니다. 학번은 팀원을 구분하는 번호이므로 연수에서는 다른 참가자와 겹치지 않는 번호를 사용합니다. 이미 등록된 학번을 다른 이름으로 입력하면 <b>이미 등록된 학번입니다. 이름을 확인하세요</b> 안내가 표시됩니다.",
  4: "진행자가 챌린지를 시작하면 목표 3D 장면이 화면에 표시됩니다. 화면에 보이는 장면을 코드가 아니라 문장으로 설명하여 제출합니다. 제출 뒤 결과까지 보통 15~25초가 걸립니다. 제한 시간 안에는 설명을 고쳐 여러 번 다시 제출할 수 있습니다. 정지 장면만 지원하므로 \"움직이게\", \"튀어 오르게\" 같은 요청은 정지 장면으로 표현되거나 <b>움직이는 장면은 아직 지원하지 않아요</b> 안내가 표시됩니다.",
  5: "기본 화면은 정면에서 본 모습으로 표시됩니다. 3D 장면은 마우스 오른쪽 버튼을 누른 채 끌거나 Ctrl 키를 누른 채 끌면 회전하고 마우스 휠로 확대·축소할 수 있습니다. AI가 체스판이나 고리를 바닥에 눕혀 만들면 정면에서는 옆면만 얇게 보여 회전해야 모양이 보입니다. 목표 장면도 돌려 보면 앞뒤 방향을 확인할 수 있습니다.",
  6: "제출할 때마다 100점 만점 점수와 피드백이 표시됩니다. 진행자가 제출을 마감하고 결과를 공개하면 팀 순위가 화면에 표시됩니다. 새로고침해도 팀 화면이 복구되며 복원된 3D 장면은 자동 실행되지 않고 <b>▶ 다시 보기</b> 버튼을 눌러야 표시됩니다.",
  7: "진행자는 <code>/training</code> 화면에서 입장 코드를 입력하고 <b>입장하기</b> 버튼을 누르면 교사 로그인 없이 수업 생성 화면으로 이동합니다. QR 링크 <code>/training?code=…</code>로 들어오면 입장 코드가 자동 입력되어 바로 입장합니다. 연수 모드에서는 API 키 설정이 불가하며 운영자가 설정한 키를 사용합니다. 수업 코드를 정한 뒤 <b>수업 시작</b> 버튼을 누릅니다.",
  8: "다른 사람이 사용 중인 수업코드는 <b>이미 사용 중인 수업코드입니다</b> 안내가 표시되어 만들 수 없습니다. 자기 이름과 숫자를 붙인 코드처럼 겹치지 않는 코드로 정합니다. 같은 탭에서 새로고침하면 자기 수업이 이어지지만 탭을 닫으면 새 코드로 다시 시작해야 합니다.",
  9: "<b>접속 안내</b> 탭에 수업코드가 크게 표시되고 QR이 함께 있으므로 화면을 띄워 참가자가 QR을 촬영합니다. 팀 목록이 실시간으로 늘어나므로 모든 참가자가 등록했는지 확인합니다.",
  10: "목표 장면을 보고 문장으로 설명하는 활동이며 점수는 100점 만점입니다. 정지 장면만 지원합니다. 마우스 오른쪽 버튼 또는 Ctrl+드래그로 장면을 회전합니다. 제한 시간 안에 여러 번 제출할 수 있습니다.",
  11: "<b>수업 진행</b> 탭에서 03 비스듬한 화살표를 고르고 제한 시간 3분으로 <b>시작하기</b>를 누릅니다. 색, 시작점, 끝점만 쓰면 되는 문제이므로 첫 성공 경험에 적합합니다. 제한 시간이 끝나면 자동 마감되며 마감 뒤 1분 정도 기다린 다음 <b>결과 공개</b>를 하고 공개 화면을 2분 동안 함께 봅니다.",
  12: "<b>다음 챌린지 선택</b>을 누르고 07 로켓을 제한 시간 3분으로 시작합니다. 로켓을 세 부분으로 나누고 위아래 관계를 쓰는 분해 경험을 합니다. 마감 뒤 1분 기다린 다음 결과 공개를 2분 동안 진행합니다.",
  13: "11 블록 피라미드를 제한 시간 4분으로 시작합니다. 층별 블록 개수와 색 규칙이 정면에서 모두 보여 규칙으로 짧게 설명하는 경험을 합니다. 마감 뒤 1분 기다린 다음 결과 공개를 2분 동안 진행합니다.",
  14: "진행자 화면을 함께 보며 교사 기능을 소개합니다. 팀별 제출 현황과 점수를 확인하고 팀 카드 두 개를 골라 프롬프트를 나란히 비교하며 전체 채팅을 확인하고 힌트를 전송합니다.",
  15: "참가자 소감을 나눕니다. 마칠 때 <b>전체 수업 종료</b>를 누르면 확인 창이 표시되고 종료하면 결과 CSV 파일이 다운로드됩니다.",
  16: "제출 1건 처리 시간은 보통 15~25초이며 코드 생성 3~12초, 채점 약 10초가 걸립니다. 10~14팀이 동시에 제출해도 같은 시간 안에 처리됩니다. 마감 직전에 제출해 채점 중이던 답은 마감 뒤 90초 안에 채점이 끝나면 저장되고 그 뒤에 끝난 답은 저장되지 않으므로 결과 공개 전에 1분 정도 기다립니다.",
  17: "시간이 20분뿐일 때의 짧은 안은 입장 5분, 규칙 설명 3분, 03 비스듬한 화살표 6분, 07 로켓 6분으로 구성합니다.",
  18: "50분이 있을 때의 긴 안은 35분 순서를 마친 뒤 참가자가 각자 <code>/training</code>으로 들어가 교사 역할을 10분 동안 체험합니다. 남는 5분은 질의응답에 사용합니다.",
  19: "학생의 설명을 Claude가 3D 코드로 바꾸고 목표 장면과 비교해 채점합니다. 정지 장면만 지원합니다. 3D 장면은 마우스 오른쪽 버튼 또는 Ctrl+드래그로 회전하고 휠로 확대·축소합니다. 제출 뒤 결과까지 보통 15~25초가 걸립니다.",
  20: "학생이 수업에서 하는 활동을 교사가 먼저 체험하는 곳입니다. 노란 원뿔, 눈사람, 구슬 피라미드 세 가지 연습 문제가 있습니다. 교사 인증 또는 연수 입장을 마친 뒤에만 제출할 수 있으며 로그인하지 않은 상태에서는 제출하면 인증 오류가 표시됩니다. 결과까지 보통 15~25초가 걸리고 장면은 마우스 오른쪽 버튼으로 회전합니다.",
  21: "로켓을 \"로켓 하나\"로만 설명하면 AI가 아는 로켓 모양이 나와 목표 장면과 달라집니다. 파란 원기둥 몸통, 빨간 원뿔 머리, 주황 원뿔 불꽃의 세 부분으로 나누는 순간이 중요합니다.",
  22: "부품으로 나누고 부품마다 도형, 색, 위아래 위치를 정해야 원하는 결과가 나옵니다.",
  23: "블록 여섯 개를 하나씩 설명하다가 층마다 하나씩 줄어드는 규칙을 발견하는 순간이 있습니다. 아래층부터 3개, 2개, 1개입니다.",
  24: "규칙을 찾으면 설명이 짧아집니다. 블록마다 쓰는 대신 층별 개수와 색 규칙으로 압축합니다.",
  25: "0부에서 실패한 \"신호등 만들어줘\"를 다시 다루는 문제입니다. 검은 본체, 앞면의 빨강·노랑·초록 구, 회색 기둥처럼 이 장면에 필요한 특징만 골라 설명하는 순간이 있습니다.",
  26: "추상화는 모든 세부를 쓰는 것이 아니라 결과를 결정하는 특징만 골라내는 일입니다. 색 순서와 세로 배열처럼 중요한 특징을 빠뜨리면 점수가 크게 떨어집니다.",
  27: "<code>/teacher</code>에 접속해 교사용 인증 코드를 입력하고 <b>인증</b> 버튼을 누릅니다. 수업 시작 설정 화면의 Claude API 키 칸에 키를 입력하고 <b>확인</b>을 누르면 한 번 설정한 키는 서버에 보관되어 다음부터 <b>API 키 설정됨</b> 표시가 나타납니다. 수업 코드를 입력하며 예를 들어 1반3교시와 같이 정하면 학생들이 이 코드로 수업에 참여합니다. <b>수업 시작 (이어가기)</b>는 같은 수업 코드의 기존 수업과 팀 구성을 그대로 이어갑니다. <b>새 수업으로 시작 (기존 세션 초기화)</b>는 같은 코드의 기존 수업을 끝내고 팀 구성을 초기화합니다.",
  28: "<b>접속 안내</b> 탭에 수업코드가 크게 표시되고 <b>코드 복사</b> 버튼이 있습니다. 같은 탭의 QR을 학생이 휴대폰 카메라로 비추면 수업코드가 자동으로 입력되며 카메라를 사용할 수 없으면 <b>주소 복사</b>로 주소를 공유합니다. 학생은 수업코드, 학번, 이름을 입력하고 <b>참여하기</b>를 누르며 팀원 1은 필수, 팀원 2는 선택으로 1인 팀도 가능합니다. 등록한 팀은 접속 안내 탭 아래 목록에 실시간으로 나타납니다. 팀 이름과 색은 자동으로 생성되며 예를 들어 \"용감한 펭귄\"과 같이 정해집니다.",
  29: "한 팀 안에서 같은 학번을 두 번 입력할 수 없습니다. 이미 등록된 학번은 이름까지 같아야 <b>이전 팀으로 들어가기</b>로 원래 팀에 복귀합니다. 기존 팀원이 새 짝과 함께 등록하면 짝이 기존 팀에 추가되며 한 팀은 2명까지입니다.",
  30: "<b>수업 진행</b> 탭 왼쪽 목록에서 챌린지를 선택합니다. 제한 시간을 1·2·3·5분 중에서 고르며 기본은 3분입니다. <b>시작하기</b>를 누르면 학생 화면에 목표 3D 장면이 표시됩니다. 학생이 설명을 제출하면 100점 만점으로 채점하며 결과까지 보통 15~25초가 걸리고 10~14팀이 동시에 제출해도 같은 시간이 걸립니다. 제한 시간 안에는 여러 번 다시 제출할 수 있습니다. 제한 시간이 끝나거나 <b>제출 마감</b>을 누르면 제출이 마감됩니다.",
  31: "마감 뒤에 시작한 제출은 저장되지 않습니다. 마감 직전에 제출해 채점 중이던 답은 마감 뒤 90초 안에 채점이 끝나면 저장됩니다. 처리 중에 Ctrl+Enter를 여러 번 눌러도 한 번만 제출됩니다. 정지 장면만 지원하므로 움직임을 요청하면 정지 장면으로 표현되거나 <b>움직이는 장면은 아직 지원하지 않아요</b> 안내가 표시됩니다.",
  32: "<b>결과 공개</b> 버튼은 제출이 마감된 뒤에만 표시되며 누르면 학생 화면에 순위가 공개됩니다. 대시보드에서 팀 카드를 누르면 그 팀의 프롬프트를 볼 수 있고 두 팀을 고르면 프롬프트를 나란히 비교합니다. <b>다음 챌린지 선택</b>으로 다음 문제로 이동하며 끝난 챌린지는 목록에 체크 표시가 됩니다. 같은 챌린지를 다시 내면 이번 라운드 점수만 순위에 반영됩니다.",
  33: "<b>전체 수업 종료</b> 버튼을 누르면 확인 창이 먼저 표시됩니다. 종료하면 학생 화면에 최종 결과가 표시되고 그 수업에서는 더 이상 챌린지를 진행할 수 없습니다. 종료와 함께 결과 CSV 파일이 다운로드됩니다. 다음 수업은 <b>새 수업 준비</b> 버튼으로 시작합니다.",
  34: "챌린지는 다섯 레벨로 나뉘며 교사가 수업 중에 골라 학생 화면으로 보냅니다. 레벨 1~3은 간단한 설명이 함께 표시되고 레벨 4~5는 대부분 설명 없이 3D 장면만 보고 풀이합니다.",
  35: "추천 순서는 03 비스듬한 화살표, 07 로켓, 11 블록 피라미드이며 시간이 남으면 17 신호등을 진행합니다. 03은 색, 시작점, 끝점만 쓰면 되어 첫 성공 경험을 제공합니다. 07은 세 부분과 위아래 관계를 쓰는 분해 연습입니다. 11은 층별 개수와 색 규칙으로 짧게 설명합니다. 17은 설명 문구 없이 장면만 보고 부품을 나누는 연습입니다. 01 포탈은 세워져 있다는 방향을 놓치면 점수가 크게 떨어져 첫 문제로는 어렵습니다. 18 도시 스카이라인은 다섯 건물을 3분 안에 모두 쓰기 어려워 첫 체험에서 제외를 권장합니다.",
  36: "기본 화면은 정면에서 수평으로 본 모습입니다. 마우스 오른쪽 버튼 또는 Ctrl+드래그로 회전하고 휠로 확대·축소합니다. 앞뒤 방향이 중요한 문제 08, 14, 15, 16, 22, 23은 시작 전에 이 조작을 먼저 안내합니다.",
  37: "<b>접속 안내</b> 탭의 큰 수업코드와 주소를 보여 주고 학생이 직접 입력합니다.",
  38: "마감 뒤에 시작한 제출은 저장되지 않습니다. 마감 직전에 제출해 채점 중이던 답은 마감 뒤 90초 안에 끝나면 저장되므로 결과 공개 전 1분 정도 대기합니다.",
  39: "같은 탭에서 새로고침하면 팀 화면이 그대로 복구됩니다. 복원된 3D 장면은 <b>▶ 다시 보기</b> 버튼을 눌러야 실행됩니다.",
  40: "참가 화면에서 같은 수업코드와 같은 학번, 이름을 다시 입력하면 <b>이전 팀으로 들어가기</b>로 원래 팀에 복귀합니다. 이름이 다르면 <b>이미 등록된 학번입니다. 이름을 확인하세요</b> 안내가 표시됩니다.",
  41: "같은 탭에서 새로고침하면 진행 중이던 수업으로 교사 화면이 복구되고 팀 목록과 제출 현황도 다시 불러옵니다. 탭을 닫았다면 같은 기기에서 인증 코드를 다시 입력하면 진행 중이던 수업으로 돌아옵니다.",
  42: "교사 로그인은 마지막 사용 뒤 6시간, 로그인 뒤 최대 12시간 유지됩니다. <b>다시 로그인</b> 버튼을 눌러 인증 코드를 다시 입력하면 같은 기기에서 진행 중이던 수업으로 돌아옵니다.",
  43: "움직이게 또는 튀어 오르게 같은 요청을 한 설명은 정지 장면으로 표현되거나 <b>움직이는 장면은 아직 지원하지 않아요</b> 안내 표시가 나타납니다. 학생에게 멈춘 순간의 모양과 위치를 설명하도록 안내합니다.",
  44: "AI가 체스판이나 고리를 바닥에 눕혀 만들면 정면에서는 옆면만 얇게 보입니다. 마우스 오른쪽 버튼 또는 Ctrl+드래그로 돌려 확인합니다. 목표 장면이 세워져 있다면 설명에 세워져 있다는 방향을 넣도록 학생에게 안내합니다.",
  45: "코드 생성 3~12초와 채점 약 10초를 합쳐 보통 15~25초가 걸립니다. 10~14팀이 동시에 제출해도 같은 시간 안에 처리됩니다. 처리 중에 Ctrl+Enter를 여러 번 눌러도 한 번만 제출되므로 결과를 기다리도록 안내합니다.",
  46: "<b>결과 공개</b>는 제출이 마감된 뒤에만 표시됩니다. <b>제출 마감</b>을 누르거나 제한 시간이 끝나기를 기다립니다.",
  47: "마감된 챌린지는 목록에서 다시 골라 시작할 수 있습니다. 순위에는 이번 라운드 점수만 반영됩니다.",
  48: "<b>전체 수업 종료</b>를 누르면 확인 창이 먼저 표시됩니다. 종료하면 그 수업에서는 챌린지를 더 진행할 수 없고 결과 CSV 파일이 다운로드됩니다.",
  49: "Anthropic 콘솔 console.anthropic.com에서 발급합니다. 수업 시작 설정 화면의 Claude API 키 칸에 입력하고 <b>확인</b>합니다. 서버에 보관되어 다음 수업부터 다시 입력할 필요가 없습니다. 연수 입장으로 들어온 경우 운영자가 설정한 키를 사용하며 키를 바꿀 수 없습니다.",
  50: "제출 1건마다 코드 생성과 채점으로 AI를 호출합니다. 비용은 팀 수와 제출 횟수에 비례합니다. 같은 설명을 다시 제출하면 저장해 둔 채점 결과를 사용해 다시 채점하지 않습니다.",
  51: "학생 기기와 교사 기기는 수업 서버에만 접속하면 됩니다. 3D 장면을 그리는 프로그램은 수업 서버가 함께 제공합니다. AI 호출은 수업 서버가 외부로 보내므로 서버는 인터넷에 연결되어 있어야 합니다. 학교 WiFi가 서버 주소를 막으면 교사 핫스팟으로 전환합니다.",
  52: "학생이 수업코드, 학번, 이름을 입력해 직접 팀을 등록하는 방식입니다. 팀 이름은 자동 생성되며 같은 수업코드를 입력한 학생은 모두 같은 수업에 참여합니다.",
  53: "챌린지 선택, <b>시작하기</b>, <b>제출 마감</b>, <b>결과 공개</b>, <b>다음 챌린지 선택</b> 순서로 진행합니다. 끝난 챌린지는 체크 표시입니다. 같은 챌린지를 다시 내면 이번 라운드 점수만 순위에 반영됩니다.",
  54: "Anthropic의 Claude를 사용합니다. 학생 설명을 3D 코드로 바꾸는 일과 목표 장면과 비교해 채점하는 일을 수행합니다. AI에는 프롬프트와 생성된 코드만 전송하며 학번과 이름은 전송하지 않습니다.",
  55: "현재는 정지 장면만 지원합니다. 움직이게, 튀어 오르게 같은 요청은 정지 장면으로 표현되거나 <b>움직이는 장면은 아직 지원하지 않아요</b> 안내가 표시됩니다.",
  56: "코드 생성 3~12초와 채점 약 10초를 합쳐 보통 15~25초가 걸립니다. 10~14팀이 동시에 제출해도 같은 시간 안에 처리됩니다.",
  57: "연수 입장 코드는 연수 진행자가 받는 코드이며 <code>/training</code>에서 입력하면 교사 로그인 없이 수업 생성 화면으로 이동합니다. 수업코드는 수업을 만들 때 교사가 정하는 코드이며 학생이 <code>/join</code>에서 입력해 수업에 참여합니다.",
}

/* ─── 연수 섹션 (신설) ─────────────────────────────────── */

function QuickstartSection() {
  const steps = [
    { title: '입장하기', color: '#B35C00', text: GUIDE_TEXT[2] },
    { title: '팀 등록하기', color: '#C2366B', text: GUIDE_TEXT[3] },
    { title: '설명 쓰고 제출하기', color: '#2B5CB8', text: GUIDE_TEXT[4] },
    { title: '장면 돌려 보기', color: '#7B4BB7', text: GUIDE_TEXT[5] },
    { title: '결과 확인하기', color: '#1E7F46', text: GUIDE_TEXT[6] },
  ]
  return (
    <div>
      <SectionTitle>연수 빠른 시작</SectionTitle>
      <p style={leadNoteStyle}>연수 참가자용 · 학생 역할로 체험합니다</p>
      <p style={leadStyle}><Rich text={GUIDE_TEXT[1]} /></p>
      {steps.map((st, i) => (
        <StepCard key={st.title} num={i + 1} color={st.color} title={st.title}>
          <p style={bodyStyle}><Rich text={st.text} /></p>
        </StepCard>
      ))}
    </div>
  )
}

function TrainingPlanSection() {
  const rows = [
    { time: '0~5분', step: '입장', text: GUIDE_TEXT[9] },
    { time: '5~8분', step: '규칙 설명', text: GUIDE_TEXT[10] },
    { time: '8~14분', step: '1라운드 · 03 비스듬한 화살표 (제한 3분)', text: GUIDE_TEXT[11] },
    { time: '14~20분', step: '2라운드 · 07 로켓 (제한 3분)', text: GUIDE_TEXT[12] },
    { time: '20~27분', step: '3라운드 · 11 블록 피라미드 (제한 4분)', text: GUIDE_TEXT[13] },
    { time: '27~32분', step: '교사 화면 보기', text: GUIDE_TEXT[14] },
    { time: '32~35분', step: '소감', text: GUIDE_TEXT[15] },
  ]
  return (
    <div>
      <SectionTitle>연수 운영 순서 (35분)</SectionTitle>
      <p style={leadNoteStyle}>연수 진행자용</p>

      <SubTitle>진행자 준비</SubTitle>
      <Card>
        <p style={{ ...bodyStyle, marginBottom: '10px' }}><Rich text={GUIDE_TEXT[7]} /></p>
        <p style={bodyStyle}><Rich text={GUIDE_TEXT[8]} /></p>
      </Card>

      <SubTitle>35분 진행표</SubTitle>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map(r => (
            <div key={r.time} style={{
              display: 'grid', gridTemplateColumns: '84px 180px 1fr', gap: '12px', alignItems: 'start',
              padding: '12px 14px', background: 'var(--card2)', borderRadius: '10px',
            }}>
              <span style={{ fontWeight: 800, fontSize: '0.8125rem', color: 'var(--accent-text)' }}>{r.time}</span>
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)' }}>{r.step}</span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-soft)', lineHeight: 1.7 }}><Rich text={r.text} /></span>
            </div>
          ))}
        </div>
        <InfoBox><Rich text={GUIDE_TEXT[16]} /></InfoBox>
      </Card>

      <SubTitle>시간이 다를 때</SubTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Card>
          <div style={{ fontWeight: 800, fontSize: '0.875rem', color: 'var(--text)', marginBottom: '6px' }}>짧은 안 (20분)</div>
          <p style={bodyStyle}><Rich text={GUIDE_TEXT[17]} /></p>
        </Card>
        <Card>
          <div style={{ fontWeight: 800, fontSize: '0.875rem', color: 'var(--text)', marginBottom: '6px' }}>긴 안 (50분)</div>
          <p style={bodyStyle}><Rich text={GUIDE_TEXT[18]} /></p>
        </Card>
      </div>
    </div>
  )
}

function SituationsSection() {
  const rows = [
    ['마감 뒤에 제출한 학생이 있다', 38],
    ['학생이 화면을 새로고침했다', 39],
    ['학생이 탭을 닫았거나 다른 기기로 다시 접속했다', 40],
    ['교사 화면을 새로고침했거나 탭을 닫았다', 41],
    ['"로그인이 만료되었습니다"가 표시된다', 42],
    ['"움직이게", "튀어 오르게" 같은 요청을 했다', 43],
    ['학생 장면이 비어 보이거나 얇은 선만 보인다', 44],
    ['결과가 늦게 나온다', 45],
    ['결과 공개 버튼이 보이지 않는다', 46],
    ['같은 챌린지를 한 번 더 내고 싶다', 47],
    ['실수로 수업을 끝낼까 걱정된다', 48],
  ]
  return (
    <div>
      <SectionTitle>상황별 대처</SectionTitle>
      <p style={leadNoteStyle}>수업 중 자주 겪는 상황</p>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '10px', padding: '0 4px 8px', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>상황</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>대처</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map(([situation, n]) => (
            <div key={n} style={{
              display: 'grid', gridTemplateColumns: '220px 1fr', gap: '10px', alignItems: 'start',
              padding: '12px 14px', background: 'var(--card2)', borderRadius: '10px',
            }}>
              <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--text)', lineHeight: 1.6 }}>{situation}</span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-soft)', lineHeight: 1.7 }}><Rich text={GUIDE_TEXT[n]} /></span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ─── 연습 문제 데이터 (실제 챌린지 뱅크와 별도) ────────────────── */
const PRACTICE_CHALLENGES = [
  {
    level: 1,
    emoji: '🟡',
    title: '노란 원뿔',
    description: '위를 향해 뾰족하게 솟은 노란색 원뿔',
    code: `cone({pos: vec(0,-1,0), axis: vec(0,3,0), radius: 1.2, color: color.yellow});`,
    hint: '원뿔이 어느 방향으로 뾰족한지, 색상은 무엇인지 묘사해보세요.',
  },
  {
    level: 2,
    emoji: '⛄',
    title: '눈사람',
    description: '흰 구 3개가 아래에서 위로 점점 작아지며 쌓여 있고, 주황색 당근 코가 달려 있다',
    code: `sphere({pos: vec(0,-1.5,0), radius: 1.2, color: color.white});
sphere({pos: vec(0,0.3,0), radius: 0.9, color: color.white});
sphere({pos: vec(0,1.7,0), radius: 0.6, color: color.white});
cone({pos: vec(0,1.7,0), axis: vec(0,0,0.8), radius: 0.12, color: color.orange});`,
    hint: '몸통은 몇 개의 구로 이루어져 있나요? 크기는 어떻게 변하나요?',
  },
  {
    level: 3,
    emoji: '🔴',
    title: '구슬 피라미드',
    description: '맨 아래 빨간 구 4개, 그 위 초록 구 3개, 파란 구 2개, 맨 위 노란 구 1개 — 총 10개가 피라미드 형태',
    code: `var colors = [color.red, color.green, color.blue, color.yellow];
for (var row = 0; row < 4; row++) {
    var count = 4 - row;
    for (var i = 0; i < count; i++) {
        sphere({pos: vec((i - (count-1)/2)*1.2, row*1.1-1.5, 0), radius: 0.45, color: colors[row]});
    }
}`,
    hint: '각 줄에 구가 몇 개인지, 어떤 색인지, 위로 갈수록 어떻게 줄어드는지 규칙을 설명하세요.',
  },
]

/* ─── 섹션 컴포넌트들 ─────────────────────────────────── */

function OverviewSection() {
  return (
    <div>
      {/* 히어로 배너 */}
      <div style={{
        background: 'linear-gradient(135deg, #FFE9A8 0%, #FFF3CC 55%, #FFFCF3 100%)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-md)',
        borderRadius: '20px',
        padding: '36px 32px',
        marginBottom: '28px',
        color: 'var(--text)',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🌍</div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '8px' }}>말로 만드는 세계</h1>
        <p style={{ fontSize: '1rem', opacity: 0.9, lineHeight: 1.6 }}>
          코드 없이 자연어 프롬프트로 3D 장면을 만드는 VPython 챌린지
        </p>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '6px' }}>
          고등학교 1학년 정보 교과 · 2인 1팀(1인 가능) · 팀 대항전
        </p>
      </div>

      {/* 핵심 포인트 3개 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '28px' }}>
        <PointCard emoji="🔄" color="#8A5A00" title="Reverse Engineering"
          desc="결과물을 보고 역으로 문제를 정의하는 교육 설계" />
        <PointCard emoji="🧩" color="#1E7F46" title="컴퓨팅 사고력"
          desc="분해, 패턴인식, 추상화를 자연어 활동으로 체득" />
        <PointCard emoji="🎯" color="#B35C00" title="문제 정의 능력"
          desc="AI 시대에 가장 중요한 '정확히 말하기' 훈련" />
      </div>

      {/* 수업 구성 */}
      <SectionTitle>수업 구성</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '28px' }}>
        <StatCard emoji="👥" label="대상" value="고1 정보" />
        <StatCard emoji="🤝" label="팀 구성" value="2인 1팀" />
        <StatCard emoji="📱" label="최대 팀 수" value="40팀" />
        <StatCard emoji="⏱️" label="수업 시간" value="100분" />
      </div>

      {/* 수업 흐름 다이어그램 */}
      <SectionTitle>수업 흐름</SectionTitle>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { emoji: '👀', label: '목표 장면\n관찰하기' },
            { emoji: '📝', label: '프롬프트\n작성하기' },
            { emoji: '🎨', label: 'AI가\n3D 장면 생성' },
            { emoji: '📊', label: '점수 확인\n피드백 받기' },
            { emoji: '🔄', label: '프롬프트\n수정 후 재도전' },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {i > 0 && <span style={{ fontSize: '1.25rem', color: '#E3CC8F' }}>→</span>}
              <div style={{
                textAlign: 'center',
                padding: '14px 16px',
                background: 'var(--card2)',
                borderRadius: '12px',
                minWidth: '100px',
              }}>
                <div style={{ fontSize: '1.75rem', marginBottom: '6px' }}>{step.emoji}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-soft)', fontWeight: 500, whiteSpace: 'pre-line', lineHeight: 1.4 }}>{step.label}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <InfoBox><Rich text={GUIDE_TEXT[19]} /></InfoBox>
    </div>
  )
}

function TryItSection() {
  const [selected, setSelected] = useState(0)
  const [prompt, setPrompt] = useState('')
  const [resultCode, setResultCode] = useState(null)
  const [evalResult, setEvalResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [error, setError] = useState(null)

  const challenge = PRACTICE_CHALLENGES[selected]
  // 체험 제출은 교사 토큰이 있어야 서버가 받는다. 로그인 없이 /guide로 들어오면 안내만 보여 준다
  const [hasTeacherToken] = useState(() => !!getTeacherToken())

  const handleSubmit = async () => {
    if (!prompt.trim() || !hasTeacherToken) return
    setLoading(true)
    setLoadingStep('3D 장면 생성 중...')
    setError(null)
    setResultCode(null)
    setEvalResult(null)
    try {
      const { code } = await generateCode(prompt.trim())
      setResultCode(code)

      setLoadingStep('프롬프트 평가 중...')
      const evaluation = await evaluatePrompt({
        prompt: prompt.trim(),
        generatedCode: code,
        targetCode: challenge.code,
      })
      setEvalResult(evaluation)
    } catch (e) {
      setError(e.message || 'AI 요청 실패')
    } finally {
      setLoading(false)
      setLoadingStep('')
    }
  }

  return (
    <div>
      <SectionTitle>직접 체험하기</SectionTitle>
      <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--text-soft)', marginBottom: '20px' }}>
        <Rich text={GUIDE_TEXT[20]} />
      </p>

      {!hasTeacherToken && (
        <div style={{ marginBottom: '16px' }}>
          <InfoBox>🔐 체험하기는 교사 로그인(또는 연수 입장) 뒤 안내서 탭에서 사용할 수 있습니다.</InfoBox>
        </div>
      )}

      {/* 레벨 선택 탭 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {PRACTICE_CHALLENGES.map((c, i) => (
          <button
            key={i}
            onClick={() => { setSelected(i); setPrompt(''); setResultCode(null); setEvalResult(null); setError(null) }}
            style={{
              flex: 1,
              padding: '12px 14px',
              border: selected === i ? '2px solid var(--gold)' : '1px solid var(--border)',
              background: selected === i ? 'var(--card)' : '#fff',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{c.emoji}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: selected === i ? 'var(--accent-text)' : 'var(--text-muted)' }}>
              Lv.{c.level}
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)' }}>{c.title}</div>
          </button>
        ))}
      </div>

      {/* 목표 장면 + 프롬프트 입력 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        {/* 목표 장면 */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            목표 장면
          </div>
          <VPythonRunner code={challenge.code} height="280px" />
          <div style={{
            marginTop: '8px',
            padding: '10px 14px',
            background: '#FFF6E0',
            borderLeft: '3px solid #8A5A00',
            borderRadius: '0 8px 8px 0',
            fontSize: '0.8125rem',
            color: '#8A5A00',
          }}>
            💡 {challenge.hint}
          </div>
        </div>

        {/* 내 결과 */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            내 프롬프트 결과
          </div>
          {resultCode ? (
            <VPythonRunner code={resultCode} height="280px" />
          ) : (
            <div style={{
              height: '280px',
              background: 'var(--card2)',
              border: '1.5px dashed var(--border)',
              borderRadius: 'var(--radius)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', fontSize: '0.875rem',
            }}>
              프롬프트를 제출하면 결과가 여기에 표시됩니다
            </div>
          )}
        </div>
      </div>

      {/* 프롬프트 입력 + 제출 */}
      <Card>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-soft)', display: 'block', marginBottom: '6px' }}>
              목표 장면을 말로 설명해보세요
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={`예: "${challenge.description}"`}
              rows={3}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                fontSize: '0.9375rem',
                lineHeight: 1.6,
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading || !prompt.trim() || !hasTeacherToken}
            style={{
              padding: '12px 28px',
              background: loading ? 'var(--card)' : 'var(--btn-primary-bg)',
              color: loading ? 'var(--text-muted)' : 'var(--btn-primary-text)',
              border: 'none',
              borderRadius: 'var(--radius-btn)',
              boxShadow: loading ? 'none' : '0 6px 18px var(--shadow)',
              fontSize: '0.9375rem',
              fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              marginBottom: '2px',
            }}
          >
            {loading ? loadingStep : '제출'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: '10px', padding: '10px 14px', background: '#FDECEC', borderRadius: '8px', fontSize: '0.8125rem', color: '#C53030' }}>
            {error}
          </div>
        )}
      </Card>

      {/* 평가 결과 */}
      {evalResult && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text)' }}>평가 결과</span>
            <span style={{
              fontSize: '2rem', fontWeight: 900,
              color: evalResult.score >= 80 ? '#1E7F46' : evalResult.score >= 60 ? '#8A5A00' : '#C53030',
            }}>
              {evalResult.score}점
            </span>
          </div>

          {/* CT 점수 바 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            {[
              ['decomp', '분해'],
              ['pattern', '패턴인식'],
              ['abstract', '추상화'],
              ['algorithm', '알고리즘'],
            ].map(([key, label]) => (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{evalResult.ct_scores?.[key] ?? 0}/25</span>
                </div>
                <div style={{ height: '6px', background: 'var(--card)', borderRadius: '3px' }}>
                  <div style={{
                    height: '100%',
                    width: `${((evalResult.ct_scores?.[key] ?? 0) / 25) * 100}%`,
                    background: 'linear-gradient(135deg, var(--gold), var(--accent))',
                    borderRadius: '3px',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* 피드백 */}
          <p style={{ fontSize: '0.9375rem', color: 'var(--text-soft)', lineHeight: 1.7, marginBottom: '12px' }}>
            {evalResult.feedback}
          </p>

          {/* 개선점 */}
          {evalResult.improvements?.length > 0 && (
            <div style={{
              padding: '12px 16px',
              background: '#EEF3FF',
              borderRadius: '10px',
              borderLeft: '3px solid #2B5CB8',
            }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#2B5CB8', marginBottom: '6px' }}>
                개선 포인트
              </div>
              <ul style={{ paddingLeft: '16px', fontSize: '0.8125rem', color: 'var(--text-soft)', lineHeight: 1.8 }}>
                {evalResult.improvements.map((imp, i) => (
                  <li key={i}>{imp}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function LessonPlanSection() {
  return (
    <div>
      <SectionTitle>강의안 (100분)</SectionTitle>
      <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--text-soft)', marginBottom: '20px' }}>
        고등학교 1학년 정보 교과 · 핵심 주제: <strong>문제 정의(Problem Definition)</strong>
      </p>

      {/* 타임라인 */}
      <Card>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#B35C00', marginBottom: '12px' }}>전체 타임라인</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { time: '0~12분', label: '0부: 문제 정의란 무엇인가', color: '#B35C00', items: ['수업 도입 — "맛있는 거 사와" 질문', 'VPython 소개 데모', '실패 쇼 — "신호등 만들어줘"'] },
            { time: '12~30분', label: '1부: 종이 게임 — 아날로그 문제 정의', color: '#C2366B', items: ['Round 1: 단순 장면 (빨간 원)', 'Round 2: 관계 추가 (사각형 + 원)'] },
            { time: '30~82분', label: '2부: VPython 글로 코딩 챌린지', color: '#2B5CB8', items: ['접속 세팅 (5분)', '챌린지 진행 + 성찰 (52분)'] },
            { time: '82~100분', label: '3부: 전체 회고 — 문제 정의 × AI', color: '#7B4BB7', items: ['오늘 배운 것 회수', 'AI 시대에 왜 문제 정의가 중요한가', '팀별 성찰 발표'] },
          ].map((phase, i) => (
            <div key={i} style={{
              padding: '14px 16px',
              background: 'var(--card2)',
              borderRadius: '10px',
              borderLeft: `3px solid ${phase.color}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{
                  fontSize: '0.6875rem', fontWeight: 800, color: '#fff',
                  background: phase.color, padding: '2px 10px', borderRadius: '12px',
                }}>{phase.time}</span>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' }}>{phase.label}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', paddingLeft: '4px' }}>
                {phase.items.map((item, j) => (
                  <span key={j} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: '#fff', padding: '2px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 0부 상세 */}
      <SubTitle>0부: 문제 정의란 무엇인가 (12분)</SubTitle>
      <Card>
        <ScriptBlock speaker="도입 질문" color="#B35C00">
          "친구한테 '맛있는 거 사와'라고 심부름을 시키면 어떻게 될까요?"
          → 기대와 다른 결과 경험 공유 → <strong>"문제 정의가 부족했기 때문"</strong>이라는 개념 도출
        </ScriptBlock>
        <ScriptBlock speaker="VPython 소개" color="#C2366B">
          3D 물체를 코드로 만드는 도구. 데모 실행 후 "오늘은 코딩 안 해요. <strong>글로 코딩</strong>할 거예요."
        </ScriptBlock>
        <ScriptBlock speaker="실패 쇼" color="#C53030">
          교사가 <strong>"신호등 만들어줘"</strong>를 입력 → 기대와 다른 결과 → "AI가 몰라서일까요, 제가 설명을 잘못한 걸까요?"
          <br />→ 수업 전체의 탐구 동기 생성. 이 질문은 3부에서 회수.
        </ScriptBlock>
      </Card>

      {/* 1부 상세 */}
      <SubTitle>1부: 종이 게임 — 아날로그 문제 정의 (18분)</SubTitle>
      <Card>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-soft)', lineHeight: 1.7, marginBottom: '12px' }}>
          2인 1팀. A는 화면을 보고 <strong>말로 설명</strong>, B는 등을 돌리고 <strong>표준 도형 카드로 장면을 재현</strong>.
          B는 질문 가능 — "질문할 수 있다"는 것이 핵심 포인트.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ padding: '12px', background: '#ECF8F0', borderRadius: '10px', border: '1px solid #CDEBD8' }}>
            <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#1E7F46', marginBottom: '4px' }}>Round 1 — 단순 장면 (8분)</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-soft)' }}>검정 배경에 빨간 원 하나<br />핵심 발견: <strong>크기, 위치, 기준</strong>이 없으면 상대가 마음대로 채움</div>
          </div>
          <div style={{ padding: '12px', background: '#EEF3FF', borderRadius: '10px', border: '1px solid #CFE0FB' }}>
            <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#2B5CB8', marginBottom: '4px' }}>Round 2 — 관계 추가 (7분)</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-soft)' }}>파란 사각형 위에 초록 원<br />핵심 발견: <strong>"안에" vs "위에"</strong> — 관계 표현의 중요성</div>
          </div>
        </div>
      </Card>

      {/* 2부 상세 */}
      <SubTitle>2부: VPython 글로 코딩 챌린지 (52분)</SubTitle>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
        각 챌린지: 문제 제시(2분) → 팀 활동(제한 시간 5분) + 교사 순회(3분) → 결과 공개 + 성찰(6분)
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        <ChallengeScript
          num={1} time="35~52분" title="분해(Decomposition) · 07 로켓"
          color="#1E7F46"
          target="목표 장면을 부품으로 분해하기"
          key_moment={<Rich text={GUIDE_TEXT[21]} />}
          takeaway={<Rich text={GUIDE_TEXT[22]} />}
        />
        <ChallengeScript
          num={2} time="52~68분" title="패턴인식(Pattern Recognition) · 11 블록 피라미드"
          color="#8A5A00"
          target="반복 구조에서 규칙 찾기"
          key_moment={<Rich text={GUIDE_TEXT[23]} />}
          takeaway={<Rich text={GUIDE_TEXT[24]} />}
        />
        <ChallengeScript
          num={3} time="68~82분" title="추상화(Abstraction) · 17 신호등"
          color="#C53030"
          target="필요한 특징만 골라 설명하기"
          key_moment={<Rich text={GUIDE_TEXT[25]} />}
          takeaway={<Rich text={GUIDE_TEXT[26]} />}
        />
      </div>

      {/* 3부 상세 */}
      <SubTitle>3부: 전체 회고 (18분)</SubTitle>
      <Card>
        <ScriptBlock speaker="질문 회수" color="#B35C00">
          "0부에서 '신호등 만들어줘'가 실패했죠. 이제 왜 실패했는지 알 것 같아요?"
          <br />→ "AI 잘못이었나요, 제 잘못이었나요?" → <strong>"AI는 알고 있었지만, 내가 원하는 것을 몰랐다"</strong>
        </ScriptBlock>
        <ScriptBlock speaker="CT 연결" color="#C2366B">
          챌린지 1(07 로켓): <strong>분해</strong>, 부품으로 나누기<br />
          챌린지 2(11 블록 피라미드): <strong>패턴인식</strong>, 규칙 찾기<br />
          챌린지 3(17 신호등): <strong>추상화</strong>, 필요한 특징만 고르기
        </ScriptBlock>
        <ScriptBlock speaker="핵심 메시지" color="#7B4BB7">
          "AI 시대에 가장 중요한 역량은 코드를 잘 짜는 것이 아니라 <strong>무엇을 만들어야 하는지 정확히 정의하는 것</strong>이다."
        </ScriptBlock>
      </Card>

      {/* 수업 자료 다운로드 */}
      <SubTitle>수업 자료</SubTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        <MaterialCard emoji="📑" title="수업 시나리오" desc="100분 수업 전체 대본 (교사 멘트, 예상 반응, 타이밍)" />
        <MaterialCard emoji="🃏" title="표준 도형 카드" desc="1부 종이 게임용 — 원, 사각형, 삼각형 카드 세트" />
        <MaterialCard emoji="📊" title="학습 체크리스트" desc="수업 후 확인 — 분해·패턴·추상화 개념 도달 여부" />
      </div>
    </div>
  )
}

function HowtoSection() {
  return (
    <div>
      <SectionTitle>수업 진행 방법</SectionTitle>

      <StepCard num={1} color="#B35C00" title="수업 만들기">
        <RichList text={GUIDE_TEXT[27]} />
      </StepCard>

      <StepCard num={2} color="#C2366B" title="학생 접속">
        <RichList text={GUIDE_TEXT[28]} />
        <InfoBox><Rich text={GUIDE_TEXT[29]} /></InfoBox>
        <InfoBox>
          팀 정원(기본 40팀)을 초과하면 "정원 초과" 안내와 함께 관람 모드로 전환됩니다.
          정원은 서버의 MAX_TEAMS 환경변수로 조정할 수 있습니다.
          기기가 부족한 경우 한 팀이 1대의 기기로 진행할 수 있습니다.
        </InfoBox>
      </StepCard>

      <StepCard num={3} color="#2B5CB8" title="챌린지 진행">
        <RichList text={GUIDE_TEXT[30]} />
        <InfoBox><Rich text={GUIDE_TEXT[31]} /></InfoBox>
        <InfoBox>
          진행 중에는 다른 챌린지를 선택할 수 없습니다. 반드시 "제출 마감"을 누른 후 다음 챌린지를 선택하세요.
          제출하지 않은 팀은 자동으로 0점 처리됩니다.
        </InfoBox>
      </StepCard>

      <StepCard num={4} color="#7B4BB7" title="결과 공개와 회고">
        <RichList text={GUIDE_TEXT[32]} />
      </StepCard>

      <StepCard num={5} color="#1E7F46" title="수업 마치기">
        <RichList text={GUIDE_TEXT[33]} />
      </StepCard>

      <SectionTitle>교사 대시보드 기능</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <FeatureCard icon="🎮" color="#8A5A00" title="데모 모드" desc="교사가 직접 프롬프트를 입력하여 시연" />
        <FeatureCard icon="💬" color="#1E7F46" title="채팅 모니터링" desc="모든 팀의 채팅을 실시간으로 확인" />
        <FeatureCard icon="🔍" color="#2B5CB8" title="프롬프트 비교" desc="두 팀의 프롬프트를 나란히 비교" />
        <FeatureCard icon="📊" color="#C2366B" title="CSV 내보내기" desc="팀별 점수와 프롬프트를 다운로드" />
        <FeatureCard icon="💡" color="#A0522D" title="힌트 전송" desc="막히는 팀에게 실시간으로 힌트 전송" />
        <FeatureCard icon="⏹️" color="#C53030" title="시작/마감 제어" desc="챌린지별 시작과 제출 마감을 명시적으로 제어" />
        <FeatureCard icon="🏆" color="#7B4BB7" title="결과 공개" desc="마감 뒤에만 표시, 미제출 팀은 '미제출'로 표시(순위 제외)" />
      </div>
    </div>
  )
}

function ChallengesSection() {
  // 레벨 라벨 색은 index.css 토큰을 쓴다 (교사 화면 ★ 표시와 같은 계열)
  const levelMeta = {
    1: { label: 'Level 1 — 정밀 묘사', color: 'var(--success-text)', bg: 'var(--success-bg)', desc: '도형 하나의 형태, 방향, 비율을 정밀하게 묘사' },
    2: { label: 'Level 2 — 분해와 재조합', color: 'var(--warning-text)', bg: 'var(--warning-bg)', desc: '현실 사물을 기본 도형으로 해체하기' },
    3: { label: 'Level 3 — 반복 패턴', color: 'var(--danger-text)', bg: 'var(--danger-bg)', desc: '하나를 설명하고, 규칙을 말하라' },
    4: { label: 'Level 4 — 복합 구조', color: 'var(--info-text)', bg: 'var(--info-bg)', desc: '입체 패턴과 여러 부품의 관계를 설명하기' },
    5: { label: 'Level 5 — 극한 도전', color: 'var(--text)', bg: 'var(--card)', desc: '복합 구조와 반복 패턴을 함께 설명하기' },
  }
  const levels = Object.keys(levelMeta).map(Number)

  return (
    <div>
      <SectionTitle>챌린지 구성</SectionTitle>
      <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--text-soft)', marginBottom: '24px' }}>
        총 <strong>{BATTLE_CHALLENGES.length}개</strong>의 챌린지가 있습니다. <Rich text={GUIDE_TEXT[34]} />
      </p>
      <div style={{ marginBottom: '24px' }}>
        <InfoBox>
          <div style={{ fontWeight: 800, marginBottom: '4px' }}>첫 수업·연수 추천 순서</div>
          <Rich text={GUIDE_TEXT[35]} />
        </InfoBox>
        <InfoBox>
          <div style={{ fontWeight: 800, marginBottom: '4px' }}>장면 돌려 보기</div>
          <Rich text={GUIDE_TEXT[36]} />
        </InfoBox>
      </div>

      {levels.map(level => {
        const meta = levelMeta[level]
        const challenges = BATTLE_CHALLENGES.filter(c => c.level === level)
        if (challenges.length === 0) return null
        return (
          <div key={level} style={{ marginBottom: '24px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px',
              padding: '10px 16px',
              background: meta.bg,
              borderRadius: '10px',
              border: '1px solid var(--border)',
            }}>
              <span style={{
                padding: '3px 12px', borderRadius: 'var(--radius-pill)', fontSize: '0.75rem', fontWeight: 800,
                background: meta.color, color: '#fff',
              }}>
                Lv.{level}
              </span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: meta.color }}>{meta.label.split(' — ')[1]}</span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginLeft: '4px' }}>— {meta.desc}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {challenges.map(c => (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '14px 16px',
                  background: '#fff',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  transition: 'box-shadow 0.15s',
                }}>
                  <span style={{ fontSize: '1.5rem' }}>{c.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' }}>{c.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>
                  </div>
                  <div style={{
                    fontSize: '0.6875rem', color: meta.color, background: meta.bg,
                    padding: '2px 8px', borderRadius: '6px', fontWeight: 600, whiteSpace: 'nowrap',
                  }}>
                    {c.ct.join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TipsSection() {
  return (
    <div>
      <SectionTitle>운영 팁</SectionTitle>

      <SubTitle>순회 우선순위</SubTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '28px' }}>
        <PriorityCard emoji="🌀" level="Level 1 — 정밀 묘사" team='"포탈 만들어줘" 단순 제출 팀' why="도형의 방향·비율 묘사 유도" color="#1E7F46" />
        <PriorityCard emoji="🍄" level="Level 2 — 분해" team="부품 구분 없이 통째로 설명하는 팀" why="줄기/갓 등 부품별 분해 유도" color="#8A5A00" />
        <PriorityCard emoji="🪜" level="Level 3 — 패턴" team="계단을 하나씩 따로 설명하는 팀" why="반복 규칙으로 압축 유도" color="#C53030" />
      </div>

      <SubTitle>피드백 원칙</SubTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '28px' }}>
        <TipCard emoji="📉" title="낮은 점수" feedback="'뭐가 부족했을 것 같아요?' — 원인을 스스로 분석하게 합니다." bg="#FDECEC" />
        <TipCard emoji="✨" title="좋은 프롬프트" feedback="전체에 공유하고 '어떻게 이렇게 썼어요?'라고 질문합니다." bg="#ECF8F0" />
        <TipCard emoji="🤖" title="AI 결과 이상" feedback="'AI가 왜 이렇게 만들었을까요?' — 프롬프트 분석으로 유도합니다." bg="#EEF3FF" />
        <TipCard emoji="⏸️" title="제출 전 개입 금지" feedback="먼저 제출하게 한 후 피드백합니다. 실패 경험이 학습입니다." bg="#FFF6E0" />
      </div>

      <SubTitle>학생 유형별 대응</SubTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
        <ResponseCard
          question='"AI가 다 해주면 되지 않나요?"'
          answer="맞아요. 근데 AI한테 '더 좋게 해줘'라고 하면 AI가 알까요? 뭘 어떻게 더 좋게 해야 하는지 정확히 말해야 해요."
        />
        <ResponseCard
          question='"어차피 ChatGPT 쓰면 다 나오는데"'
          answer="'버섯 만들어줘'라고 해보세요. AI가 버섯을 알면서도 내가 원하는 버섯을 못 만들어요."
        />
        <ResponseCard
          question="말이 없는 팀"
          answer='팀원 한 명을 지정해서 1:1 질문: "○○아, 이 프롬프트에서 빠진 게 뭔 것 같아?"'
        />
      </div>

      <SubTitle>트러블슈팅</SubTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <TroubleshootItem icon="📶" problem="학교 WiFi 차단" solution="교사 핫스팟으로 전환" />
          <TroubleshootItem icon="📱" problem="QR 스캔 불가" solution={<Rich text={GUIDE_TEXT[37]} />} />
          <TroubleshootItem icon="🔋" problem="학생 기기 없음" solution="팀 1대로 통합 진행" />
          <TroubleshootItem icon="👥" problem="팀 정원(40팀) 초과" solution="학생 화면에 정원 초과 안내가 뜨고 관람 모드로 전환됩니다" />
          <TroubleshootItem icon="🕐" problem="중간에 입장한 학생" solution="현재 진행 중인 챌린지가 자동 전달됩니다" />
          <TroubleshootItem icon="📊" problem="미제출 팀 점수" solution="제출하지 않은 챌린지는 0점으로 계산되고, 한 번도 제출하지 않은 팀은 '미제출'로 표시됩니다" />
        </div>
      </Card>
    </div>
  )
}

function PrivacySection() {
  const privacyItems = [
    {
      q: '어떤 학생 정보가 수집되나요?',
      a: '팀 구성 및 학습 추적을 위해 학번과 이름이 수집됩니다. 이 정보는 수업 운영과 평가 목적으로만 사용되며, 그 외의 개인정보는 수집하지 않습니다.',
    },
    {
      q: 'AI(Claude)에 학생 정보가 전송되나요?',
      a: 'AI API(Claude)에는 학생이 작성한 프롬프트와 생성된 코드만 전송됩니다. 학번, 이름 등 학생 식별 정보는 절대 AI에 전달되지 않습니다.',
    },
    {
      q: '외부에서 무단 접근이 가능한가요?',
      a: 'CORS 화이트리스트가 적용되어 있어, 허가된 도메인에서만 서버에 접근할 수 있습니다. 승인되지 않은 외부 사이트에서의 요청은 자동으로 차단됩니다.',
    },
    {
      q: 'SQL 인젝션 등 보안 공격은 방어되나요?',
      a: '모든 데이터베이스 쿼리에 매개변수화된 쿼리(Parameterized Query)를 사용하여 SQL 인젝션 공격을 방지합니다.',
    },
    {
      q: '개인정보 처리방침을 확인할 수 있나요?',
      a: '앱 하단의 링크 또는 /privacy 경로에서 개인정보 처리방침 전문을 확인할 수 있습니다. 수집 항목, 이용 목적, 보관 기간 등이 상세히 안내되어 있습니다.',
    },
    {
      q: '수집된 데이터는 언제 삭제되나요?',
      a: '수업 데이터는 학기 종료 시 전부 삭제됩니다. 학기 중에도 학생이 교사에게 요청하면 해당 학생의 데이터 열람 및 삭제가 가능합니다.',
    },
    {
      q: '학생이 자신의 데이터를 확인하거나 삭제를 요청할 수 있나요?',
      a: '네. 학생(또는 학부모)은 교사에게 데이터 열람 또는 삭제를 요청할 수 있습니다. 요청을 받으면 교사가 해당 데이터를 확인하거나 삭제 처리합니다.',
    },
  ]

  return (
    <div>
      <SectionTitle>개인정보 보호</SectionTitle>
      <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--text-soft)', marginBottom: '20px' }}>
        본 서비스는 학생의 개인정보를 안전하게 보호하기 위해 다양한 기술적·관리적 조치를 적용하고 있습니다.
        아래 항목을 통해 주요 보호 정책을 확인하세요.
      </p>

      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '6px' }}>
          <div style={{
            padding: '16px',
            background: '#ECF8F0',
            borderRadius: '12px',
            borderLeft: '3px solid #1E7F46',
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1E7F46', marginBottom: '6px' }}>수집 정보</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-soft)', lineHeight: 1.6 }}>
              학번, 이름 (팀 구성 및 학습 추적 목적)
            </div>
          </div>
          <div style={{
            padding: '16px',
            background: '#EEF3FF',
            borderRadius: '12px',
            borderLeft: '3px solid #2B5CB8',
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#2B5CB8', marginBottom: '6px' }}>AI 전송 범위</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-soft)', lineHeight: 1.6 }}>
              프롬프트와 코드만 전송 (학번·이름 미전송)
            </div>
          </div>
          <div style={{
            padding: '16px',
            background: '#FDECEC',
            borderRadius: '12px',
            borderLeft: '3px solid #C53030',
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#C53030', marginBottom: '6px' }}>접근 제한</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-soft)', lineHeight: 1.6 }}>
              CORS 화이트리스트로 허가된 도메인만 접근 허용
            </div>
          </div>
          <div style={{
            padding: '16px',
            background: '#FFF6E0',
            borderRadius: '12px',
            borderLeft: '3px solid #8A5A00',
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#8A5A00', marginBottom: '6px' }}>데이터 보관</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-soft)', lineHeight: 1.6 }}>
              학기 종료 시 전체 삭제, 요청 시 즉시 삭제 가능
            </div>
          </div>
        </div>
      </Card>

      <SubTitle>자주 묻는 질문</SubTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {privacyItems.map((f, i) => (
          <FAQItem key={i} q={f.q} a={f.a} />
        ))}
      </div>
    </div>
  )
}

function FAQSection() {
  // 답은 GUIDE_TEXT(솔라 원고)를 쓰고, 오늘 변경과 무관한 답은 기존 문구를 유지한다
  const faqs = [
    { q: '어떤 AI를 사용하나요?', a: <Rich text={GUIDE_TEXT[54]} /> },
    { q: 'API 키는 어디서 받나요?', a: <Rich text={GUIDE_TEXT[49]} /> },
    { q: 'API 비용은 얼마나 드나요?', a: <Rich text={GUIDE_TEXT[50]} /> },
    { q: '인터넷 없이 사용할 수 있나요?', a: <Rich text={GUIDE_TEXT[51]} /> },
    { q: '제출하면 결과가 나오기까지 얼마나 걸리나요?', a: <Rich text={GUIDE_TEXT[56]} /> },
    { q: '움직이는 장면도 만들 수 있나요?', a: <Rich text={GUIDE_TEXT[55]} /> },
    {
      q: '학생이 부적절한 프롬프트를 입력하면?',
      a: '3D 장면 관련 프롬프트만 처리되도록 설계되어 있습니다. 채팅 모니터링으로 실시간 확인도 가능합니다.',
    },
    { q: '팀을 미리 지정할 수 있나요?', a: <Rich text={GUIDE_TEXT[52]} /> },
    { q: '연수 입장 코드와 수업코드는 어떻게 다른가요?', a: <Rich text={GUIDE_TEXT[57]} /> },
    {
      q: '수업 데이터는 어디에 저장되나요?',
      a: '서버의 데이터베이스에 저장됩니다. 팀별 프롬프트, 점수, 시도 횟수가 모두 기록되며 CSV로 내보낼 수 있습니다.',
    },
    { q: '한 세션에서 여러 챌린지를 진행할 수 있나요?', a: <Rich text={GUIDE_TEXT[53]} /> },
    {
      q: '수업 중간에 학생이 들어오면 어떻게 되나요?',
      a: '중간에 접속한 학생도 현재 진행 중인 챌린지가 자동으로 전달됩니다. 이전 챌린지는 제출하지 않은 것으로 0점 계산됩니다.',
    },
    {
      q: '문제를 제출하지 않은 팀은 어떻게 되나요?',
      a: '한 번도 제출하지 않은 팀은 \'미제출\'로 표시되고 순위에서 제외됩니다. 일부 챌린지만 제출한 팀은 제출하지 않은 챌린지가 0점으로 계산됩니다. "1문제만 풀고 1등" 같은 상황은 발생하지 않습니다.',
    },
  ]

  return (
    <div>
      <SectionTitle>자주 묻는 질문</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {faqs.map((f, i) => (
          <FAQItem key={i} q={f.q} a={f.a} />
        ))}
      </div>
    </div>
  )
}

/* ─── 공용 UI 컴포넌트 ───────────────────────────────── */

// GUIDE_TEXT의 <b>·<code> 표시를 굵은 글씨·코드로 바꿔 보여 준다 (그 밖의 태그는 쓰지 않는다)
function Rich({ text }) {
  const parts = String(text).split(/(<b>.*?<\/b>|<code>.*?<\/code>)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('<b>')) return <strong key={i}>{p.slice(3, -4)}</strong>
        if (p.startsWith('<code>')) return <code key={i} style={codeStyle}>{p.slice(6, -7)}</code>
        return p
      })}
    </>
  )
}

// 문단을 문장 단위로 나눈다 — "~다." 뒤의 공백에서 자르되 <b> 안의 문장(안내 문구)은 자르지 않는다.
// 정규식 lookbehind는 구형 Safari에서 번들 전체 구문 오류를 내므로 쓰지 않는다.
function splitSentences(text) {
  const out = []
  let start = 0
  let inBold = false
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('<b>', i)) inBold = true
    else if (text.startsWith('</b>', i)) inBold = false
    else if (!inBold && text[i] === '.' && text[i - 1] === '다' && /\s/.test(text[i + 1] || '')) {
      out.push(text.slice(start, i + 1).trim())
      start = i + 1
    }
  }
  const rest = text.slice(start).trim()
  if (rest) out.push(rest)
  return out
}

// 문단을 문장 단위 목록으로 보여 준다 (문장 하나가 목록 한 줄)
function RichList({ text }) {
  const sentences = splitSentences(String(text))
  return (
    <ol style={listStyle}>
      {sentences.map((sentence, i) => <li key={i}><Rich text={sentence} /></li>)}
    </ol>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', marginBottom: '16px', marginTop: '4px' }}>
      {children}
    </h2>
  )
}

function SubTitle({ children }) {
  return <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text)', marginBottom: '12px', marginTop: '8px' }}>{children}</h3>
}

function Card({ children }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      borderRadius: '16px',
      padding: '20px',
      marginBottom: '16px',
    }}>
      {children}
    </div>
  )
}

function InfoBox({ children }) {
  return (
    <div style={{
      marginTop: '12px',
      padding: '10px 14px',
      background: '#FFF6E0',
      borderLeft: '3px solid #8A5A00',
      borderRadius: '0 8px 8px 0',
      fontSize: '0.8125rem',
      color: '#8A5A00',
    }}>
      {children}
    </div>
  )
}

function PointCard({ emoji, color, title, desc }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      borderRadius: '16px',
      padding: '20px',
      textAlign: 'center',
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{emoji}</div>
      <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text)', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
    </div>
  )
}

function StatCard({ emoji, label, value }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      borderRadius: '14px',
      padding: '16px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{emoji}</div>
      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)', marginTop: '2px' }}>{value}</div>
    </div>
  )
}

function StepCard({ num, color, title, children }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      borderRadius: '16px',
      padding: '20px 24px',
      marginBottom: '14px',
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: color, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: '0.875rem', flexShrink: 0,
        }}>
          {num}
        </div>
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

function FeatureCard({ icon, color, title, desc }) {
  return (
    <div style={{
      padding: '18px',
      background: '#fff',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      borderRadius: '14px',
      textAlign: 'center',
    }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '12px',
        background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 10px', fontSize: '1.25rem',
      }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{desc}</div>
    </div>
  )
}

function PriorityCard({ emoji, level, team, why, color }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', boxShadow: 'var(--shadow-sm)',
      padding: '16px', borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{emoji}</div>
      <div style={{ fontSize: '0.75rem', color, fontWeight: 700, marginBottom: '4px' }}>{level}</div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--text)', fontWeight: 600, marginBottom: '4px' }}>{team}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{why}</div>
    </div>
  )
}

function TipCard({ emoji, title, feedback, bg }) {
  return (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'flex-start',
      padding: '14px 16px',
      background: bg || '#fff',
      border: '1px solid var(--border)',
      borderRadius: '12px',
    }}>
      <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{emoji}</span>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{feedback}</div>
      </div>
    </div>
  )
}

function ResponseCard({ question, answer }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: '14px', boxShadow: 'var(--shadow-sm)',
      padding: '16px 20px',
    }}>
      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#B35C00', marginBottom: '6px' }}>{question}</div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-soft)', lineHeight: 1.6 }}>→ {answer}</div>
    </div>
  )
}

function TroubleshootItem({ icon, problem, solution }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--card2)', borderRadius: '10px' }}>
      <span style={{ fontSize: '1.25rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#C53030' }}>{problem}</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-soft)' }}>{solution}</div>
      </div>
    </div>
  )
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      borderRadius: '14px',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '16px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--text)',
          fontWeight: 600,
          fontSize: '0.9375rem',
          textAlign: 'left',
        }}
      >
        <span>{q}</span>
        <span style={{
          fontSize: '0.75rem', color: 'var(--text-muted)',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
        }}>▼</span>
      </button>
      {open && (
        <div style={{
          padding: '0 20px 16px',
          fontSize: '0.875rem',
          color: 'var(--text-muted)',
          lineHeight: 1.7,
        }}>
          {a}
        </div>
      )}
    </div>
  )
}

function ScriptBlock({ speaker, color, children }) {
  return (
    <div style={{
      padding: '12px 16px',
      background: 'var(--card2)',
      borderRadius: '10px',
      borderLeft: `3px solid ${color}`,
      marginBottom: '10px',
    }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color, marginBottom: '4px' }}>{speaker}</div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-soft)', lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

function ChallengeScript({ num, time, title, color, target, key_moment, takeaway }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      borderRadius: '14px',
      padding: '16px 20px',
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%',
          background: color, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: '0.8125rem', flexShrink: 0,
        }}>{num}</div>
        <div>
          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text)' }}>챌린지 {num}: {title}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '8px' }}>{time}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8125rem', color: 'var(--text-soft)', lineHeight: 1.6 }}>
        <div><span style={{ fontWeight: 600, color: 'var(--text)' }}>목표:</span> {target}</div>
        <div><span style={{ fontWeight: 600, color: 'var(--text)' }}>핵심 순간:</span> {key_moment}</div>
        <div style={{ padding: '8px 12px', background: `${color}08`, borderRadius: '8px', border: `1px solid ${color}20` }}>
          <span style={{ fontWeight: 600, color }}>정리:</span> {takeaway}
        </div>
      </div>
    </div>
  )
}

function MaterialCard({ emoji, title, desc }) {
  return (
    <div style={{
      padding: '18px',
      background: '#fff',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      borderRadius: '14px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.75rem', marginBottom: '8px' }}>{emoji}</div>
      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
    </div>
  )
}

/* ─── 스타일 상수 ─────────────────────────────────────── */

const leadStyle = { fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--text-soft)', marginBottom: '20px' }
const leadNoteStyle = { fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-text)', marginTop: '-8px', marginBottom: '12px' }
const bodyStyle = { fontSize: '0.875rem', lineHeight: 1.8, color: 'var(--text)' }

const listStyle = {
  paddingLeft: '20px',
  fontSize: '0.875rem',
  lineHeight: 2,
  color: 'var(--text)',
}

const codeStyle = {
  padding: '2px 8px',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  fontSize: '0.8125rem',
  fontFamily: 'monospace',
  color: 'var(--accent-text)',
}
