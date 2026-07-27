import axios from "axios";
import { calculatePersonalityDetails, isSwapTransaction } from "./personality.service.js";
import { calculateRiskScore } from "./scoring.service.js";
import { resolveProtocol, resolveProtocolSync } from "./protocol-resolution.service.js";
import {
  buildAddressOverview,
  buildTokenHoldingsSummary,
  summarizeEtherscanTokenPortfolio,
} from "./wallet-overview.service.js";
import {
  clearActivityStatsCache,
  fetchWalletActivityStats,
} from "./wallet-activity-stats.service.js";
import {
  getMethodDisplayLabel,
  resolveTransactionMethod,
} from "../utils/transaction-method.js";
import {
  fromWei,
  normalizePercentages,
  percentage,
  round,
  tokenAmount,
} from "../utils/calculations.js";

const BLOCKACTION_URL = process.env.BLOCKACTION_API_URL;
const DEFILLAMA_PRICES_URL = "https://coins.llama.fi/prices/current";
const CHAIN_ID = process.env.BLOCKACTION_CHAIN_ID || "1";
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_INTERVAL_MS = 350;
const INVENTORY_REQUEST_INTERVAL_MS = 550;
const INVENTORY_PAGE_SIZE = 1000;
const DEFAULT_ANALYSIS_PERIOD = "ytd";
const USD_PEGGED_TOKEN_ADDRESSES = new Set([
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0xdc035d45d973e3ec169d2276ddab16f1e407384f", // USDS
  "0x0000000000085d4780b73119b644ae5ecd22b376", // TUSD
  "0x8e870d67f660d95d5be530380d0ec0bd388289e1", // USDP
  "0x056fd409e1d7a124bd7017459dfea2f387b6d5cd", // GUSD
  "0x853d955acef822db058eb8505911ed77f175b99e", // FRAX
]);
const ETH_EQUIVALENT_TOKEN_ADDRESSES = new Set([
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", // stETH
  "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", // wstETH
]);

const PROTOCOL_ADDRESSES = {
  Uniswap: new Set([
    "0x7a250d5630b4cf539739df2c5dacab4c659f2488d",
    "0xe592427a0aece92de3edee1f18e0157c05861564",
    "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b",
  ]),
  OpenSea: new Set([
    "0x00000000006c3852cbef3e08e8df289169ede581",
    "0x0000000000000068f116a894984e2db1123eb395",
  ]),
  Aave: new Set([
    "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9",
    "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
  ]),
  Compound: new Set(["0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b"]),
  "1inch": new Set([
    "0x1111111254eeb25477b68fb85ed929f73a960582",
    "0x111111125421ca6dc452d289314280a0f8842a65",
  ]),
};

const responseCache = new Map();
const walletCache = new Map();
const priceCache = new Map();
const portfolioInventoryCache = new Map();
const PRICE_CACHE_TTL_MS = 60 * 1000;
let requestQueue = Promise.resolve();
let lastRequestAt = 0;
let inventoryRequestQueue = Promise.resolve();
let lastInventoryRequestAt = 0;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function scheduleRequest(task) {
  const scheduled = requestQueue.then(async () => {
    const delay = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (delay) await wait(delay);
    lastRequestAt = Date.now();
    return task();
  });

  requestQueue = scheduled.catch(() => undefined);
  return scheduled;
}

function scheduleInventoryRequest(task) {
  const scheduled = inventoryRequestQueue.then(async () => {
    const delay = Math.max(0, INVENTORY_REQUEST_INTERVAL_MS - (Date.now() - lastInventoryRequestAt));
    if (delay) await wait(delay);
    lastInventoryRequestAt = Date.now();
    return task();
  });

  inventoryRequestQueue = scheduled.catch(() => undefined);
  return scheduled;
}

export function clearWalletServiceCaches() {
  responseCache.clear();
  walletCache.clear();
  priceCache.clear();
  portfolioInventoryCache.clear();
  clearActivityStatsCache();
}

