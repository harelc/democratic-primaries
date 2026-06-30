import { Handler } from '@netlify/functions'
import { createClient } from '@libsql/client'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  // Require admin nonce
  const nonce = event.headers['x-admin-nonce']
  const expectedNonce = process.env.ADMIN_NONCE || process.env.VITE_ADMIN_NONCE
  if (!nonce || !expectedNonce || nonce !== expectedNonce) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL || 'file:local.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  const result = await client.execute(
    'SELECT id, selected_candidates, time_to_complete, ip_hash, created_at FROM ballots ORDER BY created_at DESC'
  )

  const ballots = result.rows.map(row => ({
    id: row.id?.toString(),
    selectedCandidates: JSON.parse(row.selected_candidates as string),
    timeToComplete: row.time_to_complete,
    ipHash: (row.ip_hash as string)?.slice(0, 12) + '…',
    createdAt: row.created_at,
  }))

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ballots }),
  }
}

export { handler }
