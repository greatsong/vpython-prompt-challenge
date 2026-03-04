import { useState } from 'react'
import { BATTLE_CHALLENGES } from '../../data/challenges-battle.js'

const sections = [
  { id: 'overview', icon: '🌍', label: '서비스 소개' },
  { id: 'howto', icon: '🚀', label: '수업 진행 방법' },
  { id: 'challenges', icon: '🎯', label: '챌린지 구성' },
  { id: 'tips', icon: '💡', label: '운영 팁' },
  { id: 'faq', icon: '💬', label: 'FAQ' },
]

export default function TeacherGuide() {
  const [activeSection, setActiveSection] = useState('overview')

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 52px)', background: '#f8fafc' }}>
      {/* 사이드 내비게이션 */}
      <nav style={{
        width: '210px',
        background: 'white',
        borderRight: '1px solid #e2e8f0',
        padding: '24px 0',
        flexShrink: 0,
        overflowY: 'auto',
      }}>
        <div style={{ padding: '0 20px 20px', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          교사 안내서
        </div>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '11px 20px',
              border: 'none',
              background: activeSection === s.id ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'transparent',
              color: activeSection === s.id ? 'white' : '#64748b',
              fontWeight: activeSection === s.id ? 600 : 500,
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
      <main style={{
        flex: 1,
        overflowY: 'auto',
        padding: '36px 48px',
        maxWidth: '900px',
      }}>
        {activeSection === 'overview' && <OverviewSection />}
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
      {/* 히어로 배너 */}
      <div style={{
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
        borderRadius: '16px',
        padding: '36px 32px',
        marginBottom: '28px',
        color: 'white',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🌍</div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '8px' }}>말로 만드는 세계</h1>
        <p style={{ fontSize: '1rem', opacity: 0.9, lineHeight: 1.6 }}>
          코드 없이 자연어 프롬프트로 3D 장면을 만드는 VPython 챌린지
        </p>
        <p style={{ fontSize: '0.875rem', opacity: 0.7, marginTop: '6px' }}>
          고등학교 1학년 정보 교과 · 2인 1팀 · 팀 대항전
        </p>
      </div>

      {/* 핵심 포인트 3개 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '28px' }}>
        <PointCard emoji="🔄" color="#f59e0b" title="Reverse Engineering"
          desc="결과물을 보고 역으로 문제를 정의하는 교육 설계" />
        <PointCard emoji="🧩" color="#22c55e" title="컴퓨팅 사고력"
          desc="분해, 패턴인식, 추상화를 자연어 활동으로 체득" />
        <PointCard emoji="🎯" color="#6366f1" title="문제 정의 능력"
          desc="AI 시대에 가장 중요한 '정확히 말하기' 훈련" />
      </div>

      {/* 수업 구성 */}
      <SectionTitle>수업 구성</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '28px' }}>
        <StatCard emoji="👥" label="대상" value="고1 정보" />
        <StatCard emoji="🤝" label="팀 구성" value="2인 1팀" />
        <StatCard emoji="📱" label="최대 팀 수" value="15팀" />
        <StatCard emoji="⏱️" label="수업 시간" value="100분" />
      </div>

      {/* 기술 구성 */}
      <SectionTitle>작동 원리</SectionTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <TechItem icon="🎨" label="3D 렌더링" value="GlowScript (VPython 웹 버전)" />
          <TechItem icon="🤖" label="AI 코드 생성" value="Claude Haiku 4.5" />
          <TechItem icon="📊" label="AI 평가" value="Claude Sonnet 4.6" />
          <TechItem icon="📡" label="실시간 통신" value="Socket.io" />
        </div>
      </Card>

      {/* 수업 흐름 다이어그램 */}
      <SectionTitle>수업 흐름</SectionTitle>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { emoji: '📝', label: '학생이\n프롬프트 작성' },
            { emoji: '🤖', label: 'AI가\n코드 생성' },
            { emoji: '🎨', label: '3D 장면\n렌더링' },
            { emoji: '📊', label: 'AI가\n점수 평가' },
            { emoji: '🔄', label: '피드백 후\n재도전' },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {i > 0 && <span style={{ fontSize: '1.25rem', color: '#cbd5e1' }}>→</span>}
              <div style={{
                textAlign: 'center',
                padding: '14px 16px',
                background: '#f8fafc',
                borderRadius: '12px',
                minWidth: '100px',
              }}>
                <div style={{ fontSize: '1.75rem', marginBottom: '6px' }}>{step.emoji}</div>
                <div style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 500, whiteSpace: 'pre-line', lineHeight: 1.4 }}>{step.label}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function HowtoSection() {
  return (
    <div>
      <SectionTitle>수업 진행 방법</SectionTitle>

      <StepCard num={1} color="#6366f1" title="세션 생성">
        <ol style={listStyle}>
          <li><code style={codeStyle}>/teacher</code> 경로로 접속합니다.</li>
          <li>Anthropic API 키를 입력합니다. (수업 중 AI 기능에 필요)</li>
          <li>교사 코드(간단한 암호)를 설정합니다.</li>
          <li>"세션 시작" 버튼을 누르면 수업 세션이 생성됩니다.</li>
        </ol>
      </StepCard>

      <StepCard num={2} color="#8b5cf6" title="학생 접속">
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
      </StepCard>

      <StepCard num={3} color="#a78bfa" title="챌린지 진행">
        <ol style={listStyle}>
          <li>"수업 진행" 탭으로 이동합니다.</li>
          <li>왼쪽 사이드바에서 챌린지를 선택하고 "시작" 버튼을 누릅니다.</li>
          <li>학생 화면에 목표 장면이 표시됩니다.</li>
          <li>학생들이 프롬프트를 입력하면 AI가 코드를 생성하고 3D로 렌더링합니다.</li>
          <li>AI가 목표 장면과 비교하여 점수를 매깁니다. (100점 만점)</li>
          <li>학생은 여러 번 재시도할 수 있습니다.</li>
        </ol>
      </StepCard>

      <StepCard num={4} color="#c084fc" title="비교 및 회고">
        <ol style={listStyle}>
          <li>대시보드에서 팀 카드를 클릭하면 해당 팀의 프롬프트를 볼 수 있습니다.</li>
          <li>두 팀의 카드를 선택하면 프롬프트를 나란히 비교할 수 있습니다.</li>
          <li>"결과 공개" 버튼으로 전체 순위를 공개합니다.</li>
          <li>팀 채팅 모니터링으로 학생들의 대화를 실시간 확인합니다.</li>
        </ol>
      </StepCard>

      <SectionTitle>교사 대시보드 기능</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <FeatureCard icon="🎮" color="#f59e0b" title="데모 모드" desc="교사가 직접 프롬프트를 입력하여 시연" />
        <FeatureCard icon="💬" color="#22c55e" title="채팅 모니터링" desc="모든 팀의 채팅을 실시간으로 확인" />
        <FeatureCard icon="🔍" color="#3b82f6" title="프롬프트 비교" desc="두 팀의 프롬프트를 나란히 비교" />
        <FeatureCard icon="📊" color="#8b5cf6" title="CSV 내보내기" desc="팀별 점수와 프롬프트를 다운로드" />
        <FeatureCard icon="💡" color="#f97316" title="힌트 전송" desc="막히는 팀에게 실시간으로 힌트 전송" />
        <FeatureCard icon="🏆" color="#ef4444" title="결과 공개" desc="라운드 종료 후 전체 순위 일괄 공개" />
      </div>
    </div>
  )
}

