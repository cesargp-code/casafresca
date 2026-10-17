// Keep this module independent of the database so calibration can be audited offline.
export type ForecastPoint = { time: string; temperature: number }
export type CalibrationRun = { fetched_at: string; hourly: ForecastPoint[]; provider?: string; model?: string; location_label?: string }
export type Reading = { timestamp: string; outdoor_temp: number | string | null }
type Sample = { time: number; temperature: number }
type Pair = { time: number; issued: number; date: string; hour: number; horizon: number; residual: number }
export type Exclusion = { start: string; end: string; readings: number }
export type HorizonCalibration = {
  leadDay: number; enabled: boolean; offsets: number[]; trainingDays: number
  validationDays: number; validationHours: number; improvedDays: number
  rawMae: number | null; adjustedMae: number | null
}
export type Calibration = {
  version: 1; status: 'adjusted' | 'insufficient-data' | 'no-improvement' | 'stale-readings'
  generatedAt: string; lastValidReading: string | null; excludedReadings: number
  exclusions: Exclusion[]; horizons: HorizonCalibration[]
}
const hour = 3600000
const day = 24 * hour
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23',
})
function local(time: number) {
  const parts = Object.fromEntries(clock.formatToParts(time).map(p => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}
function temperature(value: Reading['outdoor_temp']) {
  if (value === null || (typeof value === 'string' && !value.trim())) return NaN
  const n = Number(value)
  return Number.isFinite(n) && n >= -90 && n <= 65 ? n : NaN
}

// A six-hour exact outdoor plateau is implausible at the station's precision.
// Exclude the whole run, including its onset. A gap does not prove recovery.
export function cleanReadings(readings: Reading[], now: number) {
  const samples: Sample[] = readings.map(r => ({ time: Date.parse(r.timestamp), temperature: temperature(r.outdoor_temp) }))
    .filter(r => Number.isFinite(r.time) && Number.isFinite(r.temperature) && r.time <= now)
    .sort((a, b) => a.time - b.time)
    .filter((r, i, all) => i === 0 || r.time !== all[i - 1].time)
  const valid: Sample[] = []
  const exclusions: Exclusion[] = []
  for (let start = 0; start < samples.length;) {
    let end = start + 1
    while (end < samples.length && samples[end].temperature === samples[start].temperature) end++
    if (end - start >= 8 && samples[end - 1].time - samples[start].time >= 6 * hour) {
      exclusions.push({ start: new Date(samples[start].time).toISOString(), end: new Date(samples[end - 1].time).toISOString(), readings: end - start })
    } else valid.push(...samples.slice(start, end))
    start = end
  }
  return { valid, exclusions }
}

export function calibrationPairs(readings: Sample[], runs: CalibrationRun[]): Pair[] {
  // Interpolate only between valid observations at most 30 minutes apart.
  const observed = new Map<number, number>()
  for (let i = 1; i < readings.length; i++) {
    const a = readings[i - 1], b = readings[i]
    if (b.time - a.time > hour / 2) continue
    for (let t = Math.ceil(a.time / hour) * hour; t <= b.time; t += hour) {
      observed.set(t, a.temperature + (b.temperature - a.temperature) * (t - a.time) / (b.time - a.time))
    }
  }
  // One verification per target hour and lead-day bucket; repeated refreshes
  // must not turn one observation into several independent samples.
  const pairs = new Map<string, Pair>()
  for (const run of [...runs].sort((a, b) => Date.parse(a.fetched_at) - Date.parse(b.fetched_at))) {
    const fetched = Date.parse(run.fetched_at)
    if (!Number.isFinite(fetched)) continue
    for (const point of run.hourly) {
      const time = Date.parse(point.time), obs = observed.get(time)
      const lead = time - fetched
      if (obs === undefined || lead < 0 || lead >= 7 * day || !Number.isFinite(temperature(point.temperature))) continue
      const horizon = Math.floor(lead / day)
      pairs.set(`${time}:${horizon}`, { time, issued: fetched, ...local(time), horizon, residual: obs - point.temperature })
    }
  }
  return [...pairs.values()].sort((a, b) => a.time - b.time)
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
function fit(pairs: Pair[]) {
  const dates = [...new Set(pairs.map(p => p.date))].sort().slice(-14)
  const recent = pairs.filter(p => dates.includes(p.date))
  const offsets = Array.from({ length: 24 }, (_, h) => {
    const nearby = recent.filter(p => Math.min((p.hour - h + 24) % 24, (h - p.hour + 24) % 24) <= 1)
    if (new Set(nearby.map(p => p.date)).size < 7) return null
    // Half-strength median bias limits overcorrection with a short history.
    return Math.max(-4, Math.min(4, median(nearby.map(p => p.residual)) * 0.5))
  })
  return { offsets: offsets.every(n => n !== null) ? offsets as number[] : null, days: dates.length }
}

export function buildCalibration(readings: Reading[], runs: CalibrationRun[], now = Date.now()): Calibration {
  const { valid, exclusions } = cleanReadings(readings, now)
  const last = valid.at(-1)?.time
  const pairs = calibrationPairs(valid, runs)
  const today = local(now).date
  const horizons = Array.from({ length: 7 }, (_, horizon): HorizonCalibration => {
    const all = pairs.filter(p => p.horizon === horizon)
    // Use well-covered, completed Madrid calendar days only. Outage fragments
    // and partial first/last days cannot dominate either training or validation.
    const counts = new Map<string, number>()
    all.forEach(p => counts.set(p.date, (counts.get(p.date) || 0) + 1))
    const full = all.filter(p => p.date < today && (counts.get(p.date) || 0) >= 20)
    const dates = [...new Set(full.map(p => p.date))].sort()
    const validationDates = dates.slice(-7)
    let rawError = 0, adjustedError = 0, hours = 0, improvedDays = 0, validationDays = 0
    for (const date of validationDates) {
      const test = full.filter(p => p.date === date)
      // Training observations must predate forecast issuance, not merely its
      // target day. Otherwise long-lead validation would leak future weather.
      const issuedDate = local(Math.min(...test.map(p => p.issued))).date
      const trained = fit(full.filter(p => p.date < issuedDate))
      if (!trained.offsets) continue
      let raw = 0, adjusted = 0
      for (const p of test) {
        raw += Math.abs(p.residual)
        adjusted += Math.abs(p.residual - trained.offsets[p.hour])
      }
      rawError += raw; adjustedError += adjusted; hours += test.length; validationDays++
      if (adjusted < raw) improvedDays++
    }
    const fitted = fit(full)
    const rawMae = hours ? rawError / hours : null
    const adjustedMae = hours ? adjustedError / hours : null
    const enabled = fitted.offsets !== null && validationDays >= 5 && improvedDays >= Math.ceil(validationDays * 0.6)
      && rawMae !== null && adjustedMae !== null && rawMae - adjustedMae >= Math.max(0.1, rawMae * 0.05)
    return { leadDay: horizon + 1, enabled, offsets: fitted.offsets || Array(24).fill(0), trainingDays: fitted.days,
      validationDays, validationHours: hours, improvedDays, rawMae, adjustedMae }
  })
  const stale = last !== undefined && now - last > 7 * day
  if (stale) horizons.forEach(h => { h.enabled = false })
  return { version: 1, status: stale ? 'stale-readings' : horizons.some(h => h.enabled) ? 'adjusted'
    : horizons.some(h => h.validationDays >= 5) ? 'no-improvement' : 'insufficient-data',
    generatedAt: new Date(now).toISOString(), lastValidReading: last === undefined ? null : new Date(last).toISOString(),
    excludedReadings: exclusions.reduce((n, e) => n + e.readings, 0), exclusions, horizons }
}

export function applyCalibration<T extends CalibrationRun>(run: T, calibration: Calibration): T {
  const fetched = Date.parse(run.fetched_at)
  return { ...run, hourly: run.hourly.map(point => {
    const time = Date.parse(point.time), lead = time - fetched
    const h = calibration.horizons[Math.floor(lead / day)]
    const offset = calibration.status === 'adjusted' && h?.enabled ? h.offsets[local(time).hour] : 0
    return { ...point, temperature: point.temperature + offset }
  }) }
}
