import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MaterialIcon } from '../common/MaterialIcon'
import {
  ANALYTICS_TABS,
  DEFAULT_ANALYTICS_RANGE,
  buildRangedChartData,
  computeSoftYDomain,
  formatAnalyticsDate,
  formatAxisTick,
  formatSeriesValue,
  getRangeWindow,
  getSeriesForTab,
  getYearBoundaryDates,
  makeUniqueYTickFormatter,
  maybeBucketWeekly,
  summarizeSeries,
} from './transactionAnalytics.utils'

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

function AnalyticsTooltip({ active, payload, label, series, softMax, clipped, coordinate, viewBox }) {
  if (!active || !payload?.length) return null

  const point = payload[0]?.payload
  if (!point) return null

  const chartLeft = viewBox?.x ?? 0
  const chartWidth = viewBox?.width ?? 0
  const cursorX = coordinate?.x ?? chartLeft
  const placeLeft = chartWidth > 0 && cursorX > chartLeft + chartWidth * 0.55

  return (
    <div className={`chart-tooltip-modern analytics-tooltip ${placeLeft ? 'analytics-tooltip--left' : ''}`}>
      <span className="chart-tooltip-date">
        {formatAnalyticsDate(label || point.date, { year: 'numeric' })}
      </span>
      {series.map((item) => {
        const raw = Number(point[item.key]) || 0
        const exceeds = clipped && softMax > 0 && raw > softMax
        return (
          <div key={item.key} className="analytics-tooltip__row">
            <span className="analytics-tooltip__label">
              <i style={{ background: item.color }} />
              {item.label}
            </span>
            <strong>
              {formatSeriesValue(item.key, raw)}
              {exceeds ? ' · above scale' : ''}
            </strong>
          </div>
        )
      })}
    </div>
  )
}

function BrushTraveller(props) {
  const { x, y, width, height } = props
  const cx = x + width / 2
  const barHeight = Math.max(12, height - 8)
  const barY = y + (height - barHeight) / 2

  return (
    <g className="analytics-brush-traveller">
      <rect
        x={cx - 8}
        y={y}
        width={16}
        height={height}
        fill="transparent"
        style={{ cursor: 'ew-resize' }}
      />
      <rect
        x={cx - 1}
        y={barY}
        width={2}
        height={barHeight}
        rx={1}
        fill="#18c5c0"
      />
      <circle
        cx={cx}
        cy={y + height / 2}
        r={3.5}
        fill="#18c5c0"
        stroke="#fff"
        strokeWidth={1.5}
      />
    </g>
  )
}

