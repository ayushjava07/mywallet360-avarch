import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MaterialIcon } from '../common/MaterialIcon'
import {
  PORTFOLIO_CHART_PERIODS,
  computePeriodChange,
  filterHistoryByPeriod,
  formatPortfolioValue,
} from './portfolio.utils'

const formatChartDate = (dateStr, options = {}) => {
  const d = new Date(`${dateStr}T00:00:00Z`)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...options,
  }).format(d)
}

function ChartTooltip({ active, payload, displayMode, ethPrice }) {
  if (!active || !payload?.[0]) return null
  const point = payload[0].payload
  return (
    <div className="chart-tooltip-modern">
      <span className="chart-tooltip-date">{formatChartDate(point.date, { year: 'numeric' })}</span>
      <strong className="chart-tooltip-value">
        {formatPortfolioValue(point.value, { displayMode, ethPrice })}
      </strong>
    </div>
  )
}

function useCompactViewport(maxWidth = 700) {
  const [isCompact, setIsCompact] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches : false
  ))

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const update = () => setIsCompact(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [maxWidth])

  return isCompact
}

export function PortfolioChart({
  valuationHistory,
  displayMode = 'usd',
  ethPrice,
  chartPeriod: controlledPeriod,
  onChartPeriodChange,
}) {
  const [internalPeriod, setInternalPeriod] = useState('1y')
  const chartPeriod = controlledPeriod ?? internalPeriod
  const setChartPeriod = onChartPeriodChange ?? setInternalPeriod
  const isCompact = useCompactViewport(700)
  const isPhone = useCompactViewport(480)

  const activeChartLabel = PORTFOLIO_CHART_PERIODS.find((p) => p.value === chartPeriod)?.label || 'Valuation'

  const filteredData = useMemo(
    () => filterHistoryByPeriod(valuationHistory, chartPeriod),
    [valuationHistory, chartPeriod],
  )

  const periodStats = useMemo(
    () => computePeriodChange(valuationHistory, chartPeriod),
    [valuationHistory, chartPeriod],
  )

  if (!valuationHistory?.length) {
    return (
      <section className="card chart-modern-card p-5 max-[480px]:p-3.5">
        <p className="text-sm text-[var(--muted)]">Portfolio history unavailable for this wallet.</p>
      </section>
    )
  }

  if (filteredData.length === 0) {
    return (
      <section className="card chart-modern-card p-5 max-[480px]:p-3.5">
        <p className="text-sm text-[var(--muted)]">No valuation points in the selected range.</p>
      </section>
    )
  }

  const isPositive = periodStats ? periodStats.changePercent >= 0 : true
  const chartHeight = isPhone ? 160 : isCompact ? 180 : 200
  const latestValue = filteredData[filteredData.length - 1]?.value || 0

  return (
    <section className="card chart-modern-card p-5 max-[480px]:p-3.5">
      <div className="chart-modern-header">
        <div className="flex items-center gap-2.5 min-w-0">
          <MaterialIcon icon="show_chart" className="text-teal-400 text-xl shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Portfolio History</span>
            <h2 className="text-base font-bold mt-0.5 truncate">
              {activeChartLabel}{isPhone ? '' : ' · Current holdings'}
            </h2>
          </div>
        </div>
        <div className="chart-periods" role="group" aria-label="Portfolio chart range">
          {PORTFOLIO_CHART_PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`chart-period-btn ${chartPeriod === p.value ? 'chart-period-btn--active' : ''}`}
              onClick={() => setChartPeriod(p.value)}
              aria-pressed={chartPeriod === p.value}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-modern-value mb-3">
        <strong className={`text-2xl font-bold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {formatPortfolioValue(latestValue, { displayMode, ethPrice })}
        </strong>
        {periodStats && (
          <span className={`ml-2 text-sm font-semibold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}{periodStats.changePercent.toFixed(2)}%
          </span>
        )}
      </div>

      {periodStats && (
        <div className="portfolio-chart-stats">
          <span>High {formatPortfolioValue(periodStats.high, { displayMode, ethPrice })}</span>
          <span>Low {formatPortfolioValue(periodStats.low, { displayMode, ethPrice })}</span>
          <span>{periodStats.points} points</span>
        </div>
      )}

      <div className="chart-modern-area" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={filteredData}
            margin={isPhone
              ? { top: 4, right: 2, bottom: 0, left: 0 }
              : { top: 4, right: 4, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#18c5c0" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#18c5c0" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: isPhone ? 8 : 9, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(d) => formatChartDate(d)}
              interval="preserveStartEnd"
              minTickGap={isPhone ? 28 : 40}
            />
            <YAxis
              tick={{ fontSize: isPhone ? 8 : 9, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => {
                if (displayMode === 'tokens' && ethPrice) {
                  const eth = v / ethPrice
                  return eth >= 1 ? `${eth.toFixed(1)}Ξ` : `${eth.toFixed(3)}Ξ`
                }
                return Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${Math.round(v)}`
              }}
              width={isPhone ? 32 : 40}
            />
            <Tooltip
              content={<ChartTooltip displayMode={displayMode} ethPrice={ethPrice} />}
              cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3', opacity: 0.4 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#18c5c0"
              strokeWidth={isPhone ? 1.75 : 2}
              fill="url(#chartGradient)"
              animationDuration={500}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
