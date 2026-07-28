import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Coins, DollarSign } from 'lucide-react'
import { Icon } from '../common/Icon'
import { MaterialIcon } from '../common/MaterialIcon'
import { MetricExplainer } from '../common/MetricExplainer'
import {
  formatFlowDisplay,
  formatMonthLabel,
  formatPeriodLabel,
  netGrowthValue,
} from './moneyFlow.utils'

const FLOW_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'in', label: 'Received' },
  { id: 'out', label: 'Spent' },
]

function FlowToggle({ displayMode, onChange }) {
  return (
    <div className="money-flow-toggle" role="group" aria-label="Display currency">
      <button
        type="button"
        className={displayMode === 'usd' ? 'active' : ''}
        onClick={() => onChange('usd')}
        title="Show in USD"
      >
        <DollarSign size={12} />
        USD
      </button>
      <button
        type="button"
        className={displayMode === 'eth' ? 'active' : ''}
        onClick={() => onChange('eth')}
        title="Show in ETH"
      >
        <Coins size={12} />
        ETH
      </button>
    </div>
  )
}

function InteractiveFlowCard({ direction, data, displayMode, active, onClick }) {
  const incoming = direction === 'in'
  const amount = displayMode === 'usd' && data.usdAmount != null
    ? formatFlowDisplay(data.usdAmount, { isUsd: true, signed: incoming })
    : formatFlowDisplay(data.amount || 0, { signed: incoming })
  const subValue = displayMode === 'usd' && data.usd
    ? data.value
    : data.usd

  return (
    <button
      type="button"
      className={`flow-card flow-card--interactive flow-card--${incoming ? 'received' : 'spent'}${active ? ' flow-card--active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="flow-card__top flex justify-between gap-2.5">
        <span className={`icon-box ${incoming ? 'green' : 'red'}`}>
          <Icon name={incoming ? '99_740.svg' : '99_756.svg'} alt="" />
        </span>
        <div className="grid justify-items-end gap-[5px]">
          <strong className={incoming ? 'positive' : ''}>{amount}</strong>
          <span>{data.percent}% of volume</span>
        </div>
      </div>
      <h3>{incoming ? 'Money Received' : 'Money Spent'}</h3>
      {subValue && subValue !== '—' && (
        <p className="money-flow-card__alt">{subValue}</p>
      )}
      <div className="progress" aria-hidden="true">
        <i className={incoming ? 'green' : 'red'} style={{ width: `${data.percent}%` }} />
      </div>
      <span className="money-flow-card__hint">{active ? 'Showing in list below' : 'Tap to filter activity'}</span>
    </button>
  )
}

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0]?.payload
  if (!item) return null
  return (
    <div className="money-flow-tooltip">
      <strong>{item.name}</strong>
      <span>{item.display}</span>
      <small>{item.percent}% · click to filter</small>
    </div>
  )
}

export function MoneyFlowPanel({
  flow,
  flowStats,
  signMismatchNote,
  tip,
  activeFilter = 'all',
  onFilterChange,
}) {
  const [displayMode, setDisplayMode] = useState('usd')
  const [hoveredSegment, setHoveredSegment] = useState(null)

  const net = netGrowthValue(flow)
  const ethNet = Number(flow.ethNet ?? 0)
  const useUsd = displayMode === 'usd' && (flow.received.usdAmount != null || net.isUsd)

  const netDisplay = useUsd
    ? formatFlowDisplay(net.isUsd ? net.value : (flow.received.usdAmount - flow.spent.usdAmount), { isUsd: true, signed: true })
    : formatFlowDisplay(net.isUsd ? ethNet : net.value, { signed: true })

  const donutData = useMemo(() => {
    const receivedVal = Math.max(Number(flow.received.amount) || 0, flowStats?.incomingCount || 0, 0.001)
    const spentVal = Math.max(Number(flow.spent.amount) || 0, flowStats?.outgoingCount || 0, 0.001)
    const total = receivedVal + spentVal
    return [
      {
        name: 'Received',
        filter: 'in',
        value: receivedVal,
        color: '#38a879',
        percent: flow.received.percent,
        display: useUsd && flow.received.usd
          ? flow.received.usd
          : flow.received.value,
      },
      {
        name: 'Spent',
        filter: 'out',
        value: spentVal,
        color: '#d97883',
        percent: flow.spent.percent,
        display: useUsd && flow.spent.usd
          ? flow.spent.usd
          : flow.spent.value,
      },
    ].map((item) => ({
      ...item,
      share: total > 0 ? Math.round((item.value / total) * 100) : 50,
    }))
  }, [flow, flowStats, useUsd])

  const toggleFilter = (filterId) => {
    onFilterChange?.(activeFilter === filterId ? 'all' : filterId)
  }

  const incomingShare = flowStats
    ? (flowStats.incomingCount / Math.max(flowStats.incomingCount + flowStats.outgoingCount, 1)) * 100
    : flow.received.percent

  return (
    <div className="money-flow-panel space-y-[18px]">
      <div className="money-flow-tip">
        <MaterialIcon icon="auto_awesome" className="text-teal-400 shrink-0 text-lg max-[480px]:text-base" />
        <p>{tip}</p>
      </div>

      <MetricExplainer
        as="div"
        className="apple-card money-flow-hero p-[25px] max-[480px]:p-5"
        explanation={{
          title: 'Money Flow',
          summary: 'Tracks all ETH movement in and out of your wallet during the selected period. Net Growth shows whether you received more than you spent.',
          formula: 'Net Growth = Total Received ETH − Total Spent ETH',
          details: [
            'Received: Total value of all incoming ETH transfers to your wallet.',
            'Spent: Total value of all outgoing ETH transfers including contract interactions.',
            'Positive Net Growth means you received more than you spent.',
            'Click Received or Spent cards — or the donut — to filter the activity list below.',
          ],
        }}
      >
        <div className="money-flow-hero__head">
          <span className="money-flow-hero__label">Money Flow</span>
          <div className="money-flow-hero__actions">
            <span className="money-flow-hero__period">{formatPeriodLabel(flow.periodLabel)}</span>
            <FlowToggle displayMode={displayMode} onChange={setDisplayMode} />
          </div>
        </div>

        <div className="money-flow-hero__net">
          <p>Net Growth</p>
          <h2 className={netDisplay.startsWith('+') || (!netDisplay.startsWith('-') && Number(ethNet) >= 0) ? 'positive' : 'negative'}>
            {netDisplay}
          </h2>
          {useUsd && (
            <span className="money-flow-hero__eth-alt">
              {ethNet >= 0 ? '+' : ''}{ethNet.toLocaleString()} ETH
            </span>
          )}
          {signMismatchNote && (
            <p className="money-flow-hero__note" title={signMismatchNote}>{signMismatchNote}</p>
          )}
        </div>

        <div className="money-flow-hero__body">
          <div className="flow-grid money-flow-cards">
            <InteractiveFlowCard
              direction="in"
              data={flow.received}
              displayMode={displayMode}
              active={activeFilter === 'in'}
              onClick={() => toggleFilter('in')}
            />
            <InteractiveFlowCard
              direction="out"
              data={flow.spent}
              displayMode={displayMode}
              active={activeFilter === 'out'}
              onClick={() => toggleFilter('out')}
            />
          </div>

          <div className="money-flow-donut-wrap">
            <div className="money-flow-donut" role="img" aria-label="Received vs spent volume">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    onClick={(_, index) => toggleFilter(donutData[index]?.filter)}
                    onMouseEnter={(_, index) => setHoveredSegment(index)}
                    onMouseLeave={() => setHoveredSegment(null)}
                  >
                    {donutData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                        opacity={hoveredSegment == null || hoveredSegment === index ? 1 : 0.45}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="money-flow-donut__center">
                <strong>{Math.round(incomingShare)}%</strong>
                <span>received</span>
              </div>
            </div>
            <div className="money-flow-donut__legend">
              {donutData.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={activeFilter === item.filter ? 'active' : ''}
                  onClick={() => toggleFilter(item.filter)}
                >
                  <i style={{ background: item.color }} />
                  <span>{item.name}</span>
                  <strong>{item.display}</strong>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="money-flow-filter-pills" role="tablist" aria-label="Filter activity by direction">
          {FLOW_FILTERS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              role="tab"
              aria-selected={activeFilter === pill.id}
              className={activeFilter === pill.id ? 'active' : ''}
              onClick={() => onFilterChange?.(pill.id)}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </MetricExplainer>

      {flow.categories?.length > 0 && (
        <div className="breakdown-section">
          <div className="breakdown-section__heading mb-3 flex items-baseline justify-between gap-3">
            <strong>Transaction Breakdown</strong>
            <span>Click a category to filter</span>
          </div>
          <div className="category-grid grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
            {flow.categories.map((category) => {
              const filterId = category.label === 'Incoming' ? 'in' : 'out'
              return (
                <button
                  key={category.label}
                  type="button"
                  className={`card category-card category-card--interactive category-card--${category.tone}${activeFilter === filterId ? ' category-card--active' : ''}`}
                  onClick={() => toggleFilter(filterId)}
                  aria-pressed={activeFilter === filterId}
                >
                  <div className="flex items-center justify-start gap-[9px]">
                    <span className={`icon-box icon-box--small ${category.tone}`}>
                      <Icon name={category.icon} alt="" size="sm" />
                    </span>
                    <strong>{category.label}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-[9px]">
                    <strong>{category.value}</strong>
                    <span>{category.percent}%</span>
                  </div>
                  <div className="category-progress" aria-hidden="true">
                    <i style={{ width: `${category.percent}%` }} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {flowStats && (
        <div className="apple-card money-flow-stats p-5 max-[480px]:p-3.5">
          <span className="money-flow-stats__label">Flow Statistics</span>
          <div className="money-flow-stats__grid">
            <div className="money-flow-stat">
              <span>Average Transfer</span>
              <strong>{flowStats.avgTransfer > 0 ? `${Number(flowStats.avgTransfer).toFixed(4)} ETH` : '—'}</strong>
            </div>
            <div className="money-flow-stat">
              <span>Largest Transfer</span>
              <strong>{flowStats.largestTransfer > 0 ? `${Number(flowStats.largestTransfer).toFixed(4)} ETH` : '—'}</strong>
            </div>
            <div className="money-flow-stat">
              <span>Most Active Month</span>
              <strong>{formatMonthLabel(flowStats.mostActiveMonth)}</strong>
              <small>{flowStats.mostActiveMonthCount || 0} txns</small>
            </div>
            <div className="money-flow-stat">
              <span>Most Active Week</span>
              <strong>
                {flowStats.mostActiveWeek
                  ? new Date(`${flowStats.mostActiveWeek}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
                  : '—'}
              </strong>
              <small>{flowStats.mostActiveWeekCount || 0} txns</small>
            </div>
          </div>

          {flowStats.incomingCount + flowStats.outgoingCount > 0 && (
            <div className="money-flow-ratio">
              <div className="money-flow-ratio__head">
                <span>Incoming vs Outgoing</span>
                <span>{flowStats.incomingCount} in / {flowStats.outgoingCount} out</span>
              </div>
              <div className="money-flow-ratio__bar">
                <button
                  type="button"
                  className={`money-flow-ratio__seg money-flow-ratio__seg--in${activeFilter === 'in' ? ' active' : ''}`}
                  style={{ width: `${incomingShare}%` }}
                  onClick={() => toggleFilter('in')}
                  title={`${flowStats.incomingCount} incoming transfers`}
                />
                <button
                  type="button"
                  className={`money-flow-ratio__seg money-flow-ratio__seg--out${activeFilter === 'out' ? ' active' : ''}`}
                  style={{ width: `${100 - incomingShare}%` }}
                  onClick={() => toggleFilter('out')}
                  title={`${flowStats.outgoingCount} outgoing transfers`}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
