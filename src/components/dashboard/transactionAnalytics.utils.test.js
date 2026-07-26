import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ANALYTICS_RANGES,
  DEFAULT_ANALYTICS_RANGE,
  buildRangedChartData,
  computeSoftYDomain,
  formatYAxisTick,
  getRangeWindow,
  getSeriesForTab,
  getYearBoundaryDates,
  makeUniqueYTickFormatter,
  maybeBucketWeekly,
  padDailyRange,
  sliceByRange,
  summarizeSeries,
} from './transactionAnalytics.utils.js'

const NOW = new Date('2026-07-27T12:00:00Z')

test('default analytics range is 1M only', () => {
  assert.equal(DEFAULT_ANALYTICS_RANGE, '1m')
  assert.deepEqual(ANALYTICS_RANGES.map((r) => r.id), ['1m'])
})

test('getRangeWindow 1M is ~30 days ending today', () => {
  const window = getRangeWindow('1m', NOW)
  assert.equal(window.end, '2026-07-27')
  assert.equal(window.start, '2026-06-28')
  assert.equal(window.days, 30)
})

test('sliceByRange uses current date not last datapoint', () => {
  const rows = [
    { date: '2026-06-01', transactionCount: 1 },
    { date: '2026-06-29', transactionCount: 2 },
    { date: '2026-07-10', transactionCount: 3 },
  ]
  const sliced = sliceByRange(rows, '1m', NOW)
  assert.equal(sliced[0].date, '2026-06-29')
  assert.equal(sliced.length, 2)
})

test('buildRangedChartData pads 1M to full calendar span', () => {
  const rows = [
    { date: '2026-07-01', transactionCount: 5 },
    { date: '2026-07-12', transactionCount: 8 },
  ]
  const built = buildRangedChartData(rows, '1m', NOW)
  assert.equal(built[0].date, '2026-06-28')
  assert.equal(built[built.length - 1].date, '2026-07-27')
  assert.equal(built.length, 30)
})

test('padDailyRange fills gaps with zeros', () => {
  const padded = padDailyRange(
    [{ date: '2026-01-01', transactionCount: 2 }],
    '2026-01-01',
    '2026-01-03',
  )
  assert.equal(padded.length, 3)
  assert.equal(padded[1].transactionCount, 0)
})

test('series colors are visually distinct', () => {
  const series = getSeriesForTab('transactions')
  assert.equal(series[0].color, '#18c5c0')
  assert.equal(series[1].color, '#1e3a5f')
  assert.equal(series[2].color, '#f59e0b')
})

test('formatYAxisTick keeps small eth values distinct', () => {
  assert.equal(formatYAxisTick(0.0006, 'fees'), '6.0e-4')
  assert.notEqual(formatYAxisTick(0.0021, 'fees'), formatYAxisTick(0.0018, 'fees'))
})

test('makeUniqueYTickFormatter avoids duplicate labels', () => {
  const format = makeUniqueYTickFormatter('fees')
  const a = format(0.0021)
  const b = format(0.0018)
  assert.notEqual(a, b)
})

test('summarizeSeries totals visible window', () => {
  const series = getSeriesForTab('tokens')
  const summary = summarizeSeries([
    { date: '2026-01-01', tokenTransfers: 2 },
    { date: '2026-01-02', tokenTransfers: 5 },
  ], series)
  assert.equal(summary[0].total, 7)
  assert.equal(summary[0].peak, 5)
})

test('maybeBucketWeekly buckets long spans', () => {
  const rows = []
  for (let i = 0; i < 800; i += 1) {
    const date = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)
    rows.push({ date, transactionCount: 1 })
  }
  const { data, bucketed } = maybeBucketWeekly(rows)
  assert.equal(bucketed, true)
  assert.ok(data.length < rows.length)
})

test('getYearBoundaryDates marks year changes', () => {
  const boundaries = getYearBoundaryDates([
    { date: '2024-11-01' },
    { date: '2025-01-03' },
    { date: '2026-02-01' },
  ])
  assert.deepEqual(boundaries.map((b) => b.year), [2025, 2026])
})

test('computeSoftYDomain clips extreme spikes', () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      transactionCount: 5,
    })),
    { date: '2026-01-21', transactionCount: 1882 },
  ]
  const scale = computeSoftYDomain(rows, ['transactionCount'])
  assert.equal(scale.clipped, true)
  assert.ok(scale.softMax < scale.trueMax)
})
