import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const apiTarget = process.env.API_TARGET ?? 'http://127.0.0.1:3004';
export default defineConfig({ plugins: [react()], build: { outDir: 'dist/web' }, server: { port: 5173, strictPort: true, proxy: { '/api': apiTarget, '/health': apiTarget } } });
