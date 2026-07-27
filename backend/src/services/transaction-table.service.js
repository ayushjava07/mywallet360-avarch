import { blockActionRequest } from "./blockaction.service.js";
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

const ACTION_BY_TYPE = {
  normal: "txlist",
  internal: "txlistinternal",
  token: "tokentx",
  nft: "tokennfttx",
};

const ALLOWED_TYPES = new Set(Object.keys(ACTION_BY_TYPE));
const ALLOWED_PERIODS = new Set(["ytd", 1, 7, 30, 365]);

function normalizePeriod(analysisPeriod) {
  if (analysisPeriod === "ytd") return "ytd";
  const days = Number(analysisPeriod);
  if ([1, 7, 30, 365].includes(days)) return days;
  throw new Error("Invalid analysis period");
}

async function resolvePeriodWindow(analysisPeriod, customRange = null) {
  if (customRange?.from && customRange?.to) {
    const start = new Date(`${customRange.from}T00:00:00.000Z`);
    const requestedEnd = new Date(`${customRange.to}T23:59:59.999Z`);
    const includesCurrentDay = requestedEnd.getTime() >= Date.now();
    const [startBlock, endBlock] = await Promise.all([
      blockActionRequest({
        module: "block",
        action: "getblocknobytime",
        timestamp: Math.floor(start.getTime() / 1000),
        closest: "after",
      }),
      includesCurrentDay
        ? Promise.resolve(99_999_999)
        : blockActionRequest({
          module: "block",
          action: "getblocknobytime",
          timestamp: Math.floor(requestedEnd.getTime() / 1000),
          closest: "before",
        }),
    ]);

    return {
      id: `custom:${customRange.from}:${customRange.to}`,
      startBlock: Number(startBlock),
      endBlock: Number(endBlock),
    };
  }

  const normalizedPeriod = normalizePeriod(analysisPeriod);
  const end = new Date();
  const start = normalizedPeriod === "ytd"
    ? new Date(Date.UTC(end.getUTCFullYear(), 0, 1))
    : new Date(end.getTime() - normalizedPeriod * 86_400_000);

  const [startBlock, endBlock] = await Promise.all([
    blockActionRequest({
      module: "block",
      action: "getblocknobytime",
      timestamp: Math.floor(start.getTime() / 1000),
      closest: "after",
    }),
    blockActionRequest({
      module: "block",
      action: "getblocknobytime",
      timestamp: Math.floor(end.getTime() / 1000),
      closest: "before",
    }),
  ]);

  return {
    id: normalizedPeriod === "ytd" ? "ytd" : `${normalizedPeriod}d`,
    startBlock: Number(startBlock),
    endBlock: Number(endBlock),
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

  if (customRange?.from && customRange?.to) {
    // custom ranges are always allowed when both dates are present
  } else if (!ALLOWED_PERIODS.has(analysisPeriod) && analysisPeriod !== "custom") {
    throw new Error("Invalid analysis period");
  }

  const periodWindow = await resolvePeriodWindow(analysisPeriod, customRange);

  let rows = [];
  let upstreamPage = safePage;
  let hasMore = false;
  let fillAttempts = 0;

  if (safeSort === "amount") {
    while (rows.length < safeLimit && fillAttempts < MAX_FILL_PAGES) {
      const batch = await fetchBlockActionPage(
        normalizedType,
        normalizedAddress,
        upstreamPage,
        safeLimit,
        periodWindow,
        "desc",
      );

      if (!Array.isArray(batch) || batch.length === 0) break;

      const mapped = batch
        .map((record) => mapTransactionRow(record, normalizedAddress, normalizedType))
        .filter((row) => passesLowValueFilter(row, hideLowValue));

      rows.push(...mapped);
      hasMore = batch.length >= safeLimit;
      upstreamPage += 1;
      fillAttempts += 1;

      if (batch.length < safeLimit) {
        hasMore = false;
        break;
      }
    }

    rows = sortRows(rows, "amount", safeOrder).slice(0, safeLimit);
  } else {
    while (rows.length < safeLimit && fillAttempts < MAX_FILL_PAGES) {
      const batch = await fetchBlockActionPage(
        normalizedType,
        normalizedAddress,
        upstreamPage,
        safeLimit,
        periodWindow,
        safeOrder,
      );

      if (!Array.isArray(batch) || batch.length === 0) break;

      const mapped = batch
        .map((record) => mapTransactionRow(record, normalizedAddress, normalizedType))
        .filter((row) => passesLowValueFilter(row, hideLowValue));

      rows.push(...mapped);
      hasMore = batch.length >= safeLimit;
      upstreamPage += 1;
      fillAttempts += 1;

      if (batch.length < safeLimit) {
        hasMore = false;
        break;
      }
    }

    rows = rows.slice(0, safeLimit);
  }

  return {
    type: normalizedType,
    page: safePage,
    limit: safeLimit,
    sort: safeSort,
    order: safeOrder,
    hideLowValue: Boolean(hideLowValue),
    period: periodWindow,
    rows,
    hasMore: hasMore || rows.length >= safeLimit,
    paginationMode: "server",
  };
}

export const TRANSACTION_TABLE_CONSTANTS = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  DUST_ETH,
  ALLOWED_TYPES: [...ALLOWED_TYPES],
};
