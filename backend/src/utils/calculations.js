export const WEI_PER_ETH = 1e18;

export function round(value, decimals = 4) {
  return Number(Number(value || 0).toFixed(decimals));
}

export function fromWei(value) {
  return Number(value || 0) / WEI_PER_ETH;
}

export function tokenAmount(value, decimals) {
  return Number(value || 0) / 10 ** Number(decimals || 0);
}

export function percentage(part, total) {
  return total > 0 ? round((part / total) * 100, 2) : 0;
}

export function normalizePercentages(scores) {
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);

  if (!total) {
    return Object.fromEntries(Object.keys(scores).map((key) => [key, 0]));
  }

  const entries = Object.entries(scores);
  const normalized = entries.map(([key, score]) => [key, Math.round((score / total) * 100)]);
  const assigned = normalized.reduce((sum, [, score]) => sum + score, 0);
  normalized[0][1] += 100 - assigned;

  return Object.fromEntries(normalized);
}

/**
 * Safely extract the USD value from any asset object, supporting multiple
 * common field name conventions without breaking existing code.
 *
 * Supported field names (checked in order):
 *   value_usd, usdValue, usd_value, usd, value (if numeric and > 0)
 * Falls back to priceUsd * balance if both are available.
 *
 * @param {object} asset - An asset object with optional price/value fields.
 * @returns {number} The USD value, or 0 if it cannot be determined.
 */
export function getUsdValue(asset) {
  if (!asset || typeof asset !== 'object') return 0;

  if (typeof asset.value_usd === 'number' && asset.value_usd > 0) return asset.value_usd;
  if (typeof asset.usdValue === 'number' && asset.usdValue > 0) return asset.usdValue;
  if (typeof asset.usd_value === 'number' && asset.usd_value > 0) return asset.usd_value;
  if (typeof asset.usd === 'number' && asset.usd > 0) return asset.usd;
  if (typeof asset.value === 'number' && asset.value > 0) return asset.value;
  
  const price = Number(asset.priceUsd ?? asset.price ?? 0);
  const balance = Number(asset.balance ?? asset.rawBalance ?? 0);
  if (price > 0 && balance > 0) return price * balance;

  return 0;
}

export function getWalletAge(oldestTimestamp) {
  if (!oldestTimestamp) {
    return { days: 0, years: 0, firstTransactionAt: null };
  }

  const firstTransactionAt = new Date(Number(oldestTimestamp) * 1000);
  const days = Math.max(0, Math.floor((Date.now() - firstTransactionAt.getTime()) / 86_400_000));

  return {
    days,
    years: round(days / 365.25, 1),
    firstTransactionAt: firstTransactionAt.toISOString(),
  };
}
