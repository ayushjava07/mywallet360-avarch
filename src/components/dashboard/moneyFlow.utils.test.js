import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyTxDirection,
  filterTransactionsByFlow,
  formatFlowDisplay,
  netGrowthValue,
} from './moneyFlow.utils.js'

test('netGrowthValue prefers usd when available', () => {
  const result = netGrowthValue({
    usdNet: 120,
    ethNet: 0.05,
    received: { usdAmount: 200, amount: 0.1 },
    spent: { usdAmount: 80, amount: 0.05 },
  })
  assert.equal(result.isUsd, true)
  assert.equal(result.value, 120)
})

test('netGrowthValue falls back to eth when usd amounts are incomplete', () => {
  const result = netGrowthValue({
    ethNet: 0.05,
    received: { usdAmount: 200, amount: 0.1 },
    spent: { amount: 0.05 },
  })
  assert.equal(result.isUsd, false)
  assert.equal(result.value, 0.05)
})

test('classifyTxDirection detects receive and send', () => {
  assert.equal(classifyTxDirection({ positive: true, displayTitle: 'Receive' }), 'in')
  assert.equal(classifyTxDirection({ positive: false, displayTitle: 'Send', amount: '-1' }), 'out')
})

test('filterTransactionsByFlow filters by direction', () => {
  const txs = [
    { title: '0x1', positive: true, displayTitle: 'Receive' },
    { title: '0x2', positive: false, displayTitle: 'Send', amount: '-1' },
  ]
  assert.equal(filterTransactionsByFlow(txs, 'in').length, 1)
  assert.equal(filterTransactionsByFlow(txs, 'out').length, 1)
  assert.equal(filterTransactionsByFlow(txs, 'all').length, 2)
})

test('formatFlowDisplay formats signed usd', () => {
  assert.match(formatFlowDisplay(12.5, { isUsd: true, signed: true }), /^\+/)
})
