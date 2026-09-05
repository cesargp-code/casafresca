import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!supabase) return NextResponse.json({ error: 'Forecast unavailable' }, { status: 503 })
  const { data, error } = await supabase.from('casa_fresca_forecast_runs')
    .select('id, fetched_at, provider, model, location_label, hourly')
    .order('fetched_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return NextResponse.json({ error: 'Forecast unavailable' }, { status: 503 })
  return NextResponse.json({ forecast: data }, { headers: { 'Cache-Control': 'no-store' } })
}
