import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The Vite dev server proxies /ollama/* → the configured Ollama URL so the
// browser always calls the same origin (localhost:5173) and CORS never fires.
// The target is read from VITE_OLLAMA_URL at dev-server startup; it can also
// be overridden by the in-app Ollama URL field at runtime via the /ollama path.

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ollamaTarget = env.VITE_OLLAMA_URL || 'http://localhost:11434'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/ollama': {
          target: ollamaTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama/, ''),
        },
      },
    },
  }
})

