import { useMemo } from 'react'
import { MaterialIcon } from '../common/MaterialIcon'

const HEALTH_TONES = {
  excellent: { label: 'Excellent', icon: 'verified', color: '#10b981', bg: 'rgba(16,185,129,.1)' },
  good: { label: 'Good', icon: 'check_circle', color: '#3b82f6', bg: 'rgba(59,130,246,.1)' },
  fair: { label: 'Fair', icon: 'info', color: '#f59e0b', bg: 'rgba(245,158,11,.1)' },
  poor: { label: 'Needs Attention', icon: 'warning', color: '#ef4444', bg: 'rgba(239,68,68,.1)' },
}

const safeNumber = (v) => Number.isFinite(Number(v)) ? Number(v) : 0

function getHealthScore(assets = []) {
  if (!assets || assets.length === 0) return { score: 50, level: 'fair', label: HEALTH_TONES.fair }

  const unpricedCount = assets.filter((a) => !a.priceAvailable).length
  const priced = assets.filter((a) => a.priceAvailable)
  const totalAssets = assets.length

  const spamPenalty = Math.min(20, Math.round((unpricedCount / Math.max(totalAssets, 1)) * 25))
  const concentration = priced.length
    ? Math.max(...priced.map((a) => safeNumber(a.percentage)))
    : 0
  const concentrationPenalty = concentration > 60 ? 15 : concentration > 40 ? 10 : concentration > 25 ? 5 : 0

  const baseScore = Math.max(0, 85 - spamPenalty - concentrationPenalty)

  let level, label
  if (baseScore >= 80) { level = 'excellent'; label = HEALTH_TONES.excellent }
  else if (baseScore >= 60) { level = 'good'; label = HEALTH_TONES.good }
  else if (baseScore >= 40) { level = 'fair'; label = HEALTH_TONES.fair }
  else { level = 'poor'; label = HEALTH_TONES.poor }

  return { score: baseScore, level, label }
}

export function WalletHealth({ wallet }) {
  const assets = useMemo(() => wallet?.assets || [], [wallet?.assets])
  const pricingCoveragePercent = safeNumber(wallet?.pricingCoveragePercent)
  const pricedOnlyDisclaimer = wallet?.pricedOnlyDisclaimer
    || (pricingCoveragePercent > 0 && pricingCoveragePercent < 100
      ? `Based on priced assets only (${pricingCoveragePercent}%)`
      : null)

  const health = useMemo(() => getHealthScore(assets), [assets])

  const unpricedAssets = useMemo(() => {
    return assets.filter((a) => !a.priceAvailable).slice(0, 3)
  }, [assets])

  const totalUnpriced = assets.filter((a) => !a.priceAvailable).length
  const pricedCount = assets.filter((a) => a.priceAvailable).length
  const maxConcentration = Math.max(
    ...assets.filter((a) => a.priceAvailable).map((a) => safeNumber(a.percentage)),
    0,
  )
  const dustCount = assets.filter((a) => safeNumber(a.rawUsdValue ?? a.usdValue) > 0 && safeNumber(a.rawUsdValue ?? a.usdValue) < 0.5).length

  const healthIndicators = [
    {
      label: 'Portfolio Concentration',
      value: pricedCount > 0 ? `${maxConcentration}%` : '—',
      status: maxConcentration > 50 ? 'warning' : maxConcentration > 25 ? 'info' : 'good',
      icon: 'pie_chart',
    },
    {
      label: 'Unpriced Assets',
      value: totalUnpriced > 0 ? `${totalUnpriced} token${totalUnpriced !== 1 ? 's' : ''}` : 'None detected',
      status: totalUnpriced > 5 ? 'warning' : totalUnpriced > 0 ? 'info' : 'good',
      icon: 'help_center',
    },
    {
      label: 'Priced Assets',
      value: `${pricedCount} of ${assets.length}`,
      status: pricedCount >= 3 ? 'good' : 'info',
      icon: 'price_check',
    },
    {
      label: 'Dust Holdings',
      value: dustCount > 0 ? String(dustCount) : '—',
      status: dustCount > 5 ? 'warning' : 'good',
      icon: 'clear_all',
    },
  ]

  return (
    <section className="card health-card p-5 max-[480px]:p-3.5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <MaterialIcon icon="security" className="text-teal-400 text-xl" />
          <div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Security</span>
            <h2 className="text-base font-bold mt-0.5">Wallet Health</h2>
          </div>
        </div>
        <div className="text-right">
          <div
            className="health-score-badge"
            style={{
              background: health.label.bg,
              color: health.label.color,
              border: `1px solid ${health.label.color}20`,
            }}
          >
            <MaterialIcon icon={health.label.icon} className="text-sm" />
            <span className="font-bold text-sm">{health.score}</span>
            <span className="text-[9px] opacity-70">/100</span>
          </div>
          {pricedOnlyDisclaimer && (
            <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-1.5 max-w-[16ch] ml-auto">
              {pricedOnlyDisclaimer}
            </p>
          )}
        </div>
      </div>
      
      <div className="health-indicators grid grid-cols-2 gap-2.5 mb-4">
        {healthIndicators.map((indicator) => (
          <div
            key={indicator.label}
            className="health-indicator flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 dark:bg-white/[0.04]"
          >
            <MaterialIcon
              icon={indicator.icon}
              className={`text-lg ${
                indicator.status === 'warning' ? 'text-amber-500' :
                indicator.status === 'info' ? 'text-blue-500' :
                'text-emerald-500'
              }`}
            />
            <div className="min-w-0">
              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                {indicator.label}
              </span>
              <strong className="text-sm">{indicator.value}</strong>
            </div>
          </div>
        ))}
      </div>
      
      {unpricedAssets.length > 0 && (
        <details className="health-details text-xs">
          <summary className="flex items-center gap-2 py-2 cursor-pointer text-slate-500 dark:text-slate-400 font-semibold hover:text-slate-700 dark:hover:text-slate-300">
            <MaterialIcon icon="expand_more" className="text-base" />
            <span>Assets without market data ({totalUnpriced})</span>
          </summary>
          <div className="mt-2 space-y-1.5">
            {unpricedAssets.map((asset) => (
              <div
                key={`${asset.contractAddress || asset.symbol}`}
                className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-gray-50 dark:bg-white/[0.03]"
              >
                <span className="font-medium">{asset.symbol || 'Unknown'}</span>
                <span className="text-slate-400">{asset.rawBalance || asset.balance}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
