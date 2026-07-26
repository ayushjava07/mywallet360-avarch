import assert from "node:assert/strict";
import test from "node:test";
import {
  buildActivityStats,
  computeActiveAge,
  computeLongestStreak,
  computeUniqueDaysActive,
  formatDurationFromDays,
  formatSinceLabel,
} from "./wallet-activity-stats.service.js";

test("formatDurationFromDays renders years and days", () => {
  assert.equal(formatDurationFromDays(302 + 365 * 10).label, "10 Years 302 Days");
  assert.equal(formatDurationFromDays(5).label, "5 Days");
});

test("formatSinceLabel matches Etherscan-style copy", () => {
  const label = formatSinceLabel("2015-09-28T12:00:00.000Z");
  assert.match(label, /^Since Mon 28, Sep 2015$/);
});

test("computeLongestStreak finds consecutive active days", () => {
  const dailyCounts = {
    "2023-11-24": 1,
    "2023-11-25": 2,
    "2023-11-26": 1,
    "2024-01-01": 3,
  };

  const streak = computeLongestStreak(dailyCounts);
  assert.equal(streak.totalDays, 3);
  assert.match(streak.sinceLabel, /^Since Fri 24, Nov 2023$/);
});

test("computeUniqueDaysActive counts distinct active days as duration", () => {
  const dailyCounts = {
    "2015-09-28": 1,
    "2016-01-01": 2,
    "2016-01-02": 1,
  };

  const unique = computeUniqueDaysActive(dailyCounts, "2015-09-28T00:00:00.000Z");
  assert.equal(unique.count, 3);
  assert.equal(unique.label, "3 Days");
  assert.match(unique.sinceLabel, /^Since Mon 28, Sep 2015$/);
});

test("buildActivityStats assembles card payload", () => {
  const stats = buildActivityStats({
    dailyCounts: { "2015-09-28": 1, "2023-11-24": 2, "2023-11-25": 1 },
    firstTransactionAt: "2015-09-28T00:00:00.000Z",
    latestTransactionAt: "2026-06-01T00:00:00.000Z",
    transactionCount: 531878,
    transactionCountIsLowerBound: true,
    source: "computed_partial",
  });

  assert.equal(stats.transactionCount.value, 531878);
  assert.equal(stats.transactionCount.isLowerBound, true);
  assert.ok(stats.activeAge);
  assert.ok(stats.uniqueDaysActive);
  assert.ok(stats.longestStreak);
  assert.equal(stats.source, "computed_partial");
});

test("computeActiveAge measures elapsed time since first transaction", () => {
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  const activeAge = computeActiveAge(tenYearsAgo.toISOString());
  assert.ok(activeAge.years >= 9);
  assert.ok(activeAge.sinceLabel.startsWith("Since "));
});
