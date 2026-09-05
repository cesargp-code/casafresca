import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3'

const sixHours = 6 * 60 * 60 * 1000

Deno.serve(async (request: Request) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (request.method !== 'POST') return new Response(null, { status: 405 })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)
  try {
    const { data: config, error: configError } = await db.from('casa_fresca_forecast_config').select('*').single()
    if (configError || !config) throw new Error('Forecast location is not configured')
    if (request.headers.get('x-forecast-token') !== config.refresh_token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const now = Date.now()
    const slot = new Date(Math.floor(now / sixHours) * sixHours).toISOString()
    const existing = await db.from('casa_fresca_forecast_runs').select('id').eq('fetch_slot', slot).maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data) return Response.json({ skipped: true, reason: 'Already fetched this six-hour slot' })

    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.search = new URLSearchParams({
      latitude: String(config.latitude), longitude: String(config.longitude),
      hourly: 'temperature_2m', models: 'best_match', temperature_unit: 'celsius',
      timezone: 'UTC', timeformat: 'unixtime', forecast_days: '8',
    }).toString()
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`)
    const payload = await response.json()
    const times = payload.hourly?.time
    const temperatures = payload.hourly?.temperature_2m
    if (!Array.isArray(times) || !Array.isArray(temperatures) || times.length !== temperatures.length || payload.hourly_units?.temperature_2m !== '°C') {
      throw new Error('Invalid forecast response')
    }
    const hourly = times.map((time: number, index: number) => {
      const temperature = temperatures[index]
      if (!Number.isFinite(time) || typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < -90 || temperature > 65 || (index > 0 && time - times[index - 1] !== 3600)) {
        throw new Error('Invalid hourly forecast point')
      }
      return { time: new Date(time * 1000).toISOString(), temperature }
    })
    if (hourly.filter((point) => Date.parse(point.time) >= now).length < 168) throw new Error('Forecast does not cover seven days ahead')

    const { error } = await db.from('casa_fresca_forecast_runs').insert({
      fetch_slot: slot, fetched_at: new Date(now).toISOString(),
      latitude: config.latitude, longitude: config.longitude,
      location_label: config.location_label, hourly,
    })
    if (error && error.code !== '23505') throw error
    // Allow 30 days of verification plus the seven-day forecast lead time.
    const cleanup = await db.from('casa_fresca_forecast_runs').delete().lt('fetched_at', new Date(now - 38 * 86400000).toISOString())
    if (cleanup.error) console.error('Forecast cleanup failed', cleanup.error.message)
    return Response.json({ ok: true, hours: hourly.length })
  } catch (error) {
    console.error('Forecast refresh failed', error instanceof Error ? error.message : error)
    return Response.json({ error: 'Forecast refresh failed; previous snapshot retained' }, { status: 502 })
  }
})
