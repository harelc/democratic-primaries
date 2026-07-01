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

  const dbUrl = (process.env.TURSO_DATABASE_URL || '').replace('libsql://', 'https://')
  const authToken = process.env.TURSO_AUTH_TOKEN || ''

  const response = await fetch(`${dbUrl}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql: "SELECT COUNT(*) as n FROM ballots WHERE created_at > datetime('now', '-10 minutes')" } },
        { type: 'execute', stmt: { sql: "SELECT COUNT(*) as n FROM ballots WHERE created_at > datetime('now', '-1 hour')" } },
        { type: 'execute', stmt: { sql: "SELECT COUNT(*) as n FROM ballots WHERE created_at > datetime('now', '-6 hours')" } },
        { type: 'execute', stmt: { sql: "SELECT COUNT(*) as n FROM ballots WHERE created_at > datetime('now', '-12 hours')" } },
        { type: 'close' },
      ],
    }),
  })

  if (!response.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: 'DB error' }) }
  }

  const data = await response.json()
  const val = (idx: number) => Number(data.results?.[idx]?.response?.result?.rows?.[0]?.[0]?.value ?? 0)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      last10min: val(0),
      last1h: val(1),
      last6h: val(2),
      last12h: val(3),
    }),
  }
}

export { handler }
