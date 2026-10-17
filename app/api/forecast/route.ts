import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { localForecast } from '@/lib/localForecast'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!supabase) return NextResponse.json({ error: 'Forecast unavailable' }, { status: 503 })
  const { data, error } = await supabase.from('casa_fresca_forecast_runs')
    .select('id, fetched_at, provider, model, location_label, hourly')
    .order('fetched_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return NextResponse.json({ error: 'Forecast unavailable' }, { status: 503 })
  let forecast: (NonNullable<typeof data> & { calibration?: { status: string } }) | null = data
  if (data) {
    try {
      forecast = await localForecast(data)
    } catch {
      console.warn('Local calibration unavailable; serving original forecast')
      forecast = { ...data, calibration: { status: 'unavailable' } }
    }
  }
  return NextResponse.json({ forecast }, { headers: { 'Cache-Control': 'no-store' } })
}
