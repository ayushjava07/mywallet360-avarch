import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ANALYTICS_RANGES,
  CHART_TYPES,
  DEFAULT_ANALYTICS_RANGE,
  buildRangedChartData,
  computeNormalRangeBrushIndexes,
  computeSoftYDomain,
  computeSymlogYDomain,
  createHiddenSeriesState,
  detectSeriesOutliers,
  formatUsdValue,
  formatYAxisTick,
  getAxisUnitForTab,
  getChartTypeForTab,
  getRangeWindow,
  getSeriesForTab,
  getYearBoundaryDates,
  hasSeriesActivity,
  isSeriesHidden,
  makeUniqueYTickFormatter,
  maybeBucketWeekly,
  normalizeDailyRow,
  padDailyRange,
  SERIES_COLORS,
  sliceByRange,
  summarizeSeries,
  symexp,
  symlog,
  toggleHiddenSeries,
} from './transactionAnalytics.utils.js'

const NOW = new Date('2026-07-27T12:00:00Z')

test('default analytics range is 1M only', () => {
  assert.equal(DEFAULT_ANALYTICS_RANGE, '1m')
  assert.ok(ANALYTICS_RANGES.some((range) => range.id === '1m'))
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

test('each tab exposes a distinct chart type', () => {
  assert.equal(getChartTypeForTab('transactions'), CHART_TYPES.transactions)
  assert.equal(getChartTypeForTab('fees'), 'bar')
  assert.equal(getChartTypeForTab('ether'), 'bar')
  assert.equal(getChartTypeForTab('tokens'), 'combo')
})

test('series colors use fixed hex palette aligned across legend, stats, and chart', () => {
  const tx = getSeriesForTab('transactions')
  const colors = tx.map((item) => item.color)
  colors.forEach((color) => assert.match(color, /^#[0-9a-f]{6}$/i))
  assert.equal(new Set(colors).size, 3)
  assert.equal(tx[0].color, SERIES_COLORS.transactions)
  assert.equal(tx[1].color, SERIES_COLORS.uniqueOutgoing)
  assert.equal(tx[2].color, SERIES_COLORS.uniqueIncoming)
})

test('series definitions match tab requirements', () => {
  const tx = getSeriesForTab('transactions')
  assert.equal(tx.length, 3)
  assert.equal(tx[0].color, SERIES_COLORS.transactions)

  const fees = getSeriesForTab('fees')
  assert.deepEqual(fees.map((item) => item.key), ['ethFeesSpent', 'ethFeesUsed'])

  const ether = getSeriesForTab('ether')
  assert.equal(ether[0].label, 'Sent (Out)')
  assert.equal(ether[1].label, 'Receive (In)')

  const tokens = getSeriesForTab('tokens')
  assert.deepEqual(tokens.map((item) => item.key), ['tokenTransfers', 'tokenContractsCount'])
  assert.equal(tokens[0].yAxisId, 'left')
  assert.equal(tokens[1].yAxisId, 'right')
})

test('normalizeDailyRow maps legacy ethFees to ethFeesSpent', () => {
  const row = normalizeDailyRow({ date: '2026-01-01', ethFees: 0.5, ethFeesUsed: 0.1 })
  assert.equal(row.ethFeesSpent, 0.5)
  assert.equal(row.ethFees, 0.5)
  assert.equal(row.ethFeesUsed, 0.1)
})

test('formatYAxisTick keeps small eth values readable and distinct', () => {
  assert.equal(formatYAxisTick(0.0006, 'fees'), '0.0006')
  assert.equal(formatYAxisTick(0.000042, 'fees'), '4.2e-5')
  assert.notEqual(formatYAxisTick(0.0021, 'fees'), formatYAxisTick(0.0018, 'fees'))
})

test('makeUniqueYTickFormatter avoids duplicate labels', () => {
  const format = makeUniqueYTickFormatter('fees')
  const a = format(0.0021)
  const b = format(0.0018)
  assert.notEqual(a, b)
})

test('formatUsdValue uses current eth price', () => {
  assert.match(formatUsdValue(1, 2000), /\$2,000/)
  assert.equal(formatUsdValue(1, null), null)
})

test('summarizeSeries totals visible window', () => {
  const series = getSeriesForTab('tokens')
  const summary = summarizeSeries([
    { date: '2026-01-01', tokenTransfers: 2, tokenContractsCount: 1 },
    { date: '2026-01-02', tokenTransfers: 5, tokenContractsCount: 3 },
  ], series)
  assert.equal(summary[0].total, 7)
  assert.equal(summary[1].total, 4)
  assert.equal(summary[1].peak, 3)
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

test('1M range keeps daily rows when lifetime history is long', () => {
  const rows = []
  for (let i = 0; i < 800; i += 1) {
    const date = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10)
    rows.push({ date, transactionCount: 1 })
  }

  const ranged = buildRangedChartData(rows, '1m', NOW)
  const { data, bucketed } = maybeBucketWeekly(ranged)

  assert.equal(bucketed, false)
  assert.equal(data.length, 30)
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

test('hasSeriesActivity distinguishes a flat window from real data', () => {
  const series = getSeriesForTab('ether')
  const flat = [{ date: '2026-01-01', ethSent: 0, ethReceived: 0 }]
  const active = [{ date: '2026-01-01', ethSent: 0, ethReceived: 0.4 }]

  assert.equal(hasSeriesActivity(flat, series), false)
  assert.equal(hasSeriesActivity(active, series), true)
  assert.equal(hasSeriesActivity(active, []), false)
})

test('getAxisUnitForTab labels eth tabs vs count tabs', () => {
  assert.equal(getAxisUnitForTab('fees'), 'ETH')
  assert.equal(getAxisUnitForTab('ether'), 'ETH')
  assert.equal(getAxisUnitForTab('transactions'), 'Count')
  assert.equal(getAxisUnitForTab('tokens'), 'Count')
})

test('legend toggle state is independent per tab', () => {
  const initial = createHiddenSeriesState()
  const afterTx = toggleHiddenSeries(initial, 'transactions', 'transactionCount')
  assert.ok(isSeriesHidden(afterTx, 'transactions', 'transactionCount'))
  assert.equal(isSeriesHidden(afterTx, 'fees', 'ethFeesSpent'), false)

  const restored = toggleHiddenSeries(afterTx, 'transactions', 'transactionCount')
  assert.equal(isSeriesHidden(restored, 'transactions', 'transactionCount'), false)
})

test('symlog keeps small and large values on readable scale', () => {
  assert.equal(symlog(0), 0)
  assert.ok(symlog(1882) > symlog(20))
  assert.ok(Math.abs(symexp(symlog(1882)) - 1882) < 0.001)
})

test('detectSeriesOutliers finds extreme spike days', () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      transactionCount: 5,
    })),
    { date: '2026-01-21', transactionCount: 1882 },
  ]
  const outliers = detectSeriesOutliers(rows, ['transactionCount'])
  assert.equal(outliers[0].date, '2026-01-21')
  assert.equal(outliers[0].value, 1882)
})

test('computeSymlogYDomain spans zero to transformed max', () => {
  const rows = [{ transactionCount: 2 }, { transactionCount: 1882 }]
  const scale = computeSymlogYDomain(rows, ['transactionCount'])
  assert.equal(scale.domain[0], 0)
  assert.ok(scale.domain[1] > symlog(100))
})

test('computeNormalRangeBrushIndexes excludes outlier day window', () => {
  const rows = Array.from({ length: 22 }, (_, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    transactionCount: i === 20 ? 1882 : 5,
  }))
  const outliers = detectSeriesOutliers(rows, ['transactionCount'])
  const brush = computeNormalRangeBrushIndexes(rows, outliers)
  assert.ok(brush.endIndex < 20)
})
