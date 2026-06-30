import { Handler } from '@netlify/functions'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const nonce = event.headers['x-admin-nonce']
  const expectedNonce = process.env.ADMIN_NONCE || process.env.VITE_ADMIN_NONCE
  if (!nonce || !expectedNonce || nonce !== expectedNonce) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
  }

  const dbUrl = process.env.TURSO_DATABASE_URL || ''
  const authToken = process.env.TURSO_AUTH_TOKEN || ''

  // Use Turso HTTP API directly — no @libsql/client, no WebSockets, no background async
  const httpUrl = dbUrl.replace('libsql://', 'https://')
  const response = await fetch(`${httpUrl}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql: 'SELECT id, selected_candidates, time_to_complete, ip_hash, created_at FROM ballots ORDER BY created_at DESC LIMIT 200',
          },
        },
        { type: 'close' },
      ],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { statusCode: 500, body: JSON.stringify({ error: `Turso error: ${response.status} ${text}` }) }
  }

  const data = await response.json()
  const rows = data.results?.[0]?.response?.result?.rows ?? []
  const cols = data.results?.[0]?.response?.result?.cols ?? []

  const colIndex = (name: string) => cols.findIndex((c: any) => c.name === name)
  const idIdx = colIndex('id')
  const scIdx = colIndex('selected_candidates')
  const ttIdx = colIndex('time_to_complete')
  const ipIdx = colIndex('ip_hash')
  const caIdx = colIndex('created_at')

  const ballots = rows.map((row: any) => ({
    id: String(row[idIdx]?.value ?? ''),
    selectedCandidates: JSON.parse(String(row[scIdx]?.value ?? '[]')),
    timeToComplete: Number(row[ttIdx]?.value ?? 0),
    ipHash: String(row[ipIdx]?.value ?? '').slice(0, 12) + '…',
    createdAt: String(row[caIdx]?.value ?? ''),
  }))

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ballots }),
  }
}

export { handler }
