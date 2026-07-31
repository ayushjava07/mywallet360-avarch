import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";
import {
  buildPublicWalletData,
  buildValuationHistory,
  buildLargestHolding,
  buildTimeline,
  buildDailyTransactionCounts,
  buildDailyAnalytics,
  mergeDailyAnalytics,
  buildLastActivityAt,
  clearWalletServiceCaches,
  getBlockByTimestamp,
} from "./blockaction.service.js";

test("builds dated current-price value estimates from wallet flows", () => {
  const history = buildValuationHistory({
    address: "0xwallet",
    currentValue: 115,
    ethPrice: 1,
    normalTransactions: [{
      from: "0xsender",
      to: "0xwallet",
      value: "10000000000000000000",
      timeStamp: String(Date.parse("2026-06-02T12:00:00Z") / 1000),
    }],
    internalTransactions: [],
    tokenTransfers: [{
      contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      from: "0xsender",
      to: "0xwallet",
      tokenDecimal: "6",
      value: "5000000",
      timeStamp: String(Date.parse("2026-06-02T13:00:00Z") / 1000),
    }],
    period: {
      start: "2026-06-01T00:00:00.000Z",
      end: "2026-06-03T00:00:00.000Z",
    },
  });

  assert.deepEqual(history, [
    { date: "2026-06-01", value: 100 },
    { date: "2026-06-02", value: 115 },
    { date: "2026-06-03", value: 115 },
  ]);
});

test("wallet API response excludes large internal collections", () => {
  const response = buildPublicWalletData({
    netWorth: 12,
    portfolioValue: 13,
    portfolioValueSource: "etherscan",
    portfolioInventory: { status: "complete", tokenHoldingsCount: 88_516, source: "etherscan" },
    assetCount: 2,
    nftCount: 3,
    transactionCount: 5,
    transactionCountIsLowerBound: false,
    largestHolding: null,
    moneyFlow: {},
    personality: {},
    personalityFactors: {},
    timeline: [],
    valuationHistory: [{ date: "2026-06-01", value: 12 }],
    valuation: { totalAssetCount: 2 },
    mostUsedProtocol: {
      name: "Other",
      interactionCount: 1,
      type: "protocol",
      recognizedCount: 0,
      unrecognizedCount: 1,
      counts: { Other: 1 }
    },
    riskScore: {},
    period: { id: "30d", days: 30 },
    analysisWindow: {},
    dailyTransactionCounts: { "2026-06-01": 2 },
    dailyAnalytics: [{
      date: "2026-06-01",
      transactionCount: 2,
      uniqueOutgoing: 1,
      uniqueIncoming: 1,
      ethFees: 0.001,
      ethSent: 1,
      ethReceived: 0.5,
      etherVolume: 1.5,
      tokenTransfers: 3,
    }],
    lastActivityAt: "2026-06-01T00:00:00.000Z",
    ethPriceChangePercent: null,
    moneyFlowStats: { avgTransfer: 1 },
    activityStats: {
      source: "computed_partial",
      transactionCount: {
        value: 531878,
        isLowerBound: true,
        sinceLabel: "Since Mon 28, Sep 2015",
      },
      activeAge: { label: "10 Years 302 Days", sinceLabel: "Since Mon 28, Sep 2015" },
      uniqueDaysActive: { label: "5 Years 275 Days", sinceLabel: "Since Mon 28, Sep 2015" },
      longestStreak: { label: "2 Years 130 Days", sinceLabel: "Since Fri 24, Nov 2023" },
      dailyCounts: { "2026-06-01": 2 },
    },
  });

  assert.equal(response.assetCount, 2);
  assert.equal(response.portfolioValue, 13);
  assert.equal(response.portfolioValueSource, "etherscan");
  assert.deepEqual(response.portfolioInventory, {
    status: "complete",
    tokenHoldingsCount: 88_516,
    source: "etherscan",
    analyzedAssetCount: 2,
  });
  assert.equal(response.mostUsedProtocol.name, "Other");
  assert.equal(response.mostUsedProtocol.type, "protocol");
  assert.equal(response.mostUsedProtocol.recognizedCount, 0);
  assert.equal(response.mostUsedProtocol.unrecognizedCount, 1);
  assert.deepEqual(response.valuationHistory, [{ date: "2026-06-01", value: 12 }]);
  assert.equal(typeof response.generatedAt, "string");
  assert.equal("assets" in response, true);
  assert.equal("nfts" in response, false);
  assert.equal("topAssets" in response, false);
  assert.equal("topNfts" in response, false);
  assert.equal("counts" in response.mostUsedProtocol, false);
  assert.deepEqual(response.dailyTransactionCounts, { "2026-06-01": 2 });
  assert.equal(response.dailyAnalytics[0].transactionCount, 2);
  assert.equal(response.dailyAnalytics[0].uniqueOutgoing, 1);
  assert.equal(response.lastActivityAt, "2026-06-01T00:00:00.000Z");
  assert.equal(response.activityStats.source, "computed_partial");
  assert.equal(response.activityStats.transactionCount.value, 531878);
  assert.equal(response.activityStats.transactionCount.isLowerBound, true);
  assert.equal(response.activityStats.activeAge.label, "10 Years 302 Days");
});

