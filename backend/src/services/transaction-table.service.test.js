import assert from "node:assert/strict";
import test from "node:test";
import {
  getMethodDisplayLabel,
  isContractTriggeredTransfer,
  resolveTransactionMethod,
} from "../utils/transaction-method.js";
import {
  mapTransactionRow,
  normalizePeriod,
  resolveDirection,
  resolveFillConfig,
} from "./transaction-table.service.js";

test("normalizePeriod accepts numeric strings", () => {
  assert.equal(normalizePeriod("30"), 30);
  assert.equal(normalizePeriod("ytd"), "ytd");
  assert.throws(() => normalizePeriod("20"), /Invalid analysis period/);
});

test("resolveTransactionMethod labels native transfers and contract calls", () => {
  assert.equal(
    resolveTransactionMethod({ input: "0x", value: "1000000000000000000" }, "normal"),
    "Transfer",
  );
  assert.equal(
    resolveTransactionMethod({ input: "0x095ea7b3" }, "normal"),
    "Approve",
  );
  assert.equal(
    resolveTransactionMethod({ input: "0x38ed1739" }, "normal"),
    "Token Swap",
  );
  assert.equal(resolveTransactionMethod({}, "token"), "Transfer");
  assert.equal(resolveTransactionMethod({}, "nft"), "Transfer");
});

test("resolveDirection compares from/to against wallet address", () => {
  const wallet = "0xabc0000000000000000000000000000000000001";

  assert.equal(
    resolveDirection({ from: "0x1", to: wallet }, wallet, "normal"),
    "IN",
  );
  assert.equal(
    resolveDirection({ from: wallet, to: "0x2" }, wallet, "normal"),
    "OUT",
  );
});

test("resolveFillConfig scans deeper when hiding low-value rows", () => {
  const preview = resolveFillConfig(true, 10);
  const standard = resolveFillConfig(false, 25);

  assert.ok(preview.maxFillPages > standard.maxFillPages);
  assert.ok(preview.maxFillPages <= 8);
  assert.equal(preview.maxFillPages, 6);
  assert.ok(preview.upstreamBatchSize >= 100);
  assert.equal(standard.maxFillPages, 4);
});

test("mapTransactionRow includes fee, amount, and direction fields", () => {
  const wallet = "0xabc0000000000000000000000000000000000001";
  const row = mapTransactionRow({
    hash: "0xhash",
    blockNumber: "123",
    timeStamp: "1718000000",
    from: "0x1",
    to: wallet,
    value: "1500000000000000000",
    input: "0x",
    gasUsed: "21000",
    gasPrice: "1000000000",
    isError: "0",
  }, wallet, "normal");

  assert.equal(row.hash, "0xhash");
  assert.equal(row.method, "Transfer");
  assert.equal(row.methodDisplay, "Transfer");
  assert.equal(row.direction, "IN");
  assert.equal(row.amountSymbol, "ETH");
  assert.equal(row.amount, 1.5);
  assert.ok(row.feeEth > 0);
  assert.equal(row.status, "success");
});
