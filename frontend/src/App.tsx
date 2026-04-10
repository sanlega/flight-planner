import { useState, useEffect, useCallback } from 'react'
import { Plane, ChevronDown, ChevronUp, Shield, Settings } from 'lucide-react'
import {
  fetchOffers,
  fetchHistory,
  fetchQuota,
  fetchRuns,
  fetchConfig,
  triggerRefresh,
  type FlightOffer,
  type PriceSeries,
  type QuotaStatus,
  type SearchRun,
  type AppConfig,
} from './api/flights'
import PriceChart from './components/PriceChart'
import FlightCard from './components/FlightCard'
import RouteFilter from './components/RouteFilter'
import StatsBar from './components/StatsBar'
import QuotaTracker from './components/QuotaTracker'
import SettingsModal from './components/SettingsModal'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // re-fetch data every 5 min

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [offers, setOffers] = useState<FlightOffer[]>([])
  const [history, setHistory] = useState<PriceSeries[]>([])
  const [quota, setQuota] = useState<QuotaStatus | null>(null)
  const [lastRun, setLastRun] = useState<SearchRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [activeRoutes, setActiveRoutes] = useState<Set<string>>(new Set())
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'price' | 'date'>('price')
  const [maxDurationH, setMaxDurationH] = useState(50) // 50 = no limit
  const [showChart, setShowChart] = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  const loadAll = useCallback(async () => {
    try {
      const [cfg, q, runs] = await Promise.all([
        fetchConfig(),
        fetchQuota(),
        fetchRuns(1),
      ])
      setConfig(cfg)
      setQuota(q)
      setLastRun(runs[0] ?? null)

      // Init active routes + dates from config (only on first load)
      setActiveRoutes((prev) => {
        if (prev.size === 0 && cfg.routes.length) return new Set(cfg.routes)
        return prev
      })
      setActiveDates((prev) => {
        if (prev.size === 0 && cfg.departure_dates.length) {
          return new Set(cfg.departure_dates)
        }
        return prev
      })

      const [rawOffers, rawHistory] = await Promise.all([
        fetchOffers({ limit: 100 }),
        fetchHistory({ days: 30 }),
      ])
      setOffers(rawOffers)
      setHistory(rawHistory.series)
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
    const interval = setInterval(loadAll, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [loadAll])

  const handleRefresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      await triggerRefresh()
      await loadAll()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Error al actualizar')
    } finally {
      setRefreshing(false)
    }
  }

  const toggleRoute = (r: string) => {
    setActiveRoutes((prev) => {
      const next = new Set(prev)
      if (next.has(r)) { if (next.size > 1) next.delete(r) }
      else next.add(r)
      return next
    })
  }

  const toggleDate = (d: string) => {
    setActiveDates((prev) => {
      const next = new Set(prev)
      if (next.has(d)) { if (next.size > 1) next.delete(d) }
      else next.add(d)
      return next
    })
  }

  // Parse "14h 30m" → minutes
  const parseDurationMin = (s: string) => {
    const h = s.match(/(\d+)\s*h/)?.[1]
    const m = s.match(/(\d+)\s*m/)?.[1]
    return (h ? parseInt(h) * 60 : 0) + (m ? parseInt(m) : 0)
  }

  // Filtered & sorted offers
  const visibleOffers = offers
    .filter((o) => {
      if (!activeRoutes.has(o.route) || !activeDates.has(o.departure_date)) return false
      if (maxDurationH < 50 && o.outbound_duration) {
        const mins = parseDurationMin(o.outbound_duration)
        if (mins > maxDurationH * 60) return false
      }
      return true
    })
    .sort((a, b) =>
      sortBy === 'price'
        ? a.price_eur - b.price_eur
        : a.departure_date.localeCompare(b.departure_date),
    )


  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      {/* Header */}
      <header className="border-b border-[#1e2d45] bg-[#0d1526] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">
                Flight Tracker
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">MAD → China · Octubre 2026</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              Sin escalas en países árabes
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-[#1e2d45] hover:border-slate-600 rounded-lg px-3 py-1.5 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Configurar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Error banner */}
        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Stats bar */}
        <StatsBar
          offers={offers}
          lastRun={lastRun}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          config={config}
        />

        {/* Chart section */}
        <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl">
          <button
            className="w-full flex items-center justify-between p-5 text-left"
            onClick={() => setShowChart((v) => !v)}
          >
            <h2 className="text-base font-semibold text-white">
              Evolución del precio
            </h2>
            {showChart ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>
          {showChart && (
            <div className="px-5 pb-5">
              <PriceChart
                series={history}
                activeRoutes={activeRoutes}
                activeDates={activeDates}
              />
            </div>
          )}
        </div>

        {/* Filters + offers */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <aside className="lg:w-64 shrink-0 space-y-4">
            <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Filtros</h3>
              <RouteFilter
                routes={config?.routes ?? []}
                dates={config?.departure_dates ?? []}
                activeRoutes={activeRoutes}
                activeDates={activeDates}
                onToggleRoute={toggleRoute}
                onToggleDate={toggleDate}
              />
              {/* Max outbound duration filter */}
              <div className="mt-3 pt-3 border-t border-[#1e2d45]">
                <span className="text-xs uppercase tracking-wider text-slate-500 mb-2 block">
                  Duración max. trayecto
                </span>
                <input
                  type="range"
                  min={10}
                  max={50}
                  value={maxDurationH}
                  onChange={(e) => setMaxDurationH(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  {maxDurationH >= 50
                    ? 'Sin límite'
                    : `Máximo ${maxDurationH}h`}
                </p>
              </div>
            </div>
            <QuotaTracker quota={quota} />
          </aside>

          {/* Offers list */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-white">
                Mejores vuelos{' '}
                <span className="text-slate-500 font-normal text-sm">
                  ({visibleOffers.length})
                </span>
              </h2>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'price' | 'date')}
                className="bg-[#1a2235] border border-[#1e2d45] text-slate-300 text-xs rounded-lg px-3 py-1.5 cursor-pointer"
              >
                <option value="price">Ordenar: menor precio</option>
                <option value="date">Ordenar: fecha de salida</option>
              </select>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-[#111827] border border-[#1e2d45] rounded-2xl h-52 animate-pulse"
                  />
                ))}
              </div>
            ) : visibleOffers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-600">
                <Plane className="w-12 h-12 opacity-20" />
                <p className="text-sm">
                  No hay vuelos guardados todavía. Pulsa{' '}
                  <strong className="text-blue-400">Actualizar ahora</strong> para
                  lanzar la primera búsqueda.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {visibleOffers.map((o) => (
                  <FlightCard key={o.id} offer={o} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      {/* Settings modal */}
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={(andRefresh) => {
          // Reset filters so they reload from new config
          setActiveRoutes(new Set())
          setActiveDates(new Set())
          if (andRefresh) {
            handleRefresh()
          } else {
            loadAll()
          }
        }}
      />
    </div>
  )
}