test("largest holding dilutes percentage when unpriced assets exist", () => {
  const holding = buildLargestHolding([
    { symbol: "ETH", balance: 1, rawBalance: 1, usdValue: 1000, priceAvailable: true },
    { symbol: "AAAA", balance: 10, rawBalance: 10, usdValue: 0, priceAvailable: false },
    { symbol: "BBBB", balance: 20, rawBalance: 20, usdValue: 0, priceAvailable: false },
  ]);

  assert.equal(holding.symbol, "ETH");
  assert.equal(holding.unpricedCount, 2);
  assert.equal(holding.totalAssetCount, 3);
  assert.ok(holding.percentage < 100);
  assert.equal(holding.percentageBasis, "all_holdings");
});

test("largest holding uses full priced share when all assets are priced", () => {
  const holding = buildLargestHolding([
    { symbol: "ETH", balance: 1, rawBalance: 1, usdValue: 900, priceAvailable: true },
    { symbol: "USDC", balance: 100, rawBalance: 100, usdValue: 100, priceAvailable: true },
  ]);

  assert.equal(holding.symbol, "ETH");
  assert.equal(holding.percentage, 90);
  assert.equal(holding.percentageBasis, "priced");
  assert.equal(holding.unpricedCount, 0);
});

test("timeline omits zero ETH amount and prefers token transfer value", () => {
  const address = "0xwallet";
  const hash = "0xabc123";
  const timeline = buildTimeline(
    [{
      hash,
      from: address,
      to: "0xcontract",
      value: "0",
      input: "0x095ea7b3",
      timeStamp: String(Date.parse("2026-06-02T12:00:00Z") / 1000),
    }],
    address,
    [{
      hash,
      from: address,
      to: "0xrouter",
      value: "1500000",
      tokenDecimal: "6",
      tokenSymbol: "USDC",
      contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    }],
  );

  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].value.symbol, "USDC");
  assert.equal(timeline[0].value.amount, 1.5);
  assert.equal(timeline[0].type, "contract interaction");
});

test("timeline sets null value when zero ETH and no token transfers", () => {
  const address = "0xwallet";
  const timeline = buildTimeline(
    [{
      hash: "0xdead",
      from: address,
      to: "0xcontract",
      value: "0",
      input: "0x095ea7b3",
      timeStamp: String(Date.parse("2026-06-02T12:00:00Z") / 1000),
    }],
    address,
    [],
  );

  assert.equal(timeline[0].value, null);
});

