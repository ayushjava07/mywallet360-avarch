import { useMemo, useState } from 'react'
import { MaterialIcon } from '../common/MaterialIcon'
import { Icon } from '../common/Icon'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { useNotableTransactions } from '../../hooks/useNotableTransactions'
import { TransactionModal } from './TransactionModal'
import { MoneyFlowPanel } from './MoneyFlowPanel'
import { filterRowsByDirection, NOTABLE_ACTIVITY_PREVIEW_LIMIT } from './notableActivity.utils'

function ActivityRow({ tx, onClick }) {
  return (
    <article
      className={`transaction transaction--${tx.tone} relative grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_minmax(72px,auto)] items-center gap-[11px] rounded-[14px] border-0 bg-transparent p-[13px_11px] max-[1050px]:grid-cols-[auto_minmax(0,1fr)_auto] max-[700px]:grid-cols-[auto_minmax(0,1fr)] max-[480px]:gap-[9px] max-[480px]:p-[9px_7px]`}
      tabIndex="0"
      role="button"
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
    >
      <div className="transaction__visual">
        <span className={`icon-box ${tx.tone}`}><Icon name={tx.icon} alt="" /></span>
        <span className={`protocol-logo protocol-logo--${tx.tone}`} title={tx.protocol}>
          {tx.protocolMark}
        </span>
      </div>
      <div className="transaction__main grid min-w-0 gap-1">
        <strong>{tx.displayTitle}</strong>
        <div className="transaction__context">
          <span className="transaction__protocol">{tx.protocol}</span>
          <span aria-hidden="true">•</span>
          <span className="chain-badge">{tx.chain}</span>
        </div>
      </div>
      <div className="transaction__amount">
        {tx.amount ? (
          <>
            <strong className={tx.positive ? 'positive' : ''}>{tx.amount}</strong>
            <span>{tx.crypto}</span>
          </>
        ) : (
          <span className="text-slate-400 text-[11px]">—</span>
        )}
      </div>
      <span className="transaction__time">{tx.meta}</span>
    </article>
  )
}

