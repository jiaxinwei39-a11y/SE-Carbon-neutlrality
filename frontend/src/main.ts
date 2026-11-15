import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useUserStore } from './stores/user'
import { useToast } from './composables/useToast'
import { isMock, request } from './api/http'
import { setToken } from './api/token'

import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'

const app = createApp(App)

const pinia = createPinia()
// 注意顺序：先装 pinia，再装 router。
// 路由守卫里要用 user store，pinia 没装会直接报 "no active pinia"。
app.use(pinia)
app.use(router)

// 请求层发现 401（登录过期）时会派发这个事件。
// 这里做两件事，缺一不可：
//  ① 清掉本地登录态——只清 token 不够，store 里的 user 还在，
//     路由守卫会认为"已登录"，把用户从登录页又弹回业务页，形成 401 死循环；
//  ② 带着原地址跳登录，登录成功后能回到刚才那一页（J089）。
window.addEventListener('app:unauthorized', () => {
  const userStore = useUserStore(pinia)
  const wasLogin = userStore.isLogin
  userStore.reset()

  const current = router.currentRoute.value
  if (current.name === 'login' || current.name === 'register') return
  if (wasLogin) useToast().toast('登录已过期，请重新登录')
  void router.replace({ name: 'login', query: { redirect: current.fullPath } })
})

app.mount('#app')

// 只有 mock 模式才挂的调试钩子：给 e2e 用来构造"不好点出来"的边界请求
// （迟到 401、失败的商品 PATCH、管理员取消）。真后端模式下这里不存在。
if (isMock) {
  ;(window as unknown as Record<string, unknown>).__carbonDebug = {
    /** 通用请求口，给 e2e 读后端状态用（比如管理员会话下读积分账户） */
    call: (options: Record<string, unknown>) => request(options as never),
    /** 直接替换当前 token，用来模拟"中途重新登录拿到新 token" */
    setToken: (t: string) => setToken(t),
    /** 发起一个故意慢 N 毫秒的请求，返回时一定是 401 */
    slow401: (ms = 1200) => request({ url: '/_debug/slow401', query: { ms } }),
    /** 直接打商品 PATCH，用来验证"校验失败不改任何字段" */
    patchProduct: (productId: string, body: Record<string, unknown>) =>
      request({ url: `/admin/products/${productId}`, method: 'PATCH', body }),
    /** 直接走管理员取消接口 */
    cancelOrder: (orderId: string, reason: string) =>
      request({ url: `/admin/orders/${orderId}/cancel`, method: 'POST', body: { reason } })
  }
}
