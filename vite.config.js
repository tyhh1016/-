import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages 部署路徑：https://tyhh1016.github.io/-/
  // base 必須與 GitHub repository 名稱完全一致（含前後斜線）
  base: '/-/',
})
