import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildHeatmapMonthBlocks,
  buildMonthBlock,
  getHeatmapRange,
  listMonthsInRange,
  padToWeekEndSunday,
  padToWeekStartMonday,
} from './transactionHeatmap.utils.js'

test('getHeatmapRange returns rolling 12 calendar months', () => {
  const txCounts = { '2026-07-20': 3, '2025-08-01': 1 }
  const range = getHeatmapRange(txCounts)

  assert.ok(range)
  assert.equal(range.displayStartStr, '2025-08-01')
  assert.ok(range.displayEndStr >= '2026-07-20')
})

test('buildHeatmapMonthBlocks creates one block per month without throwing', () => {
  const txCounts = {
    '2025-08-15': 2,
    '2026-01-10': 4,
    '2026-07-26': 5,
  }
  const range = getHeatmapRange(txCounts)
  const blocks = buildHeatmapMonthBlocks(txCounts, range)

  assert.equal(blocks.length, 12)
  blocks.forEach((block) => {
    assert.ok(Number.isInteger(block.numWeeks))
    assert.ok(block.numWeeks > 0)
    assert.equal(block.cells.length, block.numWeeks * 7)
  })
})

test('buildMonthBlock pads partial weeks with inactive cells', () => {
  const block = buildMonthBlock(
    { '2026-07-22': 1 },
    {
      month: 6,
      year: 2026,
      label: 'Jul',
      visibleStart: new Date(2026, 6, 1),
      visibleEnd: new Date(2026, 6, 22),
    },
  )

  assert.ok(block.numWeeks >= 4)
  assert.equal(block.cells.filter((cell) => cell.isActive).length, 22)
})

test('listMonthsInRange spans Aug 2025 through Jul 2026', () => {
  const months = listMonthsInRange(
    new Date(2025, 7, 1),
    new Date(2026, 6, 26),
  )

  assert.equal(months.length, 12)
  assert.equal(months[0].label, 'Aug')
  assert.equal(months[11].label, 'Jul')
})

test('week padding uses Monday start and Sunday end', () => {
  const wednesday = new Date(2026, 6, 22)
  assert.equal(padToWeekStartMonday(wednesday).getDay(), 1)
  assert.equal(padToWeekEndSunday(wednesday).getDay(), 0)
})
