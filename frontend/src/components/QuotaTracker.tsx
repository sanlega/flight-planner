import { Activity } from 'lucide-react'

interface StatsPayload {
  year_month: string
  sweeps_this_month: number
  searches_this_month: number
  source: string
  quota_limit: string
  last_updated: string
}

interface Props {
  quota: StatsPayload | null
}

export default function QuotaTracker({ quota }: Props) {
  if (!quota) return null

  return (
    <div className="bg-[#111827] border border-[#1e2d45] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-slate-300">Actividad</span>
        </div>
        <span className="text-xs text-slate-500">{quota.year_month}</span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-end">
          <span className="text-xs text-slate-500">Búsquedas este mes</span>
          <span className="text-lg font-bold text-white">{quota.searches_this_month}</span>
        </div>
        <div className="flex justify-between items-end">
          <span className="text-xs text-slate-500">Sweeps completados</span>
          <span className="text-base font-semibold text-white">{quota.sweeps_this_month}</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-[#1e2d45]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          <span className="text-xs text-emerald-400 font-medium">Sin límite de cuota</span>
        </div>
        <p className="text-xs text-slate-600 mt-1">{quota.source}</p>
      </div>
    </div>
  )
}
