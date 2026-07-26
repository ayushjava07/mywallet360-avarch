import { useState } from 'react'
import { Activity } from './components/dashboard/Activity'
import { BalanceCard } from './components/dashboard/BalanceCard'
import { AnalysisPeriodBar } from './components/dashboard/AnalysisPeriodBar'
import { DashboardBar } from './components/dashboard/DashboardBar'
import { DashboardLoader } from './components/dashboard/DashboardLoader'
import { Insights } from './components/dashboard/Insights'
import { MoneyFlowTab } from './components/dashboard/MoneyFlowTab'
import { PortfolioChart } from './components/dashboard/PortfolioChart'
import { PortfolioHoldings } from './components/dashboard/PortfolioHoldings'
import { TransactionHeatmap } from './components/dashboard/TransactionHeatmap'
import { TransactionAnalytics } from './components/dashboard/TransactionAnalytics'
import { WalletHealth } from './components/dashboard/WalletHealth'
import { WalletPersonality } from './components/dashboard/WalletPersonality'
import { BottomNav } from './components/layout/BottomNav'
import { Header } from './components/layout/Header'
import { useTheme } from './hooks/useTheme'
import { useWalletDashboard } from './hooks/useWalletDashboard'
import { ANALYSIS_PERIODS, walletService } from './services/walletService'

const exampleWallets = walletService.listExampleWallets()

export default function App() {
  const [activeTab, setActiveTab] = useState('Overview')
  const [displayMode, setDisplayMode] = useState('usd')
  const {
    wallet,
    error,
    searchValue,
    isLoading,
    isPeriodLoading,
    isRefreshing,
    pendingAnalysisDays,
    isResolving,
    analysisDays,
    customRange,
    resolvedIdentifier,
    setSearchValue,
    searchWallet,
    refreshWallet,
    selectExampleWallet,
    selectAnalysisPeriod,
    connectedAddress,
    walletProviders,
    isConnecting,
    connectionError,
    connectWallet,
    disconnectWallet,
  } = useWalletDashboard()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="app-shell mx-auto w-[min(100%,1180px)] px-[clamp(16px,3vw,32px)] pb-[124px] max-[700px]:px-4 max-[700px]:pb-[120px] max-[480px]:px-3 max-[480px]:pb-[116px] max-[360px]:px-[9px] max-[360px]:pb-28">
      <Header
        wallet={wallet}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={searchWallet}
        searchError={error}
        resolvedIdentifier={resolvedIdentifier}
        onSelectExampleWallet={selectExampleWallet}
        isLoading={isLoading}
        isResolving={isResolving}
        isRefreshing={isRefreshing}
        onRefreshWallet={refreshWallet}
        exampleWallets={exampleWallets}
        theme={theme}
        onToggleTheme={toggleTheme}
        connectedAddress={connectedAddress}
        walletProviders={walletProviders}
        isConnecting={isConnecting}
        connectionError={connectionError}
        onConnectWallet={connectWallet}
        onDisconnectWallet={disconnectWallet}
      />

      {wallet ? (
        <>
          {activeTab === 'Overview' && (
            <main className={`grid gap-9 max-[700px]:gap-6 ${isLoading ? 'dashboard-loading' : 'dashboard-ready'}`} key={`overview-${wallet.id}`}>
              {isLoading && <DashboardLoader />}
              <DashboardBar
                displayMode={displayMode}
                onDisplayModeChange={setDisplayMode}
              />
              <BalanceCard
                wallet={wallet}
                error={error}
                displayMode={displayMode}
                ethPrice={wallet.ethPrice}
              />
              <TransactionHeatmap
                dailyTransactionCounts={wallet.dailyTransactionCounts}
                activityStats={wallet.activityStats}
              />
              <TransactionAnalytics
                dailyAnalytics={wallet.dailyAnalytics}
                addressLabel={wallet.profile?.wallet || wallet.chipLabel}
              />
              <AnalysisPeriodBar
                periods={ANALYSIS_PERIODS}
                selectedDays={analysisDays}
                customRange={customRange}
                pendingDays={pendingAnalysisDays}
                isLoading={isPeriodLoading}
                onPeriodChange={selectAnalysisPeriod}
                scopeHint="Period applies to: Recent Activity"
              />
              <Activity
                transactions={wallet.transactions}
                periodLabel={wallet.periodLabel}
              />
            </main>
          )}

          {activeTab === 'Money Flow' && (
            <main key={`flow-${wallet.id}`} className={`grid gap-9 max-[700px]:gap-6 ${isLoading ? 'dashboard-loading' : 'dashboard-ready'}`}>
              {isLoading && <DashboardLoader />}
              <AnalysisPeriodBar
                periods={ANALYSIS_PERIODS}
                selectedDays={analysisDays}
                customRange={customRange}
                pendingDays={pendingAnalysisDays}
                isLoading={isPeriodLoading}
                onPeriodChange={selectAnalysisPeriod}
                scopeHint="Period applies to: Money Flow & transactions"
              />
              <MoneyFlowTab wallet={wallet} />
            </main>
          )}

          {activeTab === 'Portfolio' && (
            <main className={`grid gap-9 max-[700px]:gap-6 ${isLoading ? 'dashboard-loading' : 'dashboard-ready'}`} key={`portfolio-${wallet.id}`}>
              {isLoading && <DashboardLoader />}
              <DashboardBar
                displayMode={displayMode}
                onDisplayModeChange={setDisplayMode}
              />
              <PortfolioHoldings
                holdings={wallet.holdings}
                valuationHistory={wallet.balance?.history}
                isLoading={isLoading}
                displayMode={displayMode}
                ethPrice={wallet.ethPrice}
                wallet={wallet}
              />
              <PortfolioChart
                valuationHistory={wallet.valuationHistory}
              />
            </main>
          )}

          {activeTab === 'Insights' && (
            <main className={`grid gap-9 max-[700px]:gap-6 ${isLoading ? 'dashboard-loading' : 'dashboard-ready'}`} key={`insights-${wallet.id}`}>
              {isLoading && <DashboardLoader />}
              <Insights insights={wallet.insights} wallet={wallet} periodLabel={wallet.periodLabel} />
              <WalletHealth wallet={wallet} />
              <WalletPersonality personality={wallet.personality} />
            </main>
          )}

          <BottomNav active={activeTab} onChange={setActiveTab} />
        </>
      ) : (
        <main className="wallet-empty-state grid min-h-[58vh] place-content-center justify-items-center gap-3 rounded-[28px] border border-dashed border-[rgba(44,122,123,.2)] bg-white/55 px-6 py-12 text-center dark:border-[var(--border)] dark:bg-[rgba(17,24,39,.55)]">
          {isLoading && <DashboardLoader />}
          <span>Wallet analytics</span>
          <h2>Enter a wallet address or ENS name</h2>
          <p>Search an Ethereum address or .eth name to load its on-chain analytics.</p>
        </main>
      )}
    </div>
  )
}
