import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { MaterialIcon } from '../common/MaterialIcon'
import { walletService } from '../../services/walletService'
import {
  TX_TABLE_TABS,
  buildTableHeaderCount,
  formatEthAmount,
} from './transactionTable.utils'
import {
  AddressCellWithTooltip,
  AgeCellWithTooltip,
  AmountCellWithTooltip,
  BlockCellWithTooltip,
  DirectionBadgeWithTooltip,
  FeeCellWithTooltip,
  HashLinkWithTooltip,
  MethodBadgeWithTooltip,
} from './transactionTooltipViews'

const PAGE_SIZE = 25

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

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (event) => {
    event.stopPropagation()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* silent */
    }
  }

  return (
    <button
      type="button"
      className="tx-table-copy"
      aria-label={label}
      title={label}
      onClick={handleCopy}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

function SortButton({ label, active, order, onClick }) {
  return (
    <button type="button" className={`tx-table-sort${active ? ' tx-table-sort--active' : ''}`} onClick={onClick}>
      <span>{label}</span>
      {active && (order === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  )
}

export function TransactionsExplorer({
  walletAddress,
  ensLabel,
  periodLabel,
  analysisDays,
  customRange,
  transactionCount,
  transactionCountIsLowerBound,
  nftTransferCount,
  onBack,
}) {
  const isCompact = useCompactViewport(700)
  const isPhone = useCompactViewport(480)

  const [activeTab, setActiveTab] = useState('normal')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('age')
  const [order, setOrder] = useState('desc')
  const [hideLowValue, setHideLowValue] = useState(() => (transactionCount ?? 0) > 1000)
  const [rows, setRows] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [paginationMode, setPaginationMode] = useState('server')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const totalCount = useMemo(() => {
    if (activeTab === 'normal') return transactionCount ?? null
    if (activeTab === 'nft') return nftTransferCount ?? null
    return null
  }, [activeTab, transactionCount, nftTransferCount])

  const totalIsLowerBound = activeTab === 'normal' && Boolean(transactionCountIsLowerBound)

  const headerLabel = buildTableHeaderCount({
    tabId: activeTab,
    page,
    limit: PAGE_SIZE,
    rowCount: rows.length,
    totalCount,
    totalIsLowerBound,
    hasMore,
  })

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    ;(async () => {
      setIsLoading(true)
      setError('')

      try {
        const payload = await walletService.getWalletTransactions(walletAddress, {
          type: activeTab,
          page,
          limit: PAGE_SIZE,
          analysisDays,
          customRange,
          sort,
          order,
          hideLowValue,
          signal: controller.signal,
        })

        if (!active) return

        setRows(payload.rows || [])
        setHasMore(Boolean(payload.hasMore))
        setPaginationMode(payload.paginationMode || 'server')
      } catch (requestError) {
        if (!active || controller.signal.aborted) return

        setRows([])
        setHasMore(false)
        setError(requestError.message || 'Unable to load transactions.')
      } finally {
        if (active) setIsLoading(false)
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [walletAddress, activeTab, page, sort, order, hideLowValue, analysisDays, customRange])

  useEffect(() => {
    setPage(1)
  }, [analysisDays, customRange])

  const toggleSort = (column) => {
    setPage(1)
    if (sort === column) {
      setOrder((current) => (current === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSort(column)
    setOrder('desc')
  }

  const activeTabMeta = TX_TABLE_TABS.find((tab) => tab.id === activeTab)

  return (
    <section className="card tx-table-card p-5 max-[480px]:p-3.5">
      <div className="tx-table-top">
        <button type="button" className="tx-table-back" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back to Overview</span>
        </button>
        <div className="tx-table-title-wrap">
          <MaterialIcon icon="receipt_long" className="text-teal-400 text-xl shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">
              {periodLabel}
            </span>
            <h2 className="text-base font-bold mt-0.5 truncate">
              {activeTabMeta?.label || 'Transactions'}
            </h2>
            <p className="tx-table-source">
              {ensLabel || walletAddress}
              {' · '}
              {paginationMode === 'server' ? 'Server-side pagination via BlockAction' : 'Paginated view'}
            </p>
          </div>
        </div>
      </div>

      <div className="analytics-tabs tx-table-tabs" role="tablist" aria-label="Transaction type">
        {TX_TABLE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`analytics-tab ${activeTab === tab.id ? 'analytics-tab--active' : ''}`}
            onClick={() => {
              setActiveTab(tab.id)
              setPage(1)
            }}
          >
            {isPhone ? tab.shortLabel : tab.label}
          </button>
        ))}
      </div>

      <div className="tx-table-toolbar">
        <p className="tx-table-count">{headerLabel}</p>
        <label className="tx-table-toggle">
          <input
            type="checkbox"
            checked={hideLowValue}
            onChange={(event) => {
              setHideLowValue(event.target.checked)
              setPage(1)
            }}
          />
          <span>Hide low value</span>
        </label>
      </div>

      {error && (
        <p className="tx-table-error" role="alert">{error}</p>
      )}

      <div className="tx-table-wrap">
        <table className="tx-table">
          <thead>
            <tr>
              <th>Hash</th>
              <th>Method</th>
              {!isPhone && <th>Block</th>}
              <th>
                <SortButton
                  label="Age"
                  active={sort === 'age'}
                  order={order}
                  onClick={() => toggleSort('age')}
                />
              </th>
              {!isPhone && <th>From</th>}
              <th>Dir</th>
              {!isPhone && <th>To</th>}
              <th>
                <SortButton
                  label="Amount"
                  active={sort === 'amount'}
                  order={order}
                  onClick={() => toggleSort('amount')}
                />
              </th>
              {!isPhone && <th>Txn Fee</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={isPhone ? 6 : 9} className="tx-table-empty">Loading transactions…</td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={isPhone ? 6 : 9} className="tx-table-empty">No transactions match this view.</td>
              </tr>
            )}
            {!isLoading && rows.map((row) => (
              <tr key={`${row.hash}-${row.blockNumber}-${row.timestamp}`} className="tx-table-row">
                <td>
                  <div className="tx-table-hash">
                    <HashLinkWithTooltip hash={row.hash} />
                    <CopyButton value={row.hash} label={`Copy transaction hash ${row.hash}`} />
                  </div>
                </td>
                <td>
                  <MethodBadgeWithTooltip
                    methodDisplay={row.methodDisplay || row.method}
                    contractTriggered={row.contractTriggered}
                  />
                </td>
                {!isPhone && <td><BlockCellWithTooltip blockNumber={row.blockNumber} /></td>}
                <td><AgeCellWithTooltip timestamp={row.timestamp} /></td>
                {!isPhone && (
                  <td>
                    <div className="tx-table-address">
                      <AddressCellWithTooltip
                        address={row.from}
                        walletAddress={walletAddress}
                        ensLabel={ensLabel}
                      />
                      <CopyButton value={row.from} label={`Copy address ${row.from}`} />
                    </div>
                  </td>
                )}
                <td><DirectionBadgeWithTooltip direction={row.direction} /></td>
                {!isPhone && (
                  <td>
                    <div className="tx-table-address">
                      <AddressCellWithTooltip
                        address={row.to}
                        walletAddress={walletAddress}
                        ensLabel={ensLabel}
                      />
                      <CopyButton value={row.to} label={`Copy address ${row.to}`} />
                    </div>
                  </td>
                )}
                <td><AmountCellWithTooltip row={row} /></td>
                {!isPhone && (
                  <td><FeeCellWithTooltip feeEth={row.feeEth} formatEthAmount={formatEthAmount} /></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tx-table-pagination">
        <button
          type="button"
          className="tx-table-page-btn"
          disabled={page <= 1 || isLoading}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Previous
        </button>
        <span className="tx-table-page-label">Page {page}</span>
        <button
          type="button"
          className="tx-table-page-btn"
          disabled={!hasMore || isLoading}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </button>
      </div>
    </section>
  )
}
