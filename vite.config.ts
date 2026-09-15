import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import adminLocalBackend from './admin-local-backend'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), adminLocalBackend()],
})
