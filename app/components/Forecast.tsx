'use client'

import TemperatureChart from './TemperatureChart'
import type { ForecastRun } from '@/lib/useForecast'

const hour = 3600000

export default function Forecast({ forecast, now }: { forecast: ForecastRun | null; now: number }) {
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
