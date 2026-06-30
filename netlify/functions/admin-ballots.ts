import { Handler } from '@netlify/functions'
import { createClient } from '@libsql/client'

// Catch any unhandled rejections to prevent Lambda crash
process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err)
})

const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
    }

    const nonce = event.headers['x-admin-nonce']
    const expectedNonce = process.env.ADMIN_NONCE || process.env.VITE_ADMIN_NONCE
    if (!nonce || !expectedNonce || nonce !== expectedNonce) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
    }

    // Force HTTPS transport (not WebSocket) — WebSocket can crash Lambda
    const rawUrl = process.env.TURSO_DATABASE_URL || 'file:local.db'
    const url = rawUrl.startsWith('libsql://') ? rawUrl.replace('libsql://', 'https://') : rawUrl
    const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })

    const result = await client.execute(
      'SELECT id, selected_candidates, time_to_complete, ip_hash, created_at FROM ballots ORDER BY created_at DESC LIMIT 200'
    )

    const ballots = result.rows.map(row => ({
      id: String(row.id ?? ''),
      selectedCandidates: JSON.parse(row.selected_candidates as string || '[]'),
      timeToComplete: Number(row.time_to_complete ?? 0),
      ipHash: String(row.ip_hash ?? '').slice(0, 12) + '…',
      createdAt: String(row.created_at ?? ''),
    }))

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ballots }),
    }
  } catch (error: any) {
    console.error('admin-ballots error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error?.message || 'Unknown error' }),
    }
  }
}

export { handler }
