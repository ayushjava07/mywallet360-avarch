import { useState, useMemo, useCallback } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from 'recharts'
import { MetricExplainer } from '../common/MetricExplainer'
import {
  TOKEN_COLORS,
  buildDonutData,
  computePeriodChange,
  formatPortfolioValue,
} from './portfolio.utils'

const safeNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

function TokenIcon({ symbol, size, colorIndex: forceColor }) {
  const initial = (symbol || '?').charAt(0)
  const colorIndex = symbol ? symbol.charCodeAt(0) % TOKEN_COLORS.length : 0
  const finalIndex = forceColor !== undefined ? forceColor : colorIndex
  const s = size === 'sm' ? 28 : 36
  const r = size === 'sm' ? 8 : 10
  return (
    <span
      className="holdings-token-icon"
      style={{ width: s, height: s, borderRadius: r, background: TOKEN_COLORS[finalIndex], fontSize: size === 'sm' ? 9 : 12 }}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}

function renderActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 7}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.18))', transition: 'd .18s ease' }}
    />
  )
}

function SkeletonRows() {
  return (
    <div className="holdings-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <div className="holdings-skeleton-row" key={i}>
          <span className="holdings-skeleton-icon" />
          <div className="holdings-skeleton-lines">
            <span className="holdings-skeleton-line holdings-skeleton-line--short" />
            <span className="holdings-skeleton-line holdings-skeleton-line--long" />
          </div>
          <div className="holdings-skeleton-values">
            <span className="holdings-skeleton-line holdings-skeleton-line--medium" />
            <span className="holdings-skeleton-line holdings-skeleton-line--short" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="holdings-empty">
      <div className="holdings-empty-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
          <path d="M12 18V6" />
        </svg>
      </div>
      <strong>No assets found</strong>
      <span>No priced assets were discovered for this wallet.</span>
    </div>
  )
}