function ChallengesSection() {
  const levelMeta = {
    1: { label: 'Level 1 — 정밀 묘사', color: '#22c55e', bg: '#f0fdf4', desc: '도형 하나의 형태, 방향, 비율을 정밀하게 묘사' },
    2: { label: 'Level 2 — 분해와 재조합', color: '#f59e0b', bg: '#fffbeb', desc: '현실 사물을 기본 도형으로 해체하기' },
    3: { label: 'Level 3 — 반복 패턴', color: '#ef4444', bg: '#fef2f2', desc: '하나를 설명하고, 규칙을 말하라' },
  }

  return (
    <div>
      <SectionTitle>챌린지 구성</SectionTitle>
      <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: '#475569', marginBottom: '24px' }}>
        총 <strong>{BATTLE_CHALLENGES.length}개</strong>의 챌린지가 난이도별로 구성되어 있습니다.
        교사가 사이드바에서 원하는 챌린지를 골라 수업 중 실시간으로 전송합니다.
      </p>

      {[1, 2, 3].map(level => {
        const meta = levelMeta[level]
        const challenges = BATTLE_CHALLENGES.filter(c => c.level === level)
        return (
          <div key={level} style={{ marginBottom: '24px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px',
              padding: '10px 16px',
              background: meta.bg,
              borderRadius: '10px',
              border: `1px solid ${meta.color}33`,
            }}>
              <span style={{
                padding: '3px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
                background: meta.color, color: 'white',
              }}>
                Lv.{level}
              </span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: meta.color }}>{meta.label.split(' — ')[1]}</span>
              <span style={{ fontSize: '0.8125rem', color: '#94a3b8', marginLeft: '4px' }}>— {meta.desc}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {challenges.map(c => (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '14px 16px',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  transition: 'box-shadow 0.15s',
                }}>
                  <span style={{ fontSize: '1.5rem' }}>{c.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b' }}>{c.title}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>
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
        <PriorityCard emoji="🌀" level="Level 1 — 정밀 묘사" team='"포탈 만들어줘" 단순 제출 팀' why="도형의 방향·비율 묘사 유도" color="#22c55e" />
        <PriorityCard emoji="🍄" level="Level 2 — 분해" team="부품 구분 없이 통째로 설명하는 팀" why="줄기/갓 등 부품별 분해 유도" color="#f59e0b" />
        <PriorityCard emoji="🪜" level="Level 3 — 패턴" team="계단을 하나씩 따로 설명하는 팀" why="반복 규칙으로 압축 유도" color="#ef4444" />
      </div>

      <SubTitle>피드백 원칙</SubTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '28px' }}>
        <TipCard emoji="📉" title="낮은 점수" feedback="'뭐가 부족했을 것 같아요?' — 원인을 스스로 분석하게 합니다." bg="#fef2f2" />
        <TipCard emoji="✨" title="좋은 프롬프트" feedback="전체에 공유하고 '어떻게 이렇게 썼어요?'라고 질문합니다." bg="#f0fdf4" />
        <TipCard emoji="🤖" title="AI 결과 이상" feedback="'AI가 왜 이렇게 만들었을까요?' — 프롬프트 분석으로 유도합니다." bg="#eff6ff" />
        <TipCard emoji="⏸️" title="제출 전 개입 금지" feedback="먼저 제출하게 한 후 피드백합니다. 실패 경험이 학습입니다." bg="#fffbeb" />
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
          <TroubleshootItem icon="📱" problem="QR 스캔 불가" solution="칠판에 IP 직접 기재" />
          <TroubleshootItem icon="🔋" problem="학생 기기 없음" solution="팀 1대로 통합 진행" />
          <TroubleshootItem icon="👥" problem="15팀 초과" solution="자동으로 관람 모드 전환" />
        </div>
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
      a: '1회 수업(15팀 × 평균 10회 제출) 기준 약 $1~2 정도입니다. Haiku 4.5(코드 생성)는 매우 저렴하고, Sonnet 4.6(평가)이 비용의 대부분을 차지합니다.',
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
      a: '서버의 SQLite 데이터베이스에 저장됩니다. 팀별 프롬프트, 점수, 시도 횟수가 모두 기록되며 CSV로 내보낼 수 있습니다.',
    },
    {
      q: '한 세션에서 여러 챌린지를 진행할 수 있나요?',
      a: '네. 사이드바에서 다른 챌린지를 선택하고 "시작" 버튼을 누르면 모든 팀에 새 챌린지가 전송됩니다.',
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

function SectionTitle({ children }) {
  return (
    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px', marginTop: '4px' }}>
      {children}
    </h2>
  )
}

function SubTitle({ children }) {
  return <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#334155', marginBottom: '12px', marginTop: '8px' }}>{children}</h3>
}

function Card({ children }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '14px',
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
      background: '#fffbeb',
      borderLeft: '3px solid #f59e0b',
      borderRadius: '0 8px 8px 0',
      fontSize: '0.8125rem',
      color: '#92400e',
    }}>
      {children}
    </div>
  )
}

