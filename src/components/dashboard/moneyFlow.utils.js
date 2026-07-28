export function netGrowthValue(flow) {
  if (flow.usdNet != null || (flow.received.usdAmount != null && flow.spent.usdAmount != null)) {
    const value = flow.usdNet != null
      ? Number(flow.usdNet)
      : Number(flow.received.usdAmount || 0) - Number(flow.spent.usdAmount || 0)
    return { value, symbol: '$', isUsd: true }
  }
  const value = flow.ethNet != null
    ? Number(flow.ethNet)
    : Number(flow.received.amount || 0) - Number(flow.spent.amount || 0)
  return { value, symbol: 'ETH', isUsd: false }
}

export function formatFlowDisplay(value, { isUsd = false, signed = false } = {}) {
  const num = Number(value) || 0
  const prefix = signed && num > 0 ? '+' : signed && num < 0 ? '' : ''
  if (isUsd) {
    return prefix + new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: Math.abs(num) >= 1_000_000 ? 'compact' : 'standard',
    }).format(num)
  }
  return `${prefix}${num.toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH`
}

export function classifyTxDirection(tx) {
  if (tx.positive) return 'in'
  const title = (tx.displayTitle || tx.type || '').toLowerCase()
  if (title.includes('receive')) return 'in'
  if (title.includes('send') || title.includes('sent')) return 'out'
  if (tx.amount?.startsWith('+')) return 'in'
  if (tx.amount?.startsWith('-')) return 'out'
  return 'other'
}

export function filterTransactionsByFlow(transactions, filter) {
  if (!filter || filter === 'all') return transactions
  return transactions.filter((tx) => {
    const direction = classifyTxDirection(tx)
    if (filter === 'in') return direction === 'in'
    if (filter === 'out') return direction === 'out'
    return true
  })
}

export function formatPeriodLabel(periodLabel) {
  const d = new Date()
  return (periodLabel || d.toLocaleString('en-US', { month: 'long', year: 'numeric' })).toUpperCase()
}

export function formatMonthLabel(key) {
  if (!key) return '—'
  const [, m] = key.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [y] = key.split('-')
  return `${months[parseInt(m, 10) - 1]} ${y}`
}
