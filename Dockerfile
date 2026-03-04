FROM node:20-slim

WORKDIR /app

# 빌드 도구 설치 (better-sqlite3 네이티브 컴파일용)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production=false

COPY . .
RUN npm run build

# 프로덕션 의존성만 재설치
RUN npm prune --production

EXPOSE 4009

ENV NODE_ENV=production
ENV PORT=4009

CMD ["node", "server.js"]
