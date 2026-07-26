import { apiFetch } from '../utils/api.js'
import { formatCount } from '../utils/formatCount.js'

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
export const ANALYSIS_PERIODS = [
  { value: 'ytd', id: 'ytd', label: 'Year to date', shortLabel: 'YTD', description: 'Activity since January 1' },
  { value: 1, id: '1d', label: 'Last day', shortLabel: '1D', description: 'Today\'s activity' },
  { value: 7, id: '7d', label: 'Last week', shortLabel: '7D', description: 'Recent activity' },
  { value: 30, id: '30d', label: 'Last 30 days', shortLabel: '30D', description: 'Monthly overview' },
  { value: 365, id: '365d', label: 'Last year', shortLabel: '1Y', description: 'Long-term activity' },
  { value: 'custom', id: 'custom', label: 'Custom Range', shortLabel: '✱', description: 'Choose specific dates' },
]
const DEFAULT_AVATAR = 'cebc058af93e566c96200932c258f395cbf87ebd.png'
const VITALIK_ADDRESS = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
const compactAddress = (address) => `${address.slice(0, 6)}...${address.slice(-4)}`
const EXAMPLE_WALLETS = [
  {
    name: 'vitalik.eth',
    label: 'vitalik.eth',
    type: 'ENS name',
    description: 'Resolve the ENS name first, then analyze its public Ethereum activity.',
    identifier: 'vitalik.eth',
    address: VITALIK_ADDRESS,
  },
  {
    name: 'vitalik.eth resolved address',
    label: compactAddress(VITALIK_ADDRESS),
    type: 'Resolved Ethereum address',
    description: 'Analyze the same wallet directly using the address resolved from vitalik.eth.',
    identifier: VITALIK_ADDRESS,
    address: VITALIK_ADDRESS,
  },
]

const formatUsd = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
  notation: Number(value) >= 1_000_000 ? 'compact' : 'standard',
}).format(Number(value || 0))

const formatNumber = (value, maximumFractionDigits = 4) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(Number(value))
}

const explanation = (title, summary, formula, details = []) => ({ title, summary, formula, details })

/** When ETH and USD deltas disagree in sign, explain price movement (or a generic note). */
export function getSignMismatchNote(usdDelta, ethDelta, ethPriceChangePercent = null) {
  const usd = Number(usdDelta)
  const eth = Number(ethDelta)
  if (!Number.isFinite(usd) || !Number.isFinite(eth)) return null
  if (usd === 0 || eth === 0) return null
  if (Math.sign(usd) === Math.sign(eth)) return null

  if (ethPriceChangePercent !== null && Number.isFinite(Number(ethPriceChangePercent))) {
    const change = Number(ethPriceChangePercent)
    const sign = change >= 0 ? '+' : ''
    return `ETH price changed ${sign}${change.toFixed(1)}% over this period`
  }

  return 'ETH-denominated and USD-denominated changes disagree — often due to ETH price movement over this period'
}

function buildFallbackValuationHistory(netWorth, period) {
  const start = period?.start?.slice(0, 10)
  const end = period?.end?.slice(0, 10)
  if (!start || !end) return []

  const value = Number(netWorth || 0)
  return start === end
    ? [{ date: end, value }]
    : [{ date: start, value }, { date: end, value }]
}

const formatOverviewDate = (iso) => {
  if (!iso) return null
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso))
}

