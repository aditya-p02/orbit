import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/login': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/logout': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/devices': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/alerts': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/whitelist': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/observations': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/heatmap': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8001',
        ws: true,
      },
    },
  },
})