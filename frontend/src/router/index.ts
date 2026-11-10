/**
 * 路由表 + 守卫
 * 路由结构直接对应 95 条交互规格里的建议路由（/app/* 与 /admin/*）。
 * meta 只有三个关键位：requiresAuth（要登录）、role（要什么角色）、layout（用哪套外壳）
 */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    role?: 'USER' | 'ADMIN'
    layout?: 'user' | 'admin' | 'blank'
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/app' },

  // ---------- 未登录可访问 ----------
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { title: '登录', layout: 'blank' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/auth/RegisterView.vue'),
    meta: { title: '注册', layout: 'blank' },
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/views/state/ForbiddenView.vue'),
    meta: { title: '无访问权限', layout: 'blank' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/state/NotFoundView.vue'),
    meta: { title: '页面不存在', layout: 'blank' },
  },

  // ---------- 用户端（P0 主链路） ----------
  {
    path: '/app',
    component: () => import('@/layouts/UserLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'home', component: () => import('@/views/user/HomeView.vue'), meta: { title: '首页 · 上报行程', requiresAuth: true } },
      { path: 'trips/new', name: 'trip-new', component: () => import('@/views/user/TripNewView.vue'), meta: { title: '上报行程', requiresAuth: true } },
      { path: 'trips', name: 'trips', component: () => import('@/views/user/TripListView.vue'), meta: { title: '我的行程', requiresAuth: true } },
      { path: 'trips/:tripId', name: 'trip-detail', component: () => import('@/views/user/TripDetailView.vue'), meta: { title: '核算详情', requiresAuth: true } },
      { path: 'points', name: 'points', component: () => import('@/views/user/PointsView.vue'), meta: { title: '我的积分', requiresAuth: true } },
      { path: 'mall', name: 'mall', component: () => import('@/views/user/MallView.vue'), meta: { title: '积分商城', requiresAuth: true } },
      { path: 'mall/:productId', name: 'product', component: () => import('@/views/user/ProductView.vue'), meta: { title: '商品详情', requiresAuth: true } },
      { path: 'orders', name: 'orders', component: () => import('@/views/user/OrdersView.vue'), meta: { title: '我的订单', requiresAuth: true } },
      { path: 'profile', name: 'profile', component: () => import('@/views/user/ProfileView.vue'), meta: { title: '个人资料', requiresAuth: true } },
    ],
  },

  // ---------- 管理端 ----------
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, role: 'ADMIN' },
    children: [
      { path: '', redirect: '/admin/dashboard' },
      { path: 'dashboard', name: 'admin-dashboard', component: () => import('@/views/admin/DashboardView.vue'), meta: { title: '数据概览', requiresAuth: true, role: 'ADMIN' } },
      { path: 'rules', name: 'admin-rules', component: () => import('@/views/admin/RulesView.vue'), meta: { title: '核算规则', requiresAuth: true, role: 'ADMIN' } },
      { path: 'products', name: 'admin-products', component: () => import('@/views/admin/ProductsView.vue'), meta: { title: '商品管理', requiresAuth: true, role: 'ADMIN' } },
      { path: 'orders', name: 'admin-orders', component: () => import('@/views/admin/AdminOrdersView.vue'), meta: { title: '订单管理', requiresAuth: true, role: 'ADMIN' } },
      { path: 'reconciliation', name: 'admin-reconciliation', component: () => import('@/views/admin/ReconciliationView.vue'), meta: { title: '积分对账', requiresAuth: true, role: 'ADMIN' } },
      { path: 'users', name: 'admin-users', component: () => import('@/views/admin/UsersView.vue'), meta: { title: '用户管理', requiresAuth: true, role: 'ADMIN' } },
    ],
  },
]

export const router = createRouter({
  // hash 模式：Electron 用 file:// 加载时也能正常工作
  history: createWebHashHistory(),
  routes,
  scrollBehavior(_to, _from, saved) {
    // 返回上一页时恢复滚动位置（J023）
    return saved ?? { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const store = useUserStore()
  await store.restore()

  if (to.meta.requiresAuth && !store.isLogin) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.role === 'ADMIN' && !store.isAdmin) {
    return { name: 'forbidden' }
  }
  if (to.name === 'login' && store.isLogin) {
    return { name: 'home' }
  }
  return true
})

router.afterEach((to) => {
  const base = '绿色出行碳积分'
  document.title = to.meta.title ? `${to.meta.title} · ${base}` : base
})
