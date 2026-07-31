const DEFAULT_TIMEOUT_MS = 90_000

export async function apiFetch(path, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal
  let timedOut = false
  const timeout = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    return await fetch(path, {
      ...options,
      signal,
      headers: {
        Accept: 'application/json',
        ...options.headers,
      },
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      if (timedOut) {
        throw new Error('The request took too long. Please try again.')
      }
      throw error
    }

    throw new Error('The service is unavailable right now. Please try again.')
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
