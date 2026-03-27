import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plane, ExternalLink } from 'lucide-react'
import type { FlightOffer, Segment, Stop } from '../api/flights'

interface Props {
  offer: FlightOffer
}

const AIRLINE_LOGOS: Record<string, string> = {
  IB: 'https://www.gstatic.com/flights/airline_logos/70px/IB.png',
  VY: 'https://www.gstatic.com/flights/airline_logos/70px/VY.png',
  CA: 'https://www.gstatic.com/flights/airline_logos/70px/CA.png',
  CZ: 'https://www.gstatic.com/flights/airline_logos/70px/CZ.png',
  MU: 'https://www.gstatic.com/flights/airline_logos/70px/MU.png',
  TK: 'https://www.gstatic.com/flights/airline_logos/70px/TK.png',
  LH: 'https://www.gstatic.com/flights/airline_logos/70px/LH.png',
  KL: 'https://www.gstatic.com/flights/airline_logos/70px/KL.png',
  AF: 'https://www.gstatic.com/flights/airline_logos/70px/AF.png',
  AY: 'https://www.gstatic.com/flights/airline_logos/70px/AY.png',
  OS: 'https://www.gstatic.com/flights/airline_logos/70px/OS.png',
  SQ: 'https://www.gstatic.com/flights/airline_logos/70px/SQ.png',
  CX: 'https://www.gstatic.com/flights/airline_logos/70px/CX.png',
  NH: 'https://www.gstatic.com/flights/airline_logos/70px/NH.png',
  JL: 'https://www.gstatic.com/flights/airline_logos/70px/JL.png',
}

const DEST_CITIES: Record<string, string> = {
  PEK: 'Pekín',
  PVG: 'Shanghái',
  CAN: 'Guangzhou',
  SZX: 'Shenzhen',
  HKG: 'Hong Kong',
  MAD: 'Madrid',
}

function fmtTime(isoStr: string) {
  try { return format(parseISO(isoStr), 'HH:mm') } catch { return '--:--' }
}

function fmtDate(isoStr: string) {
  try { return format(parseISO(isoStr), 'EEE d MMM', { locale: es }) } catch { return '' }
}

function dayOffset(dep: string, arr: string): number {
  try {
    const d1 = parseISO(dep)
    const d2 = parseISO(arr)
    return Math.round((d2.getTime() - d1.getTime()) / 86400000)
  } catch { return 0 }
}

interface LegProps {
  segments: Segment[]
  duration: string
  label: string
  stopsList?: Stop[]
}

