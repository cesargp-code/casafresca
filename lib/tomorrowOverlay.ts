import type { Point } from './useForecast'

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function localTime(time: string | number) {
  const parts = Object.fromEntries(clock.formatToParts(new Date(time)).map(p => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) }
}

// Compare tomorrow's calendar day against the same Madrid clock time in the
// rolling 24-hour chart. Interpolate hourly forecasts to the station timestamps.
export function tomorrowOverlay(readings: { originalTimestamp: string }[], points: Point[], now: number) {
  const today = localTime(now).date
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
  const followingDay = new Date(Date.parse(today + 'T00:00:00Z') + 2 * 86400000).toISOString().slice(0, 10)
  const samples = points.flatMap(point => {
    const local = localTime(point.time)
    if (!Number.isFinite(point.temperature)) return []
    if (local.date === tomorrow) return [{ minute: local.minute, temperature: point.temperature }]
    if (local.date === followingDay && local.minute === 0) return [{ minute: 1440, temperature: point.temperature }]
    return []
  }).sort((a, b) => a.minute - b.minute)

  return readings.map(reading => {
    const minute = localTime(reading.originalTimestamp).minute
    const right = samples.findIndex(sample => sample.minute >= minute)
    if (right < 0) return null
    if (samples[right].minute === minute) return samples[right].temperature
    if (right === 0) return null
    const left = samples[right - 1]
    const next = samples[right]
    if (next.minute - left.minute > 60) return null
    return left.temperature + (next.temperature - left.temperature) * (minute - left.minute) / (next.minute - left.minute)
  })
}
