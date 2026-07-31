import { blockActionRequest, getBlockByTimestamp } from "./blockaction.service.js";
import { LATEST_BLOCK, shouldUseLatestBlock } from "../utils/block-by-time.js";
import { fromWei, round, tokenAmount } from "../utils/calculations.js";
import {
  getMethodDisplayLabel,
  isContractTriggeredTransfer,
  resolveTransactionMethod,
} from "../utils/transaction-method.js";

const CHAIN_ID = process.env.BLOCKACTION_CHAIN_ID || "1";
const DUST_ETH = 0.0001;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_FILL_PAGES = 4;
const PREVIEW_FILL_PAGES = 6;
const PREVIEW_UPSTREAM_BATCH = 100;
const TX_TABLE_CACHE_TTL_MS = 45_000;
const PERIOD_WINDOW_CACHE_TTL_MS = 5 * 60_000;

const txTableCache = new Map();
const periodWindowCache = new Map();

const ACTION_BY_TYPE = {
  normal: "txlist",
  internal: "txlistinternal",
  token: "tokentx",
  nft: "tokennfttx",
};

const ALLOWED_TYPES = new Set(Object.keys(ACTION_BY_TYPE));

function normalizePeriod(analysisPeriod) {
  if (analysisPeriod === "ytd" || analysisPeriod === "custom") return analysisPeriod;
  const days = Number(analysisPeriod);
  if ([1, 7, 30, 365].includes(days)) return days;
  throw new Error("Invalid analysis period");
}

async function resolvePeriodWindow(analysisPeriod, customRange = null) {
  if (customRange?.from && customRange?.to) {
    const start = new Date(`${customRange.from}T00:00:00.000Z`);
    const requestedEnd = new Date(`${customRange.to}T23:59:59.999Z`);
    const includesCurrentDay = requestedEnd.getTime() >= Date.now();
    const startBlock = await getBlockByTimestamp(Math.floor(start.getTime() / 1000), "after");
    const endBlock = includesCurrentDay || shouldUseLatestBlock(requestedEnd)
      ? LATEST_BLOCK
      : await getBlockByTimestamp(Math.floor(requestedEnd.getTime() / 1000), "before");

    return {
      id: `custom:${customRange.from}:${customRange.to}`,
      startBlock,
      endBlock,
    };
  }

  const normalizedPeriod = normalizePeriod(analysisPeriod);
  const end = new Date();
  const start = normalizedPeriod === "ytd"
    ? new Date(Date.UTC(end.getUTCFullYear(), 0, 1))
    : new Date(end.getTime() - normalizedPeriod * 86_400_000);

  const startBlock = await getBlockByTimestamp(Math.floor(start.getTime() / 1000), "after");
  const endBlock = shouldUseLatestBlock(end)
    ? LATEST_BLOCK
    : await getBlockByTimestamp(Math.floor(end.getTime() / 1000), "before");

  return {
    id: normalizedPeriod === "ytd" ? "ytd" : `${normalizedPeriod}d`,
    startBlock,
    endBlock,
  };
}

function feePaidEth(record) {
  const gasUsed = Number(record.gasUsed || 0);
  const gasPrice = Number(record.gasPrice || 0);
  if (!gasUsed || !gasPrice) return 0;
  return fromWei(gasUsed * gasPrice);
}

export { resolveTransactionMethod } from "../utils/transaction-method.js";

export function resolveDirection(record, walletAddress, type) {
  const wallet = walletAddress.toLowerCase();
  const to = (record.to || "").toLowerCase();
  const from = (record.from || "").toLowerCase();

  if (type === "token" || type === "nft") {
    if (to === wallet) return "IN";
    if (from === wallet) return "OUT";
    return "—";
  }

  if (to === wallet) return "IN";
  if (from === wallet) return "OUT";
  return "—";
}

