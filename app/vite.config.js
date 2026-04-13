import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.CAPACITOR_BUILD ? './' : '/prospect-tracker/',
  server: {
    port: 5176,
    proxy: {
      '/s3-proxy': {
        target: 'https://s3.us-east-005.backblazeb2.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/s3-proxy/, ''),
      },
    },
  },
})