const formatWalletAge = (iso) => {
  if (!iso) return null
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  const days = Math.floor(elapsedSeconds / 86_400)
  if (days >= 365) {
    const years = Math.floor(days / 365)
    return `${years} year${years === 1 ? '' : 's'}`
  }
  if (days >= 30) {
    const months = Math.floor(days / 30)
    return `${months} month${months === 1 ? '' : 's'}`
  }
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`
  return 'Less than 1 day'
}

const formatEthBalance = (value) => {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(amount)
}

const formatEthFromUsd = (usdValue, ethPrice) => {
  const usd = Number(usdValue)
  const price = Number(ethPrice)
  if (!Number.isFinite(usd) || !Number.isFinite(price) || price <= 0) return '—'
  return `${formatEthBalance(usd / price)} ETH`
}

export function enrichAddressOverviewUi(overview, portfolioInventory = null, ethPrice = null, displayMode = 'usd') {
  if (!overview) return null

  const token = { ...(overview.tokenHoldings || {}) }

  if (portfolioInventory?.status === 'complete' && Number.isFinite(Number(portfolioInventory.tokenHoldingsCount))) {
    const inventoryTokenCount = Number(portfolioInventory.tokenHoldingsCount)
    token.totalCount = inventoryTokenCount
    token.totalAssetsHeld = 1 + inventoryTokenCount
    token.inventorySource = 'etherscan_inventory'
    token.inventoryComplete = true
    token.inventoryPending = false

    if (Number.isFinite(Number(portfolioInventory.tokenValueUsd))) {
      token.valueUsd = Number(portfolioInventory.tokenValueUsd)
      token.valuationSource = 'etherscan_snapshot'
    }
    if (Number.isFinite(Number(portfolioInventory.pricedCount))) {
      token.pricedCount = Number(portfolioInventory.pricedCount)
    }
    token.unpricedCount = Math.max(0, inventoryTokenCount - Number(token.pricedCount || 0))
  } else if (portfolioInventory?.status === 'pending') {
    token.inventoryPending = true
    if (Number.isFinite(Number(portfolioInventory.tokenValueUsd))) {
      token.valueUsd = Number(portfolioInventory.tokenValueUsd)
      token.valuationSource = 'etherscan_snapshot'
    }
    if (Number.isFinite(Number(portfolioInventory.pricedCount))) {
      token.pricedCount = Number(portfolioInventory.pricedCount)
      token.unpricedCount = Math.max(0, Number(token.totalCount || 0) - token.pricedCount)
    }
  }

  const hasTokenData = Number(token.totalCount) > 0 || Number(token.valueUsd) > 0
  const showEth = displayMode === 'tokens' && Number(ethPrice) > 0

  const formatValue = (usdAmount) => (
    showEth ? formatEthFromUsd(usdAmount, ethPrice) : formatUsd(usdAmount)
  )

  const assetBadges = []
  if (token.inventoryPending) {
    assetBadges.push({ key: 'counting', label: 'Counting assets…', tone: 'muted' })
  } else if (Number(token.totalAssetsHeld) > 0) {
    assetBadges.push({
      key: 'total',
      label: `${token.totalAssetsHeld} total assets`,
      tone: 'neutral',
    })
  }
  if (Number(token.pricedCount) > 0) {
    assetBadges.push({
      key: 'priced',
      label: `${token.pricedCount} priced`,
      tone: 'accent',
    })
  }
  if (Number(token.unpricedCount) > 0) {
    assetBadges.push({
      key: 'unpriced',
      label: `${token.unpricedCount} unpriced`,
      tone: 'muted',
    })
  }

  return {
    ethBalance: overview.ethBalance,
    ethBalanceLabel: `${formatEthBalance(overview.ethBalance)} ETH`,
    ethValueUsd: formatValue(overview.ethValueUsd),
    ethValueRawUsd: overview.ethValueUsd,
    netWorthUsd: overview.netWorthUsd != null ? formatValue(overview.netWorthUsd) : null,
    tokenHoldingsValue: hasTokenData ? formatValue(token.valueUsd) : null,
    tokenHoldingsRawUsd: token.valueUsd,
    tokenHoldingsCoverage: hasTokenData && !token.inventoryPending
      ? `${token.totalCount} held · ${token.pricedCount} priced · ${token.unpricedCount} without market price`
      : null,
    tokenHoldingsLabel: hasTokenData
      ? `${formatValue(token.valueUsd)} (${token.pricedCount} of ${token.totalCount} tokens priced)`
      : null,
    assetBadges,
    totalAssetsHeld: token.totalAssetsHeld,
    pricedCount: token.pricedCount,
    unpricedCount: token.unpricedCount,
    inventoryPending: Boolean(token.inventoryPending),
    firstTransaction: formatOverviewDate(overview.firstTransactionAt),
    latestTransaction: formatOverviewDate(overview.latestTransactionAt),
    walletAge: formatWalletAge(overview.firstTransactionAt),
  }
}

const formatRelativeTime = (timestamp) => {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000))

  if (elapsedSeconds < 60) return 'Just now'
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)} minutes ago`
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)} hours ago`

  return `${Math.floor(elapsedSeconds / 86400)} days ago`
}

const personalityConfig = {
  nftCollector: { label: 'NFT Collector', icon: '99_918.svg', tone: 'collector' },
  trader: { label: 'Token Trader', icon: '99_917.svg', tone: 'trader' },
  defiExplorer: { label: 'DeFi Explorer', icon: '99_938.svg', tone: 'explorer' },
  holder: { label: 'Holder', icon: '99_959.svg', tone: 'holder' },
}

const transactionConfig = (type = '') => {
  const normalizedType = type.toLowerCase()

  if (normalizedType.includes('receive')) {
    return { tone: 'green', icon: '99_875.svg', positive: true }
  }

  if (normalizedType.includes('swap') || normalizedType.includes('trade')) {
    return { tone: 'blue', icon: '99_917.svg', positive: false }
  }

  if (normalizedType.includes('nft')) {
    return { tone: 'mint', icon: '99_896.svg', positive: false }
  }

  return { tone: 'mint', icon: '99_938.svg', positive: false }
}

function buildTransactions(timeline) {
  return (timeline || []).map((item) => {
    const title = item.type.replace(/\b\w/g, (character) => character.toUpperCase())
    const amountValue = item.value?.amount
    const hasAmount = amountValue !== null && amountValue !== undefined && Number(amountValue) > 0
    const tokenDirection = item.value?.direction
    const isReceive = item.type?.toLowerCase().includes('receive')
      || tokenDirection === 'receive'
    const config = {
      ...transactionConfig(item.type),
      positive: hasAmount ? isReceive : transactionConfig(item.type).positive,
    }

    let amount = ''
    let crypto = ''
    if (hasAmount) {
      const sign = config.positive ? '+' : '-'
      amount = `${sign}${formatNumber(amountValue)}`
      crypto = item.value.symbol || 'ETH'
    }

    return {
      displayTitle: title,
      title: item.hash,
      meta: formatRelativeTime(item.timestamp),
      timestamp: item.timestamp,
      from: item.from || '—',
      to: item.to || '—',
      amount,
      crypto,
      protocol: compactAddress(item.hash),
      protocolMark: title[0] || 'T',
      chain: 'Ethereum',
      ...config,
    }
  })
}

function buildWallet(address, analytics) {
  const periodLabel = ANALYSIS_PERIODS.find((period) => period.id === analytics.period.id)?.label
    || `Last ${analytics.period.days} days`
  const factors = analytics.personalityFactors || {}
  const personalityExplanations = {
    nftCollector: explanation(
      'Why NFT Collector?',
      'NFT activity receives two points for every NFT transfer found in the selected period.',
      'NFT Collector score = NFT transfers × 2',
      [`${formatNumber(factors.nftTransfers, 0)} NFT transfers contributed to this score.`],
    ),
    trader: explanation(
      'Why Token Trader?',
      'Swapping behavior combines recognized swap calls with outgoing token transfers.',
      'Token Trader score = swaps × 3 + outgoing token transfers',
      [`${formatNumber(factors.swapCount, 0)} swaps and ${formatNumber(factors.outgoingTransfers, 0)} outgoing token transfers were found.`],
    ),
    defiExplorer: explanation(
      'Why DeFi Explorer?',
      'Interactions with recognized Uniswap, Aave, Compound, and 1inch contracts increase this score.',
      'DeFi Explorer score = recognized DeFi interactions × 3',
      [`${formatNumber(factors.defiInteractions, 0)} recognized DeFi interactions were found.`],
    ),
    holder: explanation(
      'Why Holder?',
      'Holding behavior grows when incoming transfers exceed outgoing transfers and when the wallet currently owns more assets.',
      'Holder score = max(0, incoming − outgoing) + current assets',
      [`${formatNumber(factors.incomingTransfers, 0)} incoming transfers, ${formatNumber(factors.outgoingTransfers, 0)} outgoing transfers, and ${formatNumber(factors.currentAssetCount, 0)} current assets were used.`],
    ),
  }
  const personalityTraits = Object.entries(analytics.personality)
    .map(([key, value]) => ({ ...personalityConfig[key], value }))
    .sort((first, second) => second.value - first.value)
  const primaryPersonality = personalityTraits[0]
  const flowTotal = analytics.moneyFlow.received + analytics.moneyFlow.spent
  const receivedPercent = flowTotal ? Math.round((analytics.moneyFlow.received / flowTotal) * 100) : 0
  const spentPercent = flowTotal ? 100 - receivedPercent : 0
  const days = analytics.period?.days || 1
  const density = analytics.transactionCount / days
  const activityLevel = density > 1.5 ? 'Very High' : density > 0.3 ? 'High' : 'Moderate'
  const transactionCount = formatCount(analytics.transactionCount, analytics.analysisWindow?.normalTransactionsComplete)
  const pricedCount = analytics.valuation?.pricedAssetCount ?? analytics.pricedAssetCount ?? 0
  const totalAssetCount = analytics.valuation?.totalAssetCount ?? analytics.assetCount ?? 0
  const pricingCoveragePercent = analytics.pricingCoveragePercent
    ?? analytics.valuation?.pricingCoveragePercent
    ?? (totalAssetCount > 0 ? Math.round((pricedCount / totalAssetCount) * 1000) / 10 : 0)
  const pricedOnlyDisclaimer = pricingCoveragePercent < 100
    ? `Based on priced assets only (${pricingCoveragePercent}%)`
    : null
  const wealthScore = Math.min(40, Math.max(0, Math.round(Math.log10(Math.max(1, analytics.netWorth)) * 6)))
  const diversityScore = pricedCount >= 10 ? 25 : pricedCount >= 5 ? 20 : pricedCount >= 3 ? 15 : pricedCount >= 1 ? 8 : 0
  const activityComponentScore = density > 1.5 ? 15 : density > 0.3 ? 10 : density > 0.05 ? 5 : 0
  const riskBonus = analytics.riskScore.level === 'Low' ? 20 : analytics.riskScore.level === 'Moderate' ? 10 : 0
  const portfolioScore = Math.min(99, wealthScore + diversityScore + activityComponentScore + riskBonus)
  const largestHolding = analytics.largestHolding
  const valuationHistory = analytics.valuationHistory?.length
    ? analytics.valuationHistory
    : buildFallbackValuationHistory(analytics.netWorth, analytics.period)
  const ethNet = Number(analytics.moneyFlow.received || 0) - Number(analytics.moneyFlow.spent || 0)
  const usdNet = Number(analytics.moneyFlow.receivedUsd || 0) - Number(analytics.moneyFlow.spentUsd || 0)
  const signMismatchNote = getSignMismatchNote(usdNet, ethNet, analytics.ethPriceChangePercent)

  const riskExplanation = explanation(
    'Risk Level Heuristic',
    'Evaluates wallet risk based on asset concentration, transaction failure rates, and protocol diversity.',
    'Risk score = 100 − concentration × 0.45 − failure rate × 0.35 + diversity',
    [
      `Risk Thresholds: Low (75–100) | Moderate (50–74) | High (0–49).`,
      `Concentration: ${analytics.riskScore.factors?.holdingConcentration || 0}% weight on the largest asset.`,
      `Failed transactions: ${analytics.riskScore.factors?.failedTransactionRate || 0}% error rate.`,
      `Protocol diversity: ${analytics.riskScore.factors?.protocolDiversity || 0} recognized protocols used.`,
      ...(pricedOnlyDisclaimer ? [pricedOnlyDisclaimer] : []),
    ],
  )

  const protocolExplanation = explanation(
    analytics.mostUsedProtocol.type === 'contract' ? 'Most Used Contract' : 'Most Used Protocol',
    'Attributes contract interactions to known protocols or contract addresses in a multi-tier hierarchy.',
    'Resolution: Internal DB → Verified names → Shortened Address → Other',
    [
      'If a contract is unrecognized, it falls back to its shortened address.',
      'Other includes all non-contract transactions and failed calls.',
      `Recognized interactions: ${analytics.mostUsedProtocol.recognizedCount?.toLocaleString() || '0'}`,
      `Unrecognized interactions: ${analytics.mostUsedProtocol.unrecognizedCount?.toLocaleString() || '0'}`,
    ],
  )

  const largestHoldingDetail = (() => {
    if (!largestHolding) return 'No holdings'
    const parts = [`${largestHolding.percentage ?? 0}%`]
    if (largestHolding.unpricedCount > 0) parts.push(`${largestHolding.unpricedCount} unpriced`)
    return parts.join(' · ')
  })()

  return {
    id: address.toLowerCase(),
    portfolioValue: analytics.netWorth,
    portfolioValueSource: analytics.portfolioValueSource,
    portfolioInventory: analytics.portfolioInventory,
    generatedAt: analytics.generatedAt,
    ethPrice: analytics.ethPrice,
    ethPriceChangePercent: analytics.ethPriceChangePercent ?? null,
    signMismatchNote,
    assets: analytics.assets,
    assetCount: totalAssetCount,
    pricedAssetCount: pricedCount,
    pricingCoveragePercent,
    pricedOnlyDisclaimer,
    transactionCount: analytics.transactionCount ?? 0,
    transactionCountIsLowerBound: Boolean(analytics.transactionCountIsLowerBound),
    lastActivityAt: analytics.lastActivityAt ?? null,
    dailyTransactionCounts: analytics.dailyTransactionCounts || {},
    dailyAnalytics: analytics.dailyAnalytics || [],
    activityStats: analytics.activityStats || null,
    moneyFlowStats: analytics.moneyFlowStats || null,
    largestHolding: analytics.largestHolding,
    valuationHistory,
    nftCount: analytics.nftCount,
    analysisDays: analytics.period.id === 'ytd' ? 'ytd' : analytics.period.days,
    periodLabel,
    reportRange: {
      from: analytics.period.start.slice(0, 10),
      to: analytics.period.end.slice(0, 10),
    },
    chipLabel: compactAddress(address),
    addressOverview: analytics.addressOverview ?? null,
    profile: {
      name: 'Wallet Analytics',
      wallet: compactAddress(address),
      avatar: DEFAULT_AVATAR,
    },
    balance: {
      value: formatUsd(analytics.netWorth),
      netWorth: analytics.netWorth,
      history: valuationHistory.map((point) => ({
        ...point,
        formattedValue: formatUsd(point.value),
      })),
      valuationLabel: `Portfolio value (ETH + priced tokens)${analytics.valuation.complete === false ? ' (partial)' : ''}`,
      growth: periodLabel,
      rank: `${transactionCount} txns`,
      coverageLabel: `${pricedCount} of ${totalAssetCount} tokens priced`,
      explanation: explanation(
        'How portfolio value is calculated',
        'ETH balance is priced via ETH/USD. Known stablecoins use a $1 peg. All other held ERC-20 tokens are priced via DefiLlama’s batch price API.',
        'Portfolio value = Σ(ETH balance × ETH price) + Σ(stablecoin balance) + Σ(ERC-20 balance × DefiLlama USD price)',
        [
          `${pricedCount} of ${totalAssetCount} discovered assets had prices.`,
          'Pricing sources: on-chain balances via BlockAction, DefiLlama prices.',
          analytics.valuation?.complete === false ? 'Token-transfer history hit the page cap, so this estimate is partial.' : 'Token-transfer pagination completed for the selected period.',
        ],
      ),
      stats: [
        { label: 'Transactions', value: transactionCount, icon: 'rank' },
        { label: 'Activity', value: activityLevel, icon: 'activity', explanation: explanation('Activity level', 'A label based on per-day transaction density in the selected period.', `Very High: >1.5/day · High: >0.3/day · Moderate: ≤0.3/day`, [`This wallet has ${transactionCount} transactions across ${days} day(s).`]) },
        { label: 'NFT Activity', value: analytics.personalityFactors?.nftTransfers?.toLocaleString() || '0', icon: 'risk' },
        {
          label: 'Network',
          value: analytics.valuation?.networks?.length
            ? analytics.valuation.networks.map((network) => network === 'eth-mainnet' ? 'Ethereum' : network).join(', ')
            : 'None',
          icon: 'network',
        },
      ],
    },
    portfolio: {
      status: analytics.netWorth > 0 ? 'Active' : 'Empty',
      score: portfolioScore,
      scoreDisclaimer: pricedOnlyDisclaimer,
      scoreExplanation: explanation(
        'Portfolio Score',
        'A composite score based on wealth, diversification, activity, and risk.',
        'Wealth(≤40) + Diversity(≤25) + Activity(≤15) + Risk(≤20), capped at 99',
        [
          `Current score: ${portfolioScore}/100. Wealth: ${wealthScore}/40, Diversity: ${diversityScore}/25, Activity: ${activityComponentScore}/15, Risk: ${riskBonus}/20.`,
          ...(pricedOnlyDisclaimer ? [pricedOnlyDisclaimer] : []),
        ],
      ),
      metrics: [
        {
          label: 'Largest Holding',
          value: largestHolding?.symbol || 'None',
          detail: largestHolding
            ? `${formatUsd(largestHolding.usdValue)} · ${largestHoldingDetail}`
            : 'No priced holdings',
          icon: 'wallet',
          primary: true,
          explanation: explanation(
            'Largest holding',
            'The highest-value priced asset, with allocation diluted when unpriced holdings exist so the share is not shown as 100% of an incomplete book.',
            'Share = priced share × (priced assets / all held assets) when unpriced tokens exist',
            [
              `It represents ${largestHolding?.percentage || 0}% across ${largestHolding?.totalAssetCount || totalAssetCount} held assets.`,
              largestHolding?.unpricedCount > 0
                ? `${largestHolding.unpricedCount} held assets have no market price.`
                : 'All held assets in this estimate have prices.',
            ],
          ),
        },
        {
          label: 'Risk Level',
          value: analytics.riskScore.level,
          detail: pricedOnlyDisclaimer
            ? `${analytics.riskScore.score}/100 · ${pricedOnlyDisclaimer}`
            : `${analytics.riskScore.score}/100 heuristic score`,
          icon: 'nft',
          explanation: riskExplanation,
        },
        {
          label: analytics.mostUsedProtocol.type === 'contract' ? 'Most Used Contract' : 'Most Used Protocol',
          value: analytics.mostUsedProtocol.name,
          detail: `${analytics.mostUsedProtocol.interactionCount.toLocaleString()} interactions`,
          icon: 'defi',
          explanation: protocolExplanation,
        },
        {
          label: 'Discovered Assets',
          value: Number(totalAssetCount).toLocaleString(),
          detail: `${pricedCount} priced · ${Math.max(0, totalAssetCount - pricedCount)} unpriced`,
          icon: 'collection',
          explanation: explanation(
            'Discovered Assets',
            'The total number of unique ERC-20 tokens with a positive balance from the wallet’s transfer history, plus native ETH.',
            'Discovered assets = unique token contracts with positive balance + ETH',
            [
              'Scans incoming and outgoing token transfers for the selected period.',
              analytics.valuation.complete ? 'Full transfer scan was completed.' : 'Partial scan (hit the page cap).',
            ],
          ),
        },
      ],
    },
    identity: [
      {
        label: 'Portfolio Score',
        value: `${portfolioScore}/100`,
        description: pricedOnlyDisclaimer || 'Based on priced assets and activity',
        icon: 'portfolio',
        tone: 'gold',
      },
      { label: 'Transactions', value: transactionCount, description: `Activity during ${periodLabel.toLowerCase()}`, icon: 'risk', tone: 'blue' },
      { label: 'NFT Activity', value: analytics.personalityFactors?.nftTransfers?.toLocaleString() || '0', description: `Transfers during ${periodLabel.toLowerCase()}`, icon: 'age', tone: 'purple' },
      {
        label: 'Pricing Coverage',
        value: `${pricedCount}/${totalAssetCount}`,
        description: `${pricingCoveragePercent}% of held tokens priced`,
        icon: 'kyc',
        tone: 'green',
      },
    ],
    personality: {
      title: primaryPersonality?.label || 'New Wallet',
      description: `This wallet is primarily shaped by ${primaryPersonality?.label.toLowerCase() || 'limited on-chain activity'}.`,
      traits: personalityTraits,
      explanation: personalityExplanations[Object.entries(analytics.personality).sort((first, second) => second[1] - first[1])[0]?.[0]],
    },
    flow: {
      periodLabel,
      ethNet,
      usdNet,
      signMismatchNote,
      received: {
        value: Number(analytics.moneyFlow.received) > 0 ? `+${formatNumber(analytics.moneyFlow.received)} ETH` : '—',
        usd: analytics.moneyFlow.receivedUsd != null ? formatUsd(analytics.moneyFlow.receivedUsd) : null,
        percent: receivedPercent,
        amount: Number(analytics.moneyFlow.received || 0),
        usdAmount: Number(analytics.moneyFlow.receivedUsd || 0),
      },
      spent: {
        value: Number(analytics.moneyFlow.spent) > 0 ? `-${formatNumber(analytics.moneyFlow.spent)} ETH` : '—',
        usd: analytics.moneyFlow.spentUsd != null ? formatUsd(analytics.moneyFlow.spentUsd) : null,
        percent: spentPercent,
        amount: Number(analytics.moneyFlow.spent || 0),
        usdAmount: Number(analytics.moneyFlow.spentUsd || 0),
      },
      categories: [
        { label: 'Incoming', value: `${analytics.moneyFlow.incomingCount} txns`, percent: receivedPercent, tone: 'mint', icon: '99_740.svg' },
        { label: 'Outgoing', value: `${analytics.moneyFlow.outgoingCount} txns`, percent: spentPercent, tone: 'red', icon: '99_756.svg' },
      ],
    },
    transactions: buildTransactions(analytics.timeline),
    highlights: [
      { label: 'Largest Holding', value: largestHolding?.symbol || 'None', detail: largestHoldingDetail, icon: 'holding', tone: 'violet' },
      {
        label: 'Money Received',
        value: analytics.moneyFlow.receivedUsd != null
          ? formatUsd(analytics.moneyFlow.receivedUsd)
          : (Number(analytics.moneyFlow.received) > 0 ? `${formatNumber(analytics.moneyFlow.received)} ETH` : '—'),
        detail: `${analytics.moneyFlow.incomingCount} transfers`,
        icon: 'protocol',
        tone: 'pink',
      },
      {
        label: 'Money Spent',
        value: analytics.moneyFlow.spentUsd != null
          ? formatUsd(analytics.moneyFlow.spentUsd)
          : (Number(analytics.moneyFlow.spent) > 0 ? `${formatNumber(analytics.moneyFlow.spent)} ETH` : '—'),
        detail: `${analytics.moneyFlow.outgoingCount} transfers`,
        icon: 'chain',
        tone: 'blue',
      },
      { label: 'Transactions', value: transactionCount, detail: periodLabel.toLowerCase(), icon: 'transactions', tone: 'green' },
    ],
    insights: [
      {
        label: 'Risk Level',
        value: analytics.riskScore.level,
        suffix: pricedOnlyDisclaimer
          ? `${analytics.riskScore.score}/100 · ${pricedOnlyDisclaimer}`
          : `${analytics.riskScore.score}/100`,
        explanation: riskExplanation,
      },
      { label: 'Recognized Protocol', value: analytics.mostUsedProtocol.name, suffix: `${analytics.mostUsedProtocol.interactionCount} interactions`, explanation: protocolExplanation },
    ],
    nftBreakdown: {
      incoming: analytics.personalityFactors?.nftIncoming || 0,
      outgoing: analytics.personalityFactors?.nftOutgoing || 0,
      total: analytics.personalityFactors?.nftTransfers || 0,
    },
    holdings: (() => {
      const rawAssets = analytics.assets || []
      const totalPriced = rawAssets.reduce((sum, a) => (a.priceAvailable ? sum + a.usdValue : sum), 0)
      return rawAssets.map((asset) => ({
        ...asset,
        rawBalance: asset.rawBalance ?? asset.balance,
        rawUsdValue: asset.usdValue,
        balance: asset.priceAvailable ? formatNumber(asset.balance) : asset.rawBalance ?? asset.balance,
        usdValue: asset.priceAvailable ? formatUsd(asset.usdValue) : null,
        percentage: asset.percentage ?? (totalPriced > 0 && asset.priceAvailable ? Math.round((asset.usdValue / totalPriced) * 100) : 0),
        displayBalance: !asset.priceAvailable && asset.rawBalance ? asset.rawBalance : formatNumber(asset.balance),
      }))
    })(),
  }
}

async function getWalletByAddress(address, analysisPeriod = 'ytd', customRange = null) {
  const normalizedAddress = address.trim()

  if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
    throw new Error('Enter a valid Ethereum wallet address.')
  }

  let query, expectedPeriodId
  if (analysisPeriod === 'custom' && customRange) {
    query = `from=${customRange.from}&to=${customRange.to}`
    expectedPeriodId = `custom:${customRange.from}:${customRange.to}`
  } else if (analysisPeriod === 'ytd') {
    query = 'period=ytd'
    expectedPeriodId = 'ytd'
  } else {
    query = `days=${analysisPeriod}`
    expectedPeriodId = `${analysisPeriod}d`
  }

  const response = await apiFetch(`${API_BASE_URL}/api/wallet/${normalizedAddress}?${query}`)
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || 'Unable to fetch wallet analytics.')
  }

  if (data?.period?.id !== expectedPeriodId) {
    throw new Error('The API returned stale period data. Restart or deploy the latest backend.')
  }

  return buildWallet(normalizedAddress, data)
}

async function getPortfolioInventory(address) {
  const response = await apiFetch(`${API_BASE_URL}/api/wallet/${address}/inventory`)
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || 'Unable to load token holdings inventory.')
  }

  return data
}

async function downloadTransactionReport(address, from, to) {
  const query = new URLSearchParams({ from, to })
  const response = await apiFetch(`${API_BASE_URL}/api/report/${address}?${query}`, {
    headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.message || 'Unable to create the transaction report.')
  }

  const blob = await response.blob()
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const disposition = response.headers.get('content-disposition') || ''
  const filename = disposition.match(/filename="([^"]+)"/)?.[1]
    || `mywallet360-${address.slice(0, 8)}-${from}-to-${to}.xlsx`

  link.href = downloadUrl
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(downloadUrl)
}

export const walletService = {
  downloadTransactionReport,
  getPortfolioInventory,
  getWalletByAddress,
  listExampleWallets: () => EXAMPLE_WALLETS,
}
