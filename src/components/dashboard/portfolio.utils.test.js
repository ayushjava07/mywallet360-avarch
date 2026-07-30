import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildAllocationData,
  buildDonutData,
  buildInsightTiles,
  computeConcentration,
  computePeriodChange,
  filterHistoryByPeriod,
  formatPortfolioValue,
} from './portfolio.utils.js'

describe('portfolio.utils', () => {
  it('computes concentration from priced holdings', () => {
    const result = computeConcentration([
      { priceAvailable: true, rawUsdValue: 70 },
      { priceAvailable: true, rawUsdValue: 20 },
      { priceAvailable: true, rawUsdValue: 10 },
      { priceAvailable: false, rawUsdValue: 999 },
    ])
    assert.equal(result.top1, 70)
    assert.equal(result.top3, 100)
  })

  it('computes period change from valuation history', () => {
    const history = [
      { date: '2026-01-01', value: 100 },
      { date: '2026-06-01', value: 150 },
    ]
    const result = computePeriodChange(history, 'all')
    assert.equal(result.changePercent, 50)
    assert.equal(result.high, 150)
    assert.equal(result.low, 100)
  })

  it('filters history by period', () => {
    const now = new Date()
    const recent = now.toISOString().slice(0, 10)
    const old = '2020-01-01'
    const filtered = filterHistoryByPeriod([
      { date: old, value: 1 },
      { date: recent, value: 2 },
    ], '7d')
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].value, 2)
  })

  it('builds allocation data with Others bucket', () => {
    const holdings = Array.from({ length: 12 }, (_, i) => ({
      symbol: `T${i}`,
      priceAvailable: true,
      rawUsdValue: 100 - i,
      percentage: 10,
    }))
    const data = buildAllocationData(holdings, { maxItems: 10 })
    assert.equal(data.length, 11)
    assert.equal(data[data.length - 1].symbol, 'Others')
  })

  it('builds donut data with Others slice', () => {
    const holdings = Array.from({ length: 10 }, (_, i) => ({
      symbol: `T${i}`,
      priceAvailable: true,
      rawUsdValue: 50 - i,
      percentage: 10,
    }))
    const data = buildDonutData(holdings, { maxSlices: 8 })
    assert.equal(data.length, 9)
    assert.equal(data[data.length - 1].name, 'Others')
  })

  it('builds insight tiles from wallet context', () => {
    const tiles = buildInsightTiles(
      {
        largestHolding: { symbol: 'ETH', percentage: 55 },
        pricingCoveragePercent: 82,
        assetCount: 12,
        pricedAssetCount: 10,
      },
      [{ priceAvailable: true, rawUsdValue: 55 }, { priceAvailable: true, rawUsdValue: 45 }],
      [{ date: '2026-01-01', value: 100 }, { date: '2026-06-01', value: 110 }],
    )
    assert.equal(tiles.length, 4)
    assert.match(tiles[0].value, /ETH/)
    assert.equal(tiles[1].value, '82%')
  })

  it('formats portfolio value in ETH mode', () => {
    assert.match(formatPortfolioValue(2000, { displayMode: 'tokens', ethPrice: 2000 }), /1\.0000 ETH/)
  })
})
