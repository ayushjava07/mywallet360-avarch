import { useState } from 'react'
import { MaterialIcon } from '../common/MaterialIcon'
import { Icon } from '../common/Icon'
import { MetricExplainer } from '../common/MetricExplainer'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { TransactionModal } from './TransactionModal'

function formatPeriod(periodLabel) {
  const d = new Date()
  return (periodLabel || d.toLocaleString('en-US', { month: 'long', year: 'numeric' })).toUpperCase()
}

function formatMonthLabel(key) {
  if (!key) return '—'
  const [y, m] = key.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[parseInt(m, 10) - 1]} ${y}`
}

function netGrowthValue(flow) {
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

function getDateGroup(meta) {
  const m = meta.toLowerCase()
  if (m === 'just now' || m.includes('minute') || m.includes('hour')) return 'Today'
  if (m.startsWith('yesterday')) return 'Yesterday'
  if (m.includes('day')) {
    const days = parseInt(meta) || 0
    return days <= 6 ? 'This Week' : 'Older'
  }
  return 'Older'
}

export function MoneyFlowTab({ wallet }) {
  const { balance, flow, portfolio, transactions, nftBreakdown, moneyFlowStats, pricedOnlyDisclaimer } = wallet
  const portfolioMetrics = portfolio.metrics || []
  const score = portfolio.score || 0
  const dashArray = `${Math.min(score, 100)} ${100 - Math.min(score, 100)}`
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

  const largestHoldingMetric = portfolioMetrics.find((m) => m.label === 'Largest Holding')
  const topAsset = largestHoldingMetric?.value || 'ETH'
  const activityStat = balance.stats?.find((s) => s.label === 'Activity')
  const activityLevel = activityStat?.value || (score > 70 ? 'Highly Active' : score > 40 ? 'Active' : 'Moderate')
  const txnStat = balance.stats?.find((s) => s.label === 'Transactions')
  const totalTxns = txnStat?.value || '—'

  const portfolioValue = parseFloat(balance.value.replace(/[^0-9.]/g, '')) || 0

  const riskMetric = portfolioMetrics.find(m => m.label === 'Risk Level')
  const protocolMetric = portfolioMetrics.find(m => m.label === 'Most Used Protocol' || m.label === 'Most Used Contract')
  const protocolInteractions = parseInt(protocolMetric?.detail?.replace(/[^0-9]/g, '')) || 0

  const signals = [
    {
      label: 'Transaction Activity',
      value: totalTxns,
      strength: activityLevel === 'Very High' ? 'Strong' : activityLevel === 'High' ? 'Moderate' : 'Low',
      dotColor: activityLevel === 'Very High' ? 'bg-emerald-500' : activityLevel === 'High' ? 'bg-amber-500' : 'bg-slate-400',
      badgeClass: activityLevel === 'Very High' ? 'bg-emerald-500/10 text-emerald-500' : activityLevel === 'High' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-500/10 text-slate-500',
    },
    {
      label: 'Portfolio Value',
      value: balance.value,
      strength: portfolioValue > 50000 ? 'Strong' : portfolioValue > 10000 ? 'Moderate' : 'Developing',
      dotColor: portfolioValue > 50000 ? 'bg-emerald-500' : portfolioValue > 10000 ? 'bg-amber-500' : 'bg-slate-400',
      badgeClass: portfolioValue > 50000 ? 'bg-emerald-500/10 text-emerald-500' : portfolioValue > 10000 ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-500/10 text-slate-500',
    },
    {
      label: 'Risk Profile',
      value: riskMetric?.value || '—',
      strength: riskMetric?.value === 'Low' ? 'Strong' : riskMetric?.value === 'Moderate' ? 'Moderate' : 'Needs Attention',
      dotColor: riskMetric?.value === 'Low' ? 'bg-emerald-500' : riskMetric?.value === 'Moderate' ? 'bg-amber-500' : 'bg-rose-500',
      badgeClass: riskMetric?.value === 'Low' ? 'bg-emerald-500/10 text-emerald-500' : riskMetric?.value === 'Moderate' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500',
      detail: riskMetric?.detail,
    },
    {
      label: 'Protocol Interactions',
      value: `${protocolInteractions} interactions`,
      strength: protocolInteractions > 5 ? 'Strong' : protocolInteractions > 2 ? 'Moderate' : 'Low',
      dotColor: protocolInteractions > 5 ? 'bg-emerald-500' : protocolInteractions > 2 ? 'bg-amber-500' : 'bg-slate-400',
      badgeClass: protocolInteractions > 5 ? 'bg-emerald-500/10 text-emerald-500' : protocolInteractions > 2 ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-500/10 text-slate-500',
    },
  ]

  const scoreLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : score >= 20 ? 'Limited' : 'Minimal'
  const strongCount = signals.filter(s => s.strength === 'Strong').length
  const strengthRank = { Strong: 4, Moderate: 3, Low: 2, Developing: 1, 'Needs Attention': 0 }
  const strongest = signals.reduce((best, s) => strengthRank[s.strength] > strengthRank[best.strength] ? s : best)
  const weakest = signals.reduce((best, s) => strengthRank[s.strength] < strengthRank[best.strength] ? s : best)

  const benchmarkLabel = score >= 95 ? 'Top 5% of wallets'
    : score >= 85 ? 'Top 15% of wallets'
    : score >= 70 ? 'Top 30% of wallets'
    : score >= 50 ? 'Above average'
    : 'Below average'

  const weaknessTip = weakest.strength === 'Needs Attention'
    ? `${weakest.label} requires attention. Reviewing your risk exposure could improve your score.`
    : (weakest.strength === 'Low' || weakest.strength === 'Developing')
    ? `Improving ${weakest.label.toLowerCase()} would strengthen your overall score.`
    : 'All factors are performing well. Maintain your current activity level.'

  const classificationDetail = score >= 80 ? 'Exceptional wallet health across all factors'
    : score >= 60 ? 'Above-average performance in most areas'
    : score >= 40 ? 'Moderate activity — room for improvement'
    : 'Limited activity — consider increasing wallet engagement'

  const scoreExplanation = score >= 80
    ? `Your score of ${score}/100 is ${scoreLabel.toLowerCase()}. ${strongCount} of 4 factors are performing at the highest level.`
    : score >= 60
    ? `Your score of ${score}/100 is ${scoreLabel.toLowerCase()}. ${strongCount} of 4 factors show above-average performance.`
    : score >= 40
    ? `Your score of ${score}/100 is ${scoreLabel.toLowerCase()}. Increasing transaction activity and protocol engagement could improve it.`
    : `Your score of ${score}/100 indicates ${scoreLabel.toLowerCase()} activity. Regular wallet usage across diverse protocols may help.`

  const recentTx = transactions.slice(0, 10)
  const groups = {}
  recentTx.forEach(tx => {
    const group = getDateGroup(tx.meta)
    if (!groups[group]) groups[group] = []
    groups[group].push(tx)
  })
  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Older']
  const groupedTransactions = groupOrder.filter(g => groups[g]).map(date => ({ date, items: groups[date] }))
  const [selectedTx, setSelectedTx] = useState(null)

  return (
    <div className="grid gap-9 max-[700px]:gap-6">
      {/* Money Summary */}
      <div className="space-y-[18px]">
        <div className="bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100/50 dark:border-teal-900/30 rounded-2xl p-4 max-[480px]:p-3 flex items-center gap-3">
          <MaterialIcon icon="auto_awesome" fill className="text-teal-400 shrink-0 text-lg max-[480px]:text-base" />
          <p className="text-sm max-[480px]:text-xs font-semibold text-teal-900 dark:text-teal-100">{tip}</p>
        </div>
        <MetricExplainer
          as="div"
          className="apple-card p-[25px] max-[480px]:p-5"
          explanation={{
            title: 'Money Flow',
            summary: 'Tracks all ETH movement in and out of your wallet during the selected period. Net Growth shows whether you received more than you spent.',
            formula: 'Net Growth = Total Received ETH − Total Spent ETH',
            details: [
              'Received: Total value of all incoming ETH transfers to your wallet.',
              'Spent: Total value of all outgoing ETH transfers including contract interactions.',
              'Positive Net Growth means you received more than you spent.',
              'Values are in ETH based on raw on-chain transaction data from BlobLens.',
            ],
          }}
        >
          <div className="flex justify-between items-center mb-5 max-[480px]:flex-col max-[480px]:items-start max-[480px]:gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Money Flow</span>
            <span className="px-3 py-1 bg-teal-400/10 text-teal-400 text-[10px] font-bold rounded-full">{formatPeriod(flow.periodLabel)}</span>
          </div>
          <div className="space-y-1">
            <p className="text-sm max-[480px]:text-xs font-medium text-slate-500 dark:text-slate-400">Net Growth</p>
            {(() => {
              const net = netGrowthValue(flow)
              const ethNet = Number(flow.ethNet ?? 0)
              return (
                <>
                  <h2 className="text-5xl max-[480px]:text-3xl font-bold tracking-tight text-teal-400">
                    {net.value >= 0 ? '+' : ''}{net.isUsd ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: Math.abs(net.value) >= 1_000_000 ? 'compact' : 'standard' }).format(net.value) : `${net.value.toLocaleString()} ETH`}
                  </h2>
                  {net.isUsd && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {ethNet >= 0 ? '+' : ''}{ethNet.toLocaleString()} ETH
                    </p>
                  )}
                  {signMismatchNote && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5" title={signMismatchNote}>
                      {signMismatchNote}
                    </p>
                  )}
                </>
              )
            })()}
          </div>
          <div className="grid grid-cols-2 gap-8 max-[480px]:gap-4 mt-6">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Received</p>
              <p className="text-2xl font-bold text-teal-400">{flow.received.usd || flow.received.value}</p>
              {flow.received.usd && flow.received.value !== '—' && (
                <p className="text-xs text-slate-400 dark:text-slate-500">{flow.received.value}</p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Spent</p>
              <p className="text-2xl font-bold text-rose-500">{flow.spent.usd || flow.spent.value}</p>
              {flow.spent.usd && flow.spent.value !== '—' && (
                <p className="text-xs text-slate-400 dark:text-slate-500">{flow.spent.value}</p>
              )}
            </div>
          </div>
        </MetricExplainer>
      </div>

      {/* Flow Stats — from full-period backend aggregates, not the 20-tx timeline */}
      {flowStats && (
        <div className="apple-card p-5 max-[480px]:p-3.5">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-4 block">Flow Statistics</span>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.04]">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Average Transfer</span>
              <strong className="text-lg font-bold">
                {flowStats.avgTransfer > 0 ? `${Number(flowStats.avgTransfer).toFixed(4)} ETH` : '—'}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.04]">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Largest Transfer</span>
              <strong className="text-lg font-bold">
                {flowStats.largestTransfer > 0 ? `${Number(flowStats.largestTransfer).toFixed(4)} ETH` : '—'}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.04]">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Most Active Month</span>
              <strong className="text-lg font-bold">{formatMonthLabel(flowStats.mostActiveMonth)}</strong>
              <span className="text-[10px] text-slate-400">{flowStats.mostActiveMonthCount || 0} txns</span>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.04]">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Most Active Week</span>
              <strong className="text-lg font-bold">{flowStats.mostActiveWeek ? new Date(`${flowStats.mostActiveWeek}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—'}</strong>
              <span className="text-[10px] text-slate-400">{flowStats.mostActiveWeekCount || 0} txns</span>
            </div>
          </div>
          {flowStats.incomingCount + flowStats.outgoingCount > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate-500">Incoming vs Outgoing</span>
                <span className="text-slate-400 text-[11px]">{flowStats.incomingCount} in / {flowStats.outgoingCount} out</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden flex">
                <div
                  className="h-full rounded-l-full bg-emerald-400 transition-all"
                  style={{ width: `${(flowStats.incomingCount / Math.max(flowStats.incomingCount + flowStats.outgoingCount, 1)) * 100}%` }}
                />
                <div
                  className="h-full rounded-r-full bg-rose-400 transition-all"
                  style={{ width: `${(flowStats.outgoingCount / Math.max(flowStats.incomingCount + flowStats.outgoingCount, 1)) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Portfolio Snapshot */}
      <MetricExplainer
        as="section"
        className="apple-card p-[22px] max-[480px]:p-[18px]"
          explanation={{
            title: 'Portfolio Snapshot',
            summary: 'Your wallet\'s estimated total value across all priced assets, paired with a health score based on portfolio size.',
            formula: 'Estimated Value = Σ(estimated token balance × supported USD price) for all priced assets',
            details: [
              `Current estimate: ${balance.value}`,
              'Combines ETH and supported token balances estimated from on-chain BlobLens data.',
              'The Health Score is derived from the logarithm of your estimated portfolio value: min(99, round(50 + log10(value + 1) × 12)).',
              'Only assets with available price feeds are included. If an asset lacks a price, it is excluded from the total.',
            ],
          }}
        >
          <div className="flex justify-between items-start mb-3 max-[480px]:flex-col max-[480px]:gap-3">
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-1.5">Portfolio Snapshot</p>
              <h3 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100 max-[480px]:text-3xl">{balance.value}</h3>
              {balance.coverageLabel && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{balance.coverageLabel}</p>
              )}
            </div>
            <MetricExplainer
              as="div"
              className="text-right max-[480px]:text-left"
              explanation={portfolio.scoreExplanation}
            >
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-1.5">Health Score</p>
              <div className="inline-flex items-center px-4 py-2 rounded-2xl bg-teal-400/10 border border-teal-400/20 backdrop-blur-sm">
                <p className="text-xl font-bold text-teal-400">{score}<span className="text-xs text-teal-400/50 ml-0.5">/100</span></p>
              </div>
              {(portfolio.scoreDisclaimer || pricedOnlyDisclaimer) && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 max-w-[18ch] ml-auto max-[480px]:ml-0">
                  {portfolio.scoreDisclaimer || pricedOnlyDisclaimer}
                </p>
              )}
            </MetricExplainer>
          </div>
          <div className="flex items-center gap-3 text-sm max-[480px]:text-xs font-medium pt-3 border-t border-gray-100 dark:border-white/10">
            <div className="w-7 h-7 rounded-full bg-teal-400/10 flex items-center justify-center shrink-0">
              <MaterialIcon icon="stars" fill className="text-teal-400 text-base" />
            </div>
            <span className="text-slate-900 dark:text-slate-100 font-semibold">Top Performing Asset:</span>
            <span className="text-teal-500 font-bold">{topAsset}</span>
          </div>
      </MetricExplainer>

      {/* Activity Score */}
      <section>
        <div className="section-label mb-[18px] flex justify-between text-sm font-[750] tracking-[-.02em] text-[var(--ink)]">
          <strong>Activity Score</strong>
        </div>
        <MetricExplainer
          as="div"
          className="apple-card p-[25px] max-[480px]:p-5"
          explanation={{
            title: 'Activity Score',
            summary: 'A 0–100 score that reflects your wallet\'s overall health based on portfolio value, transaction activity, risk level, and protocol interactions. Higher scores indicate stronger wallet engagement.',
            formula: 'Base score = min(99, round(50 + log10(estimated priced assets + 1) × 12)). Each factor is independently rated as Strong, Moderate, Low, Developing, or Needs Attention.',
            details: [
              `Score: ${score}/100 — ${scoreLabel}.`,
              'Four factors are evaluated alongside the base score:',
              '• Transaction Activity — based on transaction count in the selected period (Very High > 500, High > 100, Moderate ≤ 100).',
              '• Portfolio Value — the estimated USD value of your priced assets.',
              '• Risk Profile — based on asset concentration, failure rate, and protocol diversity (Low, Moderate, or High).',
              '• Protocol Interactions — the number of distinct protocols or contracts used.',
              'Each factor\'s strength rating is a simplified label derived from the underlying data — not a weighted input to the score.',
            ],
          }}
        >
          <div className="flex items-center gap-6 mb-6 max-[480px]:flex-col max-[480px]:text-center">
            <div className="relative w-20 h-20 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36" role="img" aria-label={`Activity score: ${score} out of 100`}>
                <defs>
                  <linearGradient id="scoreGradient" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#2dd4bf" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                </defs>
                <circle cx="18" cy="18" fill="transparent" r="16" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="3" />
                <circle
                  cx="18" cy="18" fill="transparent"
                  filter="drop-shadow(0 0 4px rgba(45,212,191,0.3))"
                  r="16" stroke="url(#scoreGradient)"
                  strokeDasharray={dashArray}
                  strokeLinecap="round" strokeWidth="3"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tracking-tighter">{score}</span>
                <span className="text-[7px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Score</span>
              </div>
            </div>
            <div className="text-left max-[480px]:text-center">
              <h4 className="font-bold text-xl max-[480px]:text-lg tracking-tight">{scoreLabel}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{score}/100 — {classificationDetail}</p>
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.12em] mb-0.5">Strongest Factor</p>
                <p className="text-sm font-bold truncate">{strongest.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{strongest.value}</p>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {strongest.strength}
              </span>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            {signals.map((signal) => (
              <div key={signal.label} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-white/[0.06]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-2 h-2 rounded-full ${signal.dotColor} shrink-0`} />
                  <span className="text-sm max-[480px]:text-xs font-medium truncate">{signal.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs max-[480px]:text-[10px] text-slate-500 dark:text-slate-400">{signal.value}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${signal.badgeClass}`}>
                    {signal.strength}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10">
            <span className="text-[9px] font-bold text-amber-500 uppercase tracking-[0.12em]">Opportunity</span>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{weaknessTip}</p>
          </div>

          <MetricExplainer
            as="div"
            className="mt-4 pt-4 border-t border-gray-100 dark:border-white/10 flex items-start gap-3"
            explanation={{
              title: 'Score Benchmark',
              summary: 'How your wallet\'s activity score compares against other analyzed Ethereum wallets.',
              formula: 'Top 5% (95+) | Top 15% (85+) | Top 30% (70+) | Above average (50+) | Below average (<50)',
              details: [
                `${benchmarkLabel}.`,
                'Benchmarks are relative to all Ethereum wallets analyzed on the platform for the same period.',
                'The score is based on four factors: Transaction Activity, Portfolio Value, Risk Profile, and Protocol Interactions.',
                'Higher scores indicate stronger wallet activity and healthier portfolio management.',
              ],
            }}
          >
            <div className="w-8 h-8 rounded-full bg-teal-400/10 flex items-center justify-center shrink-0">
              <MaterialIcon icon="bar_chart" className="text-teal-400 text-lg" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{benchmarkLabel}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{scoreExplanation}</p>
            </div>
          </MetricExplainer>
        </MetricExplainer>
      </section>

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

      {/* Money Journey */}
      <section className="min-[900px]:px-0.5">
        {groupedTransactions.length > 0 ? (
          <div className="card activity-feed rounded-3xl border-0 p-[22px] max-[1050px]:p-[18px] max-[480px]:rounded-[20px] max-[480px]:p-3.5">
            <div className="activity-card__heading flex min-h-[35px] items-center justify-between gap-4">
              <div className="grid gap-[3px]">
                <span>{flow.periodLabel}</span>
                <h2>Recent Activity</h2>
              </div>
            </div>
            <div className="transaction-list mt-3 grid grid-cols-1 gap-[3px]">
              {groupedTransactions.map((group) => (
                <div key={group.date}>
                  <div className="px-1 pt-2 pb-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.15em]">{group.date}</span>
                  </div>
                  {group.items.map((tx) => (
                    <article
                      key={tx.title}
                      className={`transaction transaction--${tx.tone} relative grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_minmax(72px,auto)] items-center gap-[11px] rounded-[14px] border-0 bg-transparent p-[13px_11px] max-[1050px]:grid-cols-[auto_minmax(0,1fr)_auto] max-[700px]:grid-cols-[auto_minmax(0,1fr)] max-[480px]:gap-[9px] max-[480px]:p-[9px_7px]`}
                      tabIndex="0"
                      role="button"
                      onClick={() => setSelectedTx(tx)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTx(tx) } }}
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
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card activity-feed rounded-3xl border-0 p-[22px] max-[480px]:p-5 text-center">
            <div className="py-16">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-3">
                <MaterialIcon icon="receipt_long" className="text-slate-400 text-2xl" />
              </div>
              <p className="text-sm text-slate-500">No transactions found for this period.</p>
            </div>
          </div>
        )}
      </section>
      {selectedTx && <TransactionModal tx={selectedTx} onClose={() => setSelectedTx(null)} />}
    </div>
  )
}
