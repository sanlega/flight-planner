import { TrendingDown, Clock, RefreshCw, AlertTriangle } from 'lucide-react'
import { format, parseISO, addHours } from 'date-fns'
import { es } from 'date-fns/locale'
import type { FlightOffer, SearchRun } from '../api/flights'

interface Props {
  offers: FlightOffer[]
  lastRun: SearchRun | null
  onRefresh: () => void
  refreshing: boolean
}

const DEST_LABELS: Record<string, string> = {
  'MAD-PEK': 'Pekín',
  'MAD-PVG': 'Shanghái',
  'MAD-CAN': 'Guangzhou',
  'MAD-SZX': 'Shenzhen',
  'MAD-HKG': 'Hong Kong',
}

const ROUTE_DOT: Record<string, string> = {
  'MAD-PEK': 'bg-blue-500',
  'MAD-PVG': 'bg-cyan-500',
  'MAD-CAN': 'bg-purple-500',
  'MAD-SZX': 'bg-amber-500',
  'MAD-HKG': 'bg-emerald-500',
}

export default function StatsBar({ offers, lastRun, onRefresh, refreshing }: Props) {
  // Best price per route (across all tracked dates)
  const bestByRoute: Record<string, FlightOffer> = {}
  for (const o of offers) {
    if (!bestByRoute[o.route] || o.price_eur < bestByRoute[o.route].price_eur) {
      bestByRoute[o.route] = o
    }
  }

  const nextUpdate = lastRun?.started_at
    ? addHours(parseISO(lastRun.started_at), 12)
    : null

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Best prices row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Object.entries(DEST_LABELS).map(([route, label]) => {
          const best = bestByRoute[route]
          return (
            <div
              key={route}
              className="bg-[#111827] border border-[#1e2d45] rounded-xl p-3"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${ROUTE_DOT[route] ?? 'bg-slate-500'}`} />
                <span className="text-xs text-slate-400">{label}</span>
              </div>
              {best ? (
                <>
                  <div className="text-xl font-bold text-white">
                    €{best.price_eur.toLocaleString('es-ES', { minimumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {format(parseISO(best.departure_date), 'd MMM', { locale: es })}
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-600 mt-1">Sin datos</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Status bar */}
      <div className="bg-[#111827] border border-[#1e2d45] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          {lastRun && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-slate-400">
                Última actualización:{' '}
                <span className="text-white">
                  {format(parseISO(lastRun.started_at), "d MMM, HH:mm", { locale: es })}
                </span>
              </span>
            </div>
          )}
          {nextUpdate && (
            <div className="flex items-center gap-2 text-sm">
              <TrendingDown className="w-4 h-4 text-slate-500" />
              <span className="text-slate-400">
                Próxima:{' '}
                <span className="text-white">
                  {format(nextUpdate, "HH:mm", { locale: es })}
                </span>
              </span>
            </div>
          )}
          {!lastRun && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Aún no se ha ejecutado ninguna búsqueda
            </div>
          )}
        </div>

        <button
          onClick={onRefresh}
          disabled={refreshing}
          title="Ejecutar búsqueda ahora"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors duration-150"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Buscando...' : 'Actualizar ahora'}
        </button>
      </div>
    </div>
  )
}
