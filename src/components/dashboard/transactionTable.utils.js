export const TX_TABLE_TABS = [
  { id: 'normal', label: 'Transactions', shortLabel: 'Txns' },
  { id: 'internal', label: 'Internal Transactions', shortLabel: 'Internal' },
  { id: 'token', label: 'Token Transfers', shortLabel: 'Tokens' },
  { id: 'nft', label: 'NFT Transfers', shortLabel: 'NFTs' },
]

export function compactAddress(address) {
  if (!address || address.length < 12) return address || '—'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatRelativeTime(timestamp) {
  if (!timestamp) return '—'
  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000)
    : new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '—'

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (elapsedSeconds < 60) return 'Just now'
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)} min ago`
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)} hr ago`
  if (elapsedSeconds < 604800) return `${Math.floor(elapsedSeconds / 86400)} days ago`
  if (elapsedSeconds < 2592000) return `${Math.floor(elapsedSeconds / 604800)} wk ago`
  return `${Math.floor(elapsedSeconds / 2592000)} mo ago`
}

export function formatExactTimestamp(timestamp) {
  if (!timestamp) return '—'
  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000)
    : new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatEthAmount(value, { maximumFractionDigits = 6 } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(Number(value))
}

export function formatAmountCell(row) {
  if (row.amount === null || row.amount === undefined) return '—'
  if (row.amountSymbol === 'ETH') {
    return `${formatEthAmount(row.amount)} ETH`
  }
  if (row.tokenId) {
    return row.amount > 1
      ? `${formatEthAmount(row.amount, { maximumFractionDigits: 0 })} × ${row.amountSymbol}`
      : `${row.amountSymbol}${row.tokenId ? ` #${row.tokenId}` : ''}`
  }
  return `${formatEthAmount(row.amount)} ${row.amountSymbol}`
}

export function resolveAddressLabel(address, walletAddress, ensLabel) {
  if (!address) return '—'
  if (ensLabel && address.toLowerCase() === walletAddress?.toLowerCase()) {
    return ensLabel
  }
  return compactAddress(address)
}

export function buildTableHeaderCount({
  tabId,
  page,
  limit,
  rowCount,
  totalCount,
  totalIsLowerBound,
  hasMore,
}) {
  const start = rowCount === 0 ? 0 : (page - 1) * limit + 1
  const end = rowCount === 0 ? 0 : (page - 1) * limit + rowCount

  if (totalCount != null && totalCount > 0) {
    const suffix = totalIsLowerBound ? '+' : ''
    return `Latest ${start === end ? start : `${start}–${end}`} of ${totalCount.toLocaleString()}${suffix} transactions`
  }

  if (rowCount === 0) return 'No transactions in this view'
  if (hasMore) {
    return `Showing ${start === end ? start : `${start}–${end}`} transactions (page ${page})`
  }
  return `Showing ${start === end ? start : `${start}–${end}`} transactions`
}
