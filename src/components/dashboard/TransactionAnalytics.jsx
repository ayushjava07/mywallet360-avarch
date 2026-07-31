import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MaterialIcon } from '../common/MaterialIcon'
import {
  ANALYTICS_TABS,
  ANALYTICS_VIEW_RANGES,
  DEFAULT_ANALYTICS_VIEW_RANGE,
  addSymlogFields,
  buildPeriodChartData,
  computeNormalRangeBrushIndexes,
  computeSymlogYDomain,
  createHiddenSeriesState,
  detectSeriesOutliers,
  formatAnalyticsDate,
  formatAxisTick,
  formatSeriesValue,
  formatUsdValue,
  getAxisUnitForTab,
  getChartTypeForTab,
  getOutlierBrushMarkers,
  getPrimarySeriesKey,
  getSeriesForTab,
  getYearBoundaryDates,
  hasSeriesActivity,
  isSeriesHidden,
  maybeBucketWeekly,
  makeSymlogTickFormatter,
  normalizeDailyRow,
  SERIES_COLORS,
  sliceViewRange,
  summarizeSeries,
  symlog,
  symlogDataKey,
  toggleHiddenSeries,
} from './transactionAnalytics.utils'

const MIN_POINTS_FOR_BRUSH = 6
const CHART_ANIMATION_MS = 900
const CHART_PRIMARY = SERIES_COLORS.transactions

