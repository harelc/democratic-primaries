import { useEffect, useState } from 'react'

declare global {
  interface Window {
    grecaptcha?: any
    onRecaptchaReady?: () => void
  }
}

interface CaptchaVerificationProps {
  onVerify: (token: string) => void
  loading: boolean
}

export default function CaptchaVerification({
  onVerify,
  loading,
}: CaptchaVerificationProps) {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!siteKey) return

    // Load reCAPTCHA v3 script
    const script = document.createElement('script')
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`
    script.async = true
    document.head.appendChild(script)

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script)
    }
  }, [siteKey])

  const handleVerify = async () => {
    if (!siteKey) {
      onVerify('dev-token-' + Date.now())
      return
    }

    setExecuting(true)
    setError('')
    try {
      await new Promise<void>((resolve) => {
        if (window.grecaptcha?.ready) {
          window.grecaptcha.ready(resolve)
        } else {
          resolve()
        }
      })
      const token = await window.grecaptcha.execute(siteKey, { action: 'submit' })
      onVerify(token)
    } catch (e) {
      setError('אימות נכשל. נסה שוב.')
      setExecuting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full text-center">
        <h2 className="text-xl font-bold mb-4">אימות אדם</h2>
        <p className="text-slate-600 mb-6">
          לחצו על הכפתור כדי לאמת ולהגיש את הצעתך
        </p>

        <button
          onClick={handleVerify}
          disabled={loading || executing}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
        >
          {loading || executing ? 'מאמת...' : 'אמת והגש'}
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <p className="text-xs text-slate-400 text-center mt-4">
          מוגן על ידי reCAPTCHA
        </p>
      </div>
    </div>
  )
}
