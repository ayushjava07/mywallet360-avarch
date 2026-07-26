import { useState, useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MaterialIcon } from '../common/MaterialIcon'

const DAY_MS = 86_400_000

const CHART_PERIODS = [
  { value: '1d', label: '1D' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'ytd', label: 'YTD' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'ALL' },
]

const formatChartDate = (dateStr, options = {}) => {
  const d = new Date(`${dateStr}T00:00:00Z`)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...options,
  }).format(d)
}

const formatUsd = (v) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  notation: Math.abs(v) >= 1_000_000 ? 'compact' : 'standard',
}).format(v)

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null
  const point = payload[0].payload
  return (
    <div className="chart-tooltip-modern">
      <span className="chart-tooltip-date">{formatChartDate(point.date, { year: 'numeric' })}</span>
      <strong className="chart-tooltip-value">{formatUsd(point.value)}</strong>
    </div>
  )
}

export function PortfolioChart({ valuationHistory }) {
  const [chartPeriod, setChartPeriod] = useState('1y')

  const activeChartLabel = CHART_PERIODS.find((p) => p.value === chartPeriod)?.label || 'Valuation'

  const filteredData = useMemo(() => {
    if (!valuationHistory || valuationHistory.length === 0) return []

    const sorted = [...valuationHistory]
      .map((p) => ({ ...p, dateObj: new Date(`${p.date}T00:00:00Z`) }))
      .sort((a, b) => a.dateObj - b.dateObj)

    if (chartPeriod === 'all') return sorted

    const now = new Date()
    let cutoff
    switch (chartPeriod) {
      case '1d': cutoff = new Date(now.getTime() - DAY_MS); break
      case '7d': cutoff = new Date(now.getTime() - 7 * DAY_MS); break
      case '30d': cutoff = new Date(now.getTime() - 30 * DAY_MS); break
      case '90d': cutoff = new Date(now.getTime() - 90 * DAY_MS); break
      case 'ytd': cutoff = new Date(now.getFullYear(), 0, 1); break
      default: cutoff = new Date(now.getTime() - 365 * DAY_MS); break
    }

    return sorted.filter((p) => p.dateObj >= cutoff)
  }, [valuationHistory, chartPeriod])

  const performance = useMemo(() => {
    if (filteredData.length < 2) return null
    const first = filteredData[0]?.value
    const last = filteredData[filteredData.length - 1]?.value
    if (!first || !last || first === 0) return null
    return ((last - first) / Math.abs(first)) * 100
  }, [filteredData])

  if (filteredData.length === 0) return null

  const isPositive = performance !== null ? performance >= 0 : true

  return (
    <section className="card chart-modern-card p-5 max-[480px]:p-3.5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <MaterialIcon icon="show_chart" className="text-teal-400 text-xl" />
          <div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Portfolio History</span>
            <h2 className="text-base font-bold mt-0.5">{activeChartLabel} · Current holdings</h2>
          </div>
        </div>
        <div className="chart-periods flex gap-1">
          {CHART_PERIODS.map((p) => (
            <button
              key={p.value}
              className={`chart-period-btn ${chartPeriod === p.value ? 'chart-period-btn--active' : ''}`}
              onClick={() => setChartPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-modern-value mb-3">
        <strong className={`text-2xl font-bold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {formatUsd(filteredData[filteredData.length - 1]?.value || 0)}
        </strong>
        {performance !== null && (
          <span className={`ml-2 text-sm font-semibold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}{performance.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="chart-modern-area" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={filteredData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#18c5c0" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#18c5c0" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(d) => formatChartDate(d)}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={40}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3', opacity: 0.4 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#18c5c0"
              strokeWidth={2}
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
