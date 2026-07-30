import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  TX_TOOLTIPS,
  getAmountTooltip,
  getDirectionTooltip,
  getEnsTooltip,
  getMethodTooltip,
  isEnsLabel,
  normalizeMethodKey,
  splitMethodDisplay,
} from './transactionTooltips.utils.js'

describe('transactionTooltips.utils', () => {
  it('normalizes activity titles to method keys', () => {
    assert.equal(normalizeMethodKey('Token Swap'), 'Token Swap')
    assert.equal(normalizeMethodKey('contract interaction'), 'Contract Interaction')
    assert.equal(normalizeMethodKey('Transfer*'), 'Transfer')
  })

  it('returns method tooltips including contract-triggered transfer', () => {
    assert.match(getMethodTooltip('Transfer'), /Money or tokens moved/)
    assert.match(getMethodTooltip('Transfer*'), /triggered by another contract/)
    assert.match(getMethodTooltip('Transfer', { contractTriggered: true }), /triggered by another contract/)
    assert.match(getMethodTooltip('Approve'), /permission to move/)
  })

  it('returns direction tooltips', () => {
    assert.equal(getDirectionTooltip('IN'), TX_TOOLTIPS.direction.IN)
    assert.equal(getDirectionTooltip('OUT'), TX_TOOLTIPS.direction.OUT)
    assert.equal(getDirectionTooltip('X'), null)
  })

  it('returns zero-eth tooltip only for contract interactions without token amount', () => {
    assert.equal(getAmountTooltip({
      method: 'Contract Interaction',
      amountEth: 0,
      hasTokenAmount: false,
      amountDisplay: '0 ETH',
    }), TX_TOOLTIPS.zeroEth)

    assert.equal(getAmountTooltip({
      method: 'Contract Interaction',
      amountEth: 0,
      hasTokenAmount: true,
      amountDisplay: '0 ETH',
    }), TX_TOOLTIPS.tokenAmount)

    assert.equal(getAmountTooltip({
      method: 'Transfer',
      amountEth: 0,
      hasTokenAmount: false,
      amountDisplay: '0 ETH',
    }), null)

    assert.equal(getAmountTooltip({
      method: 'Contract Interaction',
      amountEth: null,
      hasTokenAmount: false,
      amountDisplay: '1.25 ETH',
    }), null)

    assert.equal(getAmountTooltip({
      method: 'Contract Interaction',
      amountEth: null,
      hasTokenAmount: false,
      amountDisplay: '—',
    }), TX_TOOLTIPS.zeroEth)
  })

  it('builds ENS tooltip with full address', () => {
    const address = '0x1234567890123456789012345678901234567890'
    assert.match(getEnsTooltip(address), /0x1234/)
    assert.equal(getEnsTooltip(null), null)
  })

  it('detects ENS labels', () => {
    assert.equal(isEnsLabel('vitalik.eth', '0xabc'), true)
    assert.equal(isEnsLabel('0xabc', '0xabc'), false)
  })

  it('splits method display asterisk', () => {
    assert.deepEqual(splitMethodDisplay('Transfer*'), { label: 'Transfer', asterisk: true })
    assert.deepEqual(splitMethodDisplay('Approve'), { label: 'Approve', asterisk: false })
  })
})
