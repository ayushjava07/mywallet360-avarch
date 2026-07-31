import test from "node:test";
import assert from "node:assert/strict";
import {
  LATEST_BLOCK,
  estimateBlockNumber,
  shouldUseLatestBlock,
} from "./block-by-time.js";

test("estimateBlockNumber returns a positive block for known timestamps", () => {
  const jan2025 = estimateBlockNumber(1_735_689_600, "1");
  assert.ok(jan2025 >= 21_400_000);
  assert.ok(jan2025 <= 21_700_000);
});

test("estimateBlockNumber advances roughly one year of blocks", () => {
  const jan2025 = estimateBlockNumber(1_735_689_600, "1");
  const jan2026 = estimateBlockNumber(1_767_225_600, "1");
  const expectedDelta = Math.floor(31_536_000 / 12);
  assert.ok(Math.abs(jan2026 - jan2025 - expectedDelta) <= 5_000);
});

test("shouldUseLatestBlock is true for current-day ranges", () => {
  assert.equal(shouldUseLatestBlock(new Date()), true);
  assert.equal(shouldUseLatestBlock(new Date(Date.now() - 12 * 60 * 60 * 1000)), true);
});

test("shouldUseLatestBlock is false for older end dates", () => {
  assert.equal(shouldUseLatestBlock(new Date("2024-01-01T00:00:00.000Z")), false);
});

test("LATEST_BLOCK uses etherscan latest sentinel", () => {
  assert.equal(LATEST_BLOCK, 99_999_999);
});
