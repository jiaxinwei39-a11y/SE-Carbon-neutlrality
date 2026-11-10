import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * 两种构建：
 *   npm run build        → 常规多文件 dist（将来部署到 Nginx 用）
 *   npm run build:single → 单文件 dist/index.html（桌面窗口用）
 *
 * 为什么要单文件：窗口直接用 file:// 打开时，浏览器会以「跨域」为由
 * 拒绝加载 <script type="module">，页面就是白屏。把 JS/CSS 全部内联进
 * index.html，就不存在跨域问题了。
 */
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [vue(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: mode === 'single' ? 'dist-app' : 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // [接后端] 后端起来以后，前端不用改代码，只改这里：
    // proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } }
  },
}))
