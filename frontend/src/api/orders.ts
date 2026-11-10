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

/**
 * 取消订单：原因必填（J051），后端返还原额原数量（J052）。
 * 前端提交前做一次本地预检，但最终以服务端返回的订单为准。
 */
export function cancelOrder(orderId: string, reason: string): Promise<Order> {
  return request<Order, { reason: string }>({
    url: `/orders/${orderId}/cancel`,
    method: 'POST',
    body: { reason },
  })
}
