import { useMemo } from 'react'
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Hourglass,
  Layers3,
  Wallet,
} from 'lucide-react'
import { enrichAddressOverviewUi } from '../../services/walletService'

function OverviewMetric({ icon, label, value, children, primary }) {
  if (!value && !children) return null

  const MetricIcon = icon

  return (
    <article className={`balance-overview-metric${primary ? ' balance-overview-metric--primary' : ''}`}>
      <span className="balance-overview-metric__icon" aria-hidden="true">
        <MetricIcon />
      </span>
      <div className="balance-overview-metric__body">
        <span className="balance-overview-metric__label">{label}</span>
        {children || <strong className="balance-overview-metric__value">{value}</strong>}
      </div>
    </article>
  )
}

function AssetBadgeRow({ badges }) {
  if (!badges?.length) return null

  return (
    <div className="balance-overview-badges">
      {badges.map((badge) => (
        <span
          className={`balance-overview-badge balance-overview-badge--${badge.tone}`}
          key={badge.key}
        >
          {badge.label}
        </span>
      ))}
    </div>
  )
}

export function BalanceCard({ wallet, error, displayMode = 'usd', ethPrice }) {
  const overview = useMemo(
    () => enrichAddressOverviewUi(
      wallet?.addressOverview
        ? { ...wallet.addressOverview, netWorthUsd: wallet.portfolioValue }
        : null,
      wallet?.portfolioInventory,
      ethPrice ?? wallet?.ethPrice,
      displayMode,
    ),
    [wallet?.addressOverview, wallet?.portfolioInventory, wallet?.portfolioValue, wallet?.ethPrice, ethPrice, displayMode],
  )

  const portfolioHint = wallet?.portfolioValueSource === 'etherscan'
    ? 'Portfolio value · ETH + Etherscan-priced tokens'
    : 'Portfolio value · priced assets only'

  if (!overview) {
    return (
      <section className="balance-overview-card balance-overview-card--glass relative isolate overflow-hidden rounded-[28px] p-8 max-[700px]:p-[18px] max-[480px]:p-4 max-[360px]:p-3.5 min-[900px]:col-span-2 min-[1180px]:col-span-full">
        {error && <span className="balance-overview-error">{error}</span>}
        <p className="text-sm text-[var(--muted)]">Address overview unavailable.</p>
      </section>
    )
  }

  const tokenBadges = overview.assetBadges?.filter((badge) => badge.key !== 'counting') || []
  const showTokenValue = overview.tokenHoldingsValue
    || overview.inventoryPending
    || tokenBadges.length > 0

  return (
    <section className="balance-overview-card balance-overview-card--glass relative isolate overflow-hidden rounded-[28px] p-8 max-[700px]:p-[18px] max-[480px]:p-4 max-[360px]:p-3.5 min-[900px]:col-span-2 min-[1180px]:col-span-full">
      {error && <span className="balance-overview-error">{error}</span>}

      <div className="balance-overview-header">
        <div className="balance-overview-header__lead">
          <span className="balance-overview-tile__title">Wallet Overview</span>
          {overview.netWorthUsd ? (
            <>
              <h2 className="balance-overview-hero__value">{overview.netWorthUsd}</h2>
              <p className="balance-overview-hero__hint">{portfolioHint}</p>
            </>
          ) : (
            <>
              <h2 className="balance-overview-hero__value">{overview.ethBalanceLabel}</h2>
              <p className="balance-overview-hero__hint">On-chain ETH balance</p>
            </>
          )}
        </div>
        <div className="balance-overview-header__pills">
          {overview.walletAge && (
            <span className="balance-overview-pill">{overview.walletAge}</span>
          )}
        </div>
      </div>

      <div className="balance-overview-section">
        <span className="balance-overview-tile__title">Holdings</span>
        <div className="balance-overview-metrics balance-overview-metrics--grid">
          <OverviewMetric icon={Wallet} label="ETH Balance" value={overview.ethBalanceLabel} primary />
          <OverviewMetric icon={CircleDollarSign} label="ETH Value" value={overview.ethValueUsd} />
          {showTokenValue && (
            <OverviewMetric icon={Layers3} label="Token Holdings">
              <div className="balance-overview-metric__stack">
                {overview.tokenHoldingsValue && (
                  <strong className="balance-overview-metric__value">{overview.tokenHoldingsValue}</strong>
                )}
                <AssetBadgeRow badges={overview.assetBadges} />
              </div>
            </OverviewMetric>
          )}
        </div>
      </div>

      {(overview.walletAge || overview.firstTransaction || overview.latestTransaction) && (
        <div className="balance-overview-section">
          <span className="balance-overview-tile__title">Activity</span>
          <div className="balance-overview-metrics balance-overview-metrics--grid">
            {overview.walletAge && (
              <OverviewMetric icon={Hourglass} label="Wallet Age" value={overview.walletAge} />
            )}
            <OverviewMetric icon={CalendarDays} label="First Transaction" value={overview.firstTransaction} />
            <OverviewMetric icon={Clock3} label="Latest Transaction" value={overview.latestTransaction} />
          </div>
        </div>
      )}
    </section>
  )
}
