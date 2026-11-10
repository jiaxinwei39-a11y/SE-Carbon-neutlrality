import { request } from './http'
import type { User } from '@/types'

export interface LoginPayload {
  account: string
  password: string
}

export interface LoginResult {
  token: string
  /** 登录接口顺带返回用户信息，省掉一次 /auth/me（也要返回菜单，见 README） */
  user: User
}

/** 真后端：POST /api/auth/login -> { token, user } */
export function login(payload: LoginPayload): Promise<LoginResult> {
  return request<LoginResult, LoginPayload>({ url: '/auth/login', method: 'POST', body: payload })
}

/** 刷新页面后用它恢复登录态；token 失效会抛 401 */
export function fetchMe(): Promise<User> {
  return request<User>({ url: '/auth/me' })
}

export function logout(): Promise<null> {
  return request<null>({ url: '/auth/logout', method: 'POST' })
}