function getCached(key) {
  const cached = responseCache.get(key);

  if (!cached || cached.expiresAt < Date.now()) {
    responseCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCached(key, value) {
  responseCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

function inventorySnapshot(entry) {
  return {
    status: entry.status,
    tokenHoldingsCount: entry.tokenHoldingsCount,
    tokenValueUsd: entry.tokenValueUsd ?? null,
    pricedCount: entry.pricedCount ?? null,
    source: entry.source,
  };
}

function getPortfolioInventoryEntry(address) {
  const entry = portfolioInventoryCache.get(address);

  if (entry?.expiresAt && entry.expiresAt < Date.now()) {
    portfolioInventoryCache.delete(address);
    return null;
  }

  return entry || null;
}

async function aggregatePortfolioInventory(address, firstPage) {
  let tokenHoldingsCount = firstPage.length;
  let tokenValueUsd = 0;
  let pricedCount = 0;
  let previousPage = firstPage;

  const firstSummary = summarizeEtherscanTokenPortfolio(firstPage);
  if (firstSummary) {
    tokenValueUsd += firstSummary.valueUsd;
    pricedCount += firstSummary.pricedCount;
  }

  for (let page = 2; previousPage.length === INVENTORY_PAGE_SIZE; page += 1) {
    const result = await scheduleInventoryRequest(() => blockActionRequest({
      module: "account",
      action: "addresstokenbalance",
      address,
      page,
      offset: INVENTORY_PAGE_SIZE,
    }));
    tokenHoldingsCount += result.length;
    const pageSummary = summarizeEtherscanTokenPortfolio(result);
    if (pageSummary) {
      tokenValueUsd += pageSummary.valueUsd;
      pricedCount += pageSummary.pricedCount;
    }
    previousPage = result;

    if (result.length < INVENTORY_PAGE_SIZE) {
      return { tokenHoldingsCount, tokenValueUsd, pricedCount };
    }
  }

  return { tokenHoldingsCount, tokenValueUsd, pricedCount };
}

function startPortfolioInventoryJob(address, firstPage) {
  const existing = getPortfolioInventoryEntry(address);
  if (existing) return inventorySnapshot(existing);

  if (!Array.isArray(firstPage)) {
    const unavailable = {
      status: "unavailable",
      tokenHoldingsCount: null,
      source: null,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    portfolioInventoryCache.set(address, unavailable);
    return inventorySnapshot(unavailable);
  }

  if (firstPage.length < INVENTORY_PAGE_SIZE) {
    const firstSummary = summarizeEtherscanTokenPortfolio(firstPage);
    const complete = {
      status: "complete",
      tokenHoldingsCount: firstPage.length,
      tokenValueUsd: firstSummary ? round(firstSummary.valueUsd, 2) : null,
      pricedCount: firstSummary?.pricedCount ?? null,
      source: "etherscan",
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    portfolioInventoryCache.set(address, complete);
    return inventorySnapshot(complete);
  }

  const firstSummary = summarizeEtherscanTokenPortfolio(firstPage);
  const pending = {
    status: "pending",
    tokenHoldingsCount: firstPage.length,
    tokenValueUsd: firstSummary ? round(firstSummary.valueUsd, 2) : null,
    pricedCount: firstSummary?.pricedCount ?? null,
    source: "etherscan",
    expiresAt: null,
  };
  portfolioInventoryCache.set(address, pending);

  aggregatePortfolioInventory(address, firstPage)
    .then(({ tokenHoldingsCount, tokenValueUsd, pricedCount }) => {
      portfolioInventoryCache.set(address, {
        status: "complete",
        tokenHoldingsCount,
        tokenValueUsd: round(tokenValueUsd, 2),
        pricedCount,
        source: "etherscan",
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    })
    .catch((error) => {
      console.warn(`[Portfolio Inventory] Unable to count ${address}: ${error.message}`);
      portfolioInventoryCache.set(address, {
        status: "unavailable",
        tokenHoldingsCount: null,
        source: null,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    });

  return inventorySnapshot(pending);
}

export function getPortfolioInventory(address) {
  const normalizedAddress = address.toLowerCase();
  const existing = getPortfolioInventoryEntry(normalizedAddress);
  if (existing) return inventorySnapshot(existing);

  const pending = {
    status: "pending",
    tokenHoldingsCount: null,
    source: null,
    expiresAt: null,
  };
  portfolioInventoryCache.set(normalizedAddress, pending);

  blockActionRequest({
    module: "account",
    action: "addresstokenbalance",
    address: normalizedAddress,
    page: 1,
    offset: INVENTORY_PAGE_SIZE,
  })
    .then((firstPage) => {
      portfolioInventoryCache.delete(normalizedAddress);
      startPortfolioInventoryJob(normalizedAddress, firstPage);
    })
    .catch((error) => {
      console.warn(`[Portfolio Inventory] Unable to start ${normalizedAddress}: ${error.message}`);
      portfolioInventoryCache.set(normalizedAddress, {
        status: "unavailable",
        tokenHoldingsCount: null,
        source: null,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    });

  return inventorySnapshot(pending);
}

export async function blockActionRequest(params) {
  if (!BLOCKACTION_URL) {
    throw new Error("BLOCKACTION_API_URL is not configured");
  }

  const requestParams = {
    chainid: CHAIN_ID,
    ...params,
  };
  if (process.env.BLOCKACTION_API_KEY) {
    requestParams.apikey = process.env.BLOCKACTION_API_KEY;
  }
  const cacheKey = new URLSearchParams(requestParams).toString();
  const cached = getCached(cacheKey);
  if (cached) return cached;

  return scheduleRequest(async () => {
    let lastError;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await axios.get(BLOCKACTION_URL, {
          params: requestParams,
          timeout: 15_000,
        });

        if (response.data?.status === "0") {
          const errorMessage = `${response.data.message} ${response.data.result}`.toLowerCase();

          if (errorMessage.includes("no transactions")) {
            return setCached(cacheKey, []);
          }

          if (errorMessage.includes("rate limit") && attempt < 2) {
            await wait(750 * (attempt + 1));
            continue;
          }

          throw new Error(response.data.result || response.data.message || "BlockAction request failed");
        }

        return setCached(cacheKey, response.data?.result ?? response.data?.data ?? response.data);
      } catch (error) {
        lastError = error;

        if (attempt < 2 && ["ECONNRESET", "ETIMEDOUT", "ECONNABORTED"].includes(error.code)) {
          await wait(750 * (attempt + 1));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  });
}

async function fetchPaginated(action, address, extra = {}) {
  const records = [];
  let complete = false;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await blockActionRequest({
      module: "account",
      action,
      address,
      page,
      offset: PAGE_SIZE,
      sort: "desc",
      ...extra,
    });

    records.push(...result);

    if (result.length < PAGE_SIZE) {
      complete = true;
      break;
    }
  }

  return { records, complete };
}

function normalizeAnalysisPeriod(analysisPeriod) {
  if (analysisPeriod === "ytd") return "ytd";

  const days = Number(analysisPeriod);
  if ([1, 7, 30, 365].includes(days)) return days;

  throw new Error("Invalid analysis period");
}

async function getAnalysisPeriod(analysisPeriod) {
  const end = new Date();
  const normalizedPeriod = normalizeAnalysisPeriod(analysisPeriod);
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
    days: Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000)),
    start: start.toISOString(),
    end: end.toISOString(),
    startBlock: Number(startBlock),
    endBlock: Number(endBlock),
  };
}

async function getDateRange(from, to) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const requestedEnd = new Date(`${to}T23:59:59.999Z`);
  const includesCurrentDay = requestedEnd.getTime() >= Date.now();
  const startBlockRequest = blockActionRequest({
    module: "block",
    action: "getblocknobytime",
    timestamp: Math.floor(start.getTime() / 1000),
    closest: "after",
  });
  const endBlockRequest = includesCurrentDay
    ? Promise.resolve(99_999_999)
    : blockActionRequest({
      module: "block",
      action: "getblocknobytime",
      timestamp: Math.floor(requestedEnd.getTime() / 1000),
      closest: "before",
    });
  const [startBlock, endBlock] = await Promise.all([startBlockRequest, endBlockRequest]);

  return { start, end: requestedEnd, startBlock: Number(startBlock), endBlock: Number(endBlock) };
}

function addDirection(records, address) {
  return records.map((record) => ({
    ...record,
    direction: record.to?.toLowerCase() === address ? "receive" : "send",
  }));
}

function calculateMoneyFlow(transactions, internalTransactions, address, ethPrice) {
  const seen = new Set();
  let received = 0;
  let spent = 0;
  let incomingCount = 0;
  let outgoingCount = 0;

  [...transactions, ...internalTransactions].forEach((transaction) => {
    const identity = `${transaction.hash}:${transaction.traceId || "normal"}`;
    if (seen.has(identity) || transaction.isError === "1") return;
    seen.add(identity);

    const amount = fromWei(transaction.value);
    if (!amount) return;

    if (transaction.to?.toLowerCase() === address) {
      received += amount;
      incomingCount += 1;
    }

    if (transaction.from?.toLowerCase() === address) {
      spent += amount;
      outgoingCount += 1;
    }
  });

  return {
    received: round(received),
    spent: round(spent),
    receivedUsd: round(received * ethPrice, 2),
    spentUsd: round(spent * ethPrice, 2),
    incomingCount,
    outgoingCount,
  };
}

export async function fetchTokenPrices(contractAddresses) {
  if (!contractAddresses || contractAddresses.length === 0) return {};

  const prices = {};
  const uncached = [];
  const now = Date.now();

  // Check cache first
  contractAddresses.forEach((address) => {
    const cached = priceCache.get(address);
    if (cached && cached.expiresAt > now) {
      prices[address] = cached.value;
    } else {
      uncached.push(address);
    }
  });

  if (uncached.length === 0) return prices;

  const batchSize = 50;
  for (let i = 0; i < uncached.length; i += batchSize) {
    const batch = uncached.slice(i, i + batchSize);
    // DefiLlama format: ethereum:0xaddr1,ethereum:0xaddr2,...
    const coinIds = batch.map((addr) => `ethereum:${addr}`).join(",");

    try {
      const response = await axios.get(`${DEFILLAMA_PRICES_URL}/${coinIds}`, {
        params: { searchWidth: "4h" },
        timeout: 10_000,
      });

      if (response.data?.coins) {
        Object.entries(response.data.coins).forEach(([key, data]) => {
          if (data.price > 0) {
            // Key format: "ethereum:0xaddr" -> extract address
            const address = key.split(":").pop().toLowerCase();
            prices[address] = data.price;
            priceCache.set(address, { value: data.price, expiresAt: now + PRICE_CACHE_TTL_MS });
          }
        });
      }
    } catch (error) {
      console.warn(`[Token Pricing] Failed to fetch prices for batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
    }
  }

  return prices;
}

function buildEtherscanPriceMap(etherscanTokenPortfolio) {
  if (!Array.isArray(etherscanTokenPortfolio)) return {};

  const prices = {};
  etherscanTokenPortfolio.forEach((token) => {
    const contractAddress = (token.contractAddress || token.TokenAddress || token.tokenAddress || "")
      .toLowerCase();
    const price = Number(token.TokenPriceUSD || token.tokenPriceUSD || 0);
    if (contractAddress && price > 0) {
      prices[contractAddress] = price;
    }
  });
  return prices;
}

function buildAssets(tokenTransfers, ethBalance, ethPrice, address, tokenPrices = {}, etherscanPrices = {}) {
  const tokenMap = new Map();

  tokenTransfers.forEach((transfer) => {
    const contractAddress = transfer.contractAddress.toLowerCase();
    const current = tokenMap.get(contractAddress) || {
      contractAddress,
      symbol: transfer.tokenSymbol || "UNKNOWN",
      name: transfer.tokenName || "Unknown Token",
      decimals: Number(transfer.tokenDecimal || 0),
      rawBalance: 0n,
    };
    const value = BigInt(transfer.value || "0");
    current.rawBalance += transfer.to?.toLowerCase() === address ? value : -value;
    tokenMap.set(contractAddress, current);
  });

  const assets = [...tokenMap.values()]
    .filter((asset) => asset.rawBalance > 0n)
    .map((asset) => {
      const balance = tokenAmount(asset.rawBalance.toString(), asset.decimals);
      const isUsdPegged = USD_PEGGED_TOKEN_ADDRESSES.has(asset.contractAddress);
      const isEthEquivalent = ETH_EQUIVALENT_TOKEN_ADDRESSES.has(asset.contractAddress);
      const priceFromApi = tokenPrices[asset.contractAddress];

      let usdValue;
      let priceAvailable;

      if (isUsdPegged) {
        usdValue = balance;
        priceAvailable = true;
      } else if (isEthEquivalent) {
        usdValue = balance * ethPrice;
        priceAvailable = true;
      } else if (priceFromApi !== undefined && priceFromApi > 0) {
        usdValue = balance * Number(priceFromApi);
        priceAvailable = true;
      } else {
        const priceFromEtherscan = etherscanPrices[asset.contractAddress];
        if (priceFromEtherscan !== undefined && priceFromEtherscan > 0) {
          usdValue = balance * Number(priceFromEtherscan);
          priceAvailable = true;
        } else {
          usdValue = 0;
          priceAvailable = false;
        }
      }

      return {
        contractAddress: asset.contractAddress,
        symbol: asset.symbol,
        name: asset.name,
        rawBalance: balance,
        balance: round(balance, 8),
        usdValue: round(usdValue, 2),
        priceAvailable,
      };
    });

  assets.push({
    contractAddress: null,
    symbol: "ETH",
    name: "Ether",
    rawBalance: ethBalance,
    balance: round(ethBalance, 8),
    usdValue: round(ethBalance * ethPrice, 2),
    priceAvailable: true,
  });

  return assets.sort((first, second) => second.usdValue - first.usdValue);
}

function buildNfts(nftTransfers, address) {
  const holdings = new Map();

  [...nftTransfers].reverse().forEach((transfer) => {
    const key = `${transfer.contractAddress.toLowerCase()}:${transfer.tokenID}`;
    const currentAmount = holdings.get(key)?.amount || 0;
    const amount = Number(transfer.tokenValue || 1);
    const nextAmount =
      transfer.to?.toLowerCase() === address ? currentAmount + amount : currentAmount - amount;

    if (nextAmount > 0) {
      holdings.set(key, {
        contractAddress: transfer.contractAddress.toLowerCase(),
        tokenId: transfer.tokenID,
        name: transfer.tokenName || "Unknown NFT",
        symbol: transfer.tokenSymbol || "NFT",
        amount: nextAmount,
      });
    } else {
      holdings.delete(key);
    }
  });

  return [...holdings.values()].slice(0, 100);
}

export async function analyzeProtocols(transactions) {
  const startTime = Date.now();
  console.log(`[Protocol Analysis] Starting protocol analysis`);

  const contractInteractions = transactions.filter(
    (t) => t.to && t.isError !== "1" && t.input !== "0x"
  );

  const defaultCounts = Object.fromEntries(
    [...Object.keys(PROTOCOL_ADDRESSES), "Other"].map((name) => [name, 0])
  );

  if (contractInteractions.length === 0) {
    const endTime = Date.now();
    console.log(`[Protocol Analysis] Completed in ${endTime - startTime}ms (0 interactions)`);
    return {
      name: "Other",
      count: 0,
      type: "protocol",
      recognizedCount: 0,
      unrecognizedCount: 0,
      counts: defaultCounts,
    };
  }

  // Count interaction frequencies per contract address
  const addressCounts = {};
  contractInteractions.forEach((t) => {
    const addr = t.to.toLowerCase();
    addressCounts[addr] = (addressCounts[addr] || 0) + 1;
  });

  // Sort unique addresses by interaction frequency descending
  const sortedAddresses = Object.keys(addressCounts).sort(
    (a, b) => addressCounts[b] - addressCounts[a]
  );

  // Define Top N (only resolve the most active 5 contracts asynchronously)
  const TOP_N = 5;
  const topNAddresses = sortedAddresses.slice(0, TOP_N);
  const remainingAddresses = sortedAddresses.slice(TOP_N);

  // Resolve top N asynchronously in parallel
  const topResolvedList = await Promise.all(
    topNAddresses.map(async (addr) => {
      const resolved = await resolveProtocol(addr);
      return [addr, resolved];
    })
  );

  // Resolve remaining contract addresses synchronously (loads cache or falls back to shortened address)
  const remainingResolvedList = remainingAddresses.map((addr) => {
    const resolved = resolveProtocolSync(addr);
    return [addr, resolved];
  });

  const resolutionMap = new Map([...topResolvedList, ...remainingResolvedList]);

  const counts = { ...defaultCounts };
  const types = { Other: "protocol" };

  let recognizedCount = 0;
  let unrecognizedCount = 0;

  contractInteractions.forEach((transaction) => {
    const target = transaction.to.toLowerCase();
    const resolved = resolutionMap.get(target) || { name: "Other", type: "protocol" };

    if (resolved.type === "protocol") {
      recognizedCount += 1;
    } else {
      unrecognizedCount += 1;
    }

    counts[resolved.name] = (counts[resolved.name] || 0) + 1;
    types[resolved.name] = resolved.type;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [name, count] = sorted[0];
  const type = types[name] || "protocol";

  const endTime = Date.now();
  console.log(`[Protocol Analysis] Completed in ${endTime - startTime}ms (Top ${topNAddresses.length} resolved asynchronously, ${remainingAddresses.length} resolved synchronously)`);

  return {
    name,
    count,
    type,
    recognizedCount,
    unrecognizedCount,
    counts,
  };
}

function buildTokenTransfersByHash(tokenTransfers) {
  const byHash = new Map();
  tokenTransfers.forEach((transfer) => {
    const hash = transfer.hash?.toLowerCase();
    if (!hash) return;
    const list = byHash.get(hash) || [];
    list.push(transfer);
    byHash.set(hash, list);
  });
  return byHash;
}

function pickTokenValueForTimeline(tokenTransfers, address) {
  if (!tokenTransfers?.length) return null;

  const candidates = tokenTransfers
    .map((transfer) => {
      const amount = tokenAmount(transfer.value || "0", Number(transfer.tokenDecimal || 0));
      if (!(amount > 0)) return null;
      return {
        amount: round(amount, 6),
        symbol: transfer.tokenSymbol || "TOKEN",
        direction: transfer.to?.toLowerCase() === address ? "receive" : "send",
      };
    })
    .filter(Boolean)
    .sort((first, second) => second.amount - first.amount);

  return candidates[0] || null;
}

export function buildTimeline(transactions, address, tokenTransfers = []) {
  const tokensByHash = buildTokenTransfersByHash(tokenTransfers);

  return transactions.slice(0, 20).map((transaction) => {
    const direction = transaction.to?.toLowerCase() === address ? "receive" : "send";
    const type = isSwapTransaction(transaction)
      ? "token swap"
      : transaction.input !== "0x"
        ? "contract interaction"
        : direction;

    const ethAmount = fromWei(transaction.value);
    let value = null;

    if (ethAmount > 0) {
      value = {
        amount: round(ethAmount),
        symbol: "ETH",
      };
    } else {
      const tokenValue = pickTokenValueForTimeline(
        tokensByHash.get(transaction.hash?.toLowerCase()) || [],
        address,
      );
      if (tokenValue) {
        value = {
          amount: tokenValue.amount,
          symbol: tokenValue.symbol,
          direction: tokenValue.direction,
        };
      }
    }

    return {
      hash: transaction.hash,
      timestamp: new Date(Number(transaction.timeStamp) * 1000).toISOString(),
      blockNumber: Number(transaction.blockNumber || 0),
      type,
      method: getMethodDisplayLabel(
        resolveTransactionMethod(transaction, "normal"),
        false,
      ),
      contractTriggered: false,
      hasTokenAmount: Boolean(value && value.symbol !== "ETH"),
      value,
      from: transaction.from,
      to: transaction.to,
    };
  });
}

export function buildLargestHolding(assets) {
  const held = (assets || []).filter((asset) => Number(asset.rawBalance ?? asset.balance ?? 0) > 0);
  if (!held.length) return null;

  const priced = held.filter((asset) => asset.priceAvailable && Number(asset.usdValue) > 0);
  const unpricedCount = held.filter((asset) => !asset.priceAvailable).length;
  const largest = (priced.length
    ? [...priced].sort((first, second) => second.usdValue - first.usdValue)
    : held)[0];
  const totalPricedValue = priced.reduce((sum, asset) => sum + Number(asset.usdValue || 0), 0);

  // When unpriced holdings exist, dilute the priced-only share by coverage so we never
  // present "100%" as if the rest of the book did not exist.
  const pricedShare = percentage(largest.usdValue, totalPricedValue);
  const coverageRatio = held.length > 0 ? priced.length / held.length : 0;
  const displayPercentage = unpricedCount > 0
    ? round(pricedShare * coverageRatio, 2)
    : pricedShare;

  return {
    symbol: largest.symbol,
    balance: String(largest.balance),
    usdValue: largest.usdValue,
    percentage: displayPercentage,
    percentageBasis: unpricedCount > 0 ? "all_holdings" : "priced",
    unpricedCount,
    totalAssetCount: held.length,
    pricedAssetCount: priced.length,
    priceAvailable: Boolean(largest.priceAvailable),
  };
}

function attachAssetPercentages(assets) {
  const held = assets || [];
  const totalPricedValue = held
    .filter((asset) => asset.priceAvailable)
    .reduce((sum, asset) => sum + Number(asset.usdValue || 0), 0);

  return held.map((asset) => ({
    ...asset,
    percentage: asset.priceAvailable && totalPricedValue > 0
      ? percentage(asset.usdValue, totalPricedValue)
      : 0,
    percentageBasis: "priced",
  }));
}

export function buildDailyTransactionCounts(transactions) {
  const counts = {};
  (transactions || []).forEach((transaction) => {
    const timestamp = Number(transaction.timeStamp || 0);
    if (!timestamp) return;
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    counts[date] = (counts[date] || 0) + 1;
  });
  return counts;
}

function emptyDailyBucket() {
  return {
    transactionCount: 0,
    uniqueOutgoingAddresses: new Set(),
    uniqueIncomingAddresses: new Set(),
    ethFees: 0,
    ethFeesSpent: 0,
    ethFeesUsed: 0,
    ethSent: 0,
    ethReceived: 0,
    tokenTransfers: 0,
    tokenContractAddresses: new Set(),
  };
}

function feePaidEth(transaction) {
  const gasUsed = Number(transaction.gasUsed || 0);
  const gasPrice = Number(transaction.gasPrice || 0);
  if (!gasUsed || !gasPrice) return 0;
  return fromWei(gasUsed * gasPrice);
}

/**
 * Per-day analytics for the Transaction Analytics chart.
 * Derives from already-fetched txs — no extra API calls.
 */
export function buildDailyAnalytics(address, {
  normalTransactions = [],
  tokenTransfers = [],
  nftTransfers = [],
} = {}) {
  const wallet = (address || "").toLowerCase();
  const byDate = new Map();

  const ensure = (date) => {
    if (!byDate.has(date)) byDate.set(date, emptyDailyBucket());
    return byDate.get(date);
  };

  (normalTransactions || []).forEach((transaction) => {
    const timestamp = Number(transaction.timeStamp || 0);
    if (!timestamp) return;
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const bucket = ensure(date);
    bucket.transactionCount += 1;

    const from = (transaction.from || "").toLowerCase();
    const to = (transaction.to || "").toLowerCase();
    const failed = transaction.isError === "1";

    const feeEth = feePaidEth(transaction);

    if (from === wallet && to) {
      bucket.uniqueOutgoingAddresses.add(to);
      if (!failed) {
        bucket.ethFees += feeEth;
        bucket.ethFeesSpent += feeEth;
        const amount = fromWei(transaction.value);
        if (amount > 0) bucket.ethSent += amount;
      }
    }

    if (to === wallet && from) {
      bucket.uniqueIncomingAddresses.add(from);
      if (!failed) {
        if (from !== wallet) bucket.ethFeesUsed += feeEth;
        const amount = fromWei(transaction.value);
        if (amount > 0) bucket.ethReceived += amount;
      }
    }
  });

  [...(tokenTransfers || []), ...(nftTransfers || [])].forEach((transfer) => {
    const timestamp = Number(transfer.timeStamp || 0);
    if (!timestamp) return;
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const bucket = ensure(date);
    bucket.tokenTransfers += 1;
    const contract = (transfer.contractAddress || "").toLowerCase();
    if (contract) bucket.tokenContractAddresses.add(contract);
  });

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, bucket]) => {
      const ethSent = round(bucket.ethSent, 6);
      const ethReceived = round(bucket.ethReceived, 6);
      const ethFeesSpent = round(bucket.ethFeesSpent, 8);
      const ethFeesUsed = round(bucket.ethFeesUsed, 8);
      return {
        date,
        transactionCount: bucket.transactionCount,
        uniqueOutgoing: bucket.uniqueOutgoingAddresses.size,
        uniqueIncoming: bucket.uniqueIncomingAddresses.size,
        ethFees: ethFeesSpent,
        ethFeesSpent,
        ethFeesUsed,
        ethSent,
        ethReceived,
        etherVolume: round(ethSent + ethReceived, 6),
        tokenTransfers: bucket.tokenTransfers,
        tokenContractsCount: bucket.tokenContractAddresses.size,
      };
    });
}

/** Prefer the longer series for tx metrics; overlay tokenTransfers from either side. */
export function mergeDailyAnalytics(primary = [], secondary = []) {
  const map = new Map();

  primary.forEach((row) => {
    map.set(row.date, { ...row });
  });

  secondary.forEach((row) => {
    const existing = map.get(row.date);
    if (!existing) {
      map.set(row.date, { ...row });
      return;
    }

    const useSecondaryTx = (row.transactionCount || 0) > (existing.transactionCount || 0);
    map.set(row.date, {
      date: row.date,
      transactionCount: useSecondaryTx ? row.transactionCount : existing.transactionCount,
      uniqueOutgoing: useSecondaryTx ? row.uniqueOutgoing : existing.uniqueOutgoing,
      uniqueIncoming: useSecondaryTx ? row.uniqueIncoming : existing.uniqueIncoming,
      ethFees: useSecondaryTx ? row.ethFees : existing.ethFees,
      ethFeesSpent: useSecondaryTx ? row.ethFeesSpent : existing.ethFeesSpent,
      ethFeesUsed: useSecondaryTx ? row.ethFeesUsed : existing.ethFeesUsed,
      ethSent: useSecondaryTx ? row.ethSent : existing.ethSent,
      ethReceived: useSecondaryTx ? row.ethReceived : existing.ethReceived,
      etherVolume: useSecondaryTx ? row.etherVolume : existing.etherVolume,
      tokenTransfers: Math.max(existing.tokenTransfers || 0, row.tokenTransfers || 0),
      tokenContractsCount: Math.max(existing.tokenContractsCount || 0, row.tokenContractsCount || 0),
    });
  });

  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function buildLastActivityAt(...transactionLists) {
  let maxTimestamp = 0;
  transactionLists.forEach((list) => {
    (list || []).forEach((transaction) => {
      const timestamp = Number(transaction.timeStamp || 0);
      if (timestamp > maxTimestamp) maxTimestamp = timestamp;
    });
  });
  return maxTimestamp ? new Date(maxTimestamp * 1000).toISOString() : null;
}

function buildMoneyFlowStats(normalTransactions, address) {
  const amounts = [];
  const monthCounts = {};
  const weekCounts = {};

  (normalTransactions || []).forEach((transaction) => {
    if (transaction.isError === "1") return;
    const amount = fromWei(transaction.value);
    if (amount > 0) amounts.push(amount);

    const timestamp = Number(transaction.timeStamp || 0);
    if (!timestamp) return;
    const date = new Date(timestamp * 1000);
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;

    const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    const weekKey = weekStart.toISOString().slice(0, 10);
    weekCounts[weekKey] = (weekCounts[weekKey] || 0) + 1;
  });

  const mostActiveMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0] || null;
  const mostActiveWeek = Object.entries(weekCounts).sort((a, b) => b[1] - a[1])[0] || null;
  const avgTransfer = amounts.length
    ? round(amounts.reduce((sum, value) => sum + value, 0) / amounts.length, 6)
    : 0;
  const largestTransfer = amounts.length ? round(Math.max(...amounts), 6) : 0;

  let incomingCount = 0;
  let outgoingCount = 0;
  (normalTransactions || []).forEach((transaction) => {
    if (transaction.isError === "1") return;
    if (transaction.to?.toLowerCase() === address) incomingCount += 1;
    if (transaction.from?.toLowerCase() === address) outgoingCount += 1;
  });

  return {
    avgTransfer,
    largestTransfer,
    incomingCount,
    outgoingCount,
    mostActiveMonth: mostActiveMonth?.[0] || null,
    mostActiveMonthCount: mostActiveMonth?.[1] || 0,
    mostActiveWeek: mostActiveWeek?.[0] || null,
    mostActiveWeekCount: mostActiveWeek?.[1] || 0,
  };
}

function estimateEthPriceChangePercent(moneyFlow, ethPrice) {
  const ethNet = Number(moneyFlow?.received || 0) - Number(moneyFlow?.spent || 0);
  const usdNet = Number(moneyFlow?.receivedUsd || 0) - Number(moneyFlow?.spentUsd || 0);
  if (!ethNet || !ethPrice || !Number.isFinite(usdNet)) return null;

  const ethSign = Math.sign(ethNet);
  const usdSign = Math.sign(usdNet);
  if (!ethSign || !usdSign || ethSign === usdSign) return null;

  const impliedPrice = usdNet / ethNet;
  if (!(impliedPrice > 0)) return null;
  return round(((ethPrice - impliedPrice) / impliedPrice) * 100, 2);
}

function exactTokenAmount(value, decimals) {
  const negative = String(value).startsWith("-");
  const digits = String(value || "0").replace(/^-/, "").padStart(decimals + 1, "0");
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  const fraction = decimals ? digits.slice(-decimals).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function reportTransaction(record, address, type) {
  const isTokenTransfer = type === "ERC-20 transfer";
  const decimals = isTokenTransfer ? Number(record.tokenDecimal || 0) : 18;

  return {
    date: new Date(Number(record.timeStamp) * 1000).toISOString().replace("T", " ").replace(".000Z", ""),
    type,
    direction: record.to?.toLowerCase() === address ? "receive" : "send",
    asset: isTokenTransfer ? record.tokenSymbol || "UNKNOWN" : "ETH",
    amount: exactTokenAmount(record.value || "0", decimals),
    from: record.from || "",
    to: record.to || "",
    status: record.isError === "1" ? "failed" : "success",
    blockNumber: Number(record.blockNumber || 0),
    hash: record.hash || "",
    timestamp: Number(record.timeStamp || 0),
  };
}

function transactionValueDelta(transaction, address, ethPrice) {
  if (transaction.isError === "1") return 0;

  const value = fromWei(transaction.value) * ethPrice;
  const received = transaction.to?.toLowerCase() === address ? value : 0;
  const sent = transaction.from?.toLowerCase() === address ? value : 0;
  return received - sent;
}

function tokenValueDelta(transfer, address, ethPrice) {
  if (transfer.isError === "1") return 0;

  const contractAddress = transfer.contractAddress?.toLowerCase();
  const cachedPrice = contractAddress ? priceCache.get(contractAddress) : null;
  const price = USD_PEGGED_TOKEN_ADDRESSES.has(contractAddress)
    ? 1
    : ETH_EQUIVALENT_TOKEN_ADDRESSES.has(contractAddress)
      ? ethPrice
      : cachedPrice?.value || 0;
  if (!price) return 0;

  const value = tokenAmount(transfer.value || "0", Number(transfer.tokenDecimal || 0)) * price;
  const received = transfer.to?.toLowerCase() === address ? value : 0;
  const sent = transfer.from?.toLowerCase() === address ? value : 0;
  return received - sent;
}

export function buildValuationHistory({
  address,
  currentValue,
  ethPrice,
  normalTransactions,
  internalTransactions,
  tokenTransfers,
  period,
}) {
  const dailyDeltas = new Map();
  const addDelta = (timestamp, delta) => {
    if (!delta) return;
    const date = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
    dailyDeltas.set(date, (dailyDeltas.get(date) || 0) + delta);
  };

  [...normalTransactions, ...internalTransactions].forEach((transaction) => {
    addDelta(transaction.timeStamp, transactionValueDelta(transaction, address, ethPrice));
  });
  tokenTransfers.forEach((transfer) => {
    addDelta(transfer.timeStamp, tokenValueDelta(transfer, address, ethPrice));
  });

  const start = new Date(period.start);
  const end = new Date(period.end);
  const dates = [];
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(date.toISOString().slice(0, 10));
  }

  let value = currentValue;
  const history = [];
  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const date = dates[index];
    history.push({ date, value: round(Math.max(0, value), 2) });
    value -= dailyDeltas.get(date) || 0;
  }

  const chronological = history.reverse();
  const maxPoints = 32;
  if (chronological.length <= maxPoints) return chronological;

  const step = (chronological.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => chronological[Math.round(index * step)]);
}
export async function getTransactionReportData(walletAddress, from, to) {
  const address = walletAddress.toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    throw new Error("Invalid Ethereum wallet address");
  }

  const range = await getDateRange(from, to);
  const query = { startblock: range.startBlock, endblock: range.endBlock };
  const [normalResult, internalResult, tokenResult] = await Promise.all([
    fetchPaginated("txlist", address, query),
    fetchPaginated("txlistinternal", address, query),
    fetchPaginated("tokentx", address, query),
  ]);
  const transactions = [
    ...normalResult.records.map((record) => reportTransaction(record, address, "Normal transaction")),
    ...internalResult.records.map((record) => reportTransaction(record, address, "Internal transaction")),
    ...tokenResult.records.map((record) => reportTransaction(record, address, "ERC-20 transfer")),
  ].sort((first, second) => second.timestamp - first.timestamp)
    .map((transaction) => {
      const reportRow = { ...transaction };
      delete reportRow.timestamp;
      return reportRow;
    });

  return {
    address,
    from,
    to,
    generatedAt: new Date().toISOString(),
    complete: normalResult.complete && internalResult.complete && tokenResult.complete,
    transactions,
  };
}

export function buildPublicWalletData(analytics) {
  const allAssets = (analytics.assets || []).map((asset) => ({
    contractAddress: asset.contractAddress,
    symbol: asset.symbol,
    name: asset.name,
    rawBalance: asset.rawBalance,
    balance: asset.balance,
    usdValue: asset.usdValue,
    priceAvailable: asset.priceAvailable,
    percentage: asset.percentage ?? 0,
    percentageBasis: asset.percentageBasis || "priced",
  }));
  const pricedCount = allAssets.filter((a) => a.priceAvailable).length;
  const totalAssetCount = allAssets.length;
  const pricingCoveragePercent = totalAssetCount > 0
    ? round((pricedCount / totalAssetCount) * 100, 1)
    : 0;

  return {
    portfolioValue: analytics.portfolioValue,
    portfolioValueSource: analytics.portfolioValueSource,
    portfolioInventory: {
      ...analytics.portfolioInventory,
      analyzedAssetCount: analytics.assetCount,
    },
    netWorth: analytics.netWorth,
    ethPrice: analytics.ethPrice,
    ethPriceChangePercent: analytics.ethPriceChangePercent ?? null,
    assetCount: analytics.assetCount,
    pricedAssetCount: pricedCount,
    pricingCoveragePercent,
    nftCount: analytics.nftCount,
    transactionCount: analytics.transactionCount,
    transactionCountIsLowerBound: analytics.transactionCountIsLowerBound,
    lastActivityAt: analytics.lastActivityAt ?? null,
    dailyTransactionCounts: analytics.dailyTransactionCounts || {},
    dailyAnalytics: analytics.dailyAnalytics || [],
    moneyFlowStats: analytics.moneyFlowStats || null,
    largestHolding: analytics.largestHolding,
    assets: allAssets,
    moneyFlow: analytics.moneyFlow,
    personality: analytics.personality,
    personalityFactors: analytics.personalityFactors,
    timeline: analytics.timeline,
    valuationHistory: analytics.valuationHistory,
    valuation: {
      ...analytics.valuation,
      pricedAssetCount: pricedCount,
      totalAssetCount,
      pricingCoveragePercent,
    },
    mostUsedProtocol: {
      name: analytics.mostUsedProtocol.name,
      interactionCount: analytics.mostUsedProtocol.interactionCount,
      type: analytics.mostUsedProtocol.type,
      recognizedCount: analytics.mostUsedProtocol.recognizedCount,
      unrecognizedCount: analytics.mostUsedProtocol.unrecognizedCount,
    },
    riskScore: analytics.riskScore,
    period: analytics.period,
    analysisWindow: analytics.analysisWindow,
    generatedAt: new Date().toISOString(),
    addressOverview: analytics.addressOverview ?? null,
    activityStats: analytics.activityStats ?? null,
  };
}

export async function getWalletData(walletAddress, analysisPeriod = DEFAULT_ANALYSIS_PERIOD, customRange = null) {
  const address = walletAddress.toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    throw new Error("Invalid Ethereum wallet address");
  }

  let period, cacheKey = null;
  if (customRange && customRange.from && customRange.to) {
    const range = await getDateRange(customRange.from, customRange.to);
    period = {
      id: `custom:${customRange.from}:${customRange.to}`,
      days: Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / 86_400_000)),
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      startBlock: range.startBlock,
      endBlock: range.endBlock,
    };
  } else {
    const normalizedPeriod = normalizeAnalysisPeriod(analysisPeriod);
    cacheKey = `${address}:${normalizedPeriod}`;
    const cachedWallet = walletCache.get(cacheKey);
    if (cachedWallet?.expiresAt > Date.now()) {
      return cachedWallet.value;
    }
    period = await getAnalysisPeriod(normalizedPeriod);
  }

  try {
    const [
      normalResult,
      internalResult,
      tokenResult,
      nftResult,
      balanceWei,
      priceResult,
      etherscanTokenPortfolio,
    ] = await Promise.all([
      fetchPaginated("txlist", address, { startblock: period.startBlock, endblock: period.endBlock }),
      fetchPaginated("txlistinternal", address, { startblock: period.startBlock, endblock: period.endBlock }),
      fetchPaginated("tokentx", address, { startblock: period.startBlock, endblock: period.endBlock }),
      fetchPaginated("tokennfttx", address, { startblock: period.startBlock, endblock: period.endBlock }),
      blockActionRequest({ module: "account", action: "balance", address, tag: "latest" }),
      blockActionRequest({ module: "stats", action: "ethprice" }),
      // This Pro endpoint is optional. Its absence must not prevent analytics from loading.
      blockActionRequest({ module: "account", action: "addresstokenbalance", address, page: 1, offset: 1000 })
        .catch(() => null),
    ]);

    const ethPrice = Number(priceResult.ethusd || 0);
    const ethBalance = fromWei(balanceWei);
    const normalTransactions = normalResult.records;
    const internalTransactions = internalResult.records;
    const tokenTransfers = addDirection(tokenResult.records, address);
    const nftTransfers = addDirection(nftResult.records, address);
    const nfts = buildNfts(nftTransfers, address);

    const etherscanPrices = buildEtherscanPriceMap(etherscanTokenPortfolio);

    // Build initial assets without external prices to know which tokens need pricing
    const initialAssets = buildAssets(tokenTransfers, ethBalance, ethPrice, address, {}, etherscanPrices);
    const tokensNeedingPrices = initialAssets
      .filter((a) => !a.priceAvailable && a.contractAddress && Number(a.rawBalance) > 0)
      .map((a) => a.contractAddress);
    const tokenPricePromise = tokensNeedingPrices.length > 0
      ? fetchTokenPrices(tokensNeedingPrices)
      : Promise.resolve({});

    const [tokenPrices, protocolAnalysis] = await Promise.all([
      tokenPricePromise,
      analyzeProtocols(normalTransactions),
    ]);

    // Rebuild assets with DefiLlama + Etherscan prices for every unpriced held token
    const fullyPricedAssets = attachAssetPercentages(
      buildAssets(tokenTransfers, ethBalance, ethPrice, address, tokenPrices, etherscanPrices),
    );
    const pricedAssets = fullyPricedAssets.filter((asset) => asset.priceAvailable);

    if (tokensNeedingPrices.length > 0) {
      const newlyPriced = pricedAssets.filter(
        (a) => a.contractAddress && tokensNeedingPrices.includes(a.contractAddress)
      );
      console.log(`[Token Pricing] DefiLlama priced ${newlyPriced.length}/${tokensNeedingPrices.length} tokens`);
    }

    const moneyFlow = calculateMoneyFlow(normalTransactions, internalTransactions, address, ethPrice);
    const moneyFlowStats = buildMoneyFlowStats(normalTransactions, address);
    const ethPriceChangePercent = estimateEthPriceChangePercent(moneyFlow, ethPrice);
    const dailyTransactionCounts = buildDailyTransactionCounts(normalTransactions);
    let dailyAnalytics = buildDailyAnalytics(address, {
      normalTransactions,
      tokenTransfers,
      nftTransfers,
    });
    const lastActivityAt = buildLastActivityAt(normalTransactions, internalTransactions, tokenTransfers, nftTransfers);
    const personalityDetails = calculatePersonalityDetails({
      normalTransactions,
      tokenTransfers,
      nftTransfers,
      protocolCounts: protocolAnalysis.counts,
      currentAssetCount: fullyPricedAssets.length,
    });
    const walletPersonality = personalityDetails.percentages;
    const personality = normalizePercentages({
      nftCollector: walletPersonality.nftCollector,
      trader: walletPersonality.trader,
      defiExplorer: walletPersonality.defiExplorer,
      holder: walletPersonality.holder,
    });
    const riskScore = calculateRiskScore({
      assets: fullyPricedAssets,
      normalTransactions,
      protocolCounts: protocolAnalysis.counts,
    });
    const netWorth = round(pricedAssets.reduce((sum, asset) => sum + asset.usdValue, 0), 2);
    const nativeValue = ethBalance * ethPrice;
    const etherscanTokenSummary = summarizeEtherscanTokenPortfolio(etherscanTokenPortfolio);
    const etherscanTokenValue = etherscanTokenSummary
      ? round(etherscanTokenSummary.valueUsd, 2)
      : null;
    const hasEtherscanPortfolio = etherscanTokenValue !== null;
    // Prefer transfer-scan + DefiLlama net worth; Etherscan Pro is inventory/count only unless
    // it is the sole available valuation (kept as portfolioValue for transparency).
    const portfolioValue = round(hasEtherscanPortfolio ? nativeValue + etherscanTokenValue : netWorth, 2);
    const portfolioInventory = startPortfolioInventoryJob(address, etherscanTokenPortfolio);
    const valuationHistory = buildValuationHistory({
      address,
      currentValue: netWorth,
      ethPrice,
      normalTransactions,
      internalTransactions,
      tokenTransfers,
      period,
    });
    const analytics = {
      netWorth,
      portfolioValue,
      portfolioValueSource: hasEtherscanPortfolio ? "etherscan" : "defillama",
      portfolioInventory,
      ethPrice,
      ethPriceChangePercent,
      assetCount: fullyPricedAssets.length,
      nftCount: nfts.reduce((sum, nft) => sum + nft.amount, 0),
      transactionCount: normalTransactions.length,
      transactionCountIsLowerBound: !normalResult.complete,
      lastActivityAt,
      dailyTransactionCounts,
      dailyAnalytics,
      moneyFlowStats,
      largestHolding: buildLargestHolding(fullyPricedAssets),
      assets: fullyPricedAssets,
      moneyFlow,
      personality,
      personalityFactors: personalityDetails.factors,
      timeline: buildTimeline(normalTransactions, address, tokenTransfers),
      valuationHistory,
      valuation: {
        source: "blockaction",
        networks: (normalTransactions.length > 0 ||
          internalTransactions.length > 0 ||
          tokenTransfers.length > 0 ||
          nftTransfers.length > 0) ? ["eth-mainnet"] : [],
        pricedAssetCount: pricedAssets.length,
        totalAssetCount: fullyPricedAssets.length,
        pricingCoveragePercent: fullyPricedAssets.length > 0
          ? round((pricedAssets.length / fullyPricedAssets.length) * 100, 1)
          : 0,
        complete: tokenResult.complete,
      },
      mostUsedProtocol: {
        name: protocolAnalysis.name,
        interactionCount: protocolAnalysis.count,
        type: protocolAnalysis.type,
        recognizedCount: protocolAnalysis.recognizedCount,
        unrecognizedCount: protocolAnalysis.unrecognizedCount,
        counts: protocolAnalysis.counts,
      },
      riskScore,
      period: {
        id: period.id,
        days: period.days,
        start: period.start,
        end: period.end,
        startBlock: period.startBlock,
        endBlock: period.endBlock,
      },
      analysisWindow: {
        maxRecordsPerCategory: PAGE_SIZE * MAX_PAGES,
        normalTransactionsComplete: normalResult.complete,
        internalTransactionsComplete: internalResult.complete,
        tokenTransfersComplete: tokenResult.complete,
        nftTransfersComplete: nftResult.complete,
      },
    };

    const activityStatsPromise = fetchWalletActivityStats(address).catch((activityError) => {
      console.warn(`[Activity Stats] Partial stats for ${address}: ${activityError.message}`);
      return null;
    });

    try {
      analytics.addressOverview = await buildAddressOverview({
        address,
        ethBalance,
        ethPrice,
        assets: fullyPricedAssets,
        portfolioInventory,
        etherscanTokenSummary,
      });
    } catch (overviewError) {
      console.warn(`[Wallet Overview] Partial overview for ${address}: ${overviewError.message}`);
      analytics.addressOverview = {
        ethBalance,
        ethValueUsd: round(ethBalance * ethPrice, 2),
        tokenHoldings: (() => {
          const summary = buildTokenHoldingsSummary(
            fullyPricedAssets,
            ethPrice,
            portfolioInventory,
            etherscanTokenSummary,
          );
          return {
            valueUsd: summary.tokenValueUsd,
            pricedCount: summary.pricedTokenCount,
            totalCount: summary.totalTokenCount,
            unpricedCount: summary.unpricedCount,
            totalAssetsHeld: summary.totalAssetsHeld,
            inventorySource: summary.inventorySource,
            inventoryComplete: summary.inventoryComplete,
            inventoryPending: summary.inventoryPending,
            valuationSource: summary.valuationSource,
          };
        })(),
        firstTransactionAt: null,
        latestTransactionAt: null,
        fundedBy: null,
        delegation: null,
      };
    }

    analytics.activityStats = await activityStatsPromise;

    if (analytics.activityStats?.dailyAnalytics?.length) {
      analytics.dailyAnalytics = mergeDailyAnalytics(
        analytics.dailyAnalytics,
        analytics.activityStats.dailyAnalytics,
      );
      analytics.dailyTransactionCounts = Object.fromEntries(
        analytics.dailyAnalytics.map((row) => [row.date, row.transactionCount]),
      );
    }

    const result = buildPublicWalletData(analytics);

    if (cacheKey) {
      walletCache.set(cacheKey, {
        value: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }

    return result;
  } catch (error) {
    const walletError = new Error(`Unable to analyze wallet ${walletAddress}: ${error.message}`);
    walletError.cause = error;
    throw walletError;
  }
}
