import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: process.env.VITE_PUBLIC_BASE || '/',
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) { if (id.replace(/\\/g,'/').includes('/node_modules/livekit-client/')) return 'livekit' },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:18080', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:18080', ws: true, changeOrigin: true },
    },
  },
})
