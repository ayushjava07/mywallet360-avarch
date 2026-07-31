import assert from 'node:assert/strict'
import test from 'node:test'
import { filterRowsByDirection, mapTableRowToActivityItem } from './notableActivity.utils.js'

test('mapTableRowToActivityItem maps incoming ETH transfer', () => {
  const item = mapTableRowToActivityItem({
    hash: '0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890',
    method: 'transfer',
    methodDisplay: 'Transfer',
    contractTriggered: false,
    blockNumber: 123,
    timestamp: Math.floor(Date.now() / 1000) - 3600,
    from: '0x1111111111111111111111111111111111111111',
    to: '0x2222222222222222222222222222222222222222',
    direction: 'IN',
    amount: 1.5,
    amountSymbol: 'ETH',
    amountEth: 1.5,
    feeEth: 0.001,
    status: 'success',
  })

  assert.equal(item.displayTitle, 'Transfer')
  assert.equal(item.positive, true)
  assert.equal(item.amount, '+1.5')
  assert.equal(item.crypto, 'ETH')
  assert.equal(item.direction, 'IN')
})

test('filterRowsByDirection keeps only incoming rows', () => {
  const items = [
    { direction: 'IN', title: 'a' },
    { direction: 'OUT', title: 'b' },
    { direction: 'IN', title: 'c' },
  ]

  assert.equal(filterRowsByDirection(items, 'in').length, 2)
  assert.equal(filterRowsByDirection(items, 'all').length, 3)
})
