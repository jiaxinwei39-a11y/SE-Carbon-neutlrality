/**
 * token 的统一出口
 * 为什么要单独一层：demo 阶段 token 放内存，接后端后可能改 httpOnly cookie、
 * 也可能改 Electron 的安全存储。页面代码永远只调这里，不直接摸 localStorage。
 */

const KEY = 'carbon_token'

let memoryToken: string | null = null

function readStorage(): string | null {
  try {
    return window.sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function getToken(): string | null {
  if (memoryToken) return memoryToken
  memoryToken = readStorage()
  return memoryToken
}

export function setToken(token: string): void {
  memoryToken = token
  try {
    window.sessionStorage.setItem(KEY, token)
  } catch {
    /* 隐私模式写入失败也不影响内存里的值 */
  }
}

export function clearToken(): void {
  memoryToken = null
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
