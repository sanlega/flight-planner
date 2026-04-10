import { useState, useEffect, useRef } from 'react'
import { X, Plus, Save, RefreshCw, Loader2, CheckCircle, AlertCircle, Filter, Trash2 } from 'lucide-react'

interface Settings {
  origin: string
  destinations: string[]
  departure_date_start: string
  departure_date_end: string
  departure_date_step: number
  stay_days: number
  max_stops: number
  max_duration_hours: number
  excluded_airlines: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (andRefresh: boolean) => void
}

const KNOWN_AIRPORTS: Record<string, string> = {
  MAD: 'Madrid Barajas', BCN: 'Barcelona El Prat', PMI: 'Palma de Mallorca',
  PEK: 'Beijing Capital', PKX: 'Beijing Daxing', PVG: 'Shanghai Pudong',
  SHA: 'Shanghai Hongqiao', CAN: 'Guangzhou', SZX: 'Shenzhen',
  HKG: 'Hong Kong', CTU: 'Chengdu', XIY: 'Xi\'an', WUH: 'Wuhan',
  NKG: 'Nanjing', TAO: 'Qingdao', HGH: 'Hangzhou', CSX: 'Changsha',
  NRT: 'Tokyo Narita', HND: 'Tokyo Haneda', ICN: 'Seoul Incheon',
  SIN: 'Singapur', BKK: 'Bangkok', KUL: 'Kuala Lumpur',
  TPE: 'Taipei', MNL: 'Manila', SGN: 'Ho Chi Minh',
  DEL: 'Delhi', BOM: 'Mumbai',
  LHR: 'Londres Heathrow', CDG: 'Paris CDG',
  FRA: 'Frankfurt', AMS: 'Amsterdam', IST: 'Estambul',
  FCO: 'Roma', MXP: 'Milan',
  JFK: 'Nueva York JFK', LAX: 'Los Angeles', SFO: 'San Francisco',
}

function airportLabel(code: string) {
  return KNOWN_AIRPORTS[code] ? `${code} - ${KNOWN_AIRPORTS[code]}` : code
}

async function fetchSettings(): Promise<Settings> {
  const r = await fetch('/api/settings')
  if (!r.ok) throw new Error('Error cargando configuracion')
  return r.json()
}

async function saveSettings(s: Settings): Promise<void> {
  const r = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.detail ?? 'Error guardando')
  }
}

const STOPS_OPTIONS = [
  { value: 0, label: 'Solo directo' },
  { value: 1, label: 'Max. 1 escala' },
  { value: 2, label: 'Max. 2 escalas' },
  { value: -1, label: 'Sin limite' },
]

