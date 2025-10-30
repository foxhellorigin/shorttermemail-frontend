import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: './public/index.html',
        arabic: './public/ar.html'
      }
    }
  },
  server: {
    port: 3000,
    host: true
  }
});
