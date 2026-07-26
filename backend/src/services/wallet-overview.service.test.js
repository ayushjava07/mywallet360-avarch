import assert from "node:assert/strict";
import test from "node:test";
import {
  findFirstInboundNativeEth,
  buildTokenHoldingsSummary,
  summarizeEtherscanTokenPortfolio,
} from "./wallet-overview.service.js";

const WALLET = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";

test("findFirstInboundNativeEth returns earliest inbound native transfer", () => {
  const match = findFirstInboundNativeEth([
    {
      from: "0x1111111111111111111111111111111111111111",
      to: WALLET,
      value: "0",
      isError: "0",
      timeStamp: "100",
    },
    {
      from: "0x2222222222222222222222222222222222222222",
      to: WALLET,
      value: "1000000000000000000",
      isError: "0",
      timeStamp: "200",
      hash: "0xabc",
    },
  ], WALLET);

  assert.equal(match.from, "0x2222222222222222222222222222222222222222");
  assert.equal(match.timestamp, 200);
});

test("buildTokenHoldingsSummary excludes native ETH from token totals", () => {
  const summary = buildTokenHoldingsSummary([
    { symbol: "ETH", priceAvailable: true, usdValue: 1000 },
    { symbol: "USDC", priceAvailable: true, usdValue: 250 },
    { symbol: "SHIB", priceAvailable: false, usdValue: 0 },
  ], 2000);

  assert.equal(summary.tokenValueUsd, 250);
  assert.equal(summary.pricedTokenCount, 1);
  assert.equal(summary.totalTokenCount, 2);
  assert.equal(summary.unpricedCount, 1);
  assert.equal(summary.totalAssetsHeld, 3);
  assert.equal(summary.inventorySource, "transfer_scan");
  assert.equal(summary.inventoryComplete, false);
});

test("buildTokenHoldingsSummary prefers etherscan inventory for totals when complete", () => {
  const summary = buildTokenHoldingsSummary([
    { symbol: "ETH", priceAvailable: true, usdValue: 1000 },
    { symbol: "USDC", priceAvailable: true, usdValue: 250 },
    { symbol: "SHIB", priceAvailable: false, usdValue: 0 },
  ], 2000, {
    status: "complete",
    tokenHoldingsCount: 568,
    source: "etherscan",
  });

  assert.equal(summary.totalTokenCount, 568);
  assert.equal(summary.unpricedCount, 567);
  assert.equal(summary.totalAssetsHeld, 569);
  assert.equal(summary.inventorySource, "etherscan_inventory");
  assert.equal(summary.inventoryComplete, true);
});

test("summarizeEtherscanTokenPortfolio sums TokenPriceUSD across snapshot tokens", () => {
  const summary = summarizeEtherscanTokenPortfolio([
    { TokenQuantity: "1000000", TokenDivisor: "6", TokenPriceUSD: "1" },
    { TokenQuantity: "2000000000000000000", TokenDivisor: "18", TokenPriceUSD: "2000" },
    { TokenQuantity: "999", TokenDivisor: "0", TokenPriceUSD: "0" },
  ]);

  assert.equal(summary.valueUsd, 4001);
  assert.equal(summary.pricedCount, 2);
  assert.equal(summary.totalCount, 3);
});

test("buildTokenHoldingsSummary prefers etherscan snapshot value over transfer scan", () => {
  const summary = buildTokenHoldingsSummary([
    { symbol: "ETH", priceAvailable: true, usdValue: 1000 },
    { symbol: "USDC", priceAvailable: true, usdValue: 250 },
    { symbol: "SHIB", priceAvailable: false, usdValue: 0 },
  ], 2000, null, {
    valueUsd: 92806.97,
    pricedCount: 401,
    totalCount: 568,
  });

  assert.equal(summary.tokenValueUsd, 92806.97);
  assert.equal(summary.pricedTokenCount, 401);
  assert.equal(summary.totalTokenCount, 568);
  assert.equal(summary.valuationSource, "etherscan_snapshot");
});
