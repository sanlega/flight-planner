import { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { PriceSeries } from '../api/flights'

interface Props {
  series: PriceSeries[]
  activeRoutes: Set<string>
  activeDates: Set<string>
}

const ROUTE_COLORS: Record<string, string> = {
  'MAD-PEK': '#3b82f6',
  'MAD-PVG': '#06b6d4',
  'MAD-CAN': '#8b5cf6',
  'MAD-SZX': '#f59e0b',
  'MAD-HKG': '#10b981',
}

const DEST_LABELS: Record<string, string> = {
  'MAD-PEK': 'Pekín (PEK)',
  'MAD-PVG': 'Shanghái (PVG)',
  'MAD-CAN': 'Guangzhou (CAN)',
  'MAD-SZX': 'Shenzhen (SZX)',
  'MAD-HKG': 'Hong Kong (HKG)',
}

// Merge all series into a flat list of {timestamp, [route_date]: price}
function buildChartData(
  series: PriceSeries[],
  activeRoutes: Set<string>,
  activeDates: Set<string>,
) {
  const filtered = series.filter(
    (s) => activeRoutes.has(s.route) && activeDates.has(s.departure_date),
  )

  const byTime: Record<string, Record<string, number>> = {}

  for (const s of filtered) {
    const key = `${s.route}|${s.departure_date}`
    for (const pt of s.data) {
      const ts = pt.timestamp
      if (!byTime[ts]) byTime[ts] = {}
      byTime[ts][key] = pt.price
    }
  }

  return Object.entries(byTime)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ts, values]) => ({ ts, ...values }))
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a2235] border border-[#1e2d45] rounded-xl p-3 shadow-2xl text-sm">
      <p className="text-slate-400 mb-2">
        {label ? format(parseISO(label), 'dd MMM yyyy HH:mm') : ''}
      </p>
      {payload.map((entry: any) => {
        const [route, date] = entry.dataKey.split('|')
        return (
          <div key={entry.dataKey} className="flex items-center gap-2 mb-1">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ background: entry.color }}
            />
            <span className="text-slate-300">
              {DEST_LABELS[route] ?? route}
            </span>
            <span className="text-slate-400 text-xs">{date}</span>
            <span className="ml-auto font-bold" style={{ color: entry.color }}>
              €{entry.value?.toLocaleString('es-ES', { minimumFractionDigits: 0 })}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function PriceChart({ series, activeRoutes, activeDates }: Props) {
  const chartData = useMemo(
    () => buildChartData(series, activeRoutes, activeDates),
    [series, activeRoutes, activeDates],
  )

  const activeKeys = useMemo(() => {
    return series
      .filter(
        (s) => activeRoutes.has(s.route) && activeDates.has(s.departure_date),
      )
      .map((s) => `${s.route}|${s.departure_date}`)
  }, [series, activeRoutes, activeDates])

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        No hay datos para mostrar. Ejecuta la primera búsqueda con el botón&nbsp;
        <strong className="text-blue-400">Actualizar</strong>.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
        <XAxis
          dataKey="ts"
          tickFormatter={(v) => {
            try { return format(parseISO(v), 'dd/MM HH:mm') } catch { return v }
          }}
          stroke="#334155"
          tick={{ fill: '#64748b', fontSize: 11 }}
          minTickGap={60}
        />
        <YAxis
          stroke="#334155"
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickFormatter={(v) => `€${v}`}
          width={64}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => {
            const [route, date] = value.split('|')
            return (
              <span className="text-slate-400 text-xs">
                {DEST_LABELS[route] ?? route} · {date}
              </span>
            )
          }}
        />
        {activeKeys.map((key) => {
          const route = key.split('|')[0]
          return (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={ROUTE_COLORS[route] ?? '#94a3b8'}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          )
        })}
      </LineChart>
    </ResponsiveContainer>
  )
}
