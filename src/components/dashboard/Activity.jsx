import { useState } from 'react'
import { Icon } from '../common/Icon'
import { useNotableTransactions } from '../../hooks/useNotableTransactions'
import { NOTABLE_ACTIVITY_PREVIEW_LIMIT } from './notableActivity.utils'
import {
  ActivityAmountWithTooltip,
  ActivityHashWithTooltip,
  ActivityMetaWithTooltip,
  ActivityTitleWithTooltip,
} from './transactionTooltipViews'
import { TransactionModal } from './TransactionModal'

function Transaction({ item, onClick, note }) {
  return (
    <article
      className={`transaction transaction--${item.tone} relative grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_minmax(72px,auto)] items-center gap-[11px] rounded-[14px] border-0 bg-transparent p-[13px_11px] max-[1050px]:grid-cols-[auto_minmax(0,1fr)_auto] max-[700px]:grid-cols-[auto_minmax(0,1fr)] max-[480px]:gap-[9px] max-[480px]:p-[9px_7px] max-[360px]:grid-cols-[auto_minmax(0,1fr)]`}
      tabIndex="0"
      onClick={onClick}
    >
      <div className="transaction__visual">
        <span className={`icon-box ${item.tone}`}><Icon name={item.icon} alt="" /></span>
        <span className={`protocol-logo protocol-logo--${item.tone}`} title={item.protocol}>
          {item.protocolMark}
        </span>
      </div>
      <div className="transaction__main grid min-w-0 gap-1">
        <ActivityTitleWithTooltip item={item} />
        <div className="transaction__context">
          <ActivityHashWithTooltip hash={item.title} label={item.protocol} />
          <span aria-hidden="true">•</span>
          <span className="chain-badge">{item.chain}</span>
        </div>
        {note && (
          <span className="transaction__note-badge">
            🏷️ {note}
          </span>
        )}
      </div>
      <div className="transaction__amount">
        <ActivityAmountWithTooltip item={item} />
      </div>
      <ActivityMetaWithTooltip item={item} />
    </article>
  )
}

export function Activity({
  walletAddress,
  analysisDays,
  customRange,
  periodLabel,
  transactionsEnabled = true,
  onSeeAll,
}) {
  const [selectedTx, setSelectedTx] = useState(null)
  const [showLowValue, setShowLowValue] = useState(false)
  const [notes, setNotes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mywallet360_tx_notes') || '{}')
    } catch {
      return {}
    }
  })

  const { items, isLoading, error, hasMore } = useNotableTransactions({
    walletAddress,
    analysisDays,
    customRange,
    sort: 'age',
    order: 'desc',
    hideLowValue: !showLowValue,
    limit: NOTABLE_ACTIVITY_PREVIEW_LIMIT,
    enabled: transactionsEnabled,
  })

  return (
    <>
      <section className="activity min-[900px]:px-0.5">
        <div className="card activity-feed rounded-3xl border-0 p-[22px] max-[1050px]:p-[18px] max-[480px]:rounded-[20px] max-[480px]:p-3.5">
          <div className="activity-card__heading flex min-h-[35px] items-center justify-between gap-4">
            <div className="grid gap-[3px]">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{periodLabel}</span>
              <h2>Notable Activity</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {showLowValue ? 'Showing all recent transfers' : 'Dust hidden · latest meaningful transfers'}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <label className="tx-table-hide-low flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLowValue}
                  onChange={(event) => setShowLowValue(event.target.checked)}
                />
                Show low-value txns
              </label>
              {(hasMore || items.length > 0) && onSeeAll && (
                <button type="button" onClick={onSeeAll}>
                  See all
                </button>
              )}
            </div>
          </div>
          <div className="transaction-list mt-3 grid grid-cols-1 gap-[3px]">
            {isLoading && (
              <p className="py-8 text-center text-sm text-slate-500">Loading notable activity…</p>
            )}
            {!isLoading && error && (
              <p className="py-8 text-center text-sm text-rose-500">{error}</p>
            )}
            {!isLoading && !error && items.map((item) => (
              <Transaction
                item={item}
                key={item.title}
                onClick={() => setSelectedTx(item)}
                note={notes[item.title]}
              />
            ))}
            {!isLoading && !error && !items.length && (
              <p className="py-8 text-center text-sm text-slate-500">
                {showLowValue
                  ? 'No normal transactions found during this period.'
                  : 'No meaningful transfers this period. Try showing low-value txns.'}
              </p>
            )}
          </div>
        </div>
      </section>

      {selectedTx && (
        <TransactionModal
          tx={selectedTx}
          onClose={() => setSelectedTx(null)}
          onNoteSave={(hash, text) => {
            setNotes((prev) => {
              if (text) {
                return { ...prev, [hash]: text }
              }
              const copy = { ...prev }
              delete copy[hash]
              return copy
            })
          }}
        />
      )}
    </>
  )
}
