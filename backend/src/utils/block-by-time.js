export const LATEST_BLOCK = 99_999_999;

// Ethereum mainnet anchor (~Jan 1 2025 UTC, ~12s block time post-merge).
const ETH_REFERENCE_BLOCK = 21_547_000;
const ETH_REFERENCE_TIMESTAMP = 1_735_689_600;
const ETH_BLOCK_TIME_SECONDS = 12;

export function estimateBlockNumber(timestamp, chainId = "1") {
  const ts = Math.floor(Number(timestamp));
  if (!Number.isFinite(ts) || ts <= 0) return 0;

  if (chainId !== "1") {
    return Math.max(0, Math.floor(ts / ETH_BLOCK_TIME_SECONDS));
  }

  const delta = ts - ETH_REFERENCE_TIMESTAMP;
  return Math.max(0, ETH_REFERENCE_BLOCK + Math.floor(delta / ETH_BLOCK_TIME_SECONDS));
}

export function shouldUseLatestBlock(endDate) {
  return endDate.getTime() >= Date.now() - 86_400_000;
}
