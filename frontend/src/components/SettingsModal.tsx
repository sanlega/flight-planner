import { useState, useEffect, useRef } from 'react'
import { X, Plus, Save, RefreshCw, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface Settings {
  origin: string
  destinations: string[]
  departure_date_start: string
  departure_date_end: string
  departure_date_step: number
  stay_days: number
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (andRefresh: boolean) => void
}

const KNOWN_AIRPORTS: Record<string, string> = {
  MAD: 'Madrid Barajas', BCN: 'Barcelona El Prat', PMI: 'Palma de Mallorca',
  PEK: 'Pekín Capital', PKX: 'Pekín Daxing', PVG: 'Shanghái Pudong',
  SHA: 'Shanghái Hongqiao', CAN: 'Guangzhou', SZX: 'Shenzhen',
  HKG: 'Hong Kong', CTU: 'Chengdu', XIY: 'Xi\'an', WUH: 'Wuhan',
  NKG: 'Nanjing', TAO: 'Qingdao', HGH: 'Hangzhou', CSX: 'Changsha',
  LHR: 'Londres Heathrow', CDG: 'París Charles de Gaulle',
  FRA: 'Fráncfort', AMS: 'Ámsterdam', IST: 'Estambul',
  DXB: 'Dubái', SIN: 'Singapur', BKK: 'Bangkok',
}

function airportLabel(code: string) {
  return KNOWN_AIRPORTS[code] ? `${code} – ${KNOWN_AIRPORTS[code]}` : code
}

async function fetchSettings(): Promise<Settings> {
  const r = await fetch('/api/settings')
  if (!r.ok) throw new Error('Error cargando configuración')
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

export default function SettingsModal({ open, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Settings | null>(null)
  const [newDest, setNewDest] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const newDestRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setStatus('idle')
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
            <h2 className="text-base font-bold text-white">Configuración de búsqueda</h2>
            <p className="text-xs text-slate-500 mt-0.5">Los cambios se aplican en el próximo sweep</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {!form ? (
            <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Cargando...
            </div>
          ) : (
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
                    {KNOWN_AIRPORTS[form.origin] ?? 'Código IATA de 3 letras'}
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
                    placeholder="Añadir código IATA..."
                    className="flex-1 bg-[#111827] border border-[#1e2d45] text-white text-sm rounded-lg px-3 py-2 uppercase font-mono tracking-widest focus:outline-none focus:border-blue-500 placeholder:normal-case placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-600"
                  />
                  <button
                    onClick={addDest}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Añadir
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
                      {form.departure_date_step} día{form.departure_date_step > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Preview of resulting dates */}
                {previewDates.length > 0 && (
                  <div className="mt-3 p-3 bg-[#111827] border border-[#1e2d45] rounded-lg">
                    <span className="text-xs text-slate-500 block mb-2">
                      Se buscarán {previewDates.length} fecha{previewDates.length > 1 ? 's' : ''}:
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
                  Duración de la estancia
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
                    {form.stay_days} días
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Vuelta {form.stay_days} días después de la salida
                </p>
              </section>

              {/* Summary */}
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
                    <span className="text-slate-500">Búsquedas por sweep: </span>
                    {previewDates.length * form.destinations.length}
                  </li>
                  <li>
                    <span className="text-slate-500">Estancia: </span>
                    {form.stay_days} días
                  </li>
                </ul>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#1e2d45] shrink-0 space-y-2">
          {status === 'ok' && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm mb-2">
              <CheckCircle className="w-4 h-4" />
              Configuración guardada
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
