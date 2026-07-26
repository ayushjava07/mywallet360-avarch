import { useState } from 'react'
import { CalendarDays, ChevronDown, Check } from 'lucide-react'

export function AnalysisPeriodBar({
  periods,
  selectedDays,
  customRange,
  pendingDays,
  isLoading,
  onPeriodChange,
  scopeHint,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customFrom, setCustomFrom] = useState(customRange?.from || '')
  const [customTo, setCustomTo] = useState(customRange?.to || '')

  const visiblePeriod = periods.find((p) => p.value === (pendingDays || selectedDays))

  const selectPeriod = (days, range) => {
    setIsOpen(false)
    setCustomMode(false)
    onPeriodChange(days, range)
  }

  const handleCustomApply = () => {
    if (customFrom && customTo) selectPeriod('custom', { from: customFrom, to: customTo })
  }

  return (
    <div className="analysis-period-bar">
      {scopeHint && (
        <p className="analysis-period-scope">{scopeHint}</p>
      )}
      <div className="dashboard-bar-periods">
        {periods.filter((p) => p.value !== 'custom').map((period) => (
          <button
            className={`dashboard-bar-pill${selectedDays === period.value ? ' dashboard-bar-pill--active' : ''}`}
            key={period.id}
            disabled={isLoading}
            onClick={() => selectPeriod(period.value)}
          >
            {period.shortLabel}
          </button>
        ))}
        <div className="dashboard-bar-custom-wrap">
          <button
            className={`dashboard-bar-pill dashboard-bar-pill--custom${selectedDays === 'custom' ? ' dashboard-bar-pill--active' : ''}`}
            disabled={isLoading}
            onClick={() => setIsOpen(!isOpen)}
          >
            <CalendarDays size={12} />
            {selectedDays === 'custom' ? visiblePeriod?.label : 'Custom'}
            <ChevronDown size={10} className={`dashboard-bar-chevron${isOpen ? ' dashboard-bar-chevron--open' : ''}`} />
          </button>
          {isOpen && (
            <div className="dashboard-bar-dropdown">
              {customMode ? (
                <div className="dashboard-bar-custom-form">
                  <label>
                    <span>From</span>
                    <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                  </label>
                  <label>
                    <span>To</span>
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                  </label>
                  <div className="dashboard-bar-custom-actions">
                    <button onClick={() => { setCustomMode(false) }}>Cancel</button>
                    <button className="dashboard-bar-custom-apply" disabled={!customFrom || !customTo} onClick={handleCustomApply}>Apply</button>
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    className={`dashboard-bar-dropdown-item${selectedDays === 'custom' ? ' dashboard-bar-dropdown-item--active' : ''}`}
                    onClick={() => setCustomMode(true)}
                  >
                    <span className="dashboard-bar-dropdown-short">✱</span>
                    <div>
                      <strong>Custom Range</strong>
                      <small>Choose specific dates</small>
                    </div>
                    {selectedDays === 'custom' && <Check size={14} />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
