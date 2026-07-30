import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MaterialIcon } from '../common/MaterialIcon'
import {
  buildAllocationData,
  computeConcentration,
  formatPortfolioValue,
} from './portfolio.utils'

function AllocationTooltip({ active, payload, displayMode, ethPrice }) {
  if (!active || !payload?.length) return null
  const item = payload[0]?.payload
  if (!item) return null

  return (
    <div className="money-flow-tooltip">
      <strong>{item.symbol}</strong>
      <span>{formatPortfolioValue(item.rawValue, { displayMode, ethPrice })}</span>
      <small>{item.percent}% allocation</small>
    </div>
  )
}

export function PortfolioAllocation({
  holdings = [],
  displayMode = 'usd',
  ethPrice,
  activeSymbol,
  onHighlight,
}) {
  const allocationData = useMemo(
    () => buildAllocationData(holdings, { maxItems: 10 }),
    [holdings],
  )

  const concentration = useMemo(
    () => computeConcentration(holdings),
    [holdings],
  )

  if (!allocationData.length) return null

  return (
    <section className="card portfolio-allocation-card p-5 max-[480px]:p-3.5">
      <div className="portfolio-allocation__head">
        <div className="flex items-center gap-2.5 min-w-0">
          <MaterialIcon icon="pie_chart" className="text-teal-400 text-xl shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">
              Allocation
            </span>
            <h2 className="text-base font-bold mt-0.5 truncate">Top holdings by value</h2>
          </div>
        </div>
      </div>

      <p className="portfolio-allocation__caption">
        Top 3 = {concentration.top3}% of priced portfolio
      </p>

      <div className="portfolio-allocation__chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={allocationData}
            layout="vertical"
            margin={{ top: 4, right: 8, bottom: 0, left: 4 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="symbol"
              width={52}
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<AllocationTooltip displayMode={displayMode} ethPrice={ethPrice} />}
              cursor={{ fill: 'rgba(24,197,192,.08)' }}
            />
            <Bar
              dataKey="rawValue"
              radius={[0, 6, 6, 0]}
              barSize={14}
              onClick={(data) => onHighlight?.(data?.symbol === 'Others' ? null : data?.symbol)}
              onMouseEnter={(data) => onHighlight?.(data?.symbol === 'Others' ? null : data?.symbol)}
              onMouseLeave={() => onHighlight?.(null)}
            >
              {allocationData.map((entry) => (
                <Cell
                  key={entry.symbol}
                  fill={entry.fill}
                  opacity={activeSymbol && activeSymbol !== entry.symbol ? 0.45 : 1}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
