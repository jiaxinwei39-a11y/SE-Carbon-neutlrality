import { request } from './http'
import type { Order, OrderStatus, Page } from '@/types'

export interface OrderQuery {
  page?: number
  size?: number
  status?: OrderStatus | 'ALL'
}

export function listOrders(query: OrderQuery): Promise<Page<Order>> {
  return request<Page<Order>>({ url: '/orders', query: { ...query } })
}

export function getOrder(orderId: string): Promise<Order> {
  return request<Order>({ url: `/orders/${orderId}` })
}

// 注意：取消订单不在这里。
// #23 之后用户端不提供取消能力，取消由管理员在管理端发起，见 admin.ts 的 cancelOrder。
