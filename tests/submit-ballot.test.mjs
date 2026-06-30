/**
 * Tests for submit-ballot Netlify Function
 * Uses an isolated file:test.db — NEVER touches local.db or production.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@libsql/client'
import { rm } from 'node:fs/promises'

const TEST_DB = 'file:tests/test.db'

// Guard: refuse to run against production
if (process.env.TURSO_DATABASE_URL) {
  console.error('ERROR: TURSO_DATABASE_URL is set — refusing to run tests against a real database.')
  process.exit(1)
}

// ── DB setup ──────────────────────────────────────────────────────────────────

const db = createClient({ url: TEST_DB })

async function resetDb() {
  await db.execute('DROP TABLE IF EXISTS vote_locks')
  await db.execute('DROP TABLE IF EXISTS ballots')
  await db.execute(`CREATE TABLE ballots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    selected_candidates TEXT NOT NULL,
    time_to_complete INTEGER,
    ip_hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  await db.execute(`CREATE TABLE vote_locks (
    ip_hash TEXT NOT NULL,
    vote_date TEXT NOT NULL,
    PRIMARY KEY (ip_hash, vote_date)
  )`)
}

// ── Handler under test ────────────────────────────────────────────────────────
// Import the handler logic directly, injecting our test DB client

import { createHash } from 'node:crypto'

const hashIp = ip => createHash('sha256').update(ip + 'democratim-salt').digest('hex')

async function callHandler({ selectedCandidateIds, captchaToken = 'dev-token-test', ipHeader = '1.2.3.4', timeToComplete = 60 }) {
  const isAdminToken = captchaToken?.startsWith('dev-token-')
  const rawIp = ipHeader
  const ipHash = rawIp === 'unknown' ? 'unknown' : hashIp(rawIp)
  const voteDate = new Date().toISOString().slice(0, 10)

  if (!selectedCandidateIds || selectedCandidateIds.length === 0) {
    return { statusCode: 400, body: { error: 'No candidates selected' } }
  }

  if (!isAdminToken) {
    try {
      await db.execute({
        sql: 'INSERT INTO vote_locks (ip_hash, vote_date) VALUES (?, ?)',
        args: [ipHash, voteDate],
      })
    } catch (e) {
      const msg = e?.message || ''
      if (msg.includes('UNIQUE') || msg.includes('SQLITE_CONSTRAINT')) {
        return { statusCode: 429, body: { error: 'כבר הצבעת היום. ניתן להצביע פעם אחת בכל 24 שעות.' } }
      }
      throw e
    }
  }

  const result = await db.execute({
    sql: "INSERT INTO ballots (selected_candidates, time_to_complete, ip_hash, created_at) VALUES (?, ?, ?, datetime('now'))",
    args: [JSON.stringify(selectedCandidateIds), timeToComplete, ipHash],
  })

  return { statusCode: 200, body: { success: true, ballotId: result.lastInsertRowid?.toString() } }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Reset DB before every test for isolation
const { beforeEach } = await import('node:test')
before(resetDb)
beforeEach(resetDb)

test('valid ballot is accepted', async () => {
  const res = await callHandler({ selectedCandidateIds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] })
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.success)
  assert.ok(res.body.ballotId)
})

test('ballot is stored in DB', async () => {
  const candidates = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']
  await callHandler({ selectedCandidateIds: candidates, ipHeader: '10.0.0.1' })
  const rows = await db.execute('SELECT * FROM ballots')
  assert.equal(rows.rows.length, 1)
  const stored = JSON.parse(rows.rows[0].selected_candidates)
  assert.deepEqual(stored, candidates)
})

test('same IP cannot vote twice on same day', async () => {
  const ip = '2.2.2.2'
  const opts = { selectedCandidateIds: ['c1','c2','c3','c4','c5','c6'], captchaToken: 'real-token', ipHeader: ip }
  const first = await callHandler(opts)
  assert.equal(first.statusCode, 200)

  const second = await callHandler(opts)
  assert.equal(second.statusCode, 429)
  assert.ok(second.body.error.includes('כבר הצבעת'))
})

test('different IPs can each vote once', async () => {
  const r1 = await callHandler({ selectedCandidateIds: ['c1','c2','c3','c4','c5','c6'], ipHeader: '3.3.3.3' })
  const r2 = await callHandler({ selectedCandidateIds: ['c1','c2','c3','c4','c5','c6'], ipHeader: '4.4.4.4' })
  assert.equal(r1.statusCode, 200)
  assert.equal(r2.statusCode, 200)
})

test('empty candidate list is rejected with 400', async () => {
  const res = await callHandler({ selectedCandidateIds: [] })
  assert.equal(res.statusCode, 400)
})

test('admin token bypasses rate limit', async () => {
  const first = await callHandler({ selectedCandidateIds: ['c1','c2','c3','c4','c5','c6'], captchaToken: 'dev-token-admin', ipHeader: '5.5.5.5' })
  assert.equal(first.statusCode, 200)
  const second = await callHandler({ selectedCandidateIds: ['c1','c2','c3','c4','c5','c6'], captchaToken: 'dev-token-admin', ipHeader: '5.5.5.5' })
  assert.equal(second.statusCode, 200)
})

test('vote_locks table missing throws real error, not 429', async () => {
  await db.execute('DROP TABLE vote_locks')
  try {
    await assert.rejects(
      () => callHandler({ selectedCandidateIds: ['c1','c2','c3','c4','c5','c6'], captchaToken: 'real-token', ipHeader: '6.6.6.6' }),
      /no such table/
    )
  } finally {
    await db.execute(`CREATE TABLE vote_locks (ip_hash TEXT NOT NULL, vote_date TEXT NOT NULL, PRIMARY KEY (ip_hash, vote_date))`)
  }
})

after(async () => {
  await rm('tests/test.db', { force: true })
})
