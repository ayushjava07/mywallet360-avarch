const DAY_MS = 86_400_000
const WEEK_BUCKET_THRESHOLD_DAYS = 730

export const ANALYTICS_TABS = [
  { id: 'transactions', label: 'Transactions', title: 'Transactions' },
  { id: 'fees', label: 'Txn Fees', title: 'Txn Fees' },
  { id: 'ether', label: 'Ether Transfers', title: 'Ether Transfers' },
  { id: 'tokens', label: 'Token Transfers', title: 'Token Transfers' },
]

export const DEFAULT_ANALYTICS_RANGE = '1m'

export const ANALYTICS_RANGES = [
  { id: '1m', label: '1M', days: 30 },
]

/** Chart rendering mode per analytics tab. */
export const CHART_TYPES = {
  transactions: 'area',
  fees: 'bar',
  ether: 'bar',
  tokens: 'combo',
}

/**
 * Distinct, colorblind-friendlier series colors.
 * Primary stays teal; secondary series use navy + warm accent.
 * Tokens (not hex) so charts re-tint with the light/dark theme.
 */
export const SERIES_COLORS = {
  transactions: 'var(--series-primary)',
  uniqueOutgoing: 'var(--series-secondary)',
  uniqueIncoming: 'var(--series-tertiary)',
  ethFeesSpent: 'var(--series-primary)',
  ethFeesUsed: 'var(--series-secondary)',
  ethSent: 'var(--series-primary)',
  ethReceived: 'var(--series-tertiary)',
  tokenTransfers: 'var(--series-primary)',
  tokenContractsCount: 'var(--series-secondary)',
}

const EMPTY_DAY = {
  transactionCount: 0,
  uniqueOutgoing: 0,
  uniqueIncoming: 0,
  ethFees: 0,
  ethFeesSpent: 0,
  ethFeesUsed: 0,
  ethSent: 0,
  ethReceived: 0,
  etherVolume: 0,
  tokenTransfers: 0,
  tokenContractsCount: 0,
}