function resolveAmount(record, type) {
  if (type === "token") {
    const decimals = Number(record.tokenDecimal || 0);
    const amount = tokenAmount(record.value || "0", decimals);
    return {
      amount: round(amount, 8),
      amountEth: null,
      symbol: record.tokenSymbol || "TOKEN",
    };
  }

  if (type === "nft") {
    const amount = Number(record.tokenValue || 1);
    const symbol = record.tokenSymbol || record.tokenName || "NFT";
    return {
      amount: round(amount, 0),
      amountEth: null,
      symbol: amount === 1 ? symbol : `${amount} ${symbol}`,
    };
  }

  const eth = fromWei(record.value || "0");
  return {
    amount: round(eth, 8),
    amountEth: eth,
    symbol: "ETH",
  };
}

export function mapTransactionRow(record, walletAddress, type) {
  const timestamp = Number(record.timeStamp || 0);
  const { amount, amountEth, symbol } = resolveAmount(record, type);
  const method = resolveTransactionMethod(record, type);
  const contractTriggered = isContractTriggeredTransfer(record, type);
  const hasTokenAmount = type === "token" || type === "nft"
    ? Number(amount) > 0
    : false;

  return {
    hash: record.hash || "",
    method,
    methodDisplay: getMethodDisplayLabel(method, contractTriggered),
    contractTriggered,
    hasTokenAmount,
    blockNumber: Number(record.blockNumber || 0),
    timestamp,
    timestampIso: timestamp ? new Date(timestamp * 1000).toISOString() : null,
    from: record.from || "",
    to: record.to || "",
    direction: resolveDirection(record, walletAddress, type),
    amount,
    amountSymbol: symbol,
    amountEth,
    feeEth: round(feePaidEth(record), 8),
    status: record.isError === "1" ? "failed" : "success",
    tokenId: type === "nft" ? record.tokenID || null : null,
    contractAddress: type === "token" || type === "nft"
      ? (record.contractAddress || "").toLowerCase()
      : null,
  };
}

function passesLowValueFilter(row, hideLowValue) {
  if (!hideLowValue) return true;
  if (row.amountEth === null) return true;
  return Number(row.amountEth) >= DUST_ETH;
}

function resolveFillConfig(hideLowValue, safeLimit) {
  if (!hideLowValue) {
    return { maxFillPages: MAX_FILL_PAGES, upstreamBatchSize: safeLimit };
  }

  const isPreview = safeLimit <= 10;
  return {
    maxFillPages: isPreview ? PREVIEW_FILL_PAGES : Math.min(10, MAX_FILL_PAGES + 2),
    upstreamBatchSize: Math.max(safeLimit, PREVIEW_UPSTREAM_BATCH),
  };
}

function buildTxCacheKey({
  address,
  type,
  page,
  limit,
  analysisPeriod,
  customRange,
  sort,
  order,
  hideLowValue,
}) {
  const rangeKey = customRange?.from && customRange?.to
    ? `${customRange.from}:${customRange.to}`
    : String(analysisPeriod);
  return [
    address,
    type,
    page,
    limit,
    rangeKey,
    sort,
    order,
    hideLowValue ? '1' : '0',
  ].join(':');
}

async function getCachedPeriodWindow(analysisPeriod, customRange) {
  const cacheKey = customRange?.from && customRange?.to
    ? `custom:${customRange.from}:${customRange.to}`
    : String(analysisPeriod);
  const cached = periodWindowCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await resolvePeriodWindow(analysisPeriod, customRange);
  periodWindowCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + PERIOD_WINDOW_CACHE_TTL_MS,
  });
  return value;
}

export function clearTransactionTableCaches() {
  txTableCache.clear();
  periodWindowCache.clear();
}

function sortRows(rows, sort, order) {
  const direction = order === "asc" ? 1 : -1;

  if (sort === "amount") {
    return [...rows].sort((first, second) => {
      const firstValue = first.amountEth ?? first.amount ?? 0;
      const secondValue = second.amountEth ?? second.amount ?? 0;
      return (Number(firstValue) - Number(secondValue)) * direction;
    });
  }

  return [...rows].sort((first, second) => (
    (Number(first.timestamp) - Number(second.timestamp)) * direction
  ));
}

async function fetchBlockActionPage(type, address, page, limit, periodWindow, sortOrder) {
  const action = ACTION_BY_TYPE[type];
  const upstreamSort = sortOrder === "asc" ? "asc" : "desc";

  return blockActionRequest({
    chainid: CHAIN_ID,
    module: "account",
    action,
    address,
    page,
    offset: limit,
    sort: upstreamSort,
    startblock: periodWindow.startBlock,
    endblock: periodWindow.endBlock,
  });
}

