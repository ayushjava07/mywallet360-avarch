import { createPortal, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'

const OPEN_EVENT = 'context-tooltip:open'
const GAP = 8
const MAX_WIDTH = 280

function pickPlacement(triggerRect, vw, vh, contentLength = 80) {
  const panelWidth = Math.min(MAX_WIDTH, vw - 24)
  const estimatedHeight = Math.min(120, 36 + Math.ceil(contentLength / 42) * 18)

  const fitsBelow = vh - triggerRect.bottom - GAP >= estimatedHeight
  const fitsAbove = triggerRect.top - GAP >= estimatedHeight

  let placement = 'below'
  let top = triggerRect.bottom + GAP

  if (!fitsBelow && fitsAbove) {
    placement = 'above'
    top = triggerRect.top - GAP - estimatedHeight
  } else if (!fitsBelow) {
    top = Math.min(triggerRect.bottom + GAP, vh - estimatedHeight - 12)
  }

  let left = triggerRect.left + triggerRect.width / 2 - panelWidth / 2
  left = Math.max(12, Math.min(left, vw - panelWidth - 12))

  return {
    left,
    top,
    width: panelWidth,
    placement,
    arrowX: triggerRect.left + triggerRect.width / 2 - left,
  }
}

export function ContextTooltip({
  content,
  children,
  showInfoIcon = true,
  mode = 'explain',
  className = '',
  disabled = false,
}) {
  const tooltipId = useId()
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const wrapRef = useRef(null)
  const iconRef = useRef(null)
  const panelRef = useRef(null)
  const hoverTimer = useRef(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const [pinned, setPinned] = useState(false)

  const close = useCallback(() => {
    setOpen(false)
    setPosition(null)
    setPinned(false)
  }, [])

  const openAt = useCallback((target) => {
    if (!content || disabled || !target) return

    const mobile = window.matchMedia('(max-width: 700px)').matches
    if (mobile) {
      setPosition({ mode: 'sheet', placement: 'bottom' })
      setOpen(true)
      setPinned(true)
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: tooltipId }))
      return
    }

    const rect = target.getBoundingClientRect()
    setPosition({
      ...pickPlacement(rect, window.innerWidth, window.innerHeight, content.length),
      mode: 'popover',
    })
    setOpen(true)
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: tooltipId }))
  }, [content, disabled, tooltipId])

  const scheduleOpen = useCallback((target) => {
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => openAt(target), 120)
  }, [openAt])

  const scheduleClose = useCallback(() => {
    window.clearTimeout(hoverTimer.current)
    if (pinned) return
    hoverTimer.current = window.setTimeout(close, 80)
  }, [close, pinned])

  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])

  useEffect(() => {
    const closeOther = (event) => {
      if (event.detail !== tooltipId) close()
    }
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) {
        close()
      }
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') close()
    }

    window.addEventListener(OPEN_EVENT, closeOther)
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)

    return () => {
      window.removeEventListener(OPEN_EVENT, closeOther)
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [close, tooltipId])

  if (!content || disabled) {
    return <span className={className}>{children}</span>
  }

  const togglePinned = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (open && pinned) {
      close()
      return
    }
    openAt(iconRef.current || triggerRef.current)
    setPinned(true)
  }

  const stopRowClick = (event) => {
    event.stopPropagation()
  }

  return (
    <span
      className={`context-tooltip ${className}`.trim()}
      ref={rootRef}
      onClick={stopRowClick}
      onKeyDown={stopRowClick}
    >
      {mode === 'value' ? (
        <span
          className="context-tooltip__trigger context-tooltip__trigger--value"
          ref={triggerRef}
          tabIndex={0}
          aria-describedby={open ? tooltipId : undefined}
          onMouseEnter={() => scheduleOpen(triggerRef.current)}
          onMouseLeave={scheduleClose}
          onFocus={() => openAt(triggerRef.current)}
          onBlur={scheduleClose}
          onClick={(event) => {
            event.stopPropagation()
            if (open && pinned) close()
            else {
              openAt(triggerRef.current)
              setPinned(true)
            }
          }}
        >
          {children}
        </span>
      ) : (
        <span
          className="context-tooltip__wrap"
          ref={wrapRef}
          onMouseEnter={() => scheduleOpen(wrapRef.current)}
          onMouseLeave={scheduleClose}
        >
          <span className="context-tooltip__label">{children}</span>
          {showInfoIcon && (
            <button
              type="button"
              className="context-tooltip__icon"
              ref={iconRef}
              aria-label="Explain this term"
              aria-expanded={open}
              aria-controls={tooltipId}
              onClick={togglePinned}
            >
              <Info size={12} aria-hidden="true" />
            </button>
          )}
        </span>
      )}

      {open && createPortal(
        <>
          {position?.mode === 'sheet' && (
            <button type="button" className="context-tooltip__backdrop" aria-label="Close tooltip" onClick={close} />
          )}
          <div
            id={tooltipId}
            ref={panelRef}
            role="tooltip"
            className={`context-tooltip__panel context-tooltip__panel--${position?.placement || 'below'} context-tooltip__panel--${position?.mode || 'popover'}${mode === 'value' ? ' context-tooltip__panel--value' : ''}`}
            style={position?.mode === 'popover' ? {
              left: position.left,
              top: position.top,
              width: position.width,
              '--arrow-x': `${position.arrowX}px`,
            } : undefined}
            onMouseEnter={() => window.clearTimeout(hoverTimer.current)}
            onMouseLeave={scheduleClose}
          >
            <p>{content}</p>
          </div>
        </>,
        document.body,
      )}
    </span>
  )
}
