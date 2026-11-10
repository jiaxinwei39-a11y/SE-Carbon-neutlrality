import { request } from './http'
import type { Page, PointsAccount, PointsFlow, PointsFlowType } from '@/types'

export function getPointsAccount(): Promise<PointsAccount> {
  return request<PointsAccount>({ url: '/points/account' })
}

export interface FlowQuery {
  page?: number
  size?: number
  type?: PointsFlowType | 'ALL'
}

/** 真后端：GET /api/points/flows?page=&size=&type= */
export function listPointsFlows(query: FlowQuery): Promise<Page<PointsFlow>> {
  return request<Page<PointsFlow>>({ url: '/points/flows', query: { ...query } })
}
