import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanReadings, calibrationPairs, buildCalibration, applyCalibration } from '../lib/forecastCalibration.ts'
import { loadCalibrationData } from '../lib/forecastCalibrationData.ts'

const hour = 3600000, day = 24 * hour
const start = Date.parse('2026-09-01T00:00:00Z')
const iso = t => new Date(t).toISOString()
const reading = (t, value) => ({ timestamp: iso(t), outdoor_temp: value })

function history(days = 30, bias = 2) {
  const readings = [], runs = []
  for (let i = 0; i <= days * 96; i++) {
    const t = start + i * hour / 4
    readings.push(reading(t, 15 + 5 * Math.sin(i / 96 * Math.PI * 2)))
  }
  for (let i = -7 * 4; i < days * 4; i++) {
    const fetched = start + i * 6 * hour + 10 * 60000
    const hourly = []
    for (let j = 1; j <= 168; j++) {
      const t = start + i * 6 * hour + j * hour
      hourly.push({ time: iso(t), temperature: 15 + 5 * Math.sin((t - start) / day * Math.PI * 2) - bias })
    }
    runs.push({ fetched_at: iso(fetched), hourly })
  }
  return { readings, runs, now: start + days * day }
}

test('excludes the entire frozen stretch, invalid values, and future readings; resumes on change', () => {
  const readings = [reading(start - hour, 12), ...Array.from({ length: 29 }, (_, i) => reading(start + i * hour / 4, '27.5')),
    reading(start + 8 * hour, 20), reading(start + 9 * hour, null), reading(start + 10 * hour, ''), reading(start + 11 * hour, 99), reading(start + 20 * hour, 10)]
  const { valid, exclusions } = cleanReadings(readings, start + 12 * hour)
  assert.deepEqual(valid.map(r => r.temperature), [12, 20])
  assert.equal(exclusions[0].readings, 29)
  assert.equal(exclusions[0].start, iso(start))
  assert.equal(cleanReadings(readings.slice(0, 8), start + day).exclusions.length, 0)
})

test('pairs only pre-issued forecasts, deduplicates refreshes, and never bridges observation gaps', () => {
  const samples = [-0.25, 0.25, 2.25].map(h => ({ time: start + h * hour, temperature: 20 + h }))
  const point = { time: iso(start), temperature: 17 }
  const runs = [
    { fetched_at: iso(start - 2 * hour), hourly: [point] },
    { fetched_at: iso(start - hour), hourly: [{ ...point, temperature: 18 }] },
    { fetched_at: iso(start + 1), hourly: [{ ...point, temperature: -50 }] },
    { fetched_at: iso(start - hour), hourly: [{ time: iso(start + hour), temperature: 0 }] },
  ]
  const pairs = calibrationPairs(samples, runs)
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].residual, 2)
  assert.equal(pairs[0].issued, start - hour)
})

test('learns consistent bias with forward validation and leaves stored forecasts immutable', () => {
  const { readings, runs, now } = history()
  const c = buildCalibration(readings, runs, now)
  assert.equal(c.status, 'adjusted')
  assert.ok(c.horizons.every(h => h.enabled && h.rawMae > 1.99 && h.adjustedMae < 1.01))
  const run = runs.at(-1), before = structuredClone(run)
  const adjusted = applyCalibration(run, c)
  assert.deepEqual(run, before)
  assert.ok(Math.abs(adjusted.hourly[0].temperature - run.hourly[0].temperature - 1) < 0.00001)
  c.horizons[0].enabled = false
  assert.equal(applyCalibration(run, c).hourly[0].temperature, run.hourly[0].temperature)
})

test('long-lead validation cannot train on observations collected after issuance', () => {
  const { readings, runs, now } = history(17)
  const c = buildCalibration(readings, runs, now)
  assert.ok(c.horizons[0].validationDays >= 5)
  assert.ok(c.horizons[6].validationDays < 5)
  assert.equal(c.horizons[6].enabled, false)
})

test('insufficient, unbiased, and stale histories keep original forecasts', () => {
  const short = history(4)
  assert.equal(buildCalibration(short.readings, short.runs, short.now).status, 'insufficient-data')
  const unbiased = history(30, 0)
  assert.equal(buildCalibration(unbiased.readings, unbiased.runs, unbiased.now).status, 'no-improvement')
  const good = history()
  const stale = buildCalibration(good.readings, good.runs, good.now + 8 * day)
  assert.equal(stale.status, 'stale-readings')
  assert.ok(stale.horizons.every(h => !h.enabled))
  assert.deepEqual(applyCalibration(good.runs.at(-1), stale), good.runs.at(-1))
})

test('a multi-day Wi-Fi plateau has no influence on the fitted adjustments', () => {
  const { readings, runs, now } = history()
  const frozen = Array.from({ length: 192 }, (_, i) => reading(now + (i + 1) * hour / 4, 27.5))
  const clean = buildCalibration(readings, runs, now + 2 * day)
  const dirty = buildCalibration([...readings, ...frozen], runs, now + 2 * day)
  assert.equal(dirty.excludedReadings, 192)
  assert.deepEqual(dirty.horizons, clean.horizons)
})

test('Madrid hour selection follows daylight saving changes', () => {
  const point = time => ({ time, temperature: 10 })
  const c = { status: 'adjusted', horizons: [{ enabled: true, offsets: Array.from({ length: 24 }, (_, h) => h) }] }
  for (const [date, expected] of [['2026-10-24', 24], ['2026-10-25', 23]]) {
    const run = { fetched_at: `${date}T00:00:00Z`, hourly: [point(`${date}T12:00:00Z`)] }
    assert.equal(applyCalibration(run, c).hourly[0].temperature, expected)
  }
})

test('history loading pages beyond 1,000 rows and rejects incomplete reads', async () => {
  const requests = []
  function db(fail = false) {
    return { from(table) {
      const q = { select() { return q }, gte() { return q }, lte() { return q }, order() { return q },
        async range(from, to) {
          requests.push([table, from, to])
          if (fail && from === 1000) return { data: null, error: { message: 'unavailable' } }
          return { data: Array.from({ length: table.endsWith('readings') ? Math.min(1000, 2501 - from) : 120 }, () => ({})), error: null }
        } }
      return q
    } }
  }
  const data = await loadCalibrationData(db(), start)
  assert.equal(data.readings.length, 2501)
  assert.equal(data.runs.length, 120)
  assert.ok(requests.some(r => r[1] === 2000))
  await assert.rejects(loadCalibrationData(db(true), start), /unavailable/)
})