export function PortfolioHoldings({
  holdings,
  valuationHistory,
  isLoading,
  displayMode,
  ethPrice,
  wallet,
  activeSymbol: controlledSymbol,
  onHighlight,
}) {
  const [internalSymbol, setInternalSymbol] = useState(null)
  const [hoveredLegend, setHoveredLegend] = useState(null)
  const [showAllTokens, setShowAllTokens] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState('usdValue')
  const [sortDir, setSortDir] = useState('desc')
  const [hideDust, setHideDust] = useState(true)
  const [hideUnpriced, setHideUnpriced] = useState(false)

  const setHighlight = useCallback((symbol) => {
    if (onHighlight) {
      onHighlight(symbol)
    } else {
      setInternalSymbol(symbol)
    }
  }, [onHighlight])

  const activeSymbol = controlledSymbol !== undefined ? controlledSymbol : internalSymbol
  const highlighted = activeSymbol || hoveredLegend

  const performance = useMemo(() => {
    const stats = computePeriodChange(valuationHistory, '1y')
    return stats?.changePercent ?? null
  }, [valuationHistory])

  const sorted = useMemo(() => {
    if (!holdings || holdings.length === 0) return []
    let filtered = [...holdings]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((a) =>
        (a.symbol && a.symbol.toLowerCase().includes(q)) ||
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.contractAddress && a.contractAddress.toLowerCase().includes(q)),
      )
    }

    if (hideDust) {
      filtered = filtered.filter((a) => (a.priceAvailable && safeNumber(a.rawUsdValue) >= 0.5) || !a.priceAvailable)
    }

    if (hideUnpriced) {
      filtered = filtered.filter((a) => a.priceAvailable)
    }

    return [...filtered].sort((a, b) => {
      let aVal
      let bVal
      switch (sortKey) {
        case 'symbol': aVal = (a.symbol || '').toLowerCase(); bVal = (b.symbol || '').toLowerCase(); break
        case 'balance': aVal = safeNumber(a.rawBalance); bVal = safeNumber(b.rawBalance); break
        case 'percentage': aVal = safeNumber(a.percentage); bVal = safeNumber(b.percentage); break
        case 'usdValue':
        default: aVal = safeNumber(a.rawUsdValue); bVal = safeNumber(b.rawUsdValue); break
      }
      return sortDir === 'desc' ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1)
    })
  }, [holdings, searchQuery, sortKey, sortDir, hideDust, hideUnpriced])

  const pricedHoldings = useMemo(() => sorted.filter((a) => a.priceAvailable), [sorted])
  const unpricedHoldings = useMemo(() => sorted.filter((a) => !a.priceAvailable), [sorted])

  const totalRaw = useMemo(
    () => pricedHoldings.reduce((sum, a) => sum + safeNumber(a.rawUsdValue), 0),
    [pricedHoldings],
  )

  const formatValue = useCallback(
    (v) => formatPortfolioValue(v, { displayMode, ethPrice }),
    [displayMode, ethPrice],
  )

  const donutData = useMemo(
    () => buildDonutData(pricedHoldings, { maxSlices: 8 }),
    [pricedHoldings],
  )

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const exportCSV = useCallback(() => {
    const headers = ['Token', 'Name', 'Balance', 'USD Value', 'Allocation %', 'Contract Address', 'Price Available']
    const rows = sorted.map((a) => [
      a.symbol || '',
      a.name || '',
      a.rawBalance ?? a.balance ?? '',
      a.rawUsdValue ?? a.usdValue ?? '',
      a.percentage ?? 0,
      a.contractAddress || '',
      a.priceAvailable ? 'Yes' : 'No',
    ])
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `portfolio-${wallet?.id?.slice(0, 8) || 'export'}-holdings.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [sorted, wallet?.id])

  const SortHeader = ({ label, field }) => (
    <button
      type="button"
      className={`holdings-sort-btn ${sortKey === field ? 'holdings-sort-btn--active' : ''}`}
      onClick={() => toggleSort(field)}
    >
      {label}
      {sortKey === field && (
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: sortDir === 'asc' ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      )}
    </button>
  )

  if (isLoading) {
    return (
      <section className="card holdings-card p-5">
        <div className="holdings-top flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Portfolio Assets</h2>
        </div>
        <div className="holdings-total-skeleton mb-4" />
        <SkeletonRows />
      </section>
    )
  }

  if (sorted.length === 0 && !searchQuery) {
    return (
      <section className="card holdings-card p-5">
        <div className="holdings-top flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Portfolio Assets</h2>
        </div>
        <EmptyState />
      </section>
    )
  }

  return (
    <section className="card holdings-card p-5 max-[480px]:p-3.5">
      <div className="holdings-top flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-[15px] font-bold">Portfolio Assets</h2>
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 rounded-full">
            {sorted.length} total
          </span>
          {wallet?.pricedAssetCount != null && wallet?.assetCount != null && (
            <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 px-2 py-0.5 rounded-full">
              {wallet.pricedAssetCount} of {wallet.assetCount} priced
            </span>
          )}
          {performance !== null && (
            <span className={`text-[11px] font-bold ${performance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {performance >= 0 ? '+' : ''}{performance.toFixed(1)}% 1Y
            </span>
          )}
        </div>
        <button
          type="button"
          className="holdings-export-btn text-[10px] font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors"
          onClick={exportCSV}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>

      <MetricExplainer
        as="div"
        className="holdings-total mb-4"
        explanation={wallet?.balance?.explanation}
      >
        <strong className="text-2xl font-bold">{formatValue(totalRaw)}</strong>
        {unpricedHoldings.length > 0 && (
          <span className="text-[10px] text-slate-500 ml-2">
            {pricedHoldings.length} priced · {unpricedHoldings.length} unpriced
          </span>
        )}
      </MetricExplainer>

      <div className="holdings-body">
        {donutData.length > 0 && (
          <div className="holdings-donut-section mb-6 min-[900px]:mb-0">
            <div className="holdings-donut-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="rawValue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="68%"
                    outerRadius="98%"
                    activeIndex={highlighted ? donutData.findIndex((d) => d.name === highlighted) : undefined}
                    activeShape={renderActiveShape}
                    strokeWidth={0}
                    onMouseEnter={(_, index) => setHighlight(donutData[index]?.name === 'Others' ? null : donutData[index]?.name)}
                    onMouseLeave={() => setHighlight(null)}
                    animationBegin={0}
                    animationDuration={600}
                    animationEasing="ease-out"
                  >
                    {donutData.map((entry, i) => (
                      <Cell
                        key={`cell-${entry.name}-${i}`}
                        fill={entry.fill}
                        style={{
                          filter: highlighted && highlighted !== entry.name ? 'saturate(0.4) opacity(0.6)' : 'none',
                          transition: 'filter .25s ease, opacity .25s ease',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="holdings-donut-center text-center">
                <strong className="text-lg font-bold">{formatValue(totalRaw)}</strong>
                <span className="text-[9px] text-slate-400 block">Total Value</span>
              </div>
            </div>
            <div className="holdings-legend">
              {donutData.map((entry) => (
                <div
                  key={entry.name}
                  role="button"
                  tabIndex={0}
                  className={`holdings-legend-item flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-[11px] ${
                    highlighted === entry.name ? 'bg-gray-100 dark:bg-white/[0.08]' : ''
                  }`}
                  onMouseEnter={() => setHoveredLegend(entry.name === 'Others' ? null : entry.name)}
                  onMouseLeave={() => setHoveredLegend(null)}
                  onClick={() => setHighlight(entry.name === 'Others' ? null : entry.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setHighlight(entry.name === 'Others' ? null : entry.name)
                    }
                  }}
                >
                  <span className="holdings-legend-dot w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.fill }} />
                  <span className="holdings-legend-name font-medium">{entry.name}</span>
                  <span className="holdings-legend-pct text-slate-500">{entry.percent}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="holdings-list-section min-w-0">
          <div className="holdings-filters flex flex-wrap items-center gap-2 mb-4">
            <div className="holdings-search relative flex-1 min-w-[180px]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search tokens..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] text-[11px] outline-none focus:border-teal-400/40"
              />
            </div>
            <label className="holdings-filter-toggle flex items-center gap-1.5 text-[10px] font-medium text-slate-500 cursor-pointer select-none">
              <input type="checkbox" checked={hideDust} onChange={() => setHideDust(!hideDust)} className="accent-teal-500" />
              Hide dust
            </label>
            <label className="holdings-filter-toggle flex items-center gap-1.5 text-[10px] font-medium text-slate-500 cursor-pointer select-none">
              <input type="checkbox" checked={hideUnpriced} onChange={() => setHideUnpriced(!hideUnpriced)} className="accent-teal-500" />
              Priced only
            </label>
          </div>

          <div className="holdings-list-header grid grid-cols-[1fr_80px_100px_80px] gap-2 px-3 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-gray-100 dark:border-white/[0.06]">
            <span className="flex items-center gap-1">
              <SortHeader label="Token" field="symbol" />
            </span>
            <SortHeader label="Balance" field="balance" />
            <SortHeader label="Value" field="usdValue" />
            <SortHeader label="Alloc" field="percentage" />
          </div>

          <div className="holdings-list max-h-[480px] overflow-y-auto">
            {pricedHoldings.map((asset, i) => {
              const isHighlighted = highlighted === asset.symbol
              return (
                <div
                  role="button"
                  tabIndex={0}
                  aria-selected={isHighlighted}
                  className={`holdings-row grid grid-cols-[1fr_80px_100px_80px] gap-2 items-center px-3 py-2.5 ${
                    isHighlighted ? 'bg-teal-50/50 dark:bg-teal-500/5' : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                  } transition-colors rounded-lg cursor-pointer`}
                  key={`${asset.contractAddress || 'eth'}-${asset.symbol}`}
                  onMouseEnter={() => setHighlight(asset.symbol)}
                  onMouseLeave={() => setHighlight(null)}
                  onClick={() => setHighlight(isHighlighted ? null : asset.symbol)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setHighlight(isHighlighted ? null : asset.symbol)
                    }
                  }}
                >
                  <div className="holdings-row-asset flex items-center gap-2 min-w-0">
                    <TokenIcon symbol={asset.symbol} size="sm" colorIndex={i} />
                    <div className="min-w-0">
                      <strong className="text-[12px] font-semibold block truncate">{asset.symbol}</strong>
                      <span className="text-[9px] text-slate-400 block truncate">{asset.name}</span>
                    </div>
                  </div>
                  <span className="holdings-row-balance text-[11px] font-medium truncate">{asset.balance}</span>
                  <strong className="holdings-row-value text-[12px] font-semibold">
                    {displayMode === 'tokens' && ethPrice
                      ? `${(safeNumber(asset.rawUsdValue) / ethPrice).toFixed(4)} ETH`
                      : asset.usdValue || '—'}
                  </strong>
                  <div className="holdings-row-allocation flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.08] overflow-hidden">
                      <div className="h-full rounded-full bg-teal-400" style={{ width: `${Math.min(asset.percentage || 0, 100)}%` }} />
                    </div>
                    <span className="holdings-row-pct text-[10px] font-semibold text-slate-500 w-10 text-right">{asset.percentage || 0}%</span>
                  </div>
                </div>
              )
            })}
          </div>

          {unpricedHoldings.length > 0 && (
            <div className="holdings-other mt-2">
              <button
                type="button"
                className="holdings-other-toggle flex items-center gap-1.5 w-full px-3 py-2 text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                onClick={() => setShowAllTokens(!showAllTokens)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: showAllTokens ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s ease' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                {showAllTokens ? 'Hide' : 'Show'} {unpricedHoldings.length} unpriced token{unpricedHoldings.length > 1 ? 's' : ''}
              </button>
              {showAllTokens && (
                <div className="holdings-list">
                  {unpricedHoldings.map((asset, i) => (
                    <div
                      className="holdings-row grid grid-cols-[1fr_80px_100px_80px] gap-2 items-center px-3 py-2 opacity-60"
                      key={`${asset.contractAddress || 'unk'}-${asset.symbol}`}
                    >
                      <div className="holdings-row-asset flex items-center gap-2 min-w-0">
                        <TokenIcon symbol={asset.symbol} size="sm" colorIndex={i + pricedHoldings.length} />
                        <div className="min-w-0">
                          <strong className="text-[11px] font-medium block truncate">{asset.symbol || 'Unknown'}</strong>
                          <span className="text-[9px] text-slate-400 block truncate">{asset.name || '—'}</span>
                        </div>
                      </div>
                      <span className="holdings-row-balance text-[11px] truncate">{asset.displayBalance || asset.balance}</span>
                      <strong className="holdings-row-value text-[11px] text-slate-400">—</strong>
                      <span className="text-[10px] text-slate-400">—</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
