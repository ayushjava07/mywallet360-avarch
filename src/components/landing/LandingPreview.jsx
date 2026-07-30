import { Info, Search } from 'lucide-react'
import { MaterialIcon } from '../common/MaterialIcon'

const FEATURES = [
  {
    icon: 'account_balance_wallet',
    title: 'Wallet Overview',
    desc: 'Net worth, ETH balance, wallet age, and lifetime activity stats in one card.',
  },
  {
    icon: 'monitoring',
    title: 'Transaction Analytics',
    desc: 'Area, bar, and combo charts by tab — fees, transfers, tokens with clickable legends.',
  },
  {
    icon: 'receipt_long',
    title: 'Full Transaction Table',
    desc: 'Paginated explorer for normal, internal, token, and NFT transfers.',
  },
  {
    icon: 'help',
    title: 'Plain-English Tooltips',
    desc: 'Hover or tap any confusing term — Transfer*, IN/OUT, fees, ENS — explained simply.',
  },
  {
    icon: 'compare_arrows',
    title: 'Money Flow',
    desc: 'See what came in vs went out, with period filters and category breakdown.',
  },
  {
    icon: 'pie_chart',
    title: 'Portfolio & Holdings',
    desc: 'Token breakdown, allocation donut, and valuation history chart.',
  },
  {
    icon: 'insights',
    title: 'Wallet Insights',
    desc: 'Personality traits, health score, and AI-style summaries of on-chain behavior.',
  },
  {
    icon: 'verified',
    title: 'No Extra APIs',
    desc: 'Built on BlockAction data you already fetch — no Etherscan Pro required.',
  },
]

export function LandingPreview({ exampleWallets = [], onSelectExample, isLoading }) {
  return (
    <main className="landing-preview">
      <section className="landing-hero">
        <span className="landing-hero__eyebrow">Understands every txn</span>
        <h1>Ethereum wallet analytics,<br />explained in plain English</h1>
        <p>
          Search any address or ENS name to see portfolio value, activity heatmaps,
          transaction charts, and a full paginated history — with tooltips that
          decode on-chain jargon for you.
        </p>
        <div className="landing-hero__actions">
          <span className="landing-hero__hint">
            <Search size={14} strokeWidth={2} aria-hidden="true" />
            Use the search bar above, or try an example ↗
          </span>
        </div>
      </section>

      <section className="landing-features" aria-label="Product features">
        <div className="landing-features__head">
          <span className="landing-features__eyebrow">What you get</span>
          <h2>Everything Etherscan shows — plus explanations</h2>
          <p>Four tabs, one search. Data from BlockAction, design in light teal.</p>
        </div>
        <div className="landing-features__grid">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="landing-feature card">
              <span className="landing-feature__icon" aria-hidden="true">
                <MaterialIcon icon={feature.icon} />
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {exampleWallets.length > 0 && (
        <section className="landing-cta card">
          <div className="landing-cta__copy">
            <span className="landing-cta__icon" aria-hidden="true">
              <MaterialIcon icon="account_balance_wallet" />
            </span>
            <div>
              <strong>Try it with a real wallet</strong>
              <p>Load vitalik.eth or paste any 0x address — no wallet connection needed.</p>
            </div>
          </div>
          <div className="landing-cta__buttons">
            {exampleWallets.slice(0, 2).map((wallet) => (
              <button
                key={wallet.identifier}
                type="button"
                className="landing-cta__btn"
                disabled={isLoading}
                onClick={() => onSelectExample?.(wallet.identifier)}
              >
                {wallet.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <p className="landing-footnote">
        <Info size={13} strokeWidth={2} aria-hidden="true" />
        Search a wallet above for live on-chain data — no wallet connection required.
      </p>
    </main>
  )
}
