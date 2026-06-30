import { Handler } from '@netlify/functions'
import { createClient } from '@libsql/client'

const handler: Handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  try {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL || 'file:local.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    })

    // Get all ballots
    const ballots = await client.execute('SELECT selected_candidates FROM ballots')

    const candidatePickFrequency: Record<string, number> = {}
    const coOccurrenceMatrix: Record<string, number> = {}
    const candidateCounts: Record<string, number> = {}

    // Parse ballots and build analytics
    for (const row of ballots.rows) {
      const selectedIds = JSON.parse((row.selected_candidates as string) || '[]')

      // Count frequency
      selectedIds.forEach((id: string) => {
        candidateCounts[id] = (candidateCounts[id] || 0) + 1
      })

      // Count co-occurrence
      for (let i = 0; i < selectedIds.length; i++) {
        for (let j = i + 1; j < selectedIds.length; j++) {
          const key = selectedIds[i] < selectedIds[j]
            ? `${selectedIds[i]}_${selectedIds[j]}`
            : `${selectedIds[j]}_${selectedIds[i]}`
          coOccurrenceMatrix[key] = (coOccurrenceMatrix[key] || 0) + 1
        }
      }
    }

    const totalSubmissions = ballots.rows.length

    // Normalize frequencies to 0-1
    Object.keys(candidateCounts).forEach(id => {
      candidatePickFrequency[id] = totalSubmissions > 0 ? candidateCounts[id] / totalSubmissions : 0
    })

    // Normalize co-occurrence to 0-1
    Object.keys(coOccurrenceMatrix).forEach(key => {
      coOccurrenceMatrix[key] = totalSubmissions > 0 ? coOccurrenceMatrix[key] / totalSubmissions : 0
    })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
      body: JSON.stringify({
        candidatePickFrequency,
        coOccurrenceMatrix,
        totalSubmissions,
      }),
    }
  } catch (error) {
    console.error('Analytics error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch analytics' }),
    }
  }
}

export { handler }
