import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// All /api/* requests from the browser go to the Express backend (port 3001).
// The Express server then forwards them to Ollama, so the browser never
// talks to Ollama directly and CORS is never an issue.

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
