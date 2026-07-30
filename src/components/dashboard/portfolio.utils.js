const DAY_MS = 86_400_000

export const PORTFOLIO_CHART_PERIODS = [
  { value: '1d', label: '1D' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'ytd', label: 'YTD' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'ALL' },
]

export const TOKEN_COLORS = [
  '#18c5c0', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981',
  '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
]

const safeNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export function formatCompactUsd(v) {
  if (!Number.isFinite(v)) return '$0.00'
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(2)}`
}

export function formatPortfolioValue(usdValue, { displayMode = 'usd', ethPrice } = {}) {
  const value = safeNumber(usdValue)
  if (displayMode === 'tokens' && ethPrice) {
    const ethVal = value / ethPrice
    if (ethVal >= 1000) return `${(ethVal / 1000).toFixed(2)}K ETH`
    return `${ethVal.toFixed(4)} ETH`
  }
  return formatCompactUsd(value)
}

export function getPortfolioSourceLabel(source) {
  return source === 'etherscan'
    ? 'ETH + Etherscan-priced tokens'
    : 'Priced assets only'
}

export function filterHistoryByPeriod(history, period = '1y') {
  if (!history?.length) return []

  const sorted = [...history]
    .map((p) => ({ ...p, dateObj: new Date(`${p.date}T00:00:00Z`) }))
    .sort((a, b) => a.dateObj - b.dateObj)

  if (period === 'all') return sorted

  const now = new Date()
  let cutoff
  switch (period) {
    case '1d': cutoff = new Date(now.getTime() - DAY_MS); break
    case '7d': cutoff = new Date(now.getTime() - 7 * DAY_MS); break
    case '30d': cutoff = new Date(now.getTime() - 30 * DAY_MS); break
    case '90d': cutoff = new Date(now.getTime() - 90 * DAY_MS); break
    case 'ytd': cutoff = new Date(now.getFullYear(), 0, 1); break
    default: cutoff = new Date(now.getTime() - 365 * DAY_MS); break
  }

  return sorted.filter((p) => p.dateObj >= cutoff)
}

export function computePeriodChange(history, period = '1y') {
  const filtered = filterHistoryByPeriod(history, period)
  if (filtered.length < 2) return null

  const values = filtered.map((p) => safeNumber(p.value))
  const first = values[0]
  const last = values[values.length - 1]
  if (!first || first === 0) return null

  return {
    changePercent: ((last - first) / Math.abs(first)) * 100,
    first,
    last,
    high: Math.max(...values),
    low: Math.min(...values),
    points: filtered.length,
  }
}

export function computeConcentration(holdings = []) {
  const priced = holdings
    .filter((h) => h.priceAvailable)
    .map((h) => safeNumber(h.rawUsdValue ?? h.usdValue))
    .filter((v) => v > 0)
    .sort((a, b) => b - a)

  const total = priced.reduce((sum, v) => sum + v, 0)
  if (!total) {
    return { top1: 0, top3: 0, total: 0 }
  }

  const top1 = priced[0] ? (priced[0] / total) * 100 : 0
  const top3 = priced.slice(0, 3).reduce((sum, v) => sum + v, 0) / total * 100

  return {
    top1: Math.round(top1 * 10) / 10,
    top3: Math.round(top3 * 10) / 10,
    total,
  }
}

export function buildAllocationData(holdings = [], { maxItems = 10 } = {}) {
  const priced = holdings
    .filter((h) => h.priceAvailable && safeNumber(h.rawUsdValue) > 0)
    .sort((a, b) => safeNumber(b.rawUsdValue) - safeNumber(a.rawUsdValue))

  const top = priced.slice(0, maxItems).map((h, i) => ({
    symbol: h.symbol,
    name: h.name,
    rawValue: safeNumber(h.rawUsdValue),
    percent: h.percentage ?? 0,
    fill: TOKEN_COLORS[i % TOKEN_COLORS.length],
  }))

  const tail = priced.slice(maxItems)
  if (tail.length > 0) {
    const othersValue = tail.reduce((sum, h) => sum + safeNumber(h.rawUsdValue), 0)
    const totalPriced = priced.reduce((sum, h) => sum + safeNumber(h.rawUsdValue), 0)
    top.push({
      symbol: 'Others',
      name: `${tail.length} more tokens`,
      rawValue: othersValue,
      percent: totalPriced > 0 ? Math.round((othersValue / totalPriced) * 100) : 0,
      fill: '#94a3b8',
    })
  }

  return top
}

export function buildDonutData(holdings = [], { maxSlices = 8 } = {}) {
  const priced = holdings
    .filter((h) => h.priceAvailable && safeNumber(h.rawUsdValue) > 0)
    .sort((a, b) => safeNumber(b.rawUsdValue) - safeNumber(a.rawUsdValue))

  const slices = priced.slice(0, maxSlices).map((h, i) => ({
    name: h.symbol,
    rawValue: safeNumber(h.rawUsdValue),
    fill: TOKEN_COLORS[i % TOKEN_COLORS.length],
    percent: h.percentage,
  }))

  const tail = priced.slice(maxSlices)
  if (tail.length > 0) {
    const othersValue = tail.reduce((sum, h) => sum + safeNumber(h.rawUsdValue), 0)
    const totalPriced = priced.reduce((sum, h) => sum + safeNumber(h.rawUsdValue), 0)
    slices.push({
      name: 'Others',
      rawValue: Math.max(othersValue, 0.001),
      fill: '#94a3b8',
      percent: totalPriced > 0 ? Math.round((othersValue / totalPriced) * 100) : 0,
    })
  }

  return slices.map((item) => ({
    ...item,
    rawValue: Math.max(item.rawValue, 0.001),
  }))
}

export function buildInsightTiles(wallet = {}, holdings = [], history = []) {
  const concentration = computeConcentration(holdings)
  const periodStats = computePeriodChange(history, '1y')
  const largest = wallet.largestHolding
  const pricingCoverage = wallet.pricingCoveragePercent ?? 0
  const assetCount = wallet.assetCount ?? 0
  const pricedCount = wallet.pricedAssetCount ?? 0

  const concentrationTone = concentration.top3 >= 70 ? 'red' : concentration.top3 >= 50 ? 'amber' : 'green'
  const coverageTone = pricingCoverage >= 80 ? 'green' : pricingCoverage >= 50 ? 'amber' : 'red'

  return [
    {
      id: 'largest',
      label: 'Largest Holding',
      value: largest?.symbol ? `${largest.symbol} · ${largest.percentage ?? 0}%` : 'None',
      tone: 'green',
      icon: 'layers',
    },
    {
      id: 'coverage',
      label: 'Pricing Coverage',
      value: `${pricingCoverage}%`,
      tone: coverageTone,
      icon: 'price_check',
    },
    {
      id: 'assets',
      label: 'Discovered Assets',
      value: assetCount.toLocaleString(),
      tone: 'green',
      icon: 'collections_bookmark',
      detail: `${pricedCount} priced · ${Math.max(0, assetCount - pricedCount)} unpriced`,
    },
    {
      id: 'concentration',
      label: 'Top 3 Concentration',
      value: `${concentration.top3}%`,
      tone: concentrationTone,
      icon: 'pie_chart',
      detail: periodStats
        ? `1Y change ${periodStats.changePercent >= 0 ? '+' : ''}${periodStats.changePercent.toFixed(1)}%`
        : null,
    },
  ]
}
