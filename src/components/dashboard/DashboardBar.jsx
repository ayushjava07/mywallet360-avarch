import { DollarSign, Coins } from 'lucide-react'

export function DashboardBar({ displayMode, onDisplayModeChange }) {
  return (
    <div className="dashboard-bar dashboard-bar--display-only">
      <div className="dashboard-bar-display">
        <button
          className={`dashboard-bar-toggle${displayMode === 'usd' ? ' dashboard-bar-toggle--active' : ''}`}
          onClick={() => onDisplayModeChange('usd')}
          title="Show in USD"
        >
          <DollarSign size={12} />
        </button>
        <button
          className={`dashboard-bar-toggle${displayMode === 'tokens' ? ' dashboard-bar-toggle--active' : ''}`}
          onClick={() => onDisplayModeChange('tokens')}
          title="Show in Tokens"
        >
          <Coins size={12} />
        </button>
      </div>
    </div>
  )
}
