import { request } from './http'
import type { CarbonRule, Order, Page, Product, ReconcileItem, TripMode, User } from '@/types'

export interface DashboardData {
  userCount: number
  tripCount: number
  totalReductionKg: number
  totalPointsIssued: number
  modeDistribution: Array<{ mode: TripMode; count: number }>
  dailyTrend: Array<{ date: string; count: number }>
}

export function getDashboard(): Promise<DashboardData> {
  return request<DashboardData>({ url: '/admin/dashboard' })
}

export function listRules(): Promise<CarbonRule[]> {
  return request<CarbonRule[]>({ url: '/admin/rules' })
}

export function listAdminProducts(query: { page?: number; size?: number }): Promise<Page<Product>> {
  return request<Page<Product>>({ url: '/admin/products', query: { ...query } })
}

export function listAdminOrders(query: { page?: number; size?: number }): Promise<Page<Order>> {
  return request<Page<Order>>({ url: '/admin/orders', query: { ...query } })
}

export function listUsers(query: { page?: number; size?: number }): Promise<Page<User>> {
  return request<Page<User>>({ url: '/admin/users', query: { ...query } })
}

export interface ReconcileResult {
  checkedAt: string
  items: ReconcileItem[]
}

/**
 * 只读对账。三态由调用方区分：无差异（items 为空）/ 有差异 / 读取失败（抛错）。
 * 注意：读取失败绝不能被渲染成"无差异"（J069–J075），页面必须显式处理 catch。
 */
export function getReconciliation(diff?: '1' | 'error'): Promise<ReconcileResult> {
  return request<ReconcileResult>({ url: '/admin/reconciliation', query: { diff } })
}
