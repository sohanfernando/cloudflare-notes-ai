import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@shared': path.resolve(import.meta.dirname, '../shared'),
    },
  },
  server: {
    // In development the API is the Worker started by `npm run dev`.
    proxy: { '/api': 'http://127.0.0.1:8787' },
    // shared/ sits next to frontend/ and is imported by both the app and the Worker.
    fs: { allow: ['..'] },
  },
})
