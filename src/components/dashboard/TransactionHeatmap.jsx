import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MaterialIcon } from '../common/MaterialIcon'
import {
  buildHeatmapMonthBlocks,
  getHeatmapRange,
  parseDateStr,
} from './transactionHeatmap.utils'

const CELL_GAP = 2
const BLOCK_GAP_DESKTOP = 10
const BLOCK_GAP_MOBILE = 4
const MIN_CELL_DESKTOP = 8
const MIN_CELL_MOBILE = 8
const MIN_CELL_PHONE = 9

function getIntensity(count) {
  if (count === 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 10) return 3
  return 4
}

function formatDate(dateStr) {
  const d = parseDateStr(dateStr)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRangeDate(dateStr) {
  const d = parseDateStr(dateStr)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function Tooltip({ data, x, y }) {
  if (!data) return null

  return (
    <div
      className="heatmap-tooltip"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <strong>{formatDate(data.date)}</strong>
      <span>{data.count} transaction{data.count !== 1 ? 's' : ''}</span>
    </div>
  )
}

function formatCountValue(value, isLowerBound) {
  const formatted = Number(value || 0).toLocaleString()
  return isLowerBound ? `${formatted}+` : formatted
}

function ActivityStatCard({ title, value, sinceLabel, compact }) {
  if (!value) return null

  return (
    <div className="heatmap-stat-card">
      <span className="heatmap-stat-card__title">{title}</span>
      <strong className="heatmap-stat-card__value">{value}</strong>
      {sinceLabel && !compact && (
        <span className="heatmap-stat-card__since">{sinceLabel}</span>
      )}
    </div>
  )
}

export function TransactionHeatmap({ dailyTransactionCounts, activityStats, transactions }) {
  const [tooltip, setTooltip] = useState(null)
  const [layout, setLayout] = useState({
    cellSize: 11,
    blockGap: BLOCK_GAP_DESKTOP,
    isCompact: false,
    allowScroll: false,
  })
  const wrapRef = useRef(null)

  const txCounts = useMemo(() => {
    const lifetimeCounts = activityStats?.dailyCounts
    if (lifetimeCounts && Object.keys(lifetimeCounts).length > 0) {
      return lifetimeCounts
    }

    if (dailyTransactionCounts && Object.keys(dailyTransactionCounts).length > 0) {
      return dailyTransactionCounts
    }

    const counts = {}
    if (!transactions || transactions.length === 0) return counts

    transactions.forEach((tx) => {
      if (tx.timestamp) {
        const dateStr = new Date(tx.timestamp).toISOString().slice(0, 10)
        counts[dateStr] = (counts[dateStr] || 0) + 1
      }
    })

    return counts
  }, [activityStats, dailyTransactionCounts, transactions])

  const range = useMemo(() => getHeatmapRange(txCounts), [txCounts])

  const monthBlocks = useMemo(() => {
    if (!range) return []
    return buildHeatmapMonthBlocks(txCounts, range)
  }, [txCounts, range])

  const totalWeekColumns = useMemo(
    () => monthBlocks.reduce((sum, block) => sum + block.numWeeks, 0),
    [monthBlocks],
  )

  const lifetimeStats = useMemo(() => {
    if (!activityStats) return null

    return {
      transactionCount: activityStats.transactionCount?.value != null
        ? formatCountValue(
          activityStats.transactionCount.value,
          activityStats.transactionCount.isLowerBound,
        )
        : null,
      transactionSince: activityStats.transactionCount?.sinceLabel,
      activeAge: activityStats.activeAge?.label,
      activeAgeSince: activityStats.activeAge?.sinceLabel,
      uniqueDaysActive: activityStats.uniqueDaysActive?.label,
      uniqueDaysSince: activityStats.uniqueDaysActive?.sinceLabel,
      longestStreak: activityStats.longestStreak?.label,
      longestStreakSince: activityStats.longestStreak?.sinceLabel,
      isPartial: activityStats.source === 'computed_partial',
    }
  }, [activityStats])

  const visibleStats = useMemo(() => {
    if (!range) return { totalTxns: 0, activeDays: 0 }

    let totalTxns = 0
    let activeDays = 0

    Object.entries(txCounts).forEach(([date, count]) => {
      if (date >= range.displayStartStr && date <= range.displayEndStr) {
        totalTxns += count
        if (count > 0) activeDays += 1
      }
    })

    return { totalTxns, activeDays }
  }, [txCounts, range])

  const dateRangeLabel = range
    ? `${formatRangeDate(range.displayStartStr)} – ${formatRangeDate(range.displayEndStr)}`
    : null

  useEffect(() => {
    const element = wrapRef.current
    if (!element || totalWeekColumns === 0) return undefined

    const updateLayout = () => {
      const width = element.clientWidth
      const isCompact = width < 700
      const isPhone = width < 480
      const blockGap = isCompact ? BLOCK_GAP_MOBILE : BLOCK_GAP_DESKTOP
      const minCell = isPhone ? MIN_CELL_PHONE : isCompact ? MIN_CELL_MOBILE : MIN_CELL_DESKTOP
      const blockGaps = Math.max(0, monthBlocks.length - 1) * blockGap
      const cellGaps = Math.max(0, totalWeekColumns - monthBlocks.length) * CELL_GAP
      const available = width - blockGaps - cellGaps - 4
      const computed = Math.floor(available / Math.max(1, totalWeekColumns))
      const needsScroll = isCompact && computed < minCell

      setLayout({
        cellSize: needsScroll ? minCell : Math.max(minCell, computed),
        blockGap,
        isCompact,
        allowScroll: needsScroll,
      })
    }

    updateLayout()

    const observer = new ResizeObserver(updateLayout)
    observer.observe(element)
    return () => observer.disconnect()
  }, [monthBlocks.length, totalWeekColumns])

  const { cellSize, blockGap, isCompact, allowScroll } = layout

  if (!range || monthBlocks.length === 0) {
    return null
  }

  const showCellTooltip = (cell, clientX, clientY) => {
    if (!cell.isActive) return
    setTooltip({ data: cell, x: clientX, y: clientY })
  }

  return (
    <section className="card heatmap-card p-5 max-[480px]:p-3.5">
      <div className="heatmap-header flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2.5">
          <MaterialIcon icon="calendar_month" className="text-teal-400 text-xl" />
          <div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Transaction Activity</span>
            <h2 className="text-base font-bold mt-0.5">Heatmap</h2>
          </div>
        </div>
        {dateRangeLabel && (
          <p className="heatmap-range heatmap-range--header text-[10px] font-semibold text-slate-500 dark:text-slate-400 text-right shrink-0">
            {dateRangeLabel}
          </p>
        )}
      </div>

      {lifetimeStats && (
        <div className="heatmap-lifetime-stats">
          <ActivityStatCard
            title="Transaction Count"
            value={lifetimeStats.transactionCount}
            sinceLabel={lifetimeStats.transactionSince}
            compact={isCompact}
          />
          <ActivityStatCard
            title="Active Age"
            value={lifetimeStats.activeAge}
            sinceLabel={lifetimeStats.activeAgeSince}
            compact={isCompact}
          />
          <ActivityStatCard
            title="Unique Days Active"
            value={lifetimeStats.uniqueDaysActive}
            sinceLabel={lifetimeStats.uniqueDaysSince}
            compact={isCompact}
          />
          <ActivityStatCard
            title="Longest Streak"
            value={lifetimeStats.longestStreak}
            sinceLabel={lifetimeStats.longestStreakSince}
            compact={isCompact}
          />
        </div>
      )}

      {lifetimeStats?.isPartial && !isCompact && (
        <p className="heatmap-partial-note">
          Lifetime stats are based on a sampled transaction scan. Counts may show a lower bound.
        </p>
      )}

      <div className="heatmap-stats flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-xs">
        <span className="text-slate-500 dark:text-slate-400">
          <strong className="text-slate-900 dark:text-slate-100">{visibleStats.totalTxns.toLocaleString()}</strong> txns in view
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          <strong className="text-slate-900 dark:text-slate-100">{visibleStats.activeDays.toLocaleString()}</strong> active days
        </span>
      </div>

      <div ref={wrapRef} className={`heatmap-wrap ${allowScroll ? 'heatmap-wrap--scroll' : ''}`}>
        <div
          className="heatmap-layout heatmap-layout--blocks"
          style={{
            '--cell-size': `${cellSize}px`,
            '--cell-gap': `${CELL_GAP}px`,
            '--block-gap': `${blockGap}px`,
          }}
        >
          <div className="heatmap-body heatmap-body--blocks">
            <div className="heatmap-month-blocks">
              {monthBlocks.map((block) => {
                const blockWidth = block.numWeeks * cellSize + (block.numWeeks - 1) * CELL_GAP

                return (
                  <div
                    key={`${block.year}-${block.month}`}
                    className="heatmap-month-block"
                    style={{ width: `${blockWidth}px` }}
                  >
                    <div
                      className="heatmap-cells heatmap-cells--block"
                      style={{ '--week-count': block.numWeeks }}
                    >
                      {block.cells.map((cell, index) => {
                        const intensity = cell.isActive ? getIntensity(cell.count) : null
                        const levelClass = intensity === null ? '' : ` heatmap-cell--l${intensity}`

                        return (
                          <div
                            key={`${cell.date}-${index}`}
                            className={`heatmap-cell${cell.isActive ? ' heatmap-cell--interactive' : ''}${levelClass}`}
                            aria-hidden={!cell.isActive}
                            onMouseEnter={(e) => showCellTooltip(cell, e.clientX, e.clientY)}
                            onMouseMove={(e) => showCellTooltip(cell, e.clientX, e.clientY)}
                            onMouseLeave={() => setTooltip(null)}
                            onTouchStart={(e) => {
                              const touch = e.touches?.[0]
                              if (!touch) return
                              showCellTooltip(cell, touch.clientX, touch.clientY)
                            }}
                            onTouchEnd={() => setTooltip(null)}
                          />
                        )
                      })}
                    </div>
                    <span className="heatmap-month-block-label">{block.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="heatmap-legend" aria-hidden="true">
            <span>Less</span>
            <span className="heatmap-legend-cell heatmap-cell--l0" />
            <span className="heatmap-legend-cell heatmap-cell--l1" />
            <span className="heatmap-legend-cell heatmap-cell--l2" />
            <span className="heatmap-legend-cell heatmap-cell--l3" />
            <span className="heatmap-legend-cell heatmap-cell--l4" />
            <span>More</span>
          </div>
        </div>
      </div>

      {allowScroll && (
        <p className="heatmap-scroll-hint">Swipe sideways to explore the full year</p>
      )}

      {tooltip && createPortal(
        <Tooltip data={tooltip.data} x={tooltip.x} y={tooltip.y} />,
        document.body,
      )}
    </section>
  )
}
