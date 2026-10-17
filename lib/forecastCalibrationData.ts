import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalibrationRun, Reading } from './forecastCalibration'

// Supabase caps responses at 1,000 rows; 30 days of quarter-hour readings
// require multiple pages. Throw on any failed page rather than fit partial data.
export async function loadCalibrationData(db: SupabaseClient, now = Date.now()) {
  async function pages<T>(table: string, columns: string, order: string, since: number): Promise<T[]> {
    const rows: T[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select(columns)
        .gte(order, new Date(since).toISOString()).lte(order, new Date(now).toISOString())
        .order(order, { ascending: true }).range(from, from + 999)
      if (error) throw new Error(`Could not load calibration ${table}: ${error.message}`)
      rows.push(...(data as unknown as T[]))
      if (data.length < 1000) return rows
    }
  }
  const day = 86400000
  const [readings, runs] = await Promise.all([
    pages<Reading>('casa_fresca_readings', 'timestamp,outdoor_temp', 'timestamp', now - 30 * day),
    pages<CalibrationRun>('casa_fresca_forecast_runs', 'fetched_at,provider,model,location_label,hourly', 'fetched_at', now - 38 * day),
  ])
  return { readings, runs }
}
