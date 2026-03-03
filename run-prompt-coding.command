#!/bin/bash
# VPython 프롬프트 챌린지 — 더블클릭으로 실행

cd "$(dirname "$0")"

echo "======================================"
echo "  🧠 VPython 프롬프트 챌린지 시작"
echo "======================================"

# .env 파일 확인
if [ ! -f ".env" ]; then
  echo ""
  echo "⚠️  .env 파일이 없습니다!"
  echo "   .env.example을 .env로 복사하고 API 키를 입력해주세요."
  echo ""
  cp .env.example .env
  echo "   .env 파일이 생성되었습니다. API 키를 입력한 후 다시 실행해주세요."
  open .env
  read -n 1 -s
  exit 1
fi

# 의존성 설치
if [ ! -d "node_modules" ]; then
  echo ""
  echo "📦 의존성 설치 중..."
  npm install
fi

echo ""
echo "🚀 서버 시작 중..."
echo "   교사 화면 → http://localhost:4008/teacher"
echo "   (팀 URL은 교사 화면에서 QR코드로 확인)"
echo ""
echo "종료하려면 이 창을 닫거나 Ctrl+C"
echo ""

npm run dev
