/** Plain-language tooltip copy for transaction UI — one sentence each. */

export const TX_TOOLTIPS = {
  method: {
    Transfer: 'Money or tokens moved directly from one wallet to another.',
    'Transfer*': 'A token transfer, possibly triggered by another contract rather than sent directly by this wallet.',
    'Contract Interaction': 'This transaction called a smart contract instead of sending money directly — could be a swap, a deposit, a vote, or another on-chain action.',
    Approve: 'This wallet gave a smart contract permission to move a specific token on its behalf — no funds moved yet.',
    'Token Swap': 'This wallet exchanged one token for another through a decentralized exchange.',
    Receive: 'Funds arrived in this wallet from another address.',
    Send: 'This wallet sent funds to another address.',
  },
  asterisk: 'This transaction was likely triggered internally by a contract, not sent directly by this wallet.',
  direction: {
    IN: 'IN — funds or data came into this wallet.',
    OUT: 'OUT — this wallet sent funds or triggered an action.',
  },
  zeroEth: 'No ETH changed hands in this transaction — but tokens, approvals, or other on-chain data may have moved. Check Token Transfers for details.',
  tokenAmount: 'Token amount moved in this transfer.',
  block: 'Transactions are grouped into blocks, confirmed roughly every 12 seconds on Ethereum.',
  txnFee: 'The cost paid to process this transaction on the Ethereum network, paid in ETH regardless of what was being sent.',
  ens: (address) => `Human-readable name for address ${address} — like a domain name for a wallet.`,
}

const TITLE_TO_METHOD = {
  'token swap': 'Token Swap',
  'contract interaction': 'Contract Interaction',
  receive: 'Receive',
  send: 'Send',
  transfer: 'Transfer',
  approve: 'Approve',
}

export function normalizeMethodKey(methodOrTitle) {
  if (!methodOrTitle) return 'Transfer'
  const raw = String(methodOrTitle).replace(/\*$/, '').trim()
  const mapped = TITLE_TO_METHOD[raw.toLowerCase()]
  if (mapped) return mapped
  if (TX_TOOLTIPS.method[raw]) return raw
  if (raw === 'Transfer*') return 'Transfer*'
  return 'Transfer'
}

export function getMethodTooltip(methodOrTitle, { contractTriggered = false } = {}) {
  if (contractTriggered || String(methodOrTitle).includes('*')) {
    return TX_TOOLTIPS.method['Transfer*']
  }
  const key = normalizeMethodKey(methodOrTitle)
  return TX_TOOLTIPS.method[key] || TX_TOOLTIPS.method.Transfer
}

export function getDirectionTooltip(direction) {
  return TX_TOOLTIPS.direction[direction] || null
}

export function getAmountTooltip({
  method,
  amountEth,
  hasTokenAmount,
  amountDisplay,
}) {
  if (hasTokenAmount) return TX_TOOLTIPS.tokenAmount
  const normalized = normalizeMethodKey(method)
  const isZeroEth = amountEth === 0
    || amountDisplay === '—'
    || amountDisplay === '0 ETH'
    || (amountDisplay != null && /^0(\.0+)?\s*ETH$/i.test(String(amountDisplay)))
  if (normalized === 'Contract Interaction' && isZeroEth) {
    return TX_TOOLTIPS.zeroEth
  }
  return null
}

export function getEnsTooltip(address) {
  if (!address) return null
  return TX_TOOLTIPS.ens(address)
}

export function isEnsLabel(label, walletAddress) {
  if (!label || !walletAddress) return false
  return label.includes('.') && label.toLowerCase() !== walletAddress.toLowerCase()
}

export function splitMethodDisplay(methodDisplay = '') {
  const value = String(methodDisplay)
  if (value.endsWith('*')) {
    return { label: value.slice(0, -1), asterisk: true }
  }
  return { label: value, asterisk: false }
}
