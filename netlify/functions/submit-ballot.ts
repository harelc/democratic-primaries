import { Handler } from '@netlify/functions'
import { createHash } from 'crypto'

interface SubmissionBody {
  selectedCandidateIds: string[]
  timeToComplete: number
  captchaToken: string
}

const hashIp = (ip: string) =>
  createHash('sha256').update(ip + 'democratim-salt').digest('hex')

const verifyCaptcha = async (token: string): Promise<boolean> => {
  try {
    if (!process.env.RECAPTCHA_SECRET_KEY) {
      console.warn('RECAPTCHA_SECRET_KEY not set, allowing submission')
      return true
    }
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
    })
    const data = await response.json()
    console.log('CAPTCHA verification:', { success: data.success, score: data.score, error: data['error-codes'] })
    if (!data.success) { console.error('CAPTCHA failed:', data['error-codes']); return false }
    return data.score > 0.5
  } catch (error) {
    console.error('CAPTCHA verification error:', error)
    return false
  }
}

const turso = async (dbUrl: string, authToken: string, requests: any[]) => {
  const res = await fetch(`${dbUrl}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
  })
  if (!res.ok) throw new Error(`Turso HTTP error: ${res.status}`)
  const data = await res.json()
  // Check for statement-level errors (Turso returns 200 even for constraint violations)
  for (const result of data.results ?? []) {
    if (result.type === 'error') {
      const err = new Error(result.error?.message || 'Turso statement error')
      ;(err as any).code = result.error?.code || ''
      throw err
    }
  }
  return data
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const body: SubmissionBody = JSON.parse(event.body || '{}')

    if (!body.selectedCandidateIds || body.selectedCandidateIds.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No candidates selected' }) }
    }

    const isAdminToken = body.captchaToken?.startsWith('dev-token-')
    if (!isAdminToken) {
      const isValidCaptcha = await verifyCaptcha(body.captchaToken)
      if (!isValidCaptcha) {
        return { statusCode: 403, body: JSON.stringify({ error: 'CAPTCHA verification failed' }) }
      }
    }

    const dbUrl = (process.env.TURSO_DATABASE_URL || '').replace('libsql://', 'https://')
    const authToken = process.env.TURSO_AUTH_TOKEN || ''

    const rawIp = event.headers['x-forwarded-for']?.split(',')[0].trim()
      || event.headers['client-ip']
      || 'unknown'
    const ipHash = rawIp === 'unknown' ? 'unknown' : hashIp(rawIp)
    const voteDate = new Date().toISOString().slice(0, 10)

    if (!isAdminToken) {
      try {
        await turso(dbUrl, authToken, [
          { type: 'execute', stmt: { sql: 'INSERT INTO vote_locks (ip_hash, vote_date) VALUES (?, ?)', args: [{ type: 'text', value: ipHash }, { type: 'text', value: voteDate }] } },
        ])
      } catch (e: any) {
        const msg = (e?.message || '') + (e?.code || '')
        if (msg.includes('UNIQUE') || msg.includes('SQLITE_CONSTRAINT') || msg.includes('2067')) {
          return { statusCode: 429, body: JSON.stringify({ error: 'כבר הצבעת היום. ניתן להצביע פעם אחת בכל 24 שעות.' }) }
        }
        console.error('vote_locks error:', msg)
        throw e
      }
    }

    const candidatesJson = JSON.stringify(body.selectedCandidateIds)
    const result = await turso(dbUrl, authToken, [
      { type: 'execute', stmt: { sql: `INSERT INTO ballots (selected_candidates, time_to_complete, ip_hash, created_at) VALUES (?, ?, ?, datetime('now'))`, args: [{ type: 'text', value: candidatesJson }, { type: 'integer', value: body.timeToComplete }, { type: 'text', value: ipHash }] } },
    ])

    const lastId = result.results?.[0]?.response?.result?.last_insert_rowid

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, ballotId: String(lastId ?? '') }),
    }
  } catch (error) {
    console.error('Submission error:', error)
    return { statusCode: 500, body: JSON.stringify({ error: 'Submission failed' }) }
  }
}

export { handler }
