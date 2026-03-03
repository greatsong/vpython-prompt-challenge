#!/bin/bash
# VPython 프롬프트 챌린지 — 인터넷 도메인 접속 모드
# 실행하면 https://xxxx.trycloudflare.com 주소가 생성됩니다

cd "$(dirname "$0")"

echo "======================================"
echo "  🌐 VPython 챌린지 — 웹 접속 모드"
echo "======================================"

# .env 확인
if [ ! -f ".env" ]; then
  echo "⚠️  .env 파일 없음. .env.example을 복사하세요."
  exit 1
fi

# 의존성 확인
if [ ! -d "node_modules" ]; then
  echo "📦 의존성 설치 중..."
  npm install
fi

# React 앱 빌드
echo ""
echo "🔨 앱 빌드 중..."
npm run build

# 서버 백그라운드 시작
echo ""
echo "🚀 서버 시작 중 (포트 4009)..."
node server.js &
SERVER_PID=$!
sleep 2

# Cloudflare 터널 시작 (URL이 터미널에 출력됨)
echo ""
echo "🌐 인터넷 도메인 생성 중..."
echo "   아래 https:// 주소를 학생들에게 공유하세요"
echo "   (학생들은 이 주소로 접속 후 팀 이름 클릭)"
echo ""

cloudflared tunnel --url http://localhost:4009

# 터널 종료 시 서버도 종료
kill $SERVER_PID 2>/dev/null
echo ""
echo "서버 종료됨."
