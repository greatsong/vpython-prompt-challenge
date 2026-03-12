import { useNavigate } from 'react-router-dom'

export default function PrivacyPage() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      padding: '24px',
      display: 'flex',
      justifyContent: 'center',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '680px',
        animation: 'fadeIn 0.4s ease-out',
      }}>
        {/* 상단 네비게이션 */}
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '20px',
            padding: '4px 0',
          }}
        >
          &larr; 뒤로가기
        </button>

        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
        }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '4px' }}>
            개인정보 처리방침
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '28px' }}>
            최종 수정일: 2026-03-12
          </p>

          <Section title="1. 수집 목적">
            <p>학생 식별, 팀 구성, 학습 진행 추적, AI 채점을 위해 개인정보를 수집합니다.</p>
          </Section>

          <Section title="2. 수집 항목">
            <ul style={ulStyle}>
              <li>학번, 이름</li>
              <li>프롬프트 (학생이 작성한 지시문)</li>
              <li>생성 코드 (AI가 생성한 VPython 코드)</li>
              <li>CT(컴퓨팅 사고력) 점수</li>
              <li>AI 평가 결과</li>
            </ul>
          </Section>

          <Section title="3. 보유 및 이용 기간">
            <p>해당 수업 종료 후 <strong>학기말에 파기</strong>합니다.</p>
          </Section>

          <Section title="4. AI API 사용 안내">
            <p>
              본 서비스는 Anthropic Claude API를 사용하여 학생이 작성한 프롬프트와 생성된 코드를
              처리합니다.
            </p>
            <div style={infoBoxStyle}>
              <p style={{ fontWeight: 600, marginBottom: '6px' }}>안내 사항</p>
              <ul style={{ ...ulStyle, marginBottom: 0 }}>
                <li>학생의 이름·학번은 AI API로 <strong>전송되지 않습니다.</strong></li>
                <li>프롬프트와 코드는 서비스 운영을 위한 기술적 처리 목적으로만 사용됩니다.</li>
              </ul>
            </div>
          </Section>

          <Section title="5. 개인정보 보호책임자">
            <p><strong>석리송</strong> (당곡고등학교 정보과 교사)</p>
          </Section>

          <Section title="6. 열람 · 삭제 요청" last>
            <p>개인정보의 열람, 정정, 삭제를 원하시면 담당 교사에게 직접 요청해주세요.</p>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, last }) {
  return (
    <div style={{
      marginBottom: last ? 0 : '24px',
      paddingBottom: last ? 0 : '24px',
      borderBottom: last ? 'none' : '1px solid var(--border)',
    }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '10px' }}>{title}</h2>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  )
}

const ulStyle = {
  listStyle: 'disc',
  paddingLeft: '20px',
  marginBottom: '8px',
}

const infoBoxStyle = {
  marginTop: '12px',
  padding: '14px 16px',
  background: 'var(--bg)',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  fontSize: '0.875rem',
}
