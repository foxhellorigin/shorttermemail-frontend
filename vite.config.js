import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://api.shorttermemail.com',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'https://api.shorttermemail.com',
        changeOrigin: true,
        ws: true
      }
    }
  }
});