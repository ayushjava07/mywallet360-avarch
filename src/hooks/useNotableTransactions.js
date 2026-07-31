import { useEffect, useState } from 'react'
import { mapTableRowToActivityItem } from '../components/dashboard/notableActivity.utils'
import { walletService } from '../services/walletService'

export function useNotableTransactions({
  walletAddress,
  analysisDays,
  customRange,
  sort = 'age',
  order = 'desc',
  hideLowValue = true,
  limit = 5,
  enabled = true,
}) {
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    if (!walletAddress || !enabled) {
      setItems([])
      setIsLoading(false)
      setError('')
      setHasMore(false)
      return undefined
    }

    const controller = new AbortController()
    let active = true

    ;(async () => {
      setIsLoading(true)
      setError('')

      try {
        const payload = await walletService.getWalletTransactions(walletAddress, {
          type: 'normal',
          page: 1,
          limit,
          analysisDays,
          customRange,
          sort,
          order,
          hideLowValue,
          signal: controller.signal,
        })

        if (!active) return

        setItems((payload.rows || []).map(mapTableRowToActivityItem))
        setHasMore(Boolean(payload.hasMore))
      } catch (requestError) {
        if (!active || controller.signal.aborted || requestError.name === 'AbortError') return
        setItems([])
        setHasMore(false)
        setError(requestError.message || 'Unable to load transactions.')
      } finally {
        if (active) setIsLoading(false)
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [walletAddress, analysisDays, customRange, sort, order, hideLowValue, limit, enabled])

  return { items, isLoading, error, hasMore }
}
