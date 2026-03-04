import { useState } from 'react'

const sections = [
  { id: 'overview', icon: '🧠', label: '서비스 소개' },
  { id: 'curriculum', icon: '📚', label: '커리큘럼' },
  { id: 'howto', icon: '🎮', label: '수업 진행 방법' },
  { id: 'challenges', icon: '🎯', label: '챌린지 구성' },
  { id: 'tips', icon: '💡', label: '운영 팁' },
  { id: 'faq', icon: '❓', label: 'FAQ' },
]

export default function TeacherGuide() {
  const [activeSection, setActiveSection] = useState('overview')

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 52px)' }}>
      {/* 사이드 내비게이션 */}
      <nav style={{
        width: '200px',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        padding: '20px 0',
        flexShrink: 0,
        overflowY: 'auto',
      }}>
        <div style={{ padding: '0 16px 16px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          교사 안내서
        </div>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '10px 16px',
              border: 'none',
              background: activeSection === s.id ? 'var(--accent)' : 'transparent',
              color: activeSection === s.id ? 'white' : 'var(--text-muted)',
              fontWeight: activeSection === s.id ? 600 : 400,
              fontSize: '0.875rem',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s',
            }}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {/* 메인 콘텐츠 */}
      <main style={{
        flex: 1,
        overflowY: 'auto',
        padding: '32px 40px',
        maxWidth: '860px',
      }}>
        {activeSection === 'overview' && <OverviewSection />}
        {activeSection === 'curriculum' && <CurriculumSection />}
        {activeSection === 'howto' && <HowtoSection />}
        {activeSection === 'challenges' && <ChallengesSection />}
        {activeSection === 'tips' && <TipsSection />}
        {activeSection === 'faq' && <FAQSection />}
      </main>
    </div>
  )
}

/* ─── 섹션 컴포넌트들 ─────────────────────────────────── */

