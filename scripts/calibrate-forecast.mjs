// Node 22.18+; .env.local is read by the npm command, never printed.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildCalibration } from '../lib/forecastCalibration.ts'
import { loadCalibrationData } from '../lib/forecastCalibrationData.ts'

const args = process.argv.slice(2)
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const now = option('--now') ? Date.parse(option('--now')) : Date.now()
if (!Number.isFinite(now)) throw new Error('Invalid --now timestamp')
const file = option('--input')
const data = file ? JSON.parse(readFileSync(file, 'utf8')) : await loadCalibrationData(createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), now)
const latest = data.runs.at(-1)
const runs = data.runs.filter(r => r.provider === latest?.provider && r.model === latest?.model && r.location_label === latest?.location_label)
const calibration = buildCalibration(data.readings, runs, now)
if (option('--output')) writeFileSync(option('--output'), JSON.stringify(calibration, null, 2) + '\n')
console.log(JSON.stringify({ ...calibration, horizons: calibration.horizons.map(({ offsets, ...h }) => ({
  ...h, offsetRange: [Math.min(...offsets), Math.max(...offsets)],
})) }, null, 2))
