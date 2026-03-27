import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

interface Props {
  routes: string[]
  dates: string[]
  activeRoutes: Set<string>
  activeDates: Set<string>
  onToggleRoute: (r: string) => void
  onToggleDate: (d: string) => void
}

const ROUTE_COLORS: Record<string, string> = {
  'MAD-PEK': 'border-blue-500 bg-blue-500/20 text-blue-300',
  'MAD-PVG': 'border-cyan-500 bg-cyan-500/20 text-cyan-300',
  'MAD-CAN': 'border-purple-500 bg-purple-500/20 text-purple-300',
  'MAD-SZX': 'border-amber-500 bg-amber-500/20 text-amber-300',
  'MAD-HKG': 'border-emerald-500 bg-emerald-500/20 text-emerald-300',
}
const ROUTE_COLORS_INACTIVE = 'border-slate-700 bg-transparent text-slate-500 hover:border-slate-500'

const DEST_LABELS: Record<string, string> = {
  'MAD-PEK': 'Pekín',
  'MAD-PVG': 'Shanghái',
  'MAD-CAN': 'Guangzhou',
  'MAD-SZX': 'Shenzhen',
  'MAD-HKG': 'Hong Kong',
}

export default function RouteFilter({
  routes,
  dates,
  activeRoutes,
  activeDates,
  onToggleRoute,
  onToggleDate,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      {/* Route chips */}
      <div>
        <span className="text-xs uppercase tracking-wider text-slate-500 mb-2 block">
          Destinos
        </span>
        <div className="flex flex-wrap gap-2">
          {routes.map((r) => {
            const active = activeRoutes.has(r)
            return (
              <button
                key={r}
                onClick={() => onToggleRoute(r)}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-150 cursor-pointer ${
                  active ? ROUTE_COLORS[r] ?? 'border-blue-500 bg-blue-500/20 text-blue-300' : ROUTE_COLORS_INACTIVE
                }`}
              >
                {DEST_LABELS[r] ?? r}
              </button>
            )
          })}
        </div>
      </div>

      {/* Date chips */}
      <div>
        <span className="text-xs uppercase tracking-wider text-slate-500 mb-2 block">
          Fechas de salida
        </span>
        <div className="flex flex-wrap gap-2">
          {dates.map((d) => {
            const active = activeDates.has(d)
            return (
              <button
                key={d}
                onClick={() => onToggleDate(d)}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-150 cursor-pointer ${
                  active
                    ? 'border-slate-400 bg-slate-700/60 text-white'
                    : 'border-slate-700 bg-transparent text-slate-500 hover:border-slate-500'
                }`}
              >
                {format(parseISO(d), "d MMM", { locale: es })}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
