import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
