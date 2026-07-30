import { MaterialIcon } from '../common/MaterialIcon'
import { buildInsightTiles } from './portfolio.utils'

function InsightTile({ tile }) {
  return (
    <article className={`holdings-insight-card holdings-insight-card--${tile.tone}`}>
      <span className="holdings-insight-icon" aria-hidden="true">
        <MaterialIcon icon={tile.icon} className="text-base" />
      </span>
      <span className="holdings-insight-label">{tile.label}</span>
      <strong className="holdings-insight-value">{tile.value}</strong>
      {tile.detail && (
        <small className="col-span-2 text-[9px] text-[var(--muted)] pl-[44px] -mt-1">{tile.detail}</small>
      )}
    </article>
  )
}

export function PortfolioInsights({ wallet, holdings, valuationHistory }) {
  const tiles = buildInsightTiles(wallet, holdings, valuationHistory)

  return (
    <div className="holdings-insights">
      {tiles.map((tile) => (
        <InsightTile key={tile.id} tile={tile} />
      ))}
    </div>
  )
}
