import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identityLevel } from '../src/lib/identity.js'

test('identityLevel 分界點', () => {
  assert.equal(identityLevel(90, 100).filled, 5)
  assert.equal(identityLevel(89, 100).filled, 4)
  assert.equal(identityLevel(75, 100).filled, 4)
  assert.equal(identityLevel(74, 100).filled, 3)
  assert.equal(identityLevel(50, 100).filled, 3)
  assert.equal(identityLevel(49, 100).filled, 2)
  assert.equal(identityLevel(30, 100).filled, 2)
  assert.equal(identityLevel(29, 100).filled, 1)
})

test('identityLevel 等級文字', () => {
  assert.equal(identityLevel(95, 100).label, '極可能本人')
  assert.equal(identityLevel(80, 100).label, '很可能')
  assert.equal(identityLevel(60, 100).label, '可能')
  assert.equal(identityLevel(40, 100).label, '不太像')
  assert.equal(identityLevel(10, 100).label, '不像')
})

test('identityLevel 低樣本旗標與分母', () => {
  assert.equal(identityLevel(4, 4).lowSample, true)
  assert.equal(identityLevel(5, 5).lowSample, false)
  assert.equal(identityLevel(48, 50).sample, '48/50')
  assert.equal(identityLevel(4, 4).filled, 5)
})

test('identityLevel 防呆 ownerTotal<=0', () => {
  const r = identityLevel(3, 0)
  assert.equal(r.filled, 1)
  assert.equal(r.lowSample, true)
})
