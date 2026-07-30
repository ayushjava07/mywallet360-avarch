import { useState } from 'react'
import { DashboardBar } from './DashboardBar'
import { PortfolioAllocation } from './PortfolioAllocation'
import { PortfolioCard } from './PortfolioCard'
import { PortfolioChart } from './PortfolioChart'
import { PortfolioHero } from './PortfolioHero'
import { PortfolioHoldings } from './PortfolioHoldings'
import { PortfolioInsights } from './PortfolioInsights'

export function PortfolioTab({ wallet, displayMode, onDisplayModeChange, isLoading, ethPrice }) {
  const [activeSymbol, setActiveSymbol] = useState(null)

  return (
    <div className="grid gap-9 max-[700px]:gap-6">
      <DashboardBar
        displayMode={displayMode}
        onDisplayModeChange={onDisplayModeChange}
      />

      <PortfolioHero
        wallet={wallet}
        displayMode={displayMode}
        ethPrice={ethPrice}
      />

      <PortfolioInsights
        wallet={wallet}
        holdings={wallet?.holdings}
        valuationHistory={wallet?.valuationHistory}
      />

      {wallet?.portfolio && (
        <PortfolioCard portfolio={wallet.portfolio} />
      )}

      <div className="portfolio-analytics-row">
        <PortfolioChart
          valuationHistory={wallet?.valuationHistory}
          displayMode={displayMode}
          ethPrice={ethPrice}
        />
        <PortfolioAllocation
          holdings={wallet?.holdings}
          displayMode={displayMode}
          ethPrice={ethPrice}
          activeSymbol={activeSymbol}
          onHighlight={setActiveSymbol}
        />
      </div>

      <PortfolioHoldings
        holdings={wallet?.holdings}
        valuationHistory={wallet?.balance?.history}
        isLoading={isLoading}
        displayMode={displayMode}
        ethPrice={ethPrice}
        wallet={wallet}
        activeSymbol={activeSymbol}
        onHighlight={setActiveSymbol}
      />
    </div>
  )
}
