import { useEffect, useState } from 'react'
import { PrivacyLink } from './PrivacyModal'

export default function Footer() {
  const [visitorCount, setVisitorCount] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const hasVisited = sessionStorage.getItem('ballot-visited')
    if (!hasVisited) {
      fetch('https://api.counterapi.dev/v1/ballot-builder/votes/up')
        .then(() => {
          sessionStorage.setItem('ballot-visited', 'true')
          return fetch('https://api.counterapi.dev/v1/ballot-builder/votes/')
        })
        .then(res => res.json())
        .then(data => setVisitorCount(data.value))
        .catch(() => {})
    } else {
      fetch('https://api.counterapi.dev/v1/ballot-builder/votes/')
        .then(res => res.json())
        .then(data => setVisitorCount(data.value))
        .catch(() => {})
    }
  }, [])

  return (
    <footer className="shrink-0 border-t border-slate-200 bg-slate-50/40 text-xs text-slate-400" dir="rtl">

      {/* Expandable panel */}
      {expanded && (
        <div className="border-b border-slate-200 bg-white px-4 md:px-8 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-right">

          {/* BMC */}
          <div>
            <p className="font-semibold text-slate-600 mb-1">תמכו באתר</p>
            <p className="text-slate-500 mb-2 leading-relaxed">לאתר יש עלויות — עזרו להפעיל אותו.</p>
            <a
              href="https://www.buymeacoffee.com/harelc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors font-medium"
            >
              <img src="https://cdn.buymeacoffee.com/buttons/bmc-new-btn-logo.svg" alt="" className="h-4 w-4" />
              קנו לי קפה
            </a>
          </div>

          {/* Kolot Nodedim */}
          <div>
            <p className="font-semibold text-slate-600 mb-1">מתעניינים בפוליטיקה?</p>
            <a
              href="https://kolot-nodedim.netlify.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 font-medium block mb-1 transition-colors"
            >
              קולות נודדים ↗
            </a>
            <p className="text-slate-500 leading-relaxed">נתוני הבחירות לכנסת — מאגר מקיף של תוצאות ומגמות.</p>
          </div>

          {/* Bia Pia */}
          <div>
            <p className="font-semibold text-slate-600 mb-1">משחק מצביעים</p>
            <a
              href="https://bia-pia.netlify.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 font-medium block mb-1 transition-colors"
            >
              ביע פיע ↗
            </a>
            <p className="text-slate-500 leading-relaxed">המשחק שיגלה איזה ח״כים מצביעים כמוכם.</p>
          </div>

        </div>
      )}

      {/* Main bar */}
      <div className="px-3 md:px-6 py-2 md:py-2.5 flex flex-wrap justify-center items-center gap-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-slate-500 hover:text-blue-600 transition-colors font-medium underline underline-offset-2"
        >
          {expanded ? 'פחות ▴' : 'עוד ▾'}
        </button>
        <span>© {new Date().getFullYear()} הראל קין</span>
        <span>|</span>
        <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer"
          className="hover:text-slate-600 transition-colors">CC BY-NC-SA 4.0</a>
        <span>|</span>
        <PrivacyLink />
        <span>|</span>
        <a href="https://github.com/harelc/democratic-primaries" target="_blank" rel="noopener noreferrer"
          className="hidden sm:inline hover:text-slate-600 transition-colors">קוד מקור</a>
        <span className="hidden sm:inline">|</span>
        <a href="https://www.buymeacoffee.com/harelc" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-500 transition-colors">
          <img src="https://cdn.buymeacoffee.com/buttons/bmc-new-btn-logo.svg" alt="" className="h-3.5 w-3.5" />
          <span>לאתר יש עלויות — עזרו להפעיל אותו</span>
        </a>
        {visitorCount && (
          <>
            <span>|</span>
            <span className="font-mono tabular-nums">{visitorCount.toLocaleString('he-IL')} נבחרו</span>
          </>
        )}
      </div>
    </footer>
  )
}