function OverviewSection() {
  return (
    <div>
      <SectionTitle>서비스 소개</SectionTitle>
      <Paragraph>
        <strong>"말로 만드는 세계"</strong>는 고등학교 1학년 정보 교과를 위한 VPython 프롬프트 챌린지 웹앱입니다.
        학생들이 코드를 직접 작성하지 않고, <Highlight>자연어 프롬프트</Highlight>로 AI에게 3D 장면을 만들도록 지시합니다.
      </Paragraph>

      <Card title="핵심 교육 철학" accent>
        <ul style={{ ...listStyle }}>
          <li><strong>Reverse Engineering Pedagogy</strong> — 결과물을 보고 역으로 문제를 정의하는 방식</li>
          <li><strong>컴퓨팅 사고력(CT)</strong>을 자연어 활동으로 체득 — 분해, 패턴인식, 추상화, 알고리즘</li>
          <li><strong>AI 시대의 문제 정의 능력</strong> — 코딩 실력이 아니라 "무엇을 만들지 정확히 말하기"</li>
        </ul>
      </Card>

      <SubTitle>수업 구성 개요</SubTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
        <StatCard label="대상" value="고1 정보" />
        <StatCard label="팀 구성" value="2인 1팀" />
        <StatCard label="최대 팀 수" value="15팀" />
      </div>

      <SubTitle>기술 구성</SubTitle>
      <Card>
        <table style={tableStyle}>
          <tbody>
            <tr><td style={tdLabelStyle}>3D 렌더링</td><td style={tdStyle}>GlowScript (VPython 웹 버전)</td></tr>
            <tr><td style={tdLabelStyle}>AI 코드 생성</td><td style={tdStyle}>Claude Haiku — 빠른 응답</td></tr>
            <tr><td style={tdLabelStyle}>AI 평가</td><td style={tdStyle}>Claude Sonnet — 정밀 채점</td></tr>
            <tr><td style={tdLabelStyle}>실시간 통신</td><td style={tdStyle}>Socket.io — 챌린지 전송, 힌트, 채팅</td></tr>
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function CurriculumSection() {
  return (
    <div>
      <SectionTitle>커리큘럼 아크 (5세션)</SectionTitle>
      <Paragraph>
        5세션에 걸쳐 컴퓨팅 사고력의 핵심 요소를 순차적으로 학습합니다.
        Session 1과 5에서 동일한 챌린지를 풀어 성장을 측정합니다.
      </Paragraph>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SessionCard
          num={1}
          title="문제 정의"
          status="구현 완료"
          ct="분해 · 패턴인식 · 추상화"
          desc="자연어 프롬프트로 3D 장면 만들기. '정확하게 말하기'의 중요성을 체험합니다."
          detail="종이 게임(아날로그) → 프롬프트 배틀(디지털) → 회고"
          time="100분"
        />
        <SessionCard
          num={2}
          title="코드 해독"
          status="기획 중"
          ct="패턴인식"
          desc="Session 1에서 AI가 생성한 코드를 역분석하여 프로그래밍 구조를 발견합니다."
          time="50분"
        />
        <SessionCard
          num={3}
          title="직접 코딩"
          status="기획 중"
          ct="알고리즘"
          desc="VPython 코드를 직접 수정하며 프로그래밍 기본 문법을 학습합니다."
          time="50분"
        />
        <SessionCard
          num={4}
          title="창작 프로젝트"
          status="기획 중"
          ct="전체 통합"
          desc="팀별 자유 주제로 3D 장면을 설계하고 구현합니다."
          time="100분"
        />
        <SessionCard
          num={5}
          title="성장 측정"
          status="기획 중"
          ct="분해 · 패턴인식 · 추상화"
          desc="Session 1과 동일 챌린지를 다시 풀어 프롬프트 품질 성장을 비교합니다."
          time="50분"
        />
      </div>
    </div>
  )
}

function HowtoSection() {
  return (
    <div>
      <SectionTitle>수업 진행 방법</SectionTitle>

      <SubTitle>1단계: 세션 생성</SubTitle>
      <Card>
        <ol style={listStyle}>
          <li><code style={codeStyle}>/teacher</code> 경로로 접속합니다.</li>
          <li>Anthropic API 키를 입력합니다. (수업 중 AI 기능에 필요)</li>
          <li>교사 코드(간단한 암호)를 설정합니다.</li>
          <li>"세션 시작" 버튼을 누르면 수업 세션이 생성됩니다.</li>
        </ol>
      </Card>

      <SubTitle>2단계: 학생 접속</SubTitle>
      <Card>
        <ol style={listStyle}>
          <li>"접속 안내" 탭에 표시된 URL을 칠판에 적거나 공유합니다.</li>
          <li>학생들은 해당 URL에 접속한 후 교사 코드를 입력합니다.</li>
          <li>팀원 이름(2명)을 입력하면 자동으로 팀이 배정됩니다.</li>
          <li>팀 이름과 색상은 자동 생성됩니다. (예: "용감한 펭귄")</li>
        </ol>
        <InfoBox>
          15팀을 초과하면 관람 모드로 자동 전환됩니다.
          기기가 부족한 경우 한 팀이 1대의 기기로 진행할 수 있습니다.
        </InfoBox>
      </Card>

      <SubTitle>3단계: 챌린지 진행</SubTitle>
      <Card>
        <ol style={listStyle}>
          <li>"수업 진행" 탭으로 이동합니다.</li>
          <li>왼쪽 사이드바에서 챌린지를 선택하고 "시작" 버튼을 누릅니다.</li>
          <li>학생 화면에 목표 장면이 표시됩니다.</li>
          <li>학생들이 프롬프트를 입력하면 AI가 코드를 생성하고 3D로 렌더링합니다.</li>
          <li>AI가 목표 장면과 비교하여 점수를 매깁니다. (100점 만점)</li>
          <li>학생은 여러 번 재시도할 수 있습니다.</li>
        </ol>
      </Card>

      <SubTitle>4단계: 비교 및 회고</SubTitle>
      <Card>
        <ol style={listStyle}>
          <li>대시보드에서 팀 카드를 클릭하면 해당 팀의 프롬프트를 볼 수 있습니다.</li>
          <li>두 팀의 카드를 선택하면 프롬프트를 나란히 비교할 수 있습니다.</li>
          <li>"결과 공개" 버튼으로 전체 순위를 공개합니다.</li>
          <li>팀 채팅 모니터링으로 학생들의 대화를 실시간 확인합니다.</li>
        </ol>
      </Card>

      <SubTitle>교사 대시보드 기능 요약</SubTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <FeatureCard icon="🎮" title="데모 모드" desc="교사가 직접 프롬프트를 입력하여 시연 (실패 쇼에 활용)" />
        <FeatureCard icon="💬" title="채팅 모니터링" desc="모든 팀의 채팅을 실시간으로 확인" />
        <FeatureCard icon="🔍" title="프롬프트 비교" desc="두 팀의 프롬프트를 나란히 비교" />
        <FeatureCard icon="📊" title="CSV 내보내기" desc="팀별 점수와 프롬프트를 CSV로 다운로드" />
        <FeatureCard icon="💡" title="힌트 전송" desc="막히는 팀에게 실시간으로 힌트 전송" />
        <FeatureCard icon="🏆" title="결과 공개" desc="라운드 종료 후 전체 순위를 일괄 공개" />
      </div>
    </div>
  )
}

function ChallengesSection() {
  const challenges = [
    { emoji: '🔴', title: '빨간 구', level: 1, ct: '추상화', desc: '단일 객체의 속성(종류, 색상, 위치)을 정확히 묘사' },
    { emoji: '📦', title: '파란 상자', level: 1, ct: '추상화', desc: '정육면체의 크기와 위치를 묘사' },
    { emoji: '🌿', title: '초록 원기둥', level: 1, ct: '추상화', desc: '원기둥의 방향(축)과 굵기를 묘사' },
    { emoji: '🚦', title: '이상한 신호등', level: 2, ct: '분해', desc: '여러 부품의 순서와 색상을 정확히 분해하여 설명' },
    { emoji: '⛄', title: '눈사람', level: 2, ct: '분해', desc: '두 구의 크기 비율과 상대적 위치 관계' },
    { emoji: '🏠', title: '집', level: 2, ct: '분해', desc: '벽과 지붕이라는 서로 다른 도형의 조합' },
    { emoji: '🌍', title: '지구와 달', level: 2, ct: '추상화', desc: '두 구의 크기 비율과 거리 관계' },
    { emoji: '🌸', title: '꽃', level: 2, ct: '패턴인식', desc: '꽃잎 6개의 원형 배치 — 60도 간격 패턴' },
    { emoji: '🌲', title: '숲', level: 3, ct: '추상화·알고리즘', desc: '나무를 먼저 정의(추상화)한 뒤 반복 배치' },
    { emoji: '🌈', title: '무지개 줄', level: 3, ct: '패턴인식·알고리즘', desc: '7개 구의 색상 순서와 등간격 배치' },
    { emoji: '🎯', title: '과녁', level: 3, ct: '패턴인식', desc: '동심원 4개의 크기 감소 패턴과 색상 순서' },
    { emoji: '🧱', title: '벽돌 벽', level: 3, ct: '알고리즘·분해', desc: '5×3 격자 — 이중 반복 패턴' },
  ]

  return (
    <div>
      <SectionTitle>챌린지 구성</SectionTitle>
      <Paragraph>
        총 12개의 챌린지가 난이도별로 구성되어 있습니다.
        Session 1 수업에서는 <Highlight>이상한 신호등 → 꽃 → 숲</Highlight> 순서로 진행하는 것을 권장합니다.
      </Paragraph>

      {[1, 2, 3].map(level => (
        <div key={level} style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px',
          }}>
            <span style={{
              padding: '2px 10px',
              borderRadius: '20px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: level === 1 ? '#22c55e22' : level === 2 ? '#f59e0b22' : '#ef444422',
              color: level === 1 ? 'var(--success)' : level === 2 ? 'var(--warning)' : 'var(--danger)',
              border: `1px solid ${level === 1 ? 'var(--success)' : level === 2 ? 'var(--warning)' : 'var(--danger)'}`,
            }}>
              Level {level}
            </span>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {level === 1 ? '단일 객체' : level === 2 ? '2~3개 조합' : '반복 패턴'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {challenges.filter(c => c.level === level).map(c => (
              <div key={c.title} style={{
                display: 'grid',
                gridTemplateColumns: '140px 100px 1fr',
                gap: '12px',
                alignItems: 'center',
                padding: '12px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{c.emoji} {c.title}</span>
                <span style={{
                  fontSize: '0.75rem',
                  color: 'var(--accent-hover)',
                  background: 'var(--bg)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  textAlign: 'center',
                }}>{c.ct}</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{c.desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Card title="Session 1 권장 순서" accent>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {[
            { emoji: '🚦', name: '이상한 신호등', ct: '분해', time: '17분' },
            { emoji: '🌸', name: '꽃', ct: '패턴인식', time: '16분' },
            { emoji: '🌲', name: '숲', ct: '추상화', time: '14분' },
          ].map((c, i) => (
            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '1.25rem' }}>→</span>}
              <div style={{
                padding: '8px 14px',
                background: 'var(--bg)',
                borderRadius: 'var(--radius)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem' }}>{c.emoji}</div>
                <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{c.name}</div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--accent-hover)' }}>{c.ct} · {c.time}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function TipsSection() {
  return (
    <div>
      <SectionTitle>운영 팁</SectionTitle>

      <SubTitle>순회 우선순위</SubTitle>
      <Card>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>챌린지</th>
              <th style={thStyle}>먼저 방문할 팀</th>
              <th style={thStyle}>이유</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={tdStyle}>신호등</td><td style={tdStyle}>"신호등 만들어줘" 단순 제출</td><td style={tdStyle}>분해 개념 유도 필요</td></tr>
            <tr><td style={tdStyle}>꽃</td><td style={tdStyle}>자연어로만 위치 표현</td><td style={tdStyle}>패턴/각도 개념 유도</td></tr>
            <tr><td style={tdStyle}>숲</td><td style={tdStyle}>나무를 각각 따로 설명</td><td style={tdStyle}>추상화 유도 필요</td></tr>
          </tbody>
        </table>
      </Card>

      <SubTitle>즉각 피드백 원칙</SubTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <TipCard icon="📉" title="낮은 점수" feedback="'뭐가 부족했을 것 같아요?' — 원인을 스스로 분석하게 합니다." />
        <TipCard icon="✨" title="좋은 프롬프트 발견" feedback="전체에 공유하고 '어떻게 이렇게 썼어요?'라고 질문합니다." />
        <TipCard icon="🤖" title="AI 결과가 이상할 때" feedback="'AI가 왜 이렇게 만들었을까요?' — AI 탓이 아니라 프롬프트 분석으로 유도합니다." />
        <TipCard icon="😶" title="막히는 팀" feedback="힌트 버튼을 활성화하고 조용히 방문하여 1:1 질문합니다." />
        <TipCard icon="⏸️" title="제출 전 개입 금지" feedback="먼저 제출하게 한 후 피드백합니다. 실패 경험이 학습입니다." />
      </div>

      <SubTitle>학생 유형별 대응</SubTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
        <Card>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '6px' }}>
            "AI가 다 해주면 되지 않나요?"
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            → "맞아요. 근데 AI한테 '더 좋게 해줘'라고 하면 AI가 알까요?
            뭘 어떻게 더 좋게 해야 하는지 정확히 말해야 해요."
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '6px' }}>
            "어차피 ChatGPT 쓰면 다 나오는데"
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            → "챌린지 1번에서 '신호등 만들어줘' 했을 때 기억나요?
            AI가 신호등을 알면서도 우리가 원하는 신호등을 못 만들었잖아요."
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '6px' }}>
            말이 없는 팀
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            → 팀원 한 명을 지정해서 1:1 질문: "○○아, 이 프롬프트에서 빠진 게 뭔 것 같아?"
          </div>
        </Card>
      </div>

      <SubTitle>WiFi/기기 트러블슈팅</SubTitle>
      <Card>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>상황</th>
              <th style={thStyle}>대응</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={tdStyle}>학교 WiFi 차단</td><td style={tdStyle}>교사 핫스팟으로 전환</td></tr>
            <tr><td style={tdStyle}>QR 스캔 불가</td><td style={tdStyle}>칠판에 IP 직접 기재</td></tr>
            <tr><td style={tdStyle}>학생 기기 없음</td><td style={tdStyle}>팀 1대로 통합 진행</td></tr>
            <tr><td style={tdStyle}>15팀 초과</td><td style={tdStyle}>자동으로 관람 모드 전환</td></tr>
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function FAQSection() {
  const faqs = [
    {
      q: 'API 키는 어디서 받나요?',
      a: 'Anthropic 콘솔(console.anthropic.com)에서 API 키를 생성할 수 있습니다. 수업에서 AI 코드 생성과 평가 기능을 사용하려면 반드시 필요합니다.',
    },
    {
      q: 'API 비용은 얼마나 드나요?',
      a: '1회 수업(15팀 × 평균 10회 제출) 기준 약 $1~2 정도입니다. Haiku(코드 생성)는 매우 저렴하고, Sonnet(평가)이 비용의 대부분을 차지합니다.',
    },
    {
      q: '인터넷 없이 사용할 수 있나요?',
      a: '서버는 교사 노트북에서 로컬로 실행되므로 학교 내부 네트워크만 있으면 됩니다. 단, AI 기능(프롬프트 → 코드 생성, 평가)은 Anthropic API 호출이 필요하므로 인터넷 연결이 필요합니다.',
    },
    {
      q: '학생이 부적절한 프롬프트를 입력하면?',
      a: 'AI 모델에 시스템 프롬프트가 설정되어 있어 VPython 3D 객체 코드만 생성합니다. 채팅 모니터링으로 실시간 확인도 가능합니다.',
    },
    {
      q: '팀을 미리 지정할 수 있나요?',
      a: '현재는 학생이 직접 팀원 이름을 입력하여 등록하는 방식입니다. 팀 이름은 자동 생성되지만, 같은 교사 코드를 입력하면 같은 세션에 접속합니다.',
    },
    {
      q: '수업 데이터는 어디에 저장되나요?',
      a: '교사 노트북의 SQLite 데이터베이스에 로컬 저장됩니다. 팀별 프롬프트, 점수, 시도 횟수가 모두 기록되며 CSV로 내보낼 수 있습니다.',
    },
    {
      q: '한 세션에서 여러 챌린지를 진행할 수 있나요?',
      a: '네. 사이드바에서 다른 챌린지를 선택하고 "시작" 버튼을 누르면 모든 팀에 새 챌린지가 전송됩니다.',
    },
    {
      q: 'Session 2~5도 사용할 수 있나요?',
      a: '현재 Session 1(프롬프트 배틀)이 구현되어 있습니다. Session 2~5는 기획 단계이며, 향후 업데이트될 예정입니다.',
    },
  ]

  return (
    <div>
      <SectionTitle>자주 묻는 질문 (FAQ)</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {faqs.map((f, i) => (
          <FAQItem key={i} q={f.q} a={f.a} />
        ))}
      </div>
    </div>
  )
}

/* ─── 공용 UI 컴포넌트 ───────────────────────────────── */

function SectionTitle({ children }) {
  return (
    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
      {children}
    </h1>
  )
}

function SubTitle({ children }) {
  return <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '12px', marginTop: '28px' }}>{children}</h2>
}

function Paragraph({ children }) {
  return <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--text)', marginBottom: '20px' }}>{children}</p>
}

function Highlight({ children }) {
  return <span style={{ color: 'var(--accent-hover)', fontWeight: 600 }}>{children}</span>
}

function Card({ children, title, accent }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${accent ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      marginBottom: '16px',
    }}>
      {title && <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: '12px' }}>{title}</div>}
      {children}
    </div>
  )
}

