import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'chrome134',
    outDir: 'dist',
    emptyOutDir: true,
  },
})
