import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, ChevronDown, Copy, ExternalLink, Share2, X } from 'lucide-react'
import { Icon } from '../common/Icon'

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function compactAddress(addr) {
  if (!addr || addr.length < 12) return addr || '—'
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function txTypeLabel(tx) {
  const type = tx.displayTitle?.toLowerCase() || ''
  if (type.includes('receive')) return { icon: '99_875.svg', prefix: 'Received', tone: 'green' }
  if (type.includes('send')) return { icon: '99_740.svg', prefix: 'Sent', tone: 'red' }
  if (type.includes('swap') || type.includes('trade')) return { icon: '99_917.svg', prefix: 'Swapped', tone: 'blue' }
  if (type.includes('nft')) return { icon: '99_896.svg', prefix: 'NFT', tone: 'mint' }
  if (type.includes('approve')) return { icon: '99_938.svg', prefix: 'Approved', tone: 'orange' }
  if (type.includes('contract')) return { icon: '99_938.svg', prefix: 'Contract', tone: 'orange' }
  if (type.includes('stake') || type.includes('stake')) return { icon: '99_959.svg', prefix: 'Staked', tone: 'blue' }
  return { icon: '99_938.svg', prefix: tx.displayTitle || 'Transaction', tone: 'mint' }
}

function buildHumanExplanation(tx) {
  const info = txTypeLabel(tx)
  const prefix = info.prefix.toLowerCase()
  const amount = tx.amount?.replace(/^[+-]/, '') || ''
  const symbol = tx.crypto || 'ETH'

  if (prefix === 'received') return `Someone sent ${amount} ${symbol} to your wallet.`
  if (prefix === 'sent') return `You transferred ${amount} ${symbol} to another wallet.`
  if (prefix === 'swapped') return `You swapped ${amount} ${symbol} on a decentralized exchange.`
  if (prefix === 'nft') return `An NFT transaction was processed in your wallet.`
  if (prefix === 'approved') return `You approved a smart contract to spend your ${symbol}.`
  if (prefix === 'contract') return `Your wallet interacted with a smart contract on the Ethereum network.`
  if (prefix === 'staked') return `You staked ${amount} ${symbol} to earn rewards.`
  return `${tx.displayTitle || 'A transaction'} was processed on the Ethereum network.`
}

export function TransactionModal({ tx, onClose, onNoteSave }) {
  const panelRef = useRef(null)
  const startY = useRef(0)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [copiedHash, setCopiedHash] = useState(false)
  const [copiedFrom, setCopiedFrom] = useState(false)
  const [copiedTo, setCopiedTo] = useState(false)
  const [noteInput, setNoteInput] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('mywallet360_tx_notes') || '{}')
      return saved[tx.title] || ''
    } catch {
      return ''
    }
  })
  const [isSaved, setIsSaved] = useState(false)

  const PRESET_TAGS = ['Salary', 'Airdrop', 'Bridge', 'Swap', 'Payroll', 'Investment', 'Donation', 'Gift', 'Gas Refund', 'Friend', 'Expense']

  const handleSaveNote = (newNote) => {
    try {
      const saved = JSON.parse(localStorage.getItem('mywallet360_tx_notes') || '{}')
      const val = newNote.trim()
      if (val) {
        saved[tx.title] = val
      } else {
        delete saved[tx.title]
      }
      localStorage.setItem('mywallet360_tx_notes', JSON.stringify(saved))
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
      if (onNoteSave) {
        onNoteSave(tx.title, val)
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const copyToClipboard = async (text, setter) => {
    try {
      await navigator.clipboard.writeText(text)
      setter(true)
      setTimeout(() => setter(false), 1500)
    } catch { /* silent fail */ }
  }

  const etherscanUrl = `https://etherscan.io/tx/${tx.title}`
  const info = txTypeLabel(tx)
  const isContract = tx.amount === 'Contract'
  const amountNum = isContract ? null : tx.amount?.replace(/^[+-]/, '') || null
  const isIncoming = tx.positive

  const handlePointerDown = (e) => { startY.current = e.clientY }
  const handlePointerUp = (e) => {
    if (startY.current - e.clientY > 80) onClose()
  }

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return createPortal(
    <div className="tx-modal-overlay" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onClick={handleBackdrop}>
      <div className={`tx-modal tx-modal--${tx.tone}`} ref={panelRef} role="dialog" aria-modal="true" aria-label={`Transaction details: ${tx.displayTitle}`}>
        <button className="tx-modal__close" type="button" onClick={onClose} aria-label="Close transaction details">
          <X aria-hidden="true" />
        </button>

        <div className="tx-modal__header">
          <span className={`tx-modal__icon tx-modal__icon--${info.tone}`}>
            <Icon name={info.icon} alt="" />
          </span>
          <div className="tx-modal__header-text">
            <div className="tx-modal__title-row">
              <h2>{isContract ? tx.displayTitle : `${info.prefix} ${amountNum || ''} ${isContract ? '' : tx.crypto}`}</h2>
              <span className={`tx-modal__badge tx-modal__badge--success`}>Success</span>
            </div>
            <span className="tx-modal__time">{tx.meta}</span>
          </div>
        </div>

        {!isContract && (
          <div className="tx-modal__amount">
            <strong className={isIncoming ? 'text-emerald-500' : 'text-rose-500'}>{tx.amount}</strong>
            <span>{tx.crypto}</span>
          </div>
        )}

        <div className="tx-modal__summary">
          {!isContract && (
            <div className="tx-modal__summary-item">
              <span>Amount</span>
              <strong>{tx.amount} {tx.crypto}</strong>
            </div>
          )}
          <div className="tx-modal__summary-item">
            <span>Date &amp; Time</span>
            <strong>{formatDate(tx.timestamp)}</strong>
          </div>
          <div className="tx-modal__summary-item">
            <span>Network</span>
            <strong>{tx.chain}</strong>
          </div>
        </div>

        <div className="tx-modal__section">
          <h3>Transaction Overview</h3>
          <div className="tx-modal__grid">
            <div className="tx-modal__grid-item">
              <span>From</span>
              <div className="tx-modal__addr">
                <code>{compactAddress(tx.from)}</code>
                <button type="button" onClick={() => copyToClipboard(tx.from, setCopiedFrom)} aria-label="Copy from address">
                  {copiedFrom ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                </button>
              </div>
            </div>
            <div className="tx-modal__grid-item">
              <span>To</span>
              <div className="tx-modal__addr">
                <code>{compactAddress(tx.to)}</code>
                <button type="button" onClick={() => copyToClipboard(tx.to, setCopiedTo)} aria-label="Copy to address">
                  {copiedTo ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                </button>
              </div>
            </div>
            {!isContract && (
              <div className="tx-modal__grid-item">
                <span>Asset</span>
                <strong>{tx.crypto}</strong>
              </div>
            )}
            <div className="tx-modal__grid-item">
              <span>Transaction Type</span>
              <strong>{tx.displayTitle}</strong>
            </div>
          </div>
        </div>

        <div className="tx-modal__section tx-modal__notes">
          <h3>Private Notes &amp; Tags</h3>
          <div className="tx-modal__note-input-container">
            <input
              type="text"
              className="tx-modal__note-input"
              placeholder="Add a private note (e.g. salary, donation...)"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
            />
            <button
              type="button"
              className="tx-modal__note-save-btn"
              onClick={() => handleSaveNote(noteInput)}
            >
              {isSaved ? 'Saved ✔' : 'Save'}
            </button>
          </div>            <div className="tx-modal__presets flex flex-wrap gap-1.5">
              {PRESET_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`tx-modal__preset-chip ${noteInput === tag ? 'active' : ''}`}
                  onClick={() => {
                    setNoteInput(tag)
                    handleSaveNote(tag)
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
        </div>

        <div className="tx-modal__section tx-modal__explanation">
          <h3>What happened?</h3>
          <p>{buildHumanExplanation(tx)}</p>
        </div>

        <details className="tx-modal__advanced" onToggle={(e) => setShowAdvanced(e.currentTarget.open)}>
          <summary>
            <span>Advanced Details</span>
            <ChevronDown className={`size-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </summary>
          <div className="tx-modal__advanced-content">
            <div className="tx-modal__grid-item">
              <span>Transaction Hash</span>
              <code className="tx-modal__hash">{tx.title}</code>
            </div>
            <div className="tx-modal__grid-item">
              <span>From (raw)</span>
              <code className="tx-modal__hash">{tx.from}</code>
            </div>
            <div className="tx-modal__grid-item">
              <span>To (raw)</span>
              <code className="tx-modal__hash">{tx.to}</code>
            </div>
          </div>
        </details>

        <div className="tx-modal__actions">
          <button type="button" onClick={() => copyToClipboard(tx.title, setCopiedHash)}>
            {copiedHash ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copiedHash ? 'Copied!' : 'Copy Hash'}
          </button>
          <a href={etherscanUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-3.5" />
            Etherscan
            <ArrowUpRight className="size-3" />
          </a>
          <button type="button" onClick={() => { try { navigator.share?.({ title: 'Transaction', text: `${tx.displayTitle}: ${tx.amount || ''} ${tx.crypto || ''}`, url: etherscanUrl }).catch(() => {}) } catch { /* silent */ } }}>
            <Share2 className="size-3.5" />
            Share
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
