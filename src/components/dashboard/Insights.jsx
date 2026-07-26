import { useMemo } from 'react'
import { MaterialIcon } from '../common/MaterialIcon'

const safeNumber = (v) => Number.isFinite(Number(v)) ? Number(v) : 0

export function Insights({ insights, wallet, periodLabel }) {
  const computedInsights = useMemo(() => {
    const result = []
    const assets = wallet?.assets || []
    const pricedAssets = assets.filter((a) => a.priceAvailable)
    const unpricedAssets = assets.filter((a) => !a.priceAvailable)
    const totalPriced = pricedAssets.reduce((sum, a) => sum + safeNumber(a.usdValue), 0)
    const nftCount = safeNumber(wallet?.nftCount ?? 0)
    const transactionCount = safeNumber(wallet?.transactionCount ?? 0)
    const pricingCoveragePercent = safeNumber(wallet?.pricingCoveragePercent)
    const pricedOnlyNote = pricingCoveragePercent > 0 && pricingCoveragePercent < 100
      ? ` Based on priced assets only (${pricingCoveragePercent}%).`
      : ''

    // Largest concentration
    if (pricedAssets.length > 0) {
      const sorted = [...pricedAssets].sort((a, b) => safeNumber(b.usdValue) - safeNumber(a.usdValue))
      const largest = sorted[0]
      const largestPct = largest.percentage != null
        ? safeNumber(largest.percentage)
        : (totalPriced > 0 ? (safeNumber(largest.usdValue) / totalPriced) * 100 : 0)
      const top3Pct = totalPriced > 0
        ? sorted.slice(0, 3).reduce((sum, a) => sum + safeNumber(a.usdValue), 0) / totalPriced * 100
        : 0

      if (largestPct > 50) {
        result.push({
          icon: 'pie_chart',
          text: `${largestPct.toFixed(0)}% of your priced portfolio is concentrated in ${largest.symbol || largest.name}.${pricedOnlyNote}`,
          tone: 'attention',
          metric: `${largestPct.toFixed(0)}%`,
        })
      }

      if (top3Pct > 80) {
        result.push({
          icon: 'layers',
          text: `Top 3 priced assets make up ${top3Pct.toFixed(0)}% of priced value. Low diversification.${pricedOnlyNote}`,
          tone: 'info',
          metric: `${top3Pct.toFixed(0)}%`,
        })
      }
    }
    
    // Stablecoin exposure
    const stablecoins = pricedAssets.filter((a) => 
      ['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX', 'TUSD'].includes(a.symbol)
    )
    const stablecoinPct = totalPriced > 0
      ? stablecoins.reduce((sum, a) => sum + safeNumber(a.usdValue), 0) / totalPriced * 100
      : 0
    
    if (stablecoinPct === 0 && pricedAssets.length > 0) {
      result.push({
        icon: 'account_balance',
        text: 'No stablecoin exposure detected. Consider adding stablecoins for downside protection.',
        tone: 'info',
        metric: '0%',
      })
    } else if (stablecoinPct > 0 && stablecoinPct < 5) {
      result.push({
        icon: 'account_balance',
        text: `Only ${stablecoinPct.toFixed(0)}% stablecoin exposure. Limited downside protection.`,
        tone: 'info',
        metric: `${stablecoinPct.toFixed(0)}%`,
      })
    }
    
    // Unpriced assets
    if (unpricedAssets.length > 0) {
      result.push({
        icon: 'help_center',
        text: `${unpricedAssets.length} asset${unpricedAssets.length !== 1 ? 's have' : ' has'} no market data available.`,
        tone: 'info',
        metric: `${unpricedAssets.length}`,
      })
    }
    
    // Inactivity — use last on-chain activity, not API fetch time
    if (wallet?.lastActivityAt) {
      const elapsedDays = Math.floor((Date.now() - new Date(wallet.lastActivityAt).getTime()) / 86400000)
      if (elapsedDays > 30) {
        result.push({
          icon: 'schedule',
          text: `Last on-chain activity was ${elapsedDays} days ago (${transactionCount} txns in the selected period).`,
          tone: 'attention',
          metric: `${elapsedDays}d`,
        })
      }
    } else if (transactionCount === 0) {
      result.push({
        icon: 'schedule',
        text: 'No transactions found in the selected analysis period.',
        tone: 'info',
        metric: '0',
      })
    }
    
    // NFT focus
    if (nftCount > 10) {
      result.push({
        icon: 'collections_bookmark',
        text: `${nftCount} NFTs detected in your portfolio. Strong NFT collector profile.`,
        tone: 'info',
        metric: `${nftCount}`,
      })
    }
    
    // Pricing coverage
    if (assets.length > 0) {
      result.push({
        icon: 'price_check',
        text: `${pricedAssets.length} of ${assets.length} held tokens priced (${pricingCoveragePercent || Math.round((pricedAssets.length / assets.length) * 100)}%).`,
        tone: pricedAssets.length === assets.length ? 'good' : 'info',
        metric: `${pricedAssets.length}/${assets.length}`,
      })
    }
    
    return result.slice(0, 5)
  }, [wallet])

  const hasPeriodScopedInsight = computedInsights.some((insight) =>
    insight.text.includes('selected period') || insight.text.includes('txns in'),
  )
  
  if (computedInsights.length === 0 && (!insights || insights.length === 0)) {
    return null
  }
  
  return (
    <section className="insights-section grid gap-4 min-[900px]:px-0.5">
      <div className="flex items-center gap-2.5">
        <MaterialIcon icon="auto_awesome" className="text-teal-400 text-xl" />
        <div>
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Heuristic Analysis</span>
          <h2 className="text-[15px] font-bold mt-0.5">Portfolio Insights</h2>
          {hasPeriodScopedInsight && periodLabel && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              Transaction activity insights use <strong>{periodLabel.toLowerCase()}</strong> (set in Overview or Money Flow)
            </p>
          )}
        </div>
      </div>
      
      <div className="insights-list grid gap-2.5">
        {computedInsights.map((insight, i) => (
          <div
            key={i}
            className={`insight-card-data flex items-start gap-3 p-3.5 rounded-xl ${
              insight.tone === 'attention' 
                ? 'bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/10'
                : insight.tone === 'good'
                  ? 'bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200/50 dark:border-emerald-500/10'
                  : 'bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06]'
            }`}
          >
            <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
              insight.tone === 'attention'
                ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : insight.tone === 'good'
                  ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400'
            }`}>
              <MaterialIcon icon={insight.icon} className="text-sm" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] leading-relaxed text-slate-700 dark:text-slate-300">{insight.text}</p>
            </div>
            <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-md ${
              insight.tone === 'attention'
                ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : insight.tone === 'good'
                  ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400'
            }`}>
              {insight.metric}
            </span>
          </div>
        ))}
        
        {insights && insights.length > 0 && computedInsights.length === 0 && insights.map((insight, i) => (
          <div
            key={`legacy-${i}`}
            className="insight-card-data flex items-start gap-3 p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06]"
          >
            <span className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <MaterialIcon icon="insights" className="text-sm" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">{insight.label}: <strong>{insight.value}</strong> {insight.suffix}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