export function parseUtcDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`)
}

export function utcTodayStr(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10)
}

export function formatAnalyticsDate(dateStr, options = {}) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...options,
  }).format(parseUtcDate(dateStr))
}

/** Inclusive [start, end] window relative to current UTC date. */
export function getRangeWindow(rangeId, now = new Date()) {
  const today = utcTodayStr(now)
  if (rangeId === 'all') return null

  const range = ANALYTICS_RANGES.find((item) => item.id === rangeId)
  if (!range?.days) return null

  const end = parseUtcDate(today)
  const start = new Date(end.getTime() - (range.days - 1) * DAY_MS)
  return {
    start: start.toISOString().slice(0, 10),
    end: today,
    days: range.days,
  }
}

export function sliceByRange(rows, rangeId, now = new Date()) {
  if (!rows?.length) return []
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const window = getRangeWindow(rangeId, now)
  if (!window) return sorted

  return sorted.filter((row) => row.date >= window.start && row.date <= window.end)
}

/** Fill missing calendar days so fixed ranges always span their full window. */
export function padDailyRange(rows, startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return rows || []

  const byDate = new Map((rows || []).map((row) => [row.date, row]))
  const result = []
  const cursor = parseUtcDate(startDateStr)
  const end = parseUtcDate(endDateStr)

  while (cursor.getTime() <= end.getTime()) {
    const date = cursor.toISOString().slice(0, 10)
    result.push(byDate.get(date) || { date, ...EMPTY_DAY })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return result
}

/**
 * Chart series for a range button.
 * Fixed ranges are padded to the full calendar window vs today.
 * "All" stays sparse (pad only the brushed visible window in the UI).
 */
export function buildRangedChartData(rows, rangeId, now = new Date()) {
  const sorted = [...(rows || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const window = getRangeWindow(rangeId, now)

  if (!window) return sorted

  const inWindow = sorted.filter((row) => row.date >= window.start && row.date <= window.end)
  return padDailyRange(inWindow, window.start, window.end)
}

export function indexesForDateWindow(rows, startDateStr, endDateStr) {
  if (!rows?.length) return { startIndex: 0, endIndex: 0 }

  let startIndex = 0
  let endIndex = rows.length - 1

  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].date >= startDateStr) {
      startIndex = i
      break
    }
  }

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].date <= endDateStr) {
      endIndex = i
      break
    }
  }

  return {
    startIndex,
    endIndex: Math.max(startIndex, endIndex),
  }
}

function weekKey(dateStr) {
  const date = parseUtcDate(dateStr)
  const day = date.getUTCDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  date.setUTCDate(date.getUTCDate() + mondayOffset)
  return date.toISOString().slice(0, 10)
}

export function maybeBucketWeekly(rows) {
  if (!rows?.length) return { data: [], bucketed: false }

  const first = parseUtcDate(rows[0].date)
  const last = parseUtcDate(rows[rows.length - 1].date)
  const spanDays = Math.max(1, Math.round((last - first) / DAY_MS) + 1)

  if (spanDays <= WEEK_BUCKET_THRESHOLD_DAYS) {
    return { data: rows, bucketed: false }
  }

  const buckets = new Map()
  rows.forEach((row) => {
    const key = weekKey(row.date)
    const existing = buckets.get(key) || {
      date: key,
      ...EMPTY_DAY,
    }

    existing.transactionCount += row.transactionCount || 0
    existing.uniqueOutgoing += row.uniqueOutgoing || 0
    existing.uniqueIncoming += row.uniqueIncoming || 0
    existing.ethFees += row.ethFees || row.ethFeesSpent || 0
    existing.ethFeesSpent += row.ethFeesSpent || row.ethFees || 0
    existing.ethFeesUsed += row.ethFeesUsed || 0
    existing.ethSent += row.ethSent || 0
    existing.ethReceived += row.ethReceived || 0
    existing.etherVolume += row.etherVolume || 0
    existing.tokenTransfers += row.tokenTransfers || 0
    existing.tokenContractsCount = Math.max(
      existing.tokenContractsCount || 0,
      row.tokenContractsCount || 0,
    )
    buckets.set(key, existing)
  })

  return {
    data: [...buckets.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    bucketed: true,
  }
}

export function getChartTypeForTab(tabId) {
  return CHART_TYPES[tabId] || 'area'
}

export function getSeriesForTab(tabId) {
  switch (tabId) {
    case 'fees':
      return [
        { key: 'ethFeesSpent', label: 'ETH Fees Spent', color: SERIES_COLORS.ethFeesSpent, yAxisId: 'left' },
        { key: 'ethFeesUsed', label: 'ETH Fees Used', color: SERIES_COLORS.ethFeesUsed, yAxisId: 'left' },
      ]
    case 'ether':
      return [
        { key: 'ethSent', label: 'Sent (Out)', color: SERIES_COLORS.ethSent, yAxisId: 'left' },
        { key: 'ethReceived', label: 'Receive (In)', color: SERIES_COLORS.ethReceived, yAxisId: 'left' },
      ]
    case 'tokens':
      return [
        { key: 'tokenTransfers', label: 'Token Transfers', color: SERIES_COLORS.tokenTransfers, yAxisId: 'left', chartType: 'bar' },
        { key: 'tokenContractsCount', label: 'Token Contracts Count', color: SERIES_COLORS.tokenContractsCount, yAxisId: 'right', chartType: 'line' },
      ]
    default:
      return [
        { key: 'transactionCount', label: 'Transactions', color: SERIES_COLORS.transactions, yAxisId: 'left', chartType: 'area' },
        { key: 'uniqueOutgoing', label: 'Unique Outgoing Address', color: SERIES_COLORS.uniqueOutgoing, yAxisId: 'left', chartType: 'line' },
        { key: 'uniqueIncoming', label: 'Unique Incoming Address', color: SERIES_COLORS.uniqueIncoming, yAxisId: 'left', chartType: 'line' },
      ]
  }
}

export function getPrimarySeriesKey(tabId) {
  return getSeriesForTab(tabId)[0]?.key || 'transactionCount'
}

export function normalizeDailyRow(row = {}) {
  const ethFeesSpent = Number(row.ethFeesSpent ?? row.ethFees ?? 0)
  return {
    ...EMPTY_DAY,
    ...row,
    ethFeesSpent,
    ethFees: ethFeesSpent,
    ethFeesUsed: Number(row.ethFeesUsed || 0),
    tokenContractsCount: Number(row.tokenContractsCount || 0),
  }
}

const ETH_VALUE_KEYS = new Set([
  'ethFees',
  'ethFeesSpent',
  'ethFeesUsed',
  'ethSent',
  'ethReceived',
  'etherVolume',
])

export function formatSeriesValue(key, value) {
  const num = Number(value || 0)
  if (ETH_VALUE_KEYS.has(key)) {
    if (num === 0) return '0 ETH'
    if (num < 0.0001) return `${num.toExponential(2)} ETH`
    return `${num.toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH`
  }
  return num.toLocaleString()
}

export function formatUsdValue(value, ethPrice) {
  const price = Number(ethPrice)
  const num = Number(value || 0)
  if (!price || !Number.isFinite(price) || price <= 0 || !num) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: num >= 1000 ? 0 : 2,
  }).format(num * price)
}

export function summarizeSeries(rows, series) {
  if (!rows?.length || !series?.length) return []

  return series.map((item) => {
    const total = rows.reduce((sum, row) => sum + (Number(row[item.key]) || 0), 0)
    const peak = rows.reduce((max, row) => Math.max(max, Number(row[item.key]) || 0), 0)
    return {
      ...item,
      total,
      peak,
      average: total / rows.length,
    }
  })
}

export function getYearBoundaryDates(rows) {
  if (!rows?.length) return []

  const boundaries = []
  let previousYear = null

  rows.forEach((row, index) => {
    const year = parseUtcDate(row.date).getUTCFullYear()
    if (previousYear === null) {
      previousYear = year
      return
    }
    if (year !== previousYear) {
      boundaries.push({ date: row.date, year, index })
      previousYear = year
    }
  })

  return boundaries
}

export function computeSoftYDomain(rows, seriesKeys, { logScale = false } = {}) {
  const values = []
  ;(rows || []).forEach((row) => {
    seriesKeys.forEach((key) => {
      const value = Number(row[key]) || 0
      if (value > 0) values.push(value)
    })
  })

  if (!values.length) {
    return { domain: logScale ? [1, 10] : [0, 1], clipped: false, trueMax: 0, softMax: 1 }
  }

  values.sort((a, b) => a - b)
  const trueMax = values[values.length - 1]
  const p95 = values[Math.min(values.length - 1, Math.floor(values.length * 0.95))]

  if (logScale) {
    return {
      domain: [Math.max(1, Math.floor(values[0])), trueMax * 1.05],
      clipped: false,
      trueMax,
      softMax: trueMax,
    }
  }

  const shouldClip = trueMax > p95 * 3 && p95 > 0
  const softMax = shouldClip ? p95 * 1.2 : trueMax * 1.05

  return {
    domain: [0, softMax],
    clipped: shouldClip,
    trueMax,
    softMax,
  }
}

export function formatAxisTick(dateStr, { showYear = false } = {}) {
  if (showYear) {
    return formatAnalyticsDate(dateStr, { month: 'short', year: '2-digit' })
  }
  return formatAnalyticsDate(dateStr)
}

/**
 * Format Y ticks so adjacent values never collapse to the same label
 * (e.g. 0.0021 and 0.0018 both becoming "0.002").
 */
export function formatYAxisTick(value, tabId = 'transactions') {
  const num = Number(value)
  if (!Number.isFinite(num) || num === 0) return '0'

  const isEth = tabId === 'fees' || tabId === 'ether'

  if (!isEth) {
    if (Math.abs(num) >= 1000) {
      const compact = num / 1000
      return `${Number(compact.toFixed(compact >= 10 ? 0 : 1))}k`
    }
    if (Number.isInteger(num)) return String(num)
    return String(Number(num.toFixed(2)))
  }

  const abs = Math.abs(num)
  if (abs >= 1000) return `${Number((num / 1000).toFixed(1))}k`
  if (abs >= 1) return Number(num.toFixed(3)).toString()
  if (abs >= 0.01) return Number(num.toFixed(4)).toString()
  // Plain decimals stay readable down to 0.0001; below that they need exponents.
  if (abs >= 0.0001) return Number(num.toFixed(6)).toString()
  return num.toExponential(1).replace('+', '')
}

/** Deduplicate tick labels by bumping precision when collisions occur. */
export function makeUniqueYTickFormatter(tabId = 'transactions') {
  const used = new Map()

  return (value) => {
    let label = formatYAxisTick(value, tabId)
    const num = Number(value)

    if (!used.has(label)) {
      used.set(label, num)
      return label
    }

    if (used.get(label) === num) return label

    if (Math.abs(num) > 0 && Math.abs(num) < 1) {
      label = num.toExponential(2).replace('+', '')
    } else {
      label = Number(num.toPrecision(4)).toString()
    }

    used.set(label, num)
    return label
  }
}

export function createHiddenSeriesState() {
  return ANALYTICS_TABS.reduce((acc, tab) => {
    acc[tab.id] = []
    return acc
  }, {})
}

export function toggleHiddenSeries(hiddenByTab, tabId, seriesKey) {
  const current = hiddenByTab[tabId] || []
  const next = current.includes(seriesKey)
    ? current.filter((key) => key !== seriesKey)
    : [...current, seriesKey]
  return { ...hiddenByTab, [tabId]: next }
}

export function isSeriesHidden(hiddenByTab, tabId, seriesKey) {
  return (hiddenByTab[tabId] || []).includes(seriesKey)
}

/** True when every visible series is flat zero across the window. */
export function hasSeriesActivity(rows, series) {
  if (!rows?.length || !series?.length) return false
  return rows.some((row) => series.some((item) => (Number(row[item.key]) || 0) > 0))
}

export function getAxisUnitForTab(tabId) {
  return tabId === 'fees' || tabId === 'ether' ? 'ETH' : 'Count'
}
