'use client'

import { useCallback, useEffect, useState } from 'react'
import TemperatureChart from './TemperatureChart'

type Point = { time: string; temperature: number }
type ForecastRun = { fetched_at: string; location_label: string; hourly: Point[] }
const hour = 3600000

export default function Forecast() {
  const [forecast, setForecast] = useState<ForecastRun | null>(null)
  const [now, setNow] = useState(Date.now())

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/forecast', { signal })
      if (!response.ok) throw new Error('Forecast unavailable')
      const result = await response.json()
      if (!signal?.aborted) {
        setForecast(result.forecast)
        setNow(Date.now())
      }
    } catch (error) {
      if (!signal?.aborted) console.warn('Could not refresh forecast:', error)
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

  const start = Math.floor(now / hour) * hour
  const end = start + 7 * 24 * hour
  const formattedData = (forecast?.hourly || [])
    .filter(point => Date.parse(point.time) >= start && Date.parse(point.time) <= end)
    .map(point => ({
      time: new Date(point.time).toLocaleString('es-ES', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
      }),
      originalTimestamp: point.time,
      outdoor: point.temperature,
      indoor: null,
      yesterdayOutdoor: null,
      yesterdayIndoor: null,
    }))

  return (
    <>
      <TemperatureChart formattedData={formattedData} showYesterdayOverlay={false} forecast />
      <p className="text-center text-sm text-gray-500 mb-6">
        actualizado a las {forecast ? new Date(forecast.fetched_at).toLocaleTimeString('es-ES', {
          hour: '2-digit', minute: '2-digit', hour12: false,
        }) : '--:--'}
      </p>
    </>
  )
}
