import { Handler } from '@netlify/functions'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const dbUrl = (process.env.TURSO_DATABASE_URL || '').replace('libsql://', 'https://')
  const authToken = process.env.TURSO_AUTH_TOKEN || ''

  const response = await fetch(`${dbUrl}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: { sql: 'SELECT selected_candidates FROM ballots ORDER BY created_at ASC' },
        },
        { type: 'close' },
      ],
    }),
  })

  if (!response.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: 'DB error' }) }
  }

  const data = await response.json()
  const rows = data.results?.[0]?.response?.result?.rows ?? []

  const ballots = rows.map((row: any) => {
    try { return JSON.parse(String(row[0]?.value ?? '[]')) }
    catch { return [] }
  })

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=60',
    },
    body: JSON.stringify({ ballots }),
  }
}

export { handler }