export async function getPaginatedWalletTransactions({
  address,
  type = "normal",
  page = 1,
  limit = DEFAULT_LIMIT,
  analysisPeriod = "ytd",
  customRange = null,
  sort = "age",
  order = "desc",
  hideLowValue = false,
}) {
  const normalizedAddress = address.toLowerCase();
  const normalizedType = ALLOWED_TYPES.has(type) ? type : "normal";
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const safePage = Math.max(Number(page) || 1, 1);
  const safeSort = sort === "amount" ? "amount" : "age";
  const safeOrder = order === "asc" ? "asc" : "desc";
  const hideLowValueFlag = Boolean(hideLowValue);

  if (customRange?.from && customRange?.to) {
    // custom ranges are always allowed when both dates are present
  } else {
    try {
      analysisPeriod = normalizePeriod(analysisPeriod);
    } catch {
      throw new Error("Invalid analysis period");
    }
  }

  const cacheKey = buildTxCacheKey({
    address: normalizedAddress,
    type: normalizedType,
    page: safePage,
    limit: safeLimit,
    analysisPeriod,
    customRange,
    sort: safeSort,
    order: safeOrder,
    hideLowValue: hideLowValueFlag,
  });
  const cached = txTableCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) {
    return cached.value;
  }

  const periodWindow = await getCachedPeriodWindow(analysisPeriod, customRange);
  const { maxFillPages, upstreamBatchSize } = resolveFillConfig(hideLowValue, safeLimit);

  let rows = [];
  let upstreamPage = safePage;
  let hasMore = false;
  let fillAttempts = 0;
  const paginationMode = safeSort === "amount" ? "window" : "server";

  if (safeSort === "amount") {
    while (rows.length < safeLimit && fillAttempts < maxFillPages) {
      const batch = await fetchBlockActionPage(
        normalizedType,
        normalizedAddress,
        upstreamPage,
        upstreamBatchSize,
        periodWindow,
        "desc",
      );

      if (!Array.isArray(batch) || batch.length === 0) break;

      const mapped = batch
        .map((record) => mapTransactionRow(record, normalizedAddress, normalizedType))
        .filter((row) => passesLowValueFilter(row, hideLowValue));

      rows.push(...mapped);
      upstreamPage += 1;
      fillAttempts += 1;

      if (batch.length < upstreamBatchSize) {
        hasMore = false;
        break;
      }

      hasMore = true;
    }

    rows = sortRows(rows, "amount", safeOrder).slice(0, safeLimit);
  } else {
    while (rows.length < safeLimit && fillAttempts < maxFillPages) {
      const batch = await fetchBlockActionPage(
        normalizedType,
        normalizedAddress,
        upstreamPage,
        upstreamBatchSize,
        periodWindow,
        safeOrder,
      );

      if (!Array.isArray(batch) || batch.length === 0) break;

      const mapped = batch
        .map((record) => mapTransactionRow(record, normalizedAddress, normalizedType))
        .filter((row) => passesLowValueFilter(row, hideLowValue));

      rows.push(...mapped);
      hasMore = batch.length >= upstreamBatchSize;
      upstreamPage += 1;
      fillAttempts += 1;

      if (batch.length < upstreamBatchSize) {
        hasMore = false;
        break;
      }
    }

    rows = rows.slice(0, safeLimit);
  }

  const payload = {
    type: normalizedType,
    page: safePage,
    limit: safeLimit,
    sort: safeSort,
    order: safeOrder,
    hideLowValue: hideLowValueFlag,
    period: periodWindow,
    rows,
    hasMore: paginationMode === "window" ? hasMore : (hasMore || rows.length >= safeLimit),
    paginationMode,
  };

  txTableCache.set(cacheKey, {
    value: payload,
    expiresAt: Date.now() + TX_TABLE_CACHE_TTL_MS,
  });

  return payload;
}

export { normalizePeriod, resolveFillConfig };

export const TRANSACTION_TABLE_CONSTANTS = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  DUST_ETH,
  ALLOWED_TYPES: [...ALLOWED_TYPES],
};
