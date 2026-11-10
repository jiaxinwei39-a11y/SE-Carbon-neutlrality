import { makeIdempotencyKey, request } from './http'
import type { Order, Page, Product } from '@/types'

export interface ProductQuery {
  page?: number
  size?: number
  keyword?: string
}

export function listProducts(query: ProductQuery): Promise<Page<Product>> {
  return request<Page<Product>>({ url: '/mall/products', query: { ...query } })
}

export function getProduct(productId: string): Promise<Product> {
  return request<Product>({ url: `/mall/products/${productId}` })
}

export interface RedeemPayload {
  productId: string
  quantity: number
}

/**
 * 兑换。requestId 由弹窗打开时生成一次，重试复用（J036），
 * 保证"网络超时后再点一次"不会扣两次积分。
 */
export function redeem(payload: RedeemPayload, idempotencyKey?: string): Promise<Order> {
  return request<Order, RedeemPayload>({
    url: '/mall/orders',
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': idempotencyKey ?? makeIdempotencyKey('redeem') },
  })
}