function PointCard({ emoji, color, title, desc }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '14px',
      padding: '20px',
      textAlign: 'center',
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{emoji}</div>
      <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1e293b', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.5 }}>{desc}</div>
    </div>
  )
}

function StatCard({ emoji, label, value }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '16px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{emoji}</div>
      <div style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{value}</div>
    </div>
  )
}

function TechItem({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px' }}>
      <span style={{ fontSize: '1.25rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: '0.875rem', color: '#334155', fontWeight: 500 }}>{value}</div>
      </div>
    </div>
  )
}

function StepCard({ num, color, title, children }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '14px',
      padding: '20px 24px',
      marginBottom: '14px',
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: color, color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '0.875rem', flexShrink: 0,
        }}>
          {num}
        </div>
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#1e293b' }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

function FeatureCard({ icon, color, title, desc }) {
  return (
    <div style={{
      padding: '18px',
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      textAlign: 'center',
    }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '12px',
        background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 10px', fontSize: '1.25rem',
      }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>{desc}</div>
    </div>
  )
}

function PriorityCard({ emoji, level, team, why, color }) {
  return (
    <div style={{
      background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px',
      padding: '16px', borderTop: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{emoji}</div>
      <div style={{ fontSize: '0.75rem', color, fontWeight: 700, marginBottom: '4px' }}>{level}</div>
      <div style={{ fontSize: '0.8125rem', color: '#334155', fontWeight: 600, marginBottom: '4px' }}>{team}</div>
      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{why}</div>
    </div>
  )
}

function TipCard({ emoji, title, feedback, bg }) {
  return (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'flex-start',
      padding: '14px 16px',
      background: bg || 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
    }}>
      <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{emoji}</span>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.5 }}>{feedback}</div>
      </div>
    </div>
  )
}

function ResponseCard({ question, answer }) {
  return (
    <div style={{
      background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px',
      padding: '16px 20px',
    }}>
      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#6366f1', marginBottom: '6px' }}>{question}</div>
      <div style={{ fontSize: '0.8125rem', color: '#475569', lineHeight: 1.6 }}>→ {answer}</div>
    </div>
  )
}

function TroubleshootItem({ icon, problem, solution }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px' }}>
      <span style={{ fontSize: '1.25rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#ef4444' }}>{problem}</div>
        <div style={{ fontSize: '0.8125rem', color: '#475569' }}>{solution}</div>
      </div>
    </div>
  )
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
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
          color: '#1e293b',
          fontWeight: 600,
          fontSize: '0.9375rem',
          textAlign: 'left',
        }}
      >
        <span>{q}</span>
        <span style={{
          fontSize: '0.75rem', color: '#94a3b8',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
        }}>▼</span>
      </button>
      {open && (
        <div style={{
          padding: '0 20px 16px',
          fontSize: '0.875rem',
          color: '#64748b',
          lineHeight: 1.7,
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
  color: '#334155',
}

const codeStyle = {
  padding: '2px 8px',
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  fontSize: '0.8125rem',
  fontFamily: 'monospace',
  color: '#6366f1',
}