function InfoBox({ children }) {
  return (
    <div style={{
      marginTop: '12px',
      padding: '10px 14px',
      background: 'var(--bg)',
      borderLeft: '3px solid var(--warning)',
      borderRadius: '0 var(--radius) var(--radius) 0',
      fontSize: '0.8125rem',
      color: 'var(--text-muted)',
    }}>
      {children}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '16px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function SessionCard({ num, title, status, ct, desc, detail, time }) {
  const isReady = status === '구현 완료'
  return (
    <div style={{
      display: 'flex',
      gap: '16px',
      padding: '16px 20px',
      background: 'var(--surface)',
      border: `1px solid ${isReady ? 'var(--success)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
    }}>
      <div style={{
        width: '44px', height: '44px',
        borderRadius: '50%',
        background: isReady ? '#22c55e22' : 'var(--bg)',
        border: `2px solid ${isReady ? 'var(--success)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: '1.125rem', flexShrink: 0,
        color: isReady ? 'var(--success)' : 'var(--text-muted)',
      }}>
        {num}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>{title}</span>
          <span style={{
            padding: '1px 8px',
            borderRadius: '20px',
            fontSize: '0.6875rem',
            fontWeight: 600,
            background: isReady ? '#22c55e22' : 'var(--bg)',
            color: isReady ? 'var(--success)' : 'var(--text-muted)',
            border: `1px solid ${isReady ? 'var(--success)' : 'var(--border)'}`,
          }}>
            {status}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{time}</span>
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--accent-hover)', marginBottom: '4px' }}>{ct}</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
        {detail && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', fontStyle: 'italic' }}>{detail}</div>}
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={{
      padding: '16px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
    }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{desc}</div>
    </div>
  )
}

function TipCard({ icon, title, feedback }) {
  return (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'flex-start',
      padding: '14px 16px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
    }}>
      <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{feedback}</div>
      </div>
    </div>
  )
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '14px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--text)',
          fontWeight: 600,
          fontSize: '0.875rem',
          textAlign: 'left',
        }}
      >
        <span>{q}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div style={{
          padding: '0 16px 14px',
          fontSize: '0.8125rem',
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}>
          {a}
        </div>
      )}
    </div>
  )
}

/* ─── 스타일 상수 ─────────────────────────────────────── */

const listStyle = {
  paddingLeft: '20px',
  fontSize: '0.875rem',
  lineHeight: 2,
  color: 'var(--text)',
}

const codeStyle = {
  padding: '2px 6px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  fontSize: '0.8125rem',
  fontFamily: 'monospace',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.8125rem',
}

const thStyle = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-muted)',
  fontWeight: 600,
  fontSize: '0.75rem',
}

const tdStyle = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text)',
  verticalAlign: 'top',
}

const tdLabelStyle = {
  ...tdStyle,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  color: 'var(--text-muted)',
  width: '120px',
}
