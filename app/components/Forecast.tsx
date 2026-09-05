'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { ApexOptions } from 'apexcharts'

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false })
type Point = { time: string; temperature: number }
type ForecastRun = { fetched_at: string; location_label: string; hourly: Point[] }
const madrid = { timeZone: 'Europe/Madrid' }
const hour = 3600000

export default function Forecast() {
  const [forecast, setForecast] = useState<ForecastRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [now, setNow] = useState(Date.now())

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/forecast', { signal })
      if (!response.ok) throw new Error('Forecast unavailable')
      const result = await response.json()
      if (!signal?.aborted) {
        setForecast(result.forecast)
        setError(false)
        setNow(Date.now())
      }
    } catch {
      if (!signal?.aborted) setError(true)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const update = () => {
      if (document.visibilityState === 'visible') void refresh(controller.signal)
    }
    void refresh(controller.signal)
    const interval = setInterval(update, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', update)
    return () => {
      controller.abort()
      clearInterval(interval)
      document.removeEventListener('visibilitychange', update)
    }
  }, [refresh])

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-gray-500" role="status">Cargando previsión…</div>
  if (!forecast) return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 px-5 text-center text-sm text-gray-500" role="status">
      <p>{error ? 'No se ha podido cargar la previsión.' : 'La primera previsión estará disponible pronto.'}</p>
      <button className="rounded-md border border-gray-300 px-4 py-2 text-gray-700" onClick={() => void refresh()}>Reintentar</button>
    </div>
  )

  const start = Math.floor(now / hour) * hour
  const end = start + 7 * 24 * hour
  const points = forecast.hourly.filter(p => Date.parse(p.time) >= start && Date.parse(p.time) <= end)
  const stale = now - Date.parse(forecast.fetched_at) > 12 * hour
  const days = new Map<string, Point[]>()
  for (const point of points) {
    const key = new Date(point.time).toLocaleDateString('en-CA', madrid)
    days.set(key, [...(days.get(key) || []), point])
  }
  const options: ApexOptions = {
    chart: { type: 'line', toolbar: { show: false }, zoom: { enabled: false }, fontFamily: 'inherit' },
    colors: ['#C11818'],
    stroke: { width: 2, dashArray: 5, curve: 'straight' },
    markers: { size: 0 }, dataLabels: { enabled: false }, legend: { show: false },
    grid: { borderColor: '#e5e7eb' },
    xaxis: {
      type: 'datetime', min: start, max: end, tickAmount: 6,
      labels: { style: { fontSize: '10px' }, datetimeUTC: false,
        formatter: (_value, timestamp) => timestamp === undefined ? '' : new Date(timestamp).toLocaleDateString('es-ES', { ...madrid, weekday: 'short', day: 'numeric' }) },
      tooltip: { enabled: false },
    },
    yaxis: { labels: { formatter: value => `${Math.round(value)}°`, style: { fontSize: '11px' } } },
    tooltip: {
      x: { formatter: value => new Date(value).toLocaleString('es-ES', { ...madrid, weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) },
      y: { formatter: value => `${value.toFixed(1)} °C` },
    },
  }

  return (
    <section aria-label="Previsión de temperatura exterior para siete días">
      <div className="px-5 pt-2">
        <h2 className="text-sm font-medium text-gray-700">Temperatura exterior · próximos 7 días</h2>
        <p className="mt-1 text-xs text-gray-500">{forecast.location_label}</p>
      </div>
      {points.length > 0 ? <div className="h-64 md:h-72 lg:h-80"><Chart type="line" height="100%" width="100%" options={options} series={[{ name: 'Exterior previsto', data: points.map(p => ({ x: Date.parse(p.time), y: p.temperature })) }]} /></div>
        : <p className="p-8 text-center text-sm text-gray-500">La previsión guardada ha caducado.</p>}
      <div className="mx-4 mb-4 flex gap-2 overflow-x-auto pb-2" aria-label="Mínimas y máximas previstas">
        {Array.from(days.entries()).map(([day, values]) => {
          const temps = values.map(p => p.temperature)
          return <div key={day} className="min-w-20 flex-1 rounded-lg bg-gray-50 px-2 py-3 text-center">
            <p className="text-xs text-gray-500">{new Date(values[0].time).toLocaleDateString('es-ES', { ...madrid, weekday: 'short', day: 'numeric' })}</p>
            <p className="mt-1 text-sm font-medium text-gray-700">{Math.round(Math.max(...temps))}° <span className="font-normal text-gray-500">/ {Math.round(Math.min(...temps))}°</span></p>
            {values.length < 23 && <p className="mt-1 text-[10px] text-gray-500">Parcial</p>}
          </div>
        })}
      </div>
      <div className="mx-5 mb-5 space-y-2 text-center text-xs text-gray-500">
        <p>Recopilando datos para el ajuste local. Previsión sin ajustar.</p>
        <p>Menor precisión a medida que avanza la semana.</p>
        <p>Actualizada el {new Date(forecast.fetched_at).toLocaleString('es-ES', { ...madrid, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a></p>
        {(stale || error) && <p role="status" className="text-amber-700">{stale ? 'Previsión pendiente de actualizar.' : 'No se ha podido actualizar.'} Mostramos la última disponible. <button className="underline" onClick={() => void refresh()}>Reintentar</button></p>}
      </div>
    </section>
  )
}
