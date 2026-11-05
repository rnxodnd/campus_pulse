import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // /api 요청은 로컬 백엔드(Cloudflare Workers, wrangler dev)로 넘김 → CORS 걱정 없음
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