function ChartVerticalCursor({ points, height }) {
  if (!points?.length) return null
  const x = points[0].x

  return (
    <g className="analytics-chart-cursor">
      <line
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke="var(--chart-grid)"
        strokeWidth={1}
      />
      {points.map((point) => (
        <circle
          key={`${point.dataKey}-${point.x}-${point.y}`}
          cx={point.x}
          cy={point.y}
          r={4}
          fill={point.stroke || point.fill || CHART_PRIMARY}
          stroke="#fff"
          strokeWidth={2}
        />
      ))}
    </g>
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

function AnalyticsTooltip({
  active,
  payload,
  label,
  series,
  hiddenKeys = [],
}) {
  if (!active || !payload?.length) return null

  const point = payload[0]?.payload
  if (!point) return null

  const visibleSeries = series.filter((item) => !hiddenKeys.includes(item.key))
  if (!visibleSeries.length) return null

  return (
    <div className="analytics-tooltip analytics-tooltip--point">
      <span className="analytics-tooltip__date">
        {formatAnalyticsDate(label || point.date, { year: 'numeric' })}
      </span>
      {visibleSeries.map((item) => {
        const raw = Number(point[item.key]) || 0
        return (
          <div key={item.key} className="analytics-tooltip__row">
            <span className="analytics-tooltip__label">
              <i style={{ background: item.color }} />
              {item.label}
            </span>
            <strong>{formatSeriesValue(item.key, raw)}</strong>
          </div>
        )
      })}
    </div>
  )
}

function InteractiveLegend({ series, tabId, hiddenByTab, onToggle, isPhone }) {
  return (
    <div className="analytics-legend" aria-label="Series legend">
      {series.map((item) => {
        const hidden = isSeriesHidden(hiddenByTab, tabId, item.key)
        return (
          <button
            key={item.key}
            type="button"
            className={`analytics-legend__item${hidden ? ' analytics-legend__item--hidden' : ''}`}
            aria-pressed={!hidden}
            title={hidden ? `Show ${item.label}` : `Hide ${item.label}`}
            onClick={() => onToggle(item.key)}
          >
            <i style={{ background: item.color }} />
            <span>{isPhone ? item.label.replace(' Address', '') : item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function FeeStatCards({ rows, ethPrice, isPhone, hiddenKeys }) {
  const spentTotal = rows.reduce((sum, row) => sum + (Number(row.ethFeesSpent ?? row.ethFees) || 0), 0)
  const usedTotal = rows.reduce((sum, row) => sum + (Number(row.ethFeesUsed) || 0), 0)

  const cards = [
    {
      key: 'ethFeesSpent',
      label: isPhone ? 'Fees Spent' : 'Total Fees Spent (as sender)',
      total: spentTotal,
      accent: SERIES_COLORS.ethFeesSpent,
    },
    {
      key: 'ethFeesUsed',
      label: isPhone ? 'Fees Used' : 'Total Fees Used (as recipient)',
      total: usedTotal,
      accent: SERIES_COLORS.ethFeesUsed,
    },
  ]

  return (
    <div className="analytics-summary analytics-summary--2">
      {cards.map((card) => {
        const usd = formatUsdValue(card.total, ethPrice)
        const dimmed = hiddenKeys.includes(card.key)
        return (
          <div
            key={card.key}
            className={`analytics-summary__chip${dimmed ? ' analytics-summary__chip--dim' : ''}`}
            style={{ '--chip-accent': card.accent }}
          >
            <span className="analytics-summary__label">{card.label}</span>
            <strong>{formatSeriesValue(card.key, card.total)}</strong>
            <small>{usd ? `${usd} at current price` : 'USD value unavailable'}</small>
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
      <rect x={cx - 8} y={y} width={16} height={height} fill="transparent" style={{ cursor: 'ew-resize' }} />
      <rect x={cx - 1} y={barY} width={2} height={barHeight} rx={1} fill={CHART_PRIMARY} />
      <circle cx={cx} cy={y + height / 2} r={3.5} fill={CHART_PRIMARY} stroke="#fff" strokeWidth={1.5} />
    </g>
  )
}

function ViewRangeMenu({ viewRangeId, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const active = ANALYTICS_VIEW_RANGES.find((item) => item.id === viewRangeId)
    || ANALYTICS_VIEW_RANGES.find((item) => item.id === DEFAULT_ANALYTICS_VIEW_RANGE)

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div className={`dashboard-bar-custom-wrap analytics-view-range${open ? ' analytics-view-range--open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`dashboard-bar-pill dashboard-bar-pill--custom dashboard-bar-pill--active${open ? '' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {active?.label || 'YTD'}
        <MaterialIcon
          icon="expand_more"
          className={`dashboard-bar-chevron text-base!${open ? ' dashboard-bar-chevron--open' : ''}`}
        />
      </button>
      {open && (
        <div className="dashboard-bar-dropdown analytics-view-range__menu" role="listbox">
          {ANALYTICS_VIEW_RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === viewRangeId}
              className={`dashboard-bar-dropdown-item${item.id === viewRangeId ? ' dashboard-bar-dropdown-item--active' : ''}`}
              onClick={() => {
                onChange(item.id)
                setOpen(false)
              }}
            >
              <span className="dashboard-bar-dropdown-short">{item.label}</span>
              <div>
                <strong>{item.label}</strong>
                <small>Chart window</small>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function compactAddress(value) {
  if (!value || value.length < 12) return value
  if (!value.startsWith('0x')) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function renderSeries({
  chartType,
  series,
  hiddenByTab,
  tabId,
  primaryKey,
  isPhone,
  maxBarSize,
}) {
  return series.map((item) => {
    const hidden = isSeriesHidden(hiddenByTab, tabId, item.key)
    const dataKey = symlogDataKey(item.key)
    const strokeWidth = item.key === primaryKey ? (isPhone ? 2 : 2.25) : (isPhone ? 1.5 : 2)
    const activeDot = { r: isPhone ? 4 : 5, strokeWidth: 2, stroke: '#fff', fill: item.color }
    const seriesDot = {
      r: isPhone ? 2.5 : 3,
      strokeWidth: 1.5,
      stroke: '#fff',
      fill: item.color,
    }
    const isBar = chartType === 'bar' || (chartType === 'combo' && item.chartType !== 'line')

    if (isBar) {
      return (
        <Bar
          key={item.key}
          dataKey={dataKey}
          name={item.label}
          fill={`url(#analyticsBar-${item.key})`}
          radius={[4, 4, 0, 0]}
          maxBarSize={maxBarSize}
          hide={hidden}
          yAxisId={item.yAxisId || 'left'}
          isAnimationActive
          animationDuration={CHART_ANIMATION_MS}
          animationEasing="ease-out"
          legendType="none"
        />
      )
    }

    if (chartType === 'area' && item.chartType === 'area') {
      return (
        <Area
          key={item.key}
          type="linear"
          dataKey={dataKey}
          name={item.label}
          stroke={item.color}
          strokeWidth={strokeWidth}
          fill={`url(#analyticsFill-${item.key})`}
          hide={hidden}
          yAxisId={item.yAxisId || 'left'}
          isAnimationActive
          animationDuration={CHART_ANIMATION_MS}
          animationEasing="ease-out"
          legendType="none"
          dot={seriesDot}
          activeDot={activeDot}
        />
      )
    }

    return (
      <Line
        key={item.key}
        type="linear"
        dataKey={dataKey}
        name={item.label}
        stroke={item.color}
        strokeWidth={strokeWidth}
        dot={seriesDot}
        activeDot={activeDot}
        hide={hidden}
        yAxisId={item.yAxisId || (chartType === 'combo' ? 'right' : 'left')}
        isAnimationActive
        animationDuration={CHART_ANIMATION_MS}
        animationEasing="ease-out"
        legendType="none"
      />
    )
  })
}

export function TransactionAnalytics({
  dailyAnalytics,
  addressLabel,
  sourceLabel = 'MyWallet360',
  ethPrice = null,
  periodLabel = 'Selected period',
  reportRange = null,
}) {
  const isCompact = useCompactViewport(700)
  const isPhone = useCompactViewport(480)
  const [tabId, setTabId] = useState('transactions')
  const [viewRangeId, setViewRangeId] = useState(DEFAULT_ANALYTICS_VIEW_RANGE)
  const [brushIndexes, setBrushIndexes] = useState({ startIndex: 0, endIndex: 0 })
  const [hiddenByTab, setHiddenByTab] = useState(createHiddenSeriesState)
  const [outlierChipDismissed, setOutlierChipDismissed] = useState(false)

  const series = useMemo(() => getSeriesForTab(tabId), [tabId])
  const seriesKeys = useMemo(() => series.map((item) => item.key), [series])
  const chartType = useMemo(() => getChartTypeForTab(tabId), [tabId])
  const activeTab = ANALYTICS_TABS.find((tab) => tab.id === tabId) || ANALYTICS_TABS[0]
  const primaryKey = getPrimarySeriesKey(tabId)
  const primaryColor = series[0]?.color || SERIES_COLORS.transactions
  const leftTickFormatter = useMemo(() => makeSymlogTickFormatter(tabId), [tabId])
  const rightTickFormatter = useMemo(() => makeSymlogTickFormatter('tokens'), [tabId])
  const hiddenKeys = hiddenByTab[tabId] || []

  const visibleSeries = useMemo(
    () => series.filter((item) => !hiddenKeys.includes(item.key)),
    [series, hiddenKeys],
  )

  const { data: chartData, bucketed } = useMemo(() => {
    const ranged = buildPeriodChartData(dailyAnalytics, reportRange)
    const viewed = sliceViewRange(ranged, viewRangeId, reportRange)
    const bucketedResult = maybeBucketWeekly(viewed)
    const normalized = bucketedResult.data.map(normalizeDailyRow)
    return {
      data: addSymlogFields(normalized, seriesKeys),
      bucketed: bucketedResult.bucketed,
    }
  }, [dailyAnalytics, reportRange, viewRangeId, seriesKeys])

  const outliers = useMemo(
    () => detectSeriesOutliers(chartData, seriesKeys),
    [chartData, seriesKeys],
  )

  const primaryOutlier = useMemo(
    () => outliers.find((item) => item.key === primaryKey) || outliers[0] || null,
    [outliers, primaryKey],
  )

  const outlierMarkers = useMemo(
    () => getOutlierBrushMarkers(chartData, outliers, primaryKey),
    [chartData, outliers, primaryKey],
  )

  useEffect(() => {
    setOutlierChipDismissed(false)
  }, [chartData, tabId, viewRangeId])

  useEffect(() => {
    if (!chartData.length) {
      setBrushIndexes({ startIndex: 0, endIndex: 0 })
      return
    }
    setBrushIndexes({ startIndex: 0, endIndex: chartData.length - 1 })
  }, [chartData, tabId, viewRangeId])

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

  const leftVisibleKeys = useMemo(() => {
    const leftVisible = visibleSeries.filter((item) => item.yAxisId !== 'right').map((item) => item.key)
    return leftVisible.length
      ? leftVisible
      : series.filter((item) => item.yAxisId !== 'right').map((item) => item.key)
  }, [visibleSeries, series])

  const rightVisibleKeys = useMemo(() => {
    const rightSeries = series.filter((item) => item.yAxisId === 'right')
    const shown = rightSeries.filter((item) => !hiddenKeys.includes(item.key))
    return (shown.length ? shown : rightSeries).map((item) => item.key)
  }, [series, hiddenKeys])

  const leftYScale = useMemo(
    () => computeSymlogYDomain(visibleRows, leftVisibleKeys),
    [visibleRows, leftVisibleKeys],
  )

  const rightYScale = useMemo(() => {
    if (!rightVisibleKeys.length) return null
    return computeSymlogYDomain(visibleRows, rightVisibleKeys)
  }, [visibleRows, rightVisibleKeys])

  const hasActivity = useMemo(
    () => hasSeriesActivity(visibleRows, visibleSeries),
    [visibleRows, visibleSeries],
  )

  const handleLegendToggle = useCallback((seriesKey) => {
    setHiddenByTab((current) => toggleHiddenSeries(current, tabId, seriesKey))
  }, [tabId])

  const zoomToNormalRange = useCallback(() => {
    const next = computeNormalRangeBrushIndexes(chartData, outliers)
    setBrushIndexes(next)
    setOutlierChipDismissed(true)
  }, [chartData, outliers])

  const brushStartLabel = visibleRows[0]
    ? formatAnalyticsDate(visibleRows[0].date, { year: 'numeric' })
    : null
  const brushEndLabel = visibleRows[visibleRows.length - 1]
    ? formatAnalyticsDate(visibleRows[visibleRows.length - 1].date, { year: 'numeric' })
    : null

  if (!dailyAnalytics?.length || !chartData.length) return null

  const titleAddress = isCompact ? compactAddress(addressLabel) : (addressLabel || 'wallet')
  const rangeWindow = reportRange?.from && reportRange?.to
    ? { start: reportRange.from, end: reportRange.to }
    : null
  const isDualAxis = chartType === 'combo' && Boolean(rightYScale)
  const usesBars = chartType === 'bar' || chartType === 'combo'
  const showBrush = chartData.length > MIN_POINTS_FOR_BRUSH && Boolean(primaryKey)
  const showOutlierChip = Boolean(primaryOutlier) && !outlierChipDismissed

  const axisWidth = isPhone ? 36 : isCompact ? 42 : 52
  const maxBarSize = isPhone ? 9 : isCompact ? 13 : 18
  const chartMargin = {
    top: isPhone ? 10 : 14,
    right: isDualAxis ? 0 : (isPhone ? 8 : 14),
    bottom: 0,
    left: 0,
  }

  const leftAxisLabel = getAxisUnitForTab(tabId)
  const showGenericSummary = tabId !== 'fees' && summary.length > 0
  const allSeriesHidden = visibleSeries.length === 0
  const primaryLogKey = symlogDataKey(primaryKey)

  return (
    <section className="analytics-card analytics-card--glass card relative isolate overflow-visible p-[22px] max-[480px]:p-4">
      <div className="analytics-card__mesh" aria-hidden="true" />
      <div className="analytics-header">
        <div className="flex items-start gap-3 min-w-0">
          <MaterialIcon icon="monitoring" className="text-teal-400 text-xl shrink-0 mt-0.5" />
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">
              Transaction Analytics
            </span>
            <h2 className="text-base font-bold mt-0.5 text-[#1a1f36] dark:text-slate-100">
              {activeTab.title}{isPhone ? '' : ` for ${titleAddress}`}
            </h2>
            <p className="analytics-source">
              {isPhone ? (
                <>
                  {titleAddress}
                  {' · '}
                  Daily activity · {periodLabel}
                </>
              ) : (
                <>
                  Source: {sourceLabel}
                  {' · '}
                  Daily activity · {periodLabel}
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
        <ViewRangeMenu viewRangeId={viewRangeId} onChange={setViewRangeId} />
      </div>

      <div className="analytics-tabs-wrap">
        <div className="dashboard-bar-periods" role="tablist" aria-label="Analytics metric">
          {ANALYTICS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tabId === tab.id}
              className={`dashboard-bar-pill${tabId === tab.id ? ' dashboard-bar-pill--active' : ''}`}
              onClick={() => setTabId(tab.id)}
            >
              {isPhone ? tab.label.replace(' Transfers', '') : tab.label}
            </button>
          ))}
        </div>
      </div>

      {tabId === 'fees' && (
        <FeeStatCards
          rows={visibleRows}
          ethPrice={ethPrice}
          isPhone={isPhone}
          hiddenKeys={hiddenKeys}
        />
      )}

      {showGenericSummary && (
        <div className={`analytics-summary analytics-summary--${summary.length}`}>
          {summary.map((item) => (
            <div
              key={item.key}
              className={`analytics-summary__chip${hiddenKeys.includes(item.key) ? ' analytics-summary__chip--dim' : ''}`}
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

      {showOutlierChip && (
        <button
          type="button"
          className="analytics-outlier-chip"
          onClick={zoomToNormalRange}
        >
          <span aria-hidden="true">📈</span>
          Outlier detected on {formatAnalyticsDate(primaryOutlier.date, { month: 'short', day: 'numeric' })}
          {' '}
          ({formatSeriesValue(primaryOutlier.key, primaryOutlier.value)}) — click to zoom into normal range
        </button>
      )}

      {bucketed && !isPhone && (
        <p className="analytics-bucket-note">Weekly totals shown for long history.</p>
      )}

      <div
        key={`${tabId}-${viewRangeId}`}
        className={`analytics-chart-area${showBrush ? '' : ' analytics-chart-area--no-brush'}`}
        role="img"
        aria-label={`${activeTab.title} chart showing ${visibleSeries.map((item) => item.label).join(', ') || 'no series'}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={chartMargin} barCategoryGap="20%" barGap={2}>
            <defs>
              {series.map((item) => (
                <linearGradient key={`fill-${item.key}`} id={`analyticsFill-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={item.color} stopOpacity={0.18} />
                  <stop offset="85%" stopColor={item.color} stopOpacity={0.04} />
                  <stop offset="100%" stopColor={item.color} stopOpacity={0} />
                </linearGradient>
              ))}
              {series.map((item) => (
                <linearGradient key={`bar-${item.key}`} id={`analyticsBar-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={item.color} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={item.color} stopOpacity={0.45} />
                </linearGradient>
              ))}
              <linearGradient id="analyticsBrushFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_PRIMARY} stopOpacity={0.22} />
                <stop offset="100%" stopColor={CHART_PRIMARY} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 4" stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: isPhone ? 8 : 9, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(d) => formatAxisTick(d, { showYear: spansMultipleYears && !isPhone })}
              interval="preserveStartEnd"
              minTickGap={isPhone ? 24 : isCompact ? 32 : 40}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: isPhone ? 8 : 9, fill: primaryColor }}
              tickLine={false}
              axisLine={false}
              width={axisWidth}
              domain={leftYScale.domain}
              ticks={leftYScale.tickValues}
              allowDataOverflow={false}
              tickFormatter={leftTickFormatter}
              label={isCompact ? undefined : {
                value: leftAxisLabel,
                angle: -90,
                position: 'insideLeft',
                style: { fill: primaryColor, fontSize: 9, fontWeight: 700 },
              }}
            />
            {isDualAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: isPhone ? 8 : 9, fill: SERIES_COLORS.tokenContractsCount }}
                tickLine={false}
                axisLine={false}
                width={axisWidth}
                domain={rightYScale.domain}
                ticks={rightYScale.tickValues}
                allowDataOverflow={false}
                tickFormatter={rightTickFormatter}
                label={isCompact ? undefined : {
                  value: 'Contracts',
                  angle: 90,
                  position: 'insideRight',
                  style: { fill: SERIES_COLORS.tokenContractsCount, fontSize: 9, fontWeight: 700 },
                }}
              />
            )}
            {!isPhone && yearBoundaries.map((boundary) => (
              <ReferenceLine
                key={`year-${boundary.year}`}
                yAxisId="left"
                x={boundary.date}
                stroke="var(--chart-grid)"
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
            {primaryOutlier && (
              <ReferenceDot
                yAxisId="left"
                x={primaryOutlier.date}
                y={symlog(primaryOutlier.value)}
                r={4}
                fill="#fb7185"
                stroke="#fff"
                strokeWidth={1.5}
                label={{
                  value: formatSeriesValue(primaryOutlier.key, primaryOutlier.value),
                  position: 'top',
                  fill: '#fb7185',
                  fontSize: 10,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            )}
            <Tooltip
              offset={16}
              wrapperStyle={{ zIndex: 20, outline: 'none', pointerEvents: 'none' }}
              content={(
                <AnalyticsTooltip
                  series={series}
                  hiddenKeys={hiddenKeys}
                />
              )}
              cursor={usesBars
                ? { fill: 'var(--chart-cursor)', radius: 4 }
                : <ChartVerticalCursor />}
            />
            {renderSeries({
              chartType,
              series,
              hiddenByTab,
              tabId,
              primaryKey,
              isPhone,
              maxBarSize,
            })}
            {showBrush && (
              <Brush
                dataKey="date"
                height={isPhone ? 28 : 36}
                stroke="transparent"
                fill="var(--chart-cursor)"
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
                  <YAxis hide domain={[0, leftYScale.domain[1] || 1]} />
                  <Area
                    type="linear"
                    dataKey={primaryLogKey}
                    stroke={CHART_PRIMARY}
                    fill="url(#analyticsBrushFill)"
                    strokeWidth={1}
                    strokeOpacity={0.75}
                    isAnimationActive={false}
                    dot={false}
                  />
                  {outlierMarkers.map((marker) => (
                    <ReferenceDot
                      key={`brush-outlier-${marker.date}`}
                      x={marker.date}
                      y={marker.markerY}
                      r={3}
                      fill="#fb7185"
                      stroke="#fff"
                      strokeWidth={1}
                    />
                  ))}
                </AreaChart>
              </Brush>
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {(allSeriesHidden || !hasActivity) && (
          <div className="analytics-chart-empty">
            <MaterialIcon
              icon={allSeriesHidden ? 'visibility_off' : 'show_chart'}
              className="text-lg"
            />
            <span>
              {allSeriesHidden
                ? 'All series hidden — pick one below to show data'
                : 'No activity in this range'}
            </span>
          </div>
        )}
      </div>

      {showBrush && (brushStartLabel || brushEndLabel) && (
        <div className="analytics-brush-dates">
          <span>{brushStartLabel}</span>
          <span>{brushEndLabel}</span>
        </div>
      )}

      <InteractiveLegend
        series={series}
        tabId={tabId}
        hiddenByTab={hiddenByTab}
        onToggle={handleLegendToggle}
        isPhone={isPhone}
      />
    </section>
  )
}
