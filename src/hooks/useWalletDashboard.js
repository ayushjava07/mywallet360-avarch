import { useCallback, useEffect, useRef, useState } from 'react'
import { walletService } from '../services/walletService'
import { resolveWalletIdentifier } from '../utils/resolveWalletIdentifier'

export function useWalletDashboard() {
  const [analysisDays, setAnalysisDays] = useState('ytd')
  const [customRange, setCustomRange] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [searchValue, setSearchValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isPeriodLoading, setIsPeriodLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pendingAnalysisDays, setPendingAnalysisDays] = useState(null)
  const [isResolving, setIsResolving] = useState(false)
  const [resolvedIdentifier, setResolvedIdentifier] = useState(null)
  const [error, setError] = useState('')
  const [connectedAddress, setConnectedAddress] = useState('')
  const [connectedProvider, setConnectedProvider] = useState(null)
  const [walletProviders, setWalletProviders] = useState([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const isLoadingRef = useRef(false)

  const analyzeWallet = useCallback(async (identifier, days = analysisDays, options = {}) => {
    if (isLoadingRef.current) return

    const periodChange = options.periodChange === true
    const range = options.customRange || null
    isLoadingRef.current = true
    if (periodChange) {
      setIsPeriodLoading(true)
    } else {
      setIsResolving(true)
    }
    setError('')

    try {
      const resolution = periodChange
        ? { address: identifier, type: 'address', originalInput: identifier }
        : await resolveWalletIdentifier(identifier)
      if (!periodChange) setResolvedIdentifier(resolution)
      setIsResolving(false)
      if (!periodChange) setIsLoading(true)

      const nextWallet = await walletService.getWalletByAddress(resolution.address, days, range)
      setWallet(nextWallet)
      setAnalysisDays(days)
      setCustomRange(range)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      isLoadingRef.current = false
      setIsResolving(false)
      setIsLoading(false)
      setIsPeriodLoading(false)
      setPendingAnalysisDays(null)
    }
  }, [analysisDays])

  const searchWallet = () => analyzeWallet(searchValue)
  const updateSearchValue = (value) => {
    setSearchValue(value)
    setError('')
    setResolvedIdentifier(null)
  }
  const selectExampleWallet = (identifier) => {
    setSearchValue(identifier)
    analyzeWallet(identifier)
  }
  const selectAnalysisPeriod = (days, range = null) => {
    if (!wallet || isLoadingRef.current) return

    setPendingAnalysisDays(days)
    analyzeWallet(wallet.id, days, { periodChange: true, customRange: range })
  }

  const refreshWallet = useCallback(async () => {
    if (!wallet || isLoadingRef.current) return

    isLoadingRef.current = true
    setIsRefreshing(true)
    setError('')

    try {
      const nextWallet = await walletService.getWalletByAddress(wallet.id, analysisDays, customRange)
      setWallet(nextWallet)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      isLoadingRef.current = false
      setIsRefreshing(false)
    }
  }, [wallet, analysisDays, customRange])

  useEffect(() => {
    const addProvider = (provider, info = {}) => {
      if (!provider) return

      setWalletProviders((currentProviders) => {
        if (currentProviders.some((item) => item.provider === provider)) return currentProviders

        return [...currentProviders, {
          provider,
          name: info.name || (provider.isMetaMask ? 'MetaMask' : 'Browser Wallet'),
          icon: info.icon || '',
          rdns: info.rdns || '',
        }]
      })
    }

    const handleProviderAnnouncement = (event) => {
      addProvider(event.detail.provider, event.detail.info)
    }

    window.addEventListener('eip6963:announceProvider', handleProviderAnnouncement)
    window.dispatchEvent(new Event('eip6963:requestProvider'))

    const injectedProviders = window.ethereum?.providers || (window.ethereum ? [window.ethereum] : [])
    injectedProviders.forEach((provider) => addProvider(provider))

    return () => window.removeEventListener('eip6963:announceProvider', handleProviderAnnouncement)
  }, [])

  useEffect(() => {
    if (!connectedProvider?.on) return undefined

    const handleAccountsChanged = (accounts) => {
      const nextAddress = accounts[0] || ''
      setConnectedAddress(nextAddress)

      if (nextAddress) {
        setSearchValue(nextAddress)
        analyzeWallet(nextAddress)
      } else {
        setConnectedProvider(null)
      }
    }

    connectedProvider.on('accountsChanged', handleAccountsChanged)
    return () => connectedProvider.removeListener?.('accountsChanged', handleAccountsChanged)
  }, [analyzeWallet, connectedProvider])

  useEffect(() => {
    if (!wallet?.id || wallet.portfolioInventory?.status !== 'pending') return undefined

    let cancelled = false
    let attempts = 0
    let timerId

    const pollInventory = async () => {
      attempts += 1

      try {
        const inventory = await walletService.getPortfolioInventory(wallet.id)
        if (cancelled) return

        setWallet((currentWallet) => {
          if (!currentWallet || currentWallet.id !== wallet.id) return currentWallet
          return {
            ...currentWallet,
            portfolioInventory: {
              ...inventory,
              analyzedAssetCount: currentWallet.assetCount,
            },
          }
        })

        if (inventory.status !== 'pending' || attempts >= 8) return
      } catch {
        if (attempts >= 8) return
      }

      timerId = window.setTimeout(pollInventory, 7_000)
    }

    timerId = window.setTimeout(pollInventory, 7_000)
    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [wallet?.id, wallet?.portfolioInventory?.status])

  const connectWallet = async (walletProvider) => {
    setIsConnecting(true)
    setConnectionError('')

    try {
      const provider = walletProvider.provider

      try {
        await provider.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        })
      } catch (permissionError) {
        const isUnsupported = permissionError.code === -32601 || permissionError.code === 4200

        if (!isUnsupported) throw permissionError
      }

      const accounts = await provider.request({ method: 'eth_requestAccounts' })
      const address = accounts[0]

      if (!address) throw new Error('No wallet account was selected.')

      setConnectedProvider(provider)
      setConnectedAddress(address)
      setSearchValue(address)
      await analyzeWallet(address)
    } catch (requestError) {
      let message = requestError.message || 'Unable to connect wallet.'

      if (requestError.code === 4001) {
        message = 'Connection permission was rejected.'
      } else if (requestError.code === -32002) {
        message = 'A wallet permission request is already open. Check your wallet extension.'
      }

      setConnectionError(message)
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnectWallet = () => {
    setConnectedAddress('')
    setConnectedProvider(null)
    setConnectionError('')
  }

  return {
    error,
    wallet,
    searchValue,
    isLoading,
    isPeriodLoading,
    isRefreshing,
    pendingAnalysisDays,
    isResolving,
    analysisDays,
    customRange,
    resolvedIdentifier,
    setSearchValue: updateSearchValue,
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
  }
}
