import { useEffect, useState } from 'react'

export default function Footer() {
  const [visitorCount, setVisitorCount] = useState<number | null>(null)

  useEffect(() => {
    const checkVisitor = () => {
      const hasVisited = sessionStorage.getItem('ballot-visited')
      if (!hasVisited) {
        // First visit this session - increment counter
        fetch('https://api.counterapi.dev/v1/ballot-builder/votes/up')
          .then(() => {
            sessionStorage.setItem('ballot-visited', 'true')
            return fetch('https://api.counterapi.dev/v1/ballot-builder/votes/')
          })
          .then(res => res.json())
          .then(data => setVisitorCount(data.value))
          .catch(() => {})
      } else {
        // Already visited this session - just read counter
        fetch('https://api.counterapi.dev/v1/ballot-builder/votes/')
          .then(res => res.json())
          .then(data => setVisitorCount(data.value))
          .catch(() => {})
      }
    }

    checkVisitor()
  }, [])

  return (
    <footer className="shrink-0 border-t border-slate-200 bg-slate-50/40 px-3 md:px-6 py-2 md:py-2.5 text-center text-xs text-slate-400">
      <div className="flex flex-wrap justify-center items-center gap-2">
        <span>
          © {new Date().getFullYear()} הראל קין
        </span>
        <span>|</span>
        <a
          href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-slate-600 transition-colors"
        >
          CC BY-NC-SA 4.0
        </a>
        <span>|</span>
        <a
          href="https://github.com/harelc/democratic-primaries"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline hover:text-slate-600 transition-colors"
        >
          קוד מקור
        </a>
        <span className="hidden sm:inline">|</span>
        <a
          href="https://www.buymeacoffee.com/harelc"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-500 transition-colors"
        >
          <img
            src="https://cdn.buymeacoffee.com/buttons/bmc-new-btn-logo.svg"
            alt="Buy Me a Coffee"
            className="h-3.5 w-3.5"
          />
          <span>אהבתם? קנו לי קפה</span>
        </a>
        {visitorCount && (
          <>
            <span>|</span>
            <span className="font-mono tabular-nums">
              {typeof visitorCount === 'number' ? visitorCount.toLocaleString('he-IL') : visitorCount} נבחרו
            </span>
          </>
        )}
      </div>
    </footer>
  )
}
