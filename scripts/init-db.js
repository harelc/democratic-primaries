#!/usr/bin/env node
import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL || 'file:local.db'
const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function initDb() {
  console.log(`Initializing database schema at: ${url}`)

  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ballots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        selected_candidates TEXT NOT NULL,
        time_to_complete INTEGER,
        ip_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await client.execute(`
      CREATE TABLE IF NOT EXISTS vote_locks (
        ip_hash TEXT NOT NULL,
        vote_date TEXT NOT NULL,
        PRIMARY KEY (ip_hash, vote_date)
      )
    `)

    console.log('✓ Database schema initialized successfully')
    console.log('  - Created ballots table')
    console.log('  - Created vote_locks table')
  } catch (error) {
    console.error('✗ Failed to initialize database:', error)
    process.exit(1)
  }
}

initDb()