function ActivityPreviewSection({
  eyebrow,
  title,
  subtitle,
  items,
  isLoading,
  error,
  emptyMessage,
  onSeeAll,
  onSelectTx,
}) {
  return (
    <section className="min-[900px]:px-0.5">
      <div className="card activity-feed rounded-3xl border-0 p-[22px] max-[1050px]:p-[18px] max-[480px]:rounded-[20px] max-[480px]:p-3.5">
        <div className="activity-card__heading flex min-h-[35px] items-center justify-between gap-4">
          <div className="grid gap-[3px]">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{eyebrow}</span>
            <h2>{title}</h2>
            {subtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          {onSeeAll && (
            <button type="button" onClick={onSeeAll}>
              See all
            </button>
          )}
        </div>
        <div className="transaction-list mt-3 grid grid-cols-1 gap-[3px]">
          {isLoading && (
            <p className="py-8 text-center text-sm text-slate-500">Loading transactions…</p>
          )}
          {!isLoading && error && (
            <p className="py-8 text-center text-sm text-rose-500">{error}</p>
          )}
          {!isLoading && !error && items.map((tx) => (
            <ActivityRow key={tx.title} tx={tx} onClick={() => onSelectTx(tx)} />
          ))}
          {!isLoading && !error && !items.length && (
            <p className="py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
          )}
        </div>
      </div>
    </section>
  )
}

export function MoneyFlowTab({
  wallet,
  walletAddress,
  analysisDays,
  customRange,
  transactionsEnabled = true,
  onSeeAll,
}) {
  const { flow, nftBreakdown, moneyFlowStats, transactionCountIsLowerBound, periodLabel } = wallet
  const flowStats = moneyFlowStats
  const signMismatchNote = flow.signMismatchNote || wallet.signMismatchNote

  const tip = (() => {
    const recv = Number(flow.received.amount ?? 0)
    const spent = Number(flow.spent.amount ?? 0)
    if (spent === 0) return 'All income retained this period. Excellent saving!'
    const ratio = Math.round(recv / spent)
    if (ratio >= 2) return `Great job! You received ${ratio}x more than you spent this period.`
    if (ratio >= 1) return 'You received slightly more than you spent. Keep it up!'
    return 'Your spending exceeded income this period. Review your expenses.'
  })()

  const [selectedTx, setSelectedTx] = useState(null)
  const [flowFilter, setFlowFilter] = useState('all')

  const topTransfers = useNotableTransactions({
    walletAddress,
    analysisDays,
    customRange,
    sort: 'amount',
    order: 'desc',
    hideLowValue: true,
    limit: NOTABLE_ACTIVITY_PREVIEW_LIMIT,
    enabled: transactionsEnabled,
  })

  const recentActivity = useNotableTransactions({
    walletAddress,
    analysisDays,
    customRange,
    sort: 'age',
    order: 'desc',
    hideLowValue: true,
    limit: NOTABLE_ACTIVITY_PREVIEW_LIMIT,
    enabled: transactionsEnabled,
  })

  const filteredTopTransfers = useMemo(
    () => filterRowsByDirection(topTransfers.items, flowFilter),
    [topTransfers.items, flowFilter],
  )

  const filteredRecentActivity = useMemo(
    () => filterRowsByDirection(recentActivity.items, flowFilter),
    [recentActivity.items, flowFilter],
  )

  const flowEyebrow = `${flow.periodLabel || periodLabel}${flowFilter !== 'all' ? ` · ${flowFilter === 'in' ? 'Received' : 'Spent'}` : ''}`

  return (
    <div className="grid gap-9 max-[700px]:gap-6">
      <MoneyFlowPanel
        flow={flow}
        flowStats={flowStats}
        signMismatchNote={signMismatchNote}
        tip={tip}
        activeFilter={flowFilter}
        onFilterChange={setFlowFilter}
      />

      {transactionCountIsLowerBound && (
        <p className="money-flow-completeness-note rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          Stats are based on a sampled transaction scan. Open the full transaction table for complete history.
        </p>
      )}

      <ActivityPreviewSection
        eyebrow={flowEyebrow}
        title="Top Transfers"
        subtitle="Largest meaningful ETH moves this period"
        items={filteredTopTransfers}
        isLoading={topTransfers.isLoading}
        error={topTransfers.error}
        emptyMessage={
          flowFilter !== 'all'
            ? `No ${flowFilter === 'in' ? 'incoming' : 'outgoing'} top transfers in this period.`
            : 'No meaningful transfers found for this period.'
        }
        onSeeAll={onSeeAll}
        onSelectTx={setSelectedTx}
      />

      <ActivityPreviewSection
        eyebrow={flowEyebrow}
        title="Recent Activity"
        subtitle="Dust hidden · latest meaningful transfers"
        items={filteredRecentActivity}
        isLoading={recentActivity.isLoading}
        error={recentActivity.error}
        emptyMessage={
          flowFilter !== 'all'
            ? `No ${flowFilter === 'in' ? 'received' : 'spent'} transactions in this period.`
            : 'No meaningful transfers found for this period.'
        }
        onSeeAll={onSeeAll}
        onSelectTx={setSelectedTx}
      />

      {(nftBreakdown?.incoming > 0 || nftBreakdown?.outgoing > 0) && (
        <section className="apple-card nft-activity-card p-[22px] max-[480px]:p-4">
          <div className="flex items-center justify-between mb-4 max-[480px]:mb-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-1">NFT Activity</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{nftBreakdown.total} total transfers</p>
            </div>
            <MaterialIcon icon="stadia_controller" className="text-teal-400 text-2xl shrink-0" />
          </div>
          <div className="nft-activity-body grid grid-cols-[1fr_auto] gap-6 max-[480px]:gap-4 items-center">
            <div className="grid gap-3 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shrink-0" />
                  <span className="text-sm max-[480px]:text-xs font-medium text-slate-700 dark:text-slate-300">Received</span>
                </div>
                <span className="text-sm max-[480px]:text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">{nftBreakdown.incoming.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400 shrink-0" />
                  <span className="text-sm max-[480px]:text-xs font-medium text-slate-700 dark:text-slate-300">Sent</span>
                </div>
                <span className="text-sm max-[480px]:text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">{nftBreakdown.outgoing.toLocaleString()}</span>
              </div>
              <div className="pt-2 border-t border-gray-100 dark:border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Net</span>
                  <span className={`text-sm max-[480px]:text-xs font-bold tabular-nums ${nftBreakdown.incoming >= nftBreakdown.outgoing ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {nftBreakdown.incoming >= nftBreakdown.outgoing ? '+' : ''}{(nftBreakdown.incoming - nftBreakdown.outgoing).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
            <div className="nft-activity-donut shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart role="img" aria-label={`NFT transfers: ${nftBreakdown.incoming} received, ${nftBreakdown.outgoing} sent`}>
                  <Pie
                    data={[
                      { value: nftBreakdown.incoming, color: '#2dd4bf' },
                      { value: nftBreakdown.outgoing, color: '#fb7185' },
                    ]}
                    cx="50%" cy="50%"
                    innerRadius="58%"
                    outerRadius="96%"
                    startAngle={90}
                    endAngle={-270}
                    dataKey="value"
                    stroke="none"
                  >
                    {[nftBreakdown.incoming, nftBreakdown.outgoing].map((_, index) => (
                      <Cell key={index} fill={['#2dd4bf', '#fb7185'][index]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {flowFilter !== 'all' && (
        <div className="flex justify-center">
          <button type="button" className="money-flow-clear-filter" onClick={() => setFlowFilter('all')}>
            Clear direction filter
          </button>
        </div>
      )}

      {selectedTx && <TransactionModal tx={selectedTx} onClose={() => setSelectedTx(null)} />}
    </div>
  )
}
