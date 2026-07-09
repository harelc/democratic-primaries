import { useEffect, useState } from 'react'

const S3_URL = 'https://democrats-member-count.s3.eu-west-1.amazonaws.com/count.txt'
const REFRESH_MS = 120_000

export default function MemberCounter() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchCount = () => {
      fetch(`${S3_URL}?t=${Date.now()}`, { cache: 'no-store' })
        .then(res => (res.ok ? res.text() : Promise.reject()))
        .then(raw => {
          const n = parseInt(raw.trim(), 10)
          if (!cancelled && !isNaN(n)) setCount(n)
        })
        .catch(() => {})
    }
    fetchCount()
    const id = setInterval(fetchCount, REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (count === null) return null

  return (
    <a
      href="https://counter.democrats.org.il/"
      target="_blank"
      rel="noopener noreferrer"
      className="hidden sm:flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 flex-shrink-0 transition-colors"
      title="מספר חברי מפלגת הדמוקרטים, מתעדכן חי"
    >
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
      </span>
      <span className="font-bold tabular-nums">{count.toLocaleString('he-IL')}</span>
      <span className="text-blue-200">חברי מפלגה</span>
    </a>
  )
}
