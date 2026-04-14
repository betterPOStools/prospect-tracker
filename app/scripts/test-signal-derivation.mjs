#!/usr/bin/env node
// Standalone smoke test for deriveSignals(). Run: node scripts/test-signal-derivation.mjs
// No test framework dependency — uses node:assert/strict.

import assert from 'node:assert/strict'
import { deriveSignals } from '../src/data/signalDerivation.js'

const NOW = new Date('2026-04-14T12:00:00Z')
let passed = 0
let failed = 0

function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++ }
  catch (err) { console.error(`✗ ${name}\n  ${err.message}`); failed++ }
}

test('no stops → zero signals', () => {
  const out = deriveSignals({ id: 'r1' }, [], NOW)
  assert.deepEqual(out, {
    lastContact: null, touchCount: 0, daysSinceContact: null,
    isOverdue: false, recentNotes: [],
  })
})

test('unrelated stops are ignored', () => {
  const out = deriveSignals({ id: 'r1' }, [{ fromDb: 'other' }], NOW)
  assert.equal(out.touchCount, 0)
  assert.equal(out.lastContact, null)
})

test('touchCount excludes system notes', () => {
  const stops = [{
    fromDb: 'r1',
    lastContact: '2026-04-10T00:00:00Z',
    notesLog: [
      { text: 'Contact: Jane', ts: '2026-04-10T00:00:00Z', system: true },
      { text: 'Spoke with manager', ts: '2026-04-10T01:00:00Z', system: false },
      { text: 'Followed up', ts: '2026-04-11T00:00:00Z', system: false },
    ],
  }]
  const out = deriveSignals({ id: 'r1' }, stops, NOW)
  assert.equal(out.touchCount, 2)
})

test('daysSinceContact is floored integer', () => {
  const stops = [{ fromDb: 'r1', lastContact: '2026-04-10T00:00:00Z' }]
  const out = deriveSignals({ id: 'r1' }, stops, NOW)
  assert.equal(out.daysSinceContact, 4)
})

test('isOverdue true when Come back later + 7+ days', () => {
  const stops = [{
    fromDb: 'r1', status: 'Come back later', lastContact: '2026-04-01T00:00:00Z',
  }]
  const out = deriveSignals({ id: 'r1' }, stops, NOW)
  assert.equal(out.isOverdue, true)
})

test('isOverdue false when Come back later but recent', () => {
  const stops = [{
    fromDb: 'r1', status: 'Come back later', lastContact: '2026-04-12T00:00:00Z',
  }]
  const out = deriveSignals({ id: 'r1' }, stops, NOW)
  assert.equal(out.isOverdue, false)
})

test('isOverdue false for Converted status regardless of age', () => {
  const stops = [{
    fromDb: 'r1', status: 'Converted', lastContact: '2026-01-01T00:00:00Z',
  }]
  const out = deriveSignals({ id: 'r1' }, stops, NOW)
  assert.equal(out.isOverdue, false)
})

test('recentNotes sorted newest first, capped at 2, truncated', () => {
  const long = 'x'.repeat(300)
  const stops = [{
    fromDb: 'r1',
    notesLog: [
      { text: 'old', ts: '2026-01-01T00:00:00Z', system: false },
      { text: 'middle', ts: '2026-02-01T00:00:00Z', system: false },
      { text: long, ts: '2026-03-01T00:00:00Z', system: false },
    ],
  }]
  const out = deriveSignals({ id: 'r1' }, stops, NOW)
  assert.equal(out.recentNotes.length, 2)
  assert.equal(out.recentNotes[0].text.length, 200)
  assert.equal(out.recentNotes[1].text, 'middle')
})

test('lastContact picks max across multiple stops', () => {
  const stops = [
    { fromDb: 'r1', lastContact: '2026-04-01T00:00:00Z' },
    { fromDb: 'r1', lastContact: '2026-04-12T00:00:00Z' },
    { fromDb: 'r1', lastContact: '2026-04-05T00:00:00Z' },
  ]
  const out = deriveSignals({ id: 'r1' }, stops, NOW)
  assert.equal(out.lastContact, '2026-04-12T00:00:00Z')
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
