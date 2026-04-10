import axios from 'axios'

const api = axios.create({ baseURL: '/api', withCredentials: true })

export interface Segment {
  flightNumber: string
  carrier: string
  aircraft: string
  departure: { iataCode: string; at: string; terminal?: string }
  arrival: { iataCode: string; at: string; terminal?: string }
  duration: string
}

export interface Stop {
  iataCode: string
  at: string
}

export interface FlightOffer {
  id: number
  route: string
  destination_name: string
  departure_date: string
  return_date: string
  price_eur: number
  airline_codes: string
  airline_names: string
  airline_logo: string
  outbound_duration: string
  return_duration: string
  outbound_stops: Stop[]
  return_stops: Stop[]
  outbound_segments: Segment[]
  return_segments: Segment[]
  scraped_at: string
  google_flights_url: string
}

export interface PricePoint {
  timestamp: string
  price: number
}

export interface PriceSeries {
  route: string
  departure_date: string
  data: PricePoint[]
}

export interface QuotaStatus {
  year_month: string
  sweeps_this_month: number
  searches_this_month: number
  source: string
  quota_limit: string
  last_updated: string
}

export interface SearchRun {
  id: number
  started_at: string
  finished_at: string | null
  routes_searched: number
  calls_made: number
  offers_saved: number
  success: boolean
  error_msg: string | null
  triggered_by: string
}

export interface AppConfig {
  routes: string[]
  departure_dates: string[]
  airport_names: Record<string, string>
}

export const fetchOffers = (params?: {
  route?: string
  departure_date?: string
  limit?: number
}) => api.get<FlightOffer[]>('/offers', { params }).then((r) => r.data)

export const fetchHistory = (params?: {
  route?: string
  departure_date?: string
  days?: number
}) => api.get<{ series: PriceSeries[] }>('/history', { params }).then((r) => r.data)

export const fetchQuota = () => api.get<QuotaStatus>('/quota').then((r) => r.data)

export const fetchRuns = (limit = 5) =>
  api.get<SearchRun[]>('/runs', { params: { limit } }).then((r) => r.data)

export const fetchConfig = () => api.get<AppConfig>('/config').then((r) => r.data)

export const triggerRefresh = () => api.post('/refresh').then((r) => r.data)
