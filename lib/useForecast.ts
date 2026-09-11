'use client'

import { useCallback, useEffect, useState } from 'react'

export type Point = { time: string; temperature: number }
export type ForecastRun = { fetched_at: string; location_label: string; hourly: Point[] }
const hour = 3600000

export function useForecast() {
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

  return { forecast, now }
}