test("daily transaction counts cover full period", () => {
  const counts = buildDailyTransactionCounts([
    { timeStamp: String(Date.parse("2026-06-01T10:00:00Z") / 1000) },
    { timeStamp: String(Date.parse("2026-06-01T11:00:00Z") / 1000) },
    { timeStamp: String(Date.parse("2026-06-02T10:00:00Z") / 1000) },
  ]);

  assert.equal(counts["2026-06-01"], 2);
  assert.equal(counts["2026-06-02"], 1);
});

test("daily analytics aggregates tx peers, fees, ether volume, and token transfers", () => {
  const address = "0xwallet";
  const day = String(Date.parse("2026-06-01T12:00:00Z") / 1000);

  const rows = buildDailyAnalytics(address, {
    normalTransactions: [
      {
        timeStamp: day,
        from: address,
        to: "0xout1",
        value: "1000000000000000000",
        gasUsed: "21000",
        gasPrice: "1000000000",
      },
      {
        timeStamp: day,
        from: "0xin1",
        to: address,
        value: "500000000000000000",
        gasUsed: "21000",
        gasPrice: "1000000000",
      },
      {
        timeStamp: day,
        from: address,
        to: "0xout1",
        value: "0",
        gasUsed: "21000",
        gasPrice: "1000000000",
      },
    ],
    tokenTransfers: [{ timeStamp: day, contractAddress: "0xtoken1" }],
    nftTransfers: [{ timeStamp: day, contractAddress: "0xnft1" }],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "2026-06-01");
  assert.equal(rows[0].transactionCount, 3);
  assert.equal(rows[0].uniqueOutgoing, 1);
  assert.equal(rows[0].uniqueIncoming, 1);
  assert.equal(rows[0].ethFees, 0.000042);
  assert.equal(rows[0].ethFeesSpent, 0.000042);
  assert.equal(rows[0].ethFeesUsed, 0.000021);
  assert.equal(rows[0].ethSent, 1);
  assert.equal(rows[0].ethReceived, 0.5);
  assert.equal(rows[0].etherVolume, 1.5);
  assert.equal(rows[0].tokenTransfers, 2);
  assert.equal(rows[0].tokenContractsCount, 2);
});

test("mergeDailyAnalytics overlays token transfers onto longer series", () => {
  const merged = mergeDailyAnalytics(
    [{
      date: "2026-06-01",
      transactionCount: 1,
      uniqueOutgoing: 1,
      uniqueIncoming: 0,
      ethFees: 0.1,
      ethSent: 1,
      ethReceived: 0,
      etherVolume: 1,
      tokenTransfers: 0,
    }],
    [{
      date: "2026-06-01",
      transactionCount: 5,
      uniqueOutgoing: 2,
      uniqueIncoming: 3,
      ethFees: 0.2,
      ethSent: 2,
      ethReceived: 1,
      etherVolume: 3,
      tokenTransfers: 4,
    }],
  );

  assert.equal(merged[0].transactionCount, 5);
  assert.equal(merged[0].tokenTransfers, 4);
  assert.equal(merged[0].uniqueIncoming, 3);
});

test("last activity uses newest timestamp across lists", () => {
  const last = buildLastActivityAt(
    [{ timeStamp: "100" }],
    [{ timeStamp: "300" }],
    [{ timeStamp: "200" }],
  );
  assert.equal(last, new Date(300_000).toISOString());
});

test("getBlockByTimestamp falls back to estimated block when upstream times out", async () => {
  const originalGet = axios.get;
  axios.get = async () => {
    const error = new Error("timeout of 25000ms exceeded");
    error.code = "ECONNABORTED";
    error.isAxiosError = true;
    throw error;
  };

  try {
    clearWalletServiceCaches();
    process.env.BLOCKACTION_API_URL = process.env.BLOCKACTION_API_URL || "https://api.etherscan.io/v2/api";
    const block = await getBlockByTimestamp(1_767_225_600, "after");
    assert.ok(block > 20_000_000);
  } finally {
    axios.get = originalGet;
    clearWalletServiceCaches();
  }
});