function Leg({ segments, duration, label, stopsList = [] }: LegProps) {
  if (!segments.length) return null
  const first = segments[0]
  const last = segments[segments.length - 1]
  // fast-flights only returns 1 segment even for multi-stop flights;
  // use stopsList.length (from the DB stops field) as the real stops count
  const stops = segments.length > 1 ? segments.length - 1 : stopsList.length
  const offset = dayOffset(first.departure.at, last.arrival.at)

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </span>
      <div className="flex items-center gap-3">
        {/* Departure */}
        <div className="text-center min-w-[52px]">
          <div className="text-xl font-bold text-white leading-none">
            {fmtTime(first.departure.at)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {first.departure.iataCode}
          </div>
          <div className="text-xs text-slate-500 hidden sm:block">
            {DEST_CITIES[first.departure.iataCode] ?? first.departure.iataCode}
          </div>
        </div>

        {/* Middle: duration + stops */}
        <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-xs text-slate-500">{duration}</span>
          <div className="w-full flex items-center gap-1">
            <div className="h-px flex-1 bg-slate-700" />
            {stops > 0 ? (
              <>
                {/* Use stopsList for intermediate airports when available */}
                {(stopsList.length > 0 ? stopsList : Array(stops).fill({ iataCode: '?' })).map((stop, i) => (
                  <div
                    key={i}
                    className="group relative"
                    title={stop.iataCode !== '?' ? `Escala: ${stop.iataCode}` : 'Escala'}
                  >
                    <div className="w-2 h-2 rounded-full bg-slate-500 border border-slate-400" />
                    {stop.iataCode !== '?' && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow">
                        {stop.iataCode}
                      </div>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <Plane className="w-3 h-3 text-blue-400 rotate-90" />
            )}
            <div className="h-px flex-1 bg-slate-700" />
          </div>
          <span className="text-xs">
            {stops === 0 ? (
              <span className="text-emerald-400">Directo</span>
            ) : (
              <span className="text-amber-400">
                {stops} escala{stops > 1 ? 's' : ''}{' '}
                <span className="text-slate-500">
                  ({segments.slice(0, -1).map(s => s.arrival.iataCode).join(', ')})
                </span>
              </span>
            )}
          </span>
        </div>

        {/* Arrival */}
        <div className="text-center min-w-[52px]">
          <div className="text-xl font-bold text-white leading-none flex items-start justify-center gap-0.5">
            {fmtTime(last.arrival.at)}
            {offset > 0 && (
              <span className="text-xs text-amber-400 font-normal mt-0.5">
                +{offset}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {last.arrival.iataCode}
          </div>
          <div className="text-xs text-slate-500 hidden sm:block">
            {DEST_CITIES[last.arrival.iataCode] ?? last.arrival.iataCode}
          </div>
        </div>
      </div>

      {/* Segment detail on hover */}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {segments.map((seg) => (
          <span
            key={seg.flightNumber}
            className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-slate-400"
          >
            {seg.flightNumber}
            {seg.aircraft ? ` · ${seg.aircraft}` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}


export default function FlightCard({ offer }: Props) {
  const primaryCarrier = offer.airline_codes.split(',')[0].trim()
  const logoUrl = AIRLINE_LOGOS[primaryCarrier]
  const dest = offer.route.split('-')[1]

  return (
    <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl p-5 hover:border-blue-500/40 transition-colors duration-200 group">
      <div className="flex flex-col gap-4">
        {/* Top row: airline + price */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {(offer.airline_logo || logoUrl) ? (
              <img
                src={offer.airline_logo || logoUrl}
                alt={primaryCarrier}
                className="w-8 h-8 object-contain rounded"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="w-8 h-8 rounded bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                {primaryCarrier}
              </div>
            )}
            <div>
              <div className="font-semibold text-white text-sm">
                {offer.airline_names || offer.airline_codes}
              </div>
              <div className="text-xs text-slate-500">
                {DEST_CITIES['MAD']} → {DEST_CITIES[dest] ?? dest}
                {' · '}
                {fmtDate(offer.departure_date)}
                {' – '}
                {fmtDate(offer.return_date)}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-2xl font-extrabold text-blue-400">
              €{offer.price_eur.toLocaleString('es-ES', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="text-xs text-slate-500">por persona · ida y vuelta</div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[#1e2d45]" />

        {/* Outbound leg */}
        <Leg
          segments={offer.outbound_segments}
          duration={offer.outbound_duration}
          label="Ida"
          stopsList={offer.outbound_stops}
        />

        {/* Divider */}
        <div className="border-t border-dashed border-[#1e2d45]" />

        {/* Return leg */}
        {offer.return_segments.length > 0 ? (
          <Leg
            segments={offer.return_segments}
            duration={offer.return_duration}
            label="Vuelta"
            stopsList={offer.return_stops}
          />
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 uppercase tracking-wider mb-1">Vuelta</span>
            <p className="text-xs text-slate-500 italic">
              {offer.return_date
                ? `Retorno ~ ${fmtDate(offer.return_date)} · ver detalles en Google Flights`
                : 'Ver detalles en Google Flights'}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-slate-600">
            Actualizado {format(parseISO(offer.scraped_at), "d MMM HH:mm", { locale: es })}
          </span>
          <a
            href={offer.google_flights_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors bg-blue-950/40 border border-blue-900/50 px-3 py-1.5 rounded-lg"
          >
            <ExternalLink className="w-3 h-3" />
            Ver en Google Flights
          </a>
        </div>
      </div>
    </div>
  )
}