function compactAddress(value) {
  if (!value || value.length < 12) return value
  if (!value.startsWith('0x')) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

export function TransactionAnalytics({
  dailyAnalytics,
  addressLabel,
  sourceLabel = 'MyWallet360',
}) {
  const rangeId = DEFAULT_ANALYTICS_RANGE
  const isCompact = useCompactViewport(700)
  const isPhone = useCompactViewport(480)
  const [tabId, setTabId] = useState('transactions')
  const [brushIndexes, setBrushIndexes] = useState({ startIndex: 0, endIndex: 0 })

  const series = useMemo(() => getSeriesForTab(tabId), [tabId])
  const activeTab = ANALYTICS_TABS.find((tab) => tab.id === tabId) || ANALYTICS_TABS[0]
  const primaryKey = series[0]?.key
  const primaryColor = series[0]?.color || '#18c5c0'
  const yTickFormatter = useMemo(() => makeUniqueYTickFormatter(tabId), [tabId])

  const { data: historyData, bucketed } = useMemo(
    () => maybeBucketWeekly([...(dailyAnalytics || [])].sort((a, b) => (a.date < b.date ? -1 : 1))),
    [dailyAnalytics],
  )

  const chartData = useMemo(
    () => buildRangedChartData(historyData, rangeId),
    [historyData, rangeId],
  )

  useEffect(() => {
    if (!chartData.length) {
      setBrushIndexes({ startIndex: 0, endIndex: 0 })
      return
    }
    setBrushIndexes({ startIndex: 0, endIndex: chartData.length - 1 })
  }, [chartData])

  const visibleRows = useMemo(() => {
    if (!chartData.length) return []
    const start = Math.max(0, brushIndexes.startIndex || 0)
    const end = Math.min(chartData.length - 1, brushIndexes.endIndex ?? chartData.length - 1)
    return chartData.slice(start, end + 1)
  }, [brushIndexes, chartData])

  const summary = useMemo(
    () => summarizeSeries(visibleRows, series),
    [visibleRows, series],
  )

  const yearBoundaries = useMemo(
    () => getYearBoundaryDates(visibleRows),
    [visibleRows],
  )
  const spansMultipleYears = yearBoundaries.length > 0

  const yScale = useMemo(
    () => computeSoftYDomain(visibleRows, series.map((item) => item.key)),
    [visibleRows, series],
  )

  const brushStartLabel = visibleRows[0]
    ? formatAnalyticsDate(visibleRows[0].date, { year: 'numeric' })
    : null
  const brushEndLabel = visibleRows[visibleRows.length - 1]
    ? formatAnalyticsDate(visibleRows[visibleRows.length - 1].date, { year: 'numeric' })
    : null

  if (!dailyAnalytics?.length || !historyData.length || !chartData.length) return null

  const titleAddress = isCompact ? compactAddress(addressLabel) : (addressLabel || 'wallet')
  const rangeWindow = getRangeWindow(rangeId)
  const chartMargin = isPhone
    ? { top: 8, right: 6, bottom: 0, left: 0 }
    : isCompact
      ? { top: 10, right: 10, bottom: 0, left: 0 }
      : { top: 12, right: 16, bottom: 0, left: 0 }

  return (
    <section className="card analytics-card p-5 max-[480px]:p-3.5">
      <div className="analytics-header">
        <div className="flex items-center gap-2.5 min-w-0">
          <MaterialIcon icon="monitoring" className="text-teal-400 text-xl shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">
              Transaction Analytics
            </span>
            <h2 className="text-base font-bold mt-0.5 truncate">
              {activeTab.title}{isPhone ? '' : ` for ${titleAddress}`}
            </h2>
            <p className="analytics-source">
              {isPhone ? (
                <>
                  {titleAddress}
                  {rangeWindow && (
                    <>
                      {' · '}
                      {formatAnalyticsDate(rangeWindow.start, { month: 'short', day: 'numeric' })}
                      {'–'}
                      {formatAnalyticsDate(rangeWindow.end, { month: 'short', day: 'numeric' })}
                    </>
                  )}
                </>
              ) : (
                <>
                  Source: {sourceLabel}
                  {rangeWindow && (
                    <>
                      {' · '}
                      {formatAnalyticsDate(rangeWindow.start, { year: 'numeric' })}
                      {' – '}
                      {formatAnalyticsDate(rangeWindow.end, { year: 'numeric' })}
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        <span className="analytics-range-label" aria-label="Chart range">1M</span>
      </div>

      <div className="analytics-tabs" role="tablist" aria-label="Analytics metric">
        {ANALYTICS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tabId === tab.id}
            className={`analytics-tab ${tabId === tab.id ? 'analytics-tab--active' : ''}`}
            onClick={() => setTabId(tab.id)}
          >
            {isPhone ? tab.label.replace(' Transfers', '') : tab.label}
          </button>
        ))}
      </div>

      {summary.length > 0 && (
        <div className={`analytics-summary analytics-summary--${summary.length}`}>
          {summary.map((item) => (
            <div
              key={item.key}
              className="analytics-summary__chip"
              style={{ '--chip-accent': item.color }}
            >
              <span className="analytics-summary__label">
                {isPhone ? item.label.replace(' Address', '') : item.label}
              </span>
              <strong>{formatSeriesValue(item.key, item.total)}</strong>
              <small>peak {formatSeriesValue(item.key, item.peak)}</small>
            </div>
          ))}
        </div>
      )}

      {(bucketed || yScale.clipped) && !isPhone && (
        <p className="analytics-bucket-note">
          {bucketed && 'Weekly totals for long history. '}
          {yScale.clipped && (
            <>
              Y-axis soft-scaled so spikes do not flatten the chart
              {yScale.trueMax > 0 ? ` (peak ${formatSeriesValue(primaryKey, yScale.trueMax)}).` : '.'}
              {' '}Drag the brush to zoom into quieter periods.
            </>
          )}
        </p>
      )}

      <div className="analytics-chart-area">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={chartMargin}>
            <defs>
              <linearGradient id="analyticsPrimaryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primaryColor} stopOpacity={0.28} />
                <stop offset="100%" stopColor={primaryColor} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="analyticsBrushFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primaryColor} stopOpacity={0.22} />
                <stop offset="100%" stopColor={primaryColor} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: isPhone ? 8 : 9, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(d) => formatAxisTick(d, { showYear: spansMultipleYears && !isPhone })}
              interval="preserveStartEnd"
              minTickGap={isPhone ? 24 : isCompact ? 32 : 40}
            />
            <YAxis
              tick={{ fontSize: isPhone ? 8 : 9, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              width={isPhone ? 34 : isCompact ? 40 : 52}
              domain={yScale.domain}
              allowDataOverflow={false}
              tickFormatter={yTickFormatter}
              label={isCompact ? undefined : {
                value: tabId === 'fees' || tabId === 'ether' ? 'ETH' : 'Count',
                angle: -90,
                position: 'insideLeft',
                style: { fill: 'var(--muted)', fontSize: 9 },
              }}
            />
            {!isPhone && yearBoundaries.map((boundary) => (
              <ReferenceLine
                key={`year-${boundary.year}`}
                x={boundary.date}
                stroke="var(--line)"
                strokeDasharray="4 4"
                label={{
                  value: String(boundary.year),
                  position: 'insideTopLeft',
                  fill: 'var(--muted)',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />
            ))}
            <Tooltip
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 20, outline: 'none' }}
              content={(
                <AnalyticsTooltip
                  series={series}
                  softMax={yScale.softMax}
                  clipped={yScale.clipped}
                />
              )}
              cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3', opacity: 0.4 }}
            />
            {series[0] && (
              <Area
                type="monotone"
                dataKey={series[0].key}
                stroke="none"
                fill="url(#analyticsPrimaryFill)"
                isAnimationActive={false}
                legendType="none"
              />
            )}
            {series.map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={item.key === primaryKey ? (isPhone ? 2 : 2.25) : (isPhone ? 1.5 : 2)}
                dot={false}
                activeDot={{ r: isPhone ? 3 : 3.5, strokeWidth: 0, fill: item.color }}
                isAnimationActive={false}
                legendType="none"
              />
            ))}
            {chartData.length > 2 && primaryKey && (
              <Brush
                dataKey="date"
                height={isPhone ? 28 : 36}
                stroke="transparent"
                fill="rgba(24, 197, 192, 0.12)"
                travellerWidth={isPhone ? 14 : 12}
                traveller={<BrushTraveller />}
                tickFormatter={() => ''}
                startIndex={brushIndexes.startIndex}
                endIndex={brushIndexes.endIndex}
                onChange={(next) => {
                  if (next?.startIndex == null || next?.endIndex == null) return
                  setBrushIndexes({
                    startIndex: next.startIndex,
                    endIndex: next.endIndex,
                  })
                }}
              >
                <AreaChart>
                  <Area
                    type="monotone"
                    dataKey={primaryKey}
                    stroke={primaryColor}
                    fill="url(#analyticsBrushFill)"
                    strokeWidth={1}
                    strokeOpacity={0.65}
                    isAnimationActive={false}
                    dot={false}
                  />
                </AreaChart>
              </Brush>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {(brushStartLabel || brushEndLabel) && (
        <div className="analytics-brush-dates">
          <span>{brushStartLabel}</span>
          <span>{brushEndLabel}</span>
        </div>
      )}

      <div className="analytics-legend" aria-label="Series legend">
        {series.map((item) => (
          <span key={item.key} className="analytics-legend__item">
            <i style={{ background: item.color }} />
            {isPhone ? item.label.replace(' Address', '') : item.label}
          </span>
        ))}
      </div>
    </section>
  )
}
