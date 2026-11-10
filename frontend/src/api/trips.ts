import { makeIdempotencyKey, request } from './http'
import type { Page, Trip, TripDetail, TripMode } from '@/types'

export interface TripQuery {
  page?: number
  size?: number
  mode?: TripMode | 'ALL'
  keyword?: string
  from?: string
  to?: string
}

/** 真后端：GET /api/trips?page=&size=&mode=&keyword=&from=&to= */
export function listTrips(query: TripQuery): Promise<Page<Trip>> {
  return request<Page<Trip>>({ url: '/trips', query: { ...query } })
}

export function getTrip(tripId: string): Promise<TripDetail> {
  return request<TripDetail>({ url: `/trips/${tripId}` })
}

export interface CreateTripPayload {
  clientTripId: string
  mode: TripMode
  distanceKm: number
  startTime: string
  endTime: string
  startPlace: string
  endPlace: string
}

/**
 * 上报行程。
 * clientTripId 由页面在"开始提交"时生成一次并保留，重试复用同一个值（J017），
 * 否则网络超时重试会重复加分。
 */
export function createTrip(payload: CreateTripPayload, idempotencyKey?: string): Promise<TripDetail> {
  return request<TripDetail, CreateTripPayload>({
    url: '/trips',
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': idempotencyKey ?? makeIdempotencyKey('trip') },
  })
}
