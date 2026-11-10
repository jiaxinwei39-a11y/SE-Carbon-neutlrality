import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'

import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'

const app = createApp(App)

// 注意顺序：先装 pinia，再装 router。
// 路由守卫里要用 user store，pinia 没装会直接报 "no active pinia"。
app.use(createPinia())
app.use(router)

// 请求层发现 401 时会派发这个事件，这里统一跳登录并记住原地址（J089）
window.addEventListener('app:unauthorized', () => {
  const current = router.currentRoute.value
  if (current.name === 'login') return
  router.replace({ name: 'login', query: { redirect: current.fullPath } })
})

app.mount('#app')
