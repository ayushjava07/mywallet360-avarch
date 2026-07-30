import { MaterialIcon } from '../common/MaterialIcon'
import { MetricExplainer } from '../common/MetricExplainer'
import {
  computePeriodChange,
  formatPortfolioValue,
  getPortfolioSourceLabel,
} from './portfolio.utils'

export function PortfolioHero({ wallet, displayMode, ethPrice }) {
  const portfolioValue = wallet?.portfolioValue ?? wallet?.balance?.netWorth ?? 0
  const score = wallet?.portfolio?.score ?? 0
  const scoreLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : score >= 20 ? 'Limited' : 'Minimal'
  const periodStats = computePeriodChange(wallet?.valuationHistory, '1y')
  const sourceLabel = getPortfolioSourceLabel(wallet?.portfolioValueSource)
  const displayValue = formatPortfolioValue(portfolioValue, { displayMode, ethPrice })

  return (
    <MetricExplainer
      as="section"
      className="portfolio-hero apple-card p-[25px] max-[480px]:p-5"
      explanation={wallet?.balance?.explanation}
    >
      <div className="portfolio-hero__head">
        <div className="portfolio-hero__lead">
          <span className="portfolio-hero__eyebrow">Portfolio Value</span>
          <h2 className="portfolio-hero__value">{displayValue}</h2>
          <p className="portfolio-hero__hint">{sourceLabel}</p>
          {wallet?.pricedOnlyDisclaimer && (
            <p className="portfolio-hero__note">{wallet.pricedOnlyDisclaimer}</p>
          )}
        </div>
        <MetricExplainer
          as="div"
          className="portfolio-hero__score"
          explanation={wallet?.portfolio?.scoreExplanation}
        >
          <span className="portfolio-hero__eyebrow">Health Score</span>
          <div className="portfolio-hero__score-badge">
            <strong>{score}</strong>
            <span>/100</span>
          </div>
          <p className="portfolio-hero__score-label">{scoreLabel}</p>
        </MetricExplainer>
      </div>

      <div className="portfolio-hero__meta">
        {wallet?.pricedAssetCount != null && wallet?.assetCount != null && (
          <span className="portfolio-hero__pill">
            <MaterialIcon icon="collections_bookmark" className="text-sm" />
            {wallet.pricedAssetCount} of {wallet.assetCount} priced
          </span>
        )}
        {wallet?.pricingCoveragePercent != null && (
          <span className="portfolio-hero__pill">
            <MaterialIcon icon="price_check" className="text-sm" />
            {wallet.pricingCoveragePercent}% coverage
          </span>
        )}
        {periodStats && (
          <span className={`portfolio-hero__pill portfolio-hero__pill--${periodStats.changePercent >= 0 ? 'up' : 'down'}`}>
            <MaterialIcon icon="show_chart" className="text-sm" />
            1Y {periodStats.changePercent >= 0 ? '+' : ''}{periodStats.changePercent.toFixed(1)}%
          </span>
        )}
      </div>
    </MetricExplainer>
  )
}
