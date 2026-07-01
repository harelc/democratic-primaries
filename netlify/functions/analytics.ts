import { Handler } from '@netlify/functions'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const dbUrl = (process.env.TURSO_DATABASE_URL || '').replace('libsql://', 'https://')
    const authToken = process.env.TURSO_AUTH_TOKEN || ''

    const response = await fetch(`${dbUrl}/v2/pipeline`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql: 'SELECT selected_candidates FROM ballots' } },
          { type: 'close' },
        ],
      }),
    })

    if (!response.ok) throw new Error(`Turso error: ${response.status}`)

    const data = await response.json()
    const rows = data.results?.[0]?.response?.result?.rows ?? []

    const candidatePickFrequency: Record<string, number> = {}
    const coOccurrenceMatrix: Record<string, number> = {}
    const candidateCounts: Record<string, number> = {}

    for (const row of rows) {
      const selectedIds: string[] = JSON.parse(String(row[0]?.value ?? '[]'))

      selectedIds.forEach(id => {
        candidateCounts[id] = (candidateCounts[id] || 0) + 1
      })

      for (let i = 0; i < selectedIds.length; i++) {
        for (let j = i + 1; j < selectedIds.length; j++) {
          const key = selectedIds[i] < selectedIds[j]
            ? `${selectedIds[i]}_${selectedIds[j]}`
            : `${selectedIds[j]}_${selectedIds[i]}`
          coOccurrenceMatrix[key] = (coOccurrenceMatrix[key] || 0) + 1
        }
      }
    }

    const totalSubmissions = rows.length

    Object.keys(candidateCounts).forEach(id => {
      candidatePickFrequency[id] = totalSubmissions > 0 ? candidateCounts[id] / totalSubmissions : 0
    })
    Object.keys(coOccurrenceMatrix).forEach(key => {
      coOccurrenceMatrix[key] = totalSubmissions > 0 ? coOccurrenceMatrix[key] / totalSubmissions : 0
    })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=15',
      },
      body: JSON.stringify({ candidatePickFrequency, coOccurrenceMatrix, totalSubmissions }),
    }
  } catch (error) {
    console.error('Analytics error:', error)
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch analytics' }) }
  }
}

export { handler }
