import { Handler } from '@netlify/functions'
import { createClient } from '@libsql/client'

interface SubmissionBody {
  selectedCandidateIds: string[]
  timeToComplete: number
  captchaToken: string
}

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

    if (!data.success) {
      console.error('CAPTCHA failed:', data['error-codes'])
      return false
    }

    return data.score > 0.5
  } catch (error) {
    console.error('CAPTCHA verification error:', error)
    return false
  }
}

const handler: Handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  try {
    const body: SubmissionBody = JSON.parse(event.body || '{}')

    if (!body.selectedCandidateIds || body.selectedCandidateIds.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No candidates selected' }),
      }
    }

    const isValidCaptcha = await verifyCaptcha(body.captchaToken)
    if (!isValidCaptcha) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'CAPTCHA verification failed' }),
      }
    }

    // Connect to Turso
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL || 'file:local.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    })

    // Store ballot
    const candidatesJson = JSON.stringify(body.selectedCandidateIds)
    const ipHash = event.headers['client-ip'] || 'unknown'

    const result = await client.execute({
      sql: `INSERT INTO ballots (selected_candidates, time_to_complete, ip_hash, created_at)
            VALUES (?, ?, ?, datetime('now'))`,
      args: [candidatesJson, body.timeToComplete, ipHash],
    })

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        ballotId: result.lastInsertRowid,
      }),
    }
  } catch (error) {
    console.error('Submission error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Submission failed' }),
    }
  }
}

export { handler }
