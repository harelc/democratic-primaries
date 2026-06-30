import { useRef, useEffect, useState } from 'react'

declare global {
  interface Window {
    grecaptcha?: any
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const hasSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY

  useEffect(() => {
    if (!hasSiteKey) {
      setIsReady(true)
      return
    }

    // Load reCAPTCHA script
    const script = document.createElement('script')
    script.src = 'https://www.google.com/recaptcha/api.js'
    script.async = true
    script.defer = true
    script.onload = () => {
      if (containerRef.current && window.grecaptcha) {
        window.grecaptcha.render(containerRef.current, {
          sitekey: hasSiteKey,
          callback: handleCaptchaSuccess,
          'error-callback': handleCaptchaError,
        })
        setIsReady(true)
      }
    }
    document.head.appendChild(script)

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [hasSiteKey])

  const handleCaptchaSuccess = (token: string) => {
    onVerify(token)
  }

  const handleCaptchaError = () => {
    console.error('reCAPTCHA error')
  }

  const handleManualVerify = () => {
    // Fallback for dev mode
    onVerify('dev-token-' + Date.now())
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">אימות אדם</h2>
        <p className="text-slate-600 mb-6">
          אנא אשר שאתה אדם כדי להגיש את הצעתך
        </p>

        {!hasSiteKey ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
            <p className="text-sm text-yellow-800">
              reCAPTCHA לא מוגדר. במצב פיתוח, לחץ על "אימות" כדי להמשיך.
            </p>
            <button
              onClick={handleManualVerify}
              disabled={loading}
              className="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:bg-slate-400"
            >
              {loading ? 'מעבד...' : 'אימות'}
            </button>
          </div>
        ) : (
          <>
            {isReady && (
              <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-6 flex justify-center">
                <div ref={containerRef} />
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="text-center text-sm text-slate-500">
            מעבד את הצעתך...
          </div>
        )}

        <p className="text-xs text-slate-400 text-center mt-4">
          אנו משתמשים ב-reCAPTCHA כדי להגן מפני בוטים
        </p>
      </div>
    </div>
  )
}
