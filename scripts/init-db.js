#!/usr/bin/env node
import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function initDb() {
  console.log('Initializing database schema...')

  try {
    // Create ballots table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ballots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        selected_candidates TEXT NOT NULL,
        time_to_complete INTEGER,
        ip_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    console.log('✓ Database schema initialized successfully')
    console.log('  - Created ballots table')
  } catch (error) {
    console.error('✗ Failed to initialize database:', error)
    process.exit(1)
  }
}

initDb()
