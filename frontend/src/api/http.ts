/**
 * 统一请求层 —— 这是整个前端最不该省的一段代码，接后端时 90% 的改动都发生在这里
 *
 * 它做四件事：
 *  1. 一个 axios 实例：baseURL、超时、token 注入都在这里，页面不用管
 *  2. 拆包装：后端统一返回 { code, message, data }，业务代码只想拿 data
 *  3. 错误归一：HTTP 状态码 / 业务 code / 网络错误，全部变成 ApiError，
 *     页面用 isApiError(e) 判断即可，不用写 if (err.response?.data?.code)
 *  4. mock 开关：VITE_DATA_SOURCE=mock 时请求不进网络，改 .env 一行就能切到真后端
 */
import axios, { AxiosError, type Method } from 'axios'
import type { ApiResult } from '@/types'
import { clearToken, getToken } from './token'
import { mockRequest } from './mock'

/** 业务错误：页面拿它来分支（401 回登录 / 403 无权限 / 409 冲突） */
export class ApiError extends Error {
  /** 业务码（后端定义的），网络层错误时为 -1 */
  code: number
  /** HTTP 状态码，网络层错误时为 0 */
  httpStatus: number

  constructor(message: string, code = -1, httpStatus = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

/** 从任意异常里取一句能显示给用户的话 */
export function errorMessage(e: unknown, fallback = '操作失败，请稍后重试'): string {
  if (isApiError(e)) return e.message
  if (e instanceof Error && e.message) return e.message
  return fallback
}

export const DATA_SOURCE = (import.meta.env.VITE_DATA_SOURCE as string) || 'mock'
/** 演示版用 mock；接后端时把 .env 里的 VITE_DATA_SOURCE 改成 api */
export const isMock = DATA_SOURCE !== 'api'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

/* ① 请求拦截：带上 token */
http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/* ② 响应拦截：统一处理 401（token 过期）*/
http.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    const status = err.response?.status ?? 0
    if (status === 401) {
      clearToken()
      // 交给 main.ts 里的监听器跳登录（不要在拦截器里直接 router.push，
      // 否则拦截器和路由互相 import，容易循环依赖）
      window.dispatchEvent(new CustomEvent('app:unauthorized'))
    }
    if (status === 0) {
      throw new ApiError('网络连接失败，请检查网络后重试', -1, 0)
    }
    const body = err.response?.data as Partial<ApiResult<unknown>> | undefined
    throw new ApiError(body?.message || err.message || '请求失败', body?.code ?? -1, status)
  },
)

export interface RequestOptions<B = unknown> {
  url: string
  method?: Method
  /** query 参数，undefined 的字段会被丢掉 */
  query?: Record<string, string | number | boolean | undefined | null>
  body?: B
  headers?: Record<string, string>
}

/**
 * 唯一的出口。页面/api 模块都调它，不直接调 axios。
 * 返回已经拆过壳的 data。
 */
export async function request<T, B = unknown>(options: RequestOptions<B>): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()

  if (isMock) {
    // mock 内部返回的是「未拆壳」的 { code, message, data }，和真后端一致；
    // 这里必须和下面 axios 分支一样拆壳，否则页面拿到的会是整个包裹对象。
    const wrapped = (await mockRequest<T>({
      url: options.url,
      method,
      query: options.query,
      body: options.body,
      headers: options.headers,
    })) as unknown as ApiResult<T>
    if (wrapped.code !== 0) throw new ApiError(wrapped.message || '服务返回异常', wrapped.code)
    return wrapped.data
  }

  const res = await http.request<ApiResult<T>>({
    url: options.url,
    method,
    params: options.query,
    data: options.body,
    headers: options.headers,
  })

  const payload = res.data
  // 后端约定 code === 0 成功；不是 0 就当业务失败抛出
  if (!payload || payload.code !== 0) {
    const msg = payload?.message || '服务返回异常'
    if (payload?.code === 401) clearToken()
    throw new ApiError(msg, payload?.code ?? -1, res.status)
  }
  return payload.data
}

/**
 * 幂等键：同一次业务意图（一次提交/一次兑换）只能生成一个 id，
 * 重试时必须复用，不能每次点都换新的（J017 / J036）
 */
export function makeIdempotencyKey(prefix = 'req'): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now()}-${rand}`
}
