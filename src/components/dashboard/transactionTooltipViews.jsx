import { ContextTooltip } from '../common/ContextTooltip'
import {
  TX_TOOLTIPS,
  getAmountTooltip,
  getDirectionTooltip,
  getEnsTooltip,
  getMethodTooltip,
  isEnsLabel,
  splitMethodDisplay,
} from './transactionTooltips.utils'
import { formatExactTimestamp, resolveAddressLabel } from './transactionTable.utils'

export function MethodBadgeWithTooltip({ methodDisplay, contractTriggered = false }) {
  const { label, asterisk } = splitMethodDisplay(methodDisplay || 'Transfer')
  const tooltip = getMethodTooltip(asterisk ? 'Transfer*' : label, {
    contractTriggered: contractTriggered || asterisk,
  })

  return (
    <span className="tx-table-method-wrap">
      <ContextTooltip content={tooltip}>
        <span className="tx-table-method">{label}</span>
      </ContextTooltip>
      {asterisk && (
        <ContextTooltip content={TX_TOOLTIPS.asterisk} mode="value" showInfoIcon={false}>
          <span className="tx-table-method__asterisk" aria-hidden="true">*</span>
        </ContextTooltip>
      )}
    </span>
  )
}

export function DirectionBadgeWithTooltip({ direction }) {
  if (direction !== 'IN' && direction !== 'OUT') {
    return <span className="tx-table-direction tx-table-direction--neutral">—</span>
  }

  const tooltip = getDirectionTooltip(direction)
  return (
    <ContextTooltip content={tooltip}>
      <span className={`tx-table-direction tx-table-direction--${direction.toLowerCase()}`}>
        {direction}
      </span>
    </ContextTooltip>
  )
}

export function AddressCellWithTooltip({ address, walletAddress, ensLabel }) {
  const display = resolveAddressLabel(address, walletAddress, ensLabel)

  return (
    <div className="tx-table-address">
      {isEnsLabel(display, walletAddress) ? (
        <ContextTooltip content={getEnsTooltip(address)}>
          <span className="tx-table-address__label">{display}</span>
        </ContextTooltip>
      ) : (
        <ContextTooltip content={address} mode="value" showInfoIcon={false}>
          <span className="tx-table-address__label">{display}</span>
        </ContextTooltip>
      )}
    </div>
  )
}

