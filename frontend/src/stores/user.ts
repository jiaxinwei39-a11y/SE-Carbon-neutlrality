/**
 * 用户/登录态
 * 只存"当前是谁 + token"，业务数据不往 store 里塞（页面自己请求，避免缓存不一致）。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '@/api/auth'
import { clearToken, getToken, setToken } from '@/api/token'
import type { User } from '@/types'

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(getToken())
  /** 是否已经尝试过恢复登录态，避免每次跳转都调 /auth/me */
  const initialized = ref(false)
  const loading = ref(false)

  const isLogin = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')
  const nickname = computed(() => user.value?.nickname ?? '未登录')

  async function login(account: string, password: string): Promise<User> {
    loading.value = true
    try {
      const res = await authApi.login({ account, password })
      token.value = res.token
      setToken(res.token)
      user.value = res.user
      initialized.value = true
      return res.user
    } finally {
      loading.value = false
    }
  }

  /** 刷新页面后恢复登录态：有 token 才去问后端"我是谁" */
  async function restore(): Promise<void> {
    if (initialized.value) return
    initialized.value = true
    if (!token.value) return
    try {
      user.value = await authApi.fetchMe()
    } catch {
      // token 失效：清掉，让路由守卫把用户送去登录页
      reset()
    }
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } catch {
      /* 退出接口失败也要清本地，否则用户会被卡住 */
    }
    reset()
  }

  function reset(): void {
    user.value = null
    token.value = null
    clearToken()
  }

  return { user, token, loading, initialized, isLogin, isAdmin, nickname, login, restore, logout, reset }
})
