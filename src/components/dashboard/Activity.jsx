import { useState } from 'react'
import { Icon } from '../common/Icon'
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
        <strong>{item.displayTitle}</strong>
        <div className="transaction__context">
          <span className="transaction__protocol">{item.protocol}</span>
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
        {item.amount ? (
          <>
            <strong className={item.positive ? 'positive' : ''}>{item.amount}</strong>
            <span>{item.crypto}</span>
          </>
        ) : (
          <span className="text-slate-400 text-[11px]">—</span>
        )}
      </div>
      <span className="transaction__time">{item.meta}</span>
    </article>
  )
}

export function Activity({ transactions, periodLabel }) {
  const [showAll, setShowAll] = useState(false)
  const [selectedTx, setSelectedTx] = useState(null)
  const [notes, setNotes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mywallet360_tx_notes') || '{}')
    } catch {
      return {}
    }
  })

  const visibleTransactions = showAll ? transactions : transactions.slice(0, 3)

  return (
    <>
      <section className="activity min-[900px]:px-0.5">
        <div className="card activity-feed rounded-3xl border-0 p-[22px] max-[1050px]:p-[18px] max-[480px]:rounded-[20px] max-[480px]:p-3.5">
          <div className="activity-card__heading flex min-h-[35px] items-center justify-between gap-4">
            <div className="grid gap-[3px]">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{periodLabel}</span>
              <h2>Recent Activity</h2>
            </div>
            {transactions.length > 3 && (
              <button type="button" onClick={() => setShowAll((value) => !value)}>
                {showAll ? 'Show Less' : 'See All'}
              </button>
            )}
          </div>
          <div className="transaction-list mt-3 grid grid-cols-1 gap-[3px]">
            {visibleTransactions.map((item) => (
              <Transaction
                item={item}
                key={item.title}
                onClick={() => setSelectedTx(item)}
                note={notes[item.title]}
              />
            ))}
            {!transactions.length && <p>No normal transactions found during this period.</p>}
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
