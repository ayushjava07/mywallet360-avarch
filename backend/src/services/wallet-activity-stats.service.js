import {
  blockActionRequest,
  buildDailyAnalytics,
  buildDailyTransactionCounts,
} from "./blockaction.service.js";
import { fetchLifetimeTransactionBounds } from "./wallet-overview.service.js";

const PAGE_SIZE = 1000;
const LIFETIME_TX_MAX_PAGES = 20;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const activityStatsCache = new Map();

function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addCalendarDays(dateStr, days) {
  const next = parseDateStr(dateStr);
  next.setDate(next.getDate() + days);
  return formatDateKey(next);
}

export function formatDurationFromDays(totalDays) {
  const safeDays = Math.max(0, Math.floor(Number(totalDays) || 0));
  const years = Math.floor(safeDays / 365);
  const days = safeDays % 365;
  const parts = [];
  if (years > 0) parts.push(`${years} Year${years === 1 ? "" : "s"}`);
  if (days > 0 || years === 0) parts.push(`${days} Day${days === 1 ? "" : "s"}`);
  return {
    totalDays: safeDays,
    years,
    days,
    label: parts.join(" "),
  };
}

export function formatSinceLabel(isoDate) {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const day = date.getDate();
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const year = date.getFullYear();
  return `Since ${weekday} ${day}, ${month} ${year}`;
}

export function computeActiveAge(firstTransactionAt) {
  if (!firstTransactionAt) return null;
  const first = new Date(firstTransactionAt);
  if (Number.isNaN(first.getTime())) return null;
  const totalDays = Math.max(0, Math.floor((Date.now() - first.getTime()) / 86_400_000));
  return {
    ...formatDurationFromDays(totalDays),
    since: firstTransactionAt,
    sinceLabel: formatSinceLabel(firstTransactionAt),
  };
}

export function computeUniqueDaysActive(dailyCounts, firstTransactionAt) {
  const activeDates = Object.keys(dailyCounts || {}).filter((date) => dailyCounts[date] > 0);
  if (!activeDates.length) return null;

  activeDates.sort();
  const duration = formatDurationFromDays(activeDates.length);
  const since = firstTransactionAt || `${activeDates[0]}T00:00:00.000Z`;
  return {
    ...duration,
    count: activeDates.length,
    since,
    sinceLabel: formatSinceLabel(since),
  };
}

export function computeLongestStreak(dailyCounts) {
  const activeDates = Object.keys(dailyCounts || {})
    .filter((date) => dailyCounts[date] > 0)
    .sort();

  if (!activeDates.length) return null;

  let bestStart = activeDates[0];
  let bestLength = 1;
  let currentStart = activeDates[0];
  let currentLength = 1;

  for (let index = 1; index < activeDates.length; index += 1) {
    const expected = addCalendarDays(activeDates[index - 1], 1);
    if (activeDates[index] === expected) {
      currentLength += 1;
    } else {
      if (currentLength > bestLength) {
        bestLength = currentLength;
        bestStart = currentStart;
      }
      currentStart = activeDates[index];
      currentLength = 1;
    }
  }

  if (currentLength > bestLength) {
    bestLength = currentLength;
    bestStart = currentStart;
  }

  return {
    ...formatDurationFromDays(bestLength),
    since: `${bestStart}T00:00:00.000Z`,
    sinceLabel: formatSinceLabel(`${bestStart}T00:00:00.000Z`),
  };
}

export function buildActivityStats({
  dailyCounts,
  dailyAnalytics,
  firstTransactionAt,
  latestTransactionAt,
  transactionCount,
  transactionCountIsLowerBound = false,
  source = "computed",
}) {
  const activeAge = computeActiveAge(firstTransactionAt);
  const uniqueDaysActive = computeUniqueDaysActive(dailyCounts, firstTransactionAt);
  const longestStreak = computeLongestStreak(dailyCounts);

  return {
    source,
    transactionCount: {
      value: transactionCount,
      isLowerBound: transactionCountIsLowerBound,
      since: firstTransactionAt,
      sinceLabel: formatSinceLabel(firstTransactionAt),
    },
    activeAge,
    uniqueDaysActive,
    longestStreak,
    firstTransactionAt,
    latestTransactionAt,
    dailyCounts: dailyCounts || {},
    dailyAnalytics: dailyAnalytics || [],
  };
}

async function tryEtherscanProActivityStats(address) {
  const candidates = [
    { module: "account", action: "addressactivity", address },
    { module: "account", action: "activity", address },
    { module: "account", action: "addressinfo", address },
  ];

  for (const params of candidates) {
    try {
      const result = await blockActionRequest(params);
      if (!result || typeof result !== "object") continue;

      const count = Number(
        result.transactionCount
        ?? result.txCount
        ?? result.totalTx
        ?? result.transactions
        ?? 0,
      );
      const first = result.firstTransactionDate || result.firstTxDate || result.firstTransactionAt;
      const latest = result.lastTransactionDate || result.lastTxDate || result.latestTransactionAt;
      const dailyCounts = result.dailyTransactionCounts || result.dailyTxMap || null;

      if (count > 0 || first || dailyCounts) {
        return buildActivityStats({
          dailyCounts: dailyCounts || {},
          firstTransactionAt: first,
          latestTransactionAt: latest,
          transactionCount: count,
          transactionCountIsLowerBound: false,
          source: "etherscan",
        });
      }
    } catch {
      // Optional Pro-only endpoints are expected to fail on standard plans.
    }
  }

  return null;
}

async function fetchTxPages(address, { maxPages, sort }) {
  const records = [];
  let complete = false;

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await blockActionRequest({
      module: "account",
      action: "txlist",
      address,
      page,
      offset: PAGE_SIZE,
      sort,
      startblock: 0,
      endblock: 99999999,
    });

    records.push(...result);

    if (result.length < PAGE_SIZE) {
      complete = true;
      break;
    }
  }

  return { records, complete, count: records.length };
}

async function fetchComputedActivityStats(address) {
  const [bounds, txPages] = await Promise.all([
    fetchLifetimeTransactionBounds(address),
    fetchTxPages(address, { maxPages: LIFETIME_TX_MAX_PAGES, sort: "desc" }),
  ]);

  const dailyCounts = buildDailyTransactionCounts(txPages.records);
  const dailyAnalytics = buildDailyAnalytics(address, {
    normalTransactions: txPages.records,
  });

  return buildActivityStats({
    dailyCounts,
    dailyAnalytics,
    firstTransactionAt: bounds.firstTransactionAt,
    latestTransactionAt: bounds.latestTransactionAt,
    transactionCount: txPages.count,
    transactionCountIsLowerBound: !txPages.complete,
    source: txPages.complete ? "computed" : "computed_partial",
  });
}

export async function fetchWalletActivityStats(address) {
  const normalizedAddress = address.toLowerCase();
  const cached = activityStatsCache.get(normalizedAddress);
  if (cached?.expiresAt > Date.now()) {
    return cached.value;
  }

  const proStats = await tryEtherscanProActivityStats(normalizedAddress);
  const stats = proStats || await fetchComputedActivityStats(normalizedAddress);

  activityStatsCache.set(normalizedAddress, {
    value: stats,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return stats;
}

export function clearActivityStatsCache() {
  activityStatsCache.clear();
}