export default function SettingsModal({ open, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Settings | null>(null)
  const [newDest, setNewDest] = useState('')
  const [newExcluded, setNewExcluded] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [activeTab, setActiveTab] = useState<'routes' | 'filters'>('routes')
  const newDestRef = useRef<HTMLInputElement>(null)
  const newExcludedRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setStatus('idle')
      setActiveTab('routes')
      fetchSettings().then(setForm).catch(() => setStatus('error'))
    }
  }, [open])

  if (!open) return null

  const addDest = () => {
    const code = newDest.trim().toUpperCase()
    if (!code || code.length !== 3) return
    if (form && !form.destinations.includes(code)) {
      setForm({ ...form, destinations: [...form.destinations, code] })
    }
    setNewDest('')
    newDestRef.current?.focus()
  }

  const removeDest = (code: string) => {
    if (!form || form.destinations.length <= 1) return
    setForm({ ...form, destinations: form.destinations.filter(d => d !== code) })
  }

  const addExcluded = () => {
    const kw = newExcluded.trim().toLowerCase()
    if (!kw) return
    if (form && !form.excluded_airlines.includes(kw)) {
      setForm({ ...form, excluded_airlines: [...form.excluded_airlines, kw] })
    }
    setNewExcluded('')
    newExcludedRef.current?.focus()
  }

  const removeExcluded = (kw: string) => {
    if (!form) return
    setForm({ ...form, excluded_airlines: form.excluded_airlines.filter(a => a !== kw) })
  }

  const handleSave = async (andRefresh: boolean) => {
    if (!form) return
    setSaving(true)
    setStatus('idle')
    try {
      await saveSettings(form)
      setStatus('ok')
      setTimeout(() => {
        onClose()
        onSaved(andRefresh)
      }, 600)
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Error desconocido')
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  // Generate preview of departure dates
  const previewDates = (() => {
    if (!form) return []
    const dates: string[] = []
    let current = new Date(form.departure_date_start + 'T00:00:00')
    const end = new Date(form.departure_date_end + 'T00:00:00')
    while (current <= end && dates.length < 20) {
      dates.push(current.toISOString().slice(0, 10))
      current = new Date(current.getTime() + form.departure_date_step * 86400000)
    }
    return dates
  })()

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="w-full max-w-md bg-[#0d1526] border-l border-[#1e2d45] flex flex-col h-full overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#1e2d45] shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Configuracion de busqueda</h2>
            <p className="text-xs text-slate-500 mt-0.5">Los cambios se aplican en el proximo sweep</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1e2d45] shrink-0">
          <button
            onClick={() => setActiveTab('routes')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'routes'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Rutas y fechas
          </button>
          <button
            onClick={() => setActiveTab('filters')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'filters'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filtros
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {!form ? (
            <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Cargando...
            </div>
          ) : activeTab === 'routes' ? (
            <>
              {/* Origin */}
              <section>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Aeropuerto de salida
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={3}
                    value={form.origin}
                    onChange={e => setForm({ ...form, origin: e.target.value.toUpperCase() })}
                    className="w-24 bg-[#111827] border border-[#1e2d45] text-white text-sm rounded-lg px-3 py-2 uppercase font-mono tracking-widest focus:outline-none focus:border-blue-500"
                    placeholder="MAD"
                  />
                  <span className="flex items-center text-sm text-slate-400">
                    {KNOWN_AIRPORTS[form.origin] ?? 'Codigo IATA de 3 letras'}
                  </span>
                </div>
              </section>

              {/* Destinations */}
              <section>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Destinos
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {form.destinations.map(code => (
                    <div
                      key={code}
                      className="flex items-center gap-1.5 bg-blue-950/60 border border-blue-800/60 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="text-sm font-mono font-semibold text-blue-300">{code}</span>
                      <span className="text-xs text-slate-500 hidden sm:block">
                        {KNOWN_AIRPORTS[code] ?? ''}
                      </span>
                      <button
                        onClick={() => removeDest(code)}
                        disabled={form.destinations.length <= 1}
                        className="ml-1 text-slate-500 hover:text-red-400 disabled:opacity-30 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    ref={newDestRef}
                    type="text"
                    maxLength={3}
                    value={newDest}
                    onChange={e => setNewDest(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && addDest()}
                    placeholder="Anadir codigo IATA..."
                    className="flex-1 bg-[#111827] border border-[#1e2d45] text-white text-sm rounded-lg px-3 py-2 uppercase font-mono tracking-widest focus:outline-none focus:border-blue-500 placeholder:normal-case placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-600"
                  />
                  <button
                    onClick={addDest}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Anadir
                  </button>
                </div>
                {newDest.length > 0 && newDest.length < 3 && (
                  <p className="text-xs text-slate-500 mt-1.5">{airportLabel(newDest)}</p>
                )}
                {newDest.length === 3 && (
                  <p className="text-xs text-blue-400 mt-1.5">{airportLabel(newDest)}</p>
                )}
              </section>

              {/* Departure date range */}
              <section>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Ventana de fechas de salida
                </label>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <span className="block text-xs text-slate-500 mb-1">Desde</span>
                    <input
                      type="date"
                      value={form.departure_date_start}
                      onChange={e => setForm({ ...form, departure_date_start: e.target.value })}
                      className="w-full bg-[#111827] border border-[#1e2d45] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500 mb-1">Hasta</span>
                    <input
                      type="date"
                      value={form.departure_date_end}
                      min={form.departure_date_start}
                      onChange={e => setForm({ ...form, departure_date_end: e.target.value })}
                      className="w-full bg-[#111827] border border-[#1e2d45] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                    />
                  </div>
                </div>
                <div>
                  <span className="block text-xs text-slate-500 mb-1">Comprobar cada</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={7}
                      value={form.departure_date_step}
                      onChange={e => setForm({ ...form, departure_date_step: Number(e.target.value) })}
                      className="flex-1 accent-blue-500"
                    />
                    <span className="text-sm text-white w-16 shrink-0">
                      {form.departure_date_step} dia{form.departure_date_step > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Preview of resulting dates */}
                {previewDates.length > 0 && (
                  <div className="mt-3 p-3 bg-[#111827] border border-[#1e2d45] rounded-lg">
                    <span className="text-xs text-slate-500 block mb-2">
                      Se buscaran {previewDates.length} fecha{previewDates.length > 1 ? 's' : ''}:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {previewDates.map(d => (
                        <span
                          key={d}
                          className="text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-0.5 font-mono"
                        >
                          {new Date(d + 'T00:00:00').toLocaleDateString('es-ES', {
                            day: 'numeric', month: 'short'
                          })}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Stay duration */}
              <section>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Duracion de la estancia
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={3}
                    max={30}
                    value={form.stay_days}
                    onChange={e => setForm({ ...form, stay_days: Number(e.target.value) })}
                    className="flex-1 accent-blue-500"
                  />
                  <span className="text-sm text-white w-24 shrink-0 text-right">
                    {form.stay_days} dias
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Vuelta {form.stay_days} dias despues de la salida
                </p>
              </section>
            </>
          ) : (
            /* ═══ FILTERS TAB ═══ */
            <>
              {/* Max stops */}
              <section>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Escalas maximas
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {STOPS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setForm({ ...form!, max_stops: opt.value })}
                      className={`py-2.5 px-3 rounded-lg text-sm font-medium transition-colors border ${
                        form!.max_stops === opt.value
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                          : 'bg-[#111827] border-[#1e2d45] text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Max duration */}
              <section>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Duracion maxima del vuelo
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={8}
                    max={50}
                    value={form!.max_duration_hours}
                    onChange={e => setForm({ ...form!, max_duration_hours: Number(e.target.value) })}
                    className="flex-1 accent-blue-500"
                  />
                  <span className="text-sm text-white w-20 shrink-0 text-right">
                    {form!.max_duration_hours}h
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  {form!.max_duration_hours === 50
                    ? 'Sin limite de duracion'
                    : `Solo vuelos de hasta ${form!.max_duration_hours} horas`}
                </p>
              </section>

              {/* Excluded airlines */}
              <section>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Aerolineas excluidas
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  Vuelos cuyo nombre de aerolinea contenga estas palabras seran filtrados.
                </p>
                <div className="flex flex-wrap gap-1.5 mb-3 max-h-40 overflow-y-auto">
                  {form!.excluded_airlines.map(kw => (
                    <div
                      key={kw}
                      className="flex items-center gap-1 bg-red-950/40 border border-red-900/50 rounded-lg px-2.5 py-1"
                    >
                      <span className="text-xs text-red-300">{kw}</span>
                      <button
                        onClick={() => removeExcluded(kw)}
                        className="text-red-500/50 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {form!.excluded_airlines.length === 0 && (
                    <span className="text-xs text-slate-600 italic">Sin exclusiones</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    ref={newExcludedRef}
                    type="text"
                    value={newExcluded}
                    onChange={e => setNewExcluded(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addExcluded()}
                    placeholder="ej: emirates, qatar..."
                    className="flex-1 bg-[#111827] border border-[#1e2d45] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                  />
                  <button
                    onClick={addExcluded}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-900/50 hover:bg-red-800/50 text-red-300 text-sm rounded-lg transition-colors border border-red-800/50"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {form!.excluded_airlines.length > 0 && (
                  <button
                    onClick={() => setForm({ ...form!, excluded_airlines: [] })}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 mt-2 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Borrar todas las exclusiones
                  </button>
                )}
              </section>
            </>
          )}

          {/* Summary (always visible) */}
          {form && (
            <section className="bg-[#111827] border border-[#1e2d45] rounded-xl p-4">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Resumen
              </h4>
              <ul className="space-y-1 text-sm text-slate-300">
                <li>
                  <span className="text-slate-500">Origen: </span>
                  {form.origin}
                </li>
                <li>
                  <span className="text-slate-500">Destinos: </span>
                  {form.destinations.join(', ')}
                </li>
                <li>
                  <span className="text-slate-500">Busquedas por sweep: </span>
                  {previewDates.length * form.destinations.length}
                </li>
                <li>
                  <span className="text-slate-500">Estancia: </span>
                  {form.stay_days} dias
                </li>
                <li>
                  <span className="text-slate-500">Escalas: </span>
                  {STOPS_OPTIONS.find(o => o.value === form.max_stops)?.label ?? `Max ${form.max_stops}`}
                </li>
                <li>
                  <span className="text-slate-500">Duracion max: </span>
                  {form.max_duration_hours >= 50 ? 'Sin limite' : `${form.max_duration_hours}h`}
                </li>
                <li>
                  <span className="text-slate-500">Excluidas: </span>
                  {form.excluded_airlines.length} aerolinea{form.excluded_airlines.length !== 1 ? 's' : ''}
                </li>
              </ul>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#1e2d45] shrink-0 space-y-2">
          {status === 'ok' && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm mb-2">
              <CheckCircle className="w-4 h-4" />
              Configuracion guardada
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-2 text-red-400 text-sm mb-2">
              <AlertCircle className="w-4 h-4" />
              {errorMsg}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => handleSave(false)}
              disabled={saving || !form}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving || !form}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Guardar y buscar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
