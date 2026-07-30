import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTableHeaderCount,
  compactAddress,
  formatRelativeTime,
  resolveAddressLabel,
} from "./transactionTable.utils.js";

test("compactAddress truncates long addresses", () => {
  const address = "0xabcdef1234567890abcdef1234567890abcdef12";
  assert.equal(compactAddress(address), "0xabcd...ef12");
});

test("formatRelativeTime returns human-readable age", () => {
  const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 86400;
  assert.match(formatRelativeTime(twoDaysAgo), /days ago/);
});

test("resolveAddressLabel prefers ENS for the viewed wallet", () => {
  const wallet = "0xabc0000000000000000000000000000000000001";
  assert.equal(resolveAddressLabel(wallet, wallet, "vitalik.eth"), "vitalik.eth");
  assert.equal(resolveAddressLabel("0x1111111111111111111111111111111111111111", wallet, "vitalik.eth"), "0x1111...1111");
});

test("buildTableHeaderCount includes totals when available", () => {
  const label = buildTableHeaderCount({
    tabId: "normal",
    page: 1,
    limit: 25,
    rowCount: 25,
    totalCount: 78000,
    totalIsLowerBound: true,
    hasMore: true,
  });
  assert.match(label, /25 of 78,000\+/);
});
