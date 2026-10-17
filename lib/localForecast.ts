import { supabase } from './supabase'
import { applyCalibration, buildCalibration, type Calibration, type CalibrationRun } from './forecastCalibration'
import { loadCalibrationData } from './forecastCalibrationData'

// Cache within each server instance; a new forecast or an hour of new readings
// triggers recalibration. Concurrent requests share the same calculation.
let cached: { key: string; expires: number; value: Promise<Calibration> } | undefined
export async function localForecast<T extends CalibrationRun>(run: T, now = Date.now()) {
  if (!supabase) throw new Error('Forecast unavailable')
  const key = [run.fetched_at, run.provider, run.model, run.location_label].join('|')
  if (!cached || cached.key !== key || cached.expires <= now) {
    const db = supabase
    const value = loadCalibrationData(db, now).then(({ readings, runs }) => buildCalibration(readings,
      runs.filter(r => r.provider === run.provider && r.model === run.model && r.location_label === run.location_label), now))
    cached = { key, expires: now + 3600000, value }
    // Failed history reads must be retried and must never break the raw forecast.
    void value.catch(() => { if (cached?.value === value) cached = undefined })
  }
  const calibration = await cached.value
  return { ...applyCalibration(run, calibration), calibration }
}