export function HashLinkWithTooltip({ hash }) {
  const short = `${hash.slice(0, 8)}…${hash.slice(-6)}`
  return (
    <ContextTooltip content={hash} mode="value" showInfoIcon={false}>
      <a
        href={`https://etherscan.io/tx/${hash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="tx-table-hash__link"
      >
        {short}
      </a>
    </ContextTooltip>
  )
}

export function AgeCellWithTooltip({ timestamp }) {
  const exact = formatExactTimestamp(timestamp)
  return (
    <ContextTooltip content={exact} mode="value" showInfoIcon={false}>
      <span>{formatRelativeTimeShort(timestamp)}</span>
    </ContextTooltip>
  )
}

function formatRelativeTimeShort(timestamp) {
  if (!timestamp) return '—'
  const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '—'
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (elapsedSeconds < 60) return 'Just now'
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)} min ago`
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)} hr ago`
  return `${Math.floor(elapsedSeconds / 86400)} days ago`
}

export function BlockCellWithTooltip({ blockNumber }) {
  if (!blockNumber) return '—'
  return (
    <ContextTooltip content={TX_TOOLTIPS.block}>
      <span>{blockNumber.toLocaleString()}</span>
    </ContextTooltip>
  )
}

export function AmountCellWithTooltip({ row }) {
  const amountDisplay = row.amountSymbol === 'ETH'
    ? `${row.amount} ETH`
    : `${row.amount} ${row.amountSymbol}`
  const tooltip = getAmountTooltip({
    method: row.methodDisplay || row.method,
    amountEth: row.amountEth,
    hasTokenAmount: row.hasTokenAmount,
    amountDisplay,
  })

  const label = row.amountSymbol === 'ETH'
    ? `${row.amount} ETH`
    : row.tokenId
      ? `${row.amountSymbol}${row.tokenId ? ` #${row.tokenId}` : ''}`
      : `${row.amount} ${row.amountSymbol}`

  if (!tooltip) {
    return <span className="tx-table-amount">{label}</span>
  }

  return (
    <ContextTooltip content={tooltip}>
      <span className="tx-table-amount">{label}</span>
    </ContextTooltip>
  )
}

export function FeeCellWithTooltip({ feeEth, formatEthAmount }) {
  const label = feeEth > 0 ? `${formatEthAmount(feeEth)} ETH` : '—'
  if (feeEth <= 0) return <span className="tx-table-fee">{label}</span>

  return (
    <ContextTooltip content={TX_TOOLTIPS.txnFee}>
      <span className="tx-table-fee">{label}</span>
    </ContextTooltip>
  )
}

export function ActivityTitleWithTooltip({ item }) {
  const methodKey = item.method || item.displayTitle
  const tooltip = getMethodTooltip(methodKey, { contractTriggered: item.contractTriggered })
  const { label, asterisk } = splitMethodDisplay(methodKey)

  return (
    <span className="activity-title-with-tooltip">
      <ContextTooltip content={tooltip}>
        <strong>{item.displayTitle || label}</strong>
      </ContextTooltip>
      {asterisk && (
        <ContextTooltip content={TX_TOOLTIPS.asterisk} mode="value" showInfoIcon={false}>
          <span className="tx-table-method__asterisk" aria-hidden="true">*</span>
        </ContextTooltip>
      )}
    </span>
  )
}

export function ActivityAmountWithTooltip({ item }) {
  if (item.amount) {
    const hasToken = item.crypto && item.crypto !== 'ETH'
    const tooltip = hasToken
      ? TX_TOOLTIPS.tokenAmount
      : getAmountTooltip({
        method: item.method || item.displayTitle,
        amountEth: null,
        hasTokenAmount: hasToken,
        amountDisplay: `${item.amount} ${item.crypto}`,
      })

    if (!tooltip) {
      return (
        <>
          <strong className={item.positive ? 'positive' : ''}>{item.amount}</strong>
          <span>{item.crypto}</span>
        </>
      )
    }

    return (
      <ContextTooltip content={tooltip}>
        <span className="activity-amount-tooltip-wrap">
          <strong className={item.positive ? 'positive' : ''}>{item.amount}</strong>
          <span>{item.crypto}</span>
        </span>
      </ContextTooltip>
    )
  }

  const zeroTooltip = getAmountTooltip({
    method: item.method || item.displayTitle,
    amountEth: 0,
    hasTokenAmount: item.hasTokenAmount,
    amountDisplay: '—',
  })

  if (!zeroTooltip) {
    return <span className="text-slate-400 text-[11px]">—</span>
  }

  return (
    <ContextTooltip content={zeroTooltip}>
      <span className="text-slate-400 text-[11px]">0 ETH</span>
    </ContextTooltip>
  )
}

export function ActivityMetaWithTooltip({ item }) {
  const exact = formatExactTimestamp(item.timestamp)
  const lines = [exact]
  if (item.blockNumber) {
    lines.push(TX_TOOLTIPS.block)
  }

  return (
    <ContextTooltip content={lines.join(' · ')} mode="value" showInfoIcon={Boolean(item.blockNumber)}>
      <span className="transaction__time">{item.meta}</span>
    </ContextTooltip>
  )
}

export function ActivityHashWithTooltip({ hash, label }) {
  return (
    <ContextTooltip content={hash} mode="value" showInfoIcon={false}>
      <span className="transaction__protocol">{label}</span>
    </ContextTooltip>
  )
}
