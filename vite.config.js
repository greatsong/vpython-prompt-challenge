import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'crypto'
import fs from 'fs'
import { join } from 'path'

// 3D 라이브러리(public/lib/glowscript/*) 내용 해시. 서버가 이 경로를 1년 immutable 캐시로 주므로
// 장면 iframe의 라이브러리 URL에 ?v=<해시>를 붙여, 파일이 바뀌면 브라우저가 새로 받게 한다.
function glowscriptLibVersion() {
  try {
    const dir = join(process.cwd(), 'public', 'lib', 'glowscript')
    const hash = createHash('sha1')
    for (const name of fs.readdirSync(dir).sort()) {
      hash.update(name)
      hash.update(fs.readFileSync(join(dir, name)))
    }
    return hash.digest('hex').slice(0, 10)
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __GLOWSCRIPT_LIB_VERSION__: JSON.stringify(glowscriptLibVersion()),
  },
  server: {
    port: 4008,
    proxy: {
      '/api': {
        target: 'http://localhost:4009',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4009',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
