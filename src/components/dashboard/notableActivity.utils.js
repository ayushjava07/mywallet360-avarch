import { formatRelativeTime } from './transactionTable.utils.js'

export const NOTABLE_ACTIVITY_PREVIEW_LIMIT = 10

function activityVisual(direction, contractTriggered) {
  if (direction === 'IN') {
    return { tone: 'teal', icon: '99_896.svg', positive: true }
  }
  if (direction === 'OUT') {
    return { tone: 'rose', icon: '99_854.svg', positive: false }
  }
  if (contractTriggered) {
    return { tone: 'slate', icon: '99_980.svg', positive: false }
  }
  return { tone: 'mint', icon: '99_938.svg', positive: false }
}

export function mapTableRowToActivityItem(row) {
  const methodDisplay = (row.methodDisplay || row.method || 'Transfer').replace(/\*$/, '')
  const visual = activityVisual(row.direction, row.contractTriggered)

  let amount = ''
  let crypto = ''
  if (row.amount != null && row.amount !== '' && Number(row.amount) > 0) {
    const sign = row.direction === 'IN' ? '+' : row.direction === 'OUT' ? '-' : ''
    amount = `${sign}${row.amount}`
    crypto = row.amountSymbol || 'ETH'
  }

  const hash = row.hash || ''

  return {
    displayTitle: methodDisplay,
    title: hash,
    meta: formatRelativeTime(row.timestamp),
    timestamp: row.timestampIso || (row.timestamp ? new Date(row.timestamp * 1000).toISOString() : null),
    blockNumber: row.blockNumber || 0,
    method: row.method || methodDisplay,
    contractTriggered: Boolean(row.contractTriggered),
    hasTokenAmount: Boolean(row.hasTokenAmount),
    from: row.from || '—',
    to: row.to || '—',
    amount,
    crypto,
    protocol: hash ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : '—',
    protocolMark: methodDisplay[0]?.toUpperCase() || 'T',
    chain: 'Ethereum',
    direction: row.direction,
    amountEth: row.amountEth,
    ...visual,
  }
}

export function filterRowsByDirection(items, flowFilter) {
  if (!flowFilter || flowFilter === 'all') return items
  return items.filter((item) => {
    if (flowFilter === 'in') return item.direction === 'IN'
    if (flowFilter === 'out') return item.direction === 'OUT'
    return true
  })
}
