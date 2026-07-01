import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Candidate, Analytics } from '../types'
import ForceDirectedGraph from './ForceDirectedGraph'
import { computeSNA, getCommunityColor } from '../utils/sna'
import ConvergenceChart from './ConvergenceChart'

function Tooltip({ term, children }: { term: string; children: React.ReactNode }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  return (
    <span className="relative inline-block">
      <span
        ref={ref}
        className="border-b border-dotted border-slate-400 cursor-help"
        style={{ fontFamily: 'inherit', fontWeight: 'inherit', fontSize: 'inherit', color: 'inherit', lineHeight: 'inherit' }}
        onMouseEnter={() => setRect(ref.current?.getBoundingClientRect() ?? null)}
        onMouseLeave={() => setRect(null)}
      >
        {term}
      </span>
      {rect && (
        <span
          className="fixed z-[9999] w-80 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl leading-relaxed pointer-events-none whitespace-pre-line"
          style={{ bottom: window.innerHeight - rect.top + 8, left: Math.min(rect.left, window.innerWidth - 272) }}
        >
          {children}
          <span className="absolute top-full left-4 border-4 border-transparent border-t-slate-800" />
        </span>
      )}
    </span>
  )
}

function FullMatrix({ allCandidates, coOccurrenceMatrix, snaData, matrixOrder, candidatePickFrequency }: {
  allCandidates: Candidate[]
  coOccurrenceMatrix: Record<string, number>
  snaData: ReturnType<typeof computeSNA> | null
  matrixOrder: 'louvain' | 'votes'
  candidatePickFrequency: Record<string, number>
}) {
  const ordered = matrixOrder === 'louvain' && snaData
    ? [...allCandidates].sort((a, b) => {
        const ca = snaData.communityDisplayIndex[a.id] ?? 99
        const cb = snaData.communityDisplayIndex[b.id] ?? 99
        if (ca !== cb) return ca - cb
        return (snaData.weightedDegree[b.id] ?? 0) - (snaData.weightedDegree[a.id] ?? 0)
      })
    : [...allCandidates].sort((a, b) => (candidatePickFrequency[b.id] ?? 0) - (candidatePickFrequency[a.id] ?? 0))

  return (
    <div className="overflow-auto border border-slate-200 rounded" style={{ maxHeight: '600px' }}>
      <div className="inline-block min-w-full">
        <div className="flex mb-1 sticky top-0 bg-white z-10">
          <div className="flex-shrink-0 bg-slate-50 border-r border-b border-slate-200" style={{ width: '120px' }} />
          {ordered.map(c => (
            <div key={`h-${c.id}`} className="flex-shrink-0 flex items-center justify-center text-xs font-semibold bg-slate-50 border-r border-b border-slate-200 p-0.5"
              title={c.name} style={{ width: '60px', height: '60px', wordBreak: 'break-word', fontSize: '10px',
                color: snaData ? getCommunityColor(snaData.communityDisplayIndex[c.id] ?? -1) : '#475569' }}>
              {c.name}
            </div>
          ))}
        </div>
        {ordered.map(c1 => {
          const comm = snaData ? (snaData.communityDisplayIndex[c1.id] ?? -1) : null
          return (
            <div key={`r-${c1.id}`} className="flex mb-1">
              <div className="flex-shrink-0 text-xs font-semibold px-1 flex items-center justify-end border-r border-slate-200 truncate"
                title={c1.name} style={{ width: '120px',
                  color: (comm !== null && comm >= 0) ? getCommunityColor(comm) : '#475569',
                  backgroundColor: (comm !== null && comm >= 0) ? `${getCommunityColor(comm)}15` : '#f8fafc' }}>
                {c1.name}
              </div>
              {ordered.map(c2 => {
                const self = c1.id === c2.id
                const key = c1.id < c2.id ? `${c1.id}_${c2.id}` : `${c2.id}_${c1.id}`
                const v = self ? 1 : (coOccurrenceMatrix[key] || 0)
                const bg = self ? '#2563eb' : `hsl(210, 100%, ${100 - v * 80}%)`
                return (
                  <div key={`c-${c1.id}-${c2.id}`}
                    className="flex-shrink-0 flex items-center justify-center text-xs font-bold border-r border-b border-slate-200"
                    style={{ width: '60px', height: '60px', backgroundColor: bg, color: v > 0.5 ? 'white' : '#475569' }}
                    title={`${c1.name} & ${c2.name}: ${Math.round(v * 100)}%`}>
                    {Math.round(v * 100)}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NewVoteToast({ totalSubmissions, onNewTotal }: { totalSubmissions: number; onNewTotal: (n: number) => void }) {
  const [toast, setToast] = useState<string | null>(null)
  const lastCount = useRef(totalSubmissions)

  useEffect(() => {
    lastCount.current = totalSubmissions
  }, [])

  useEffect(() => {
    const url = window.location.port === '5173'
      ? 'http://localhost:8888/.netlify/functions/analytics'
      : '/.netlify/functions/analytics'

    const interval = setInterval(async () => {
      try {
        const data = await fetch(url).then(r => r.json())
        const newCount = data.totalSubmissions || 0
        if (newCount > lastCount.current) {
          const diff = newCount - lastCount.current
          setToast(`🗳️ ${diff === 1 ? 'הצבעה חדשה נכנסה' : `${diff} הצבעות חדשות נכנסו`}!`)
          lastCount.current = newCount
          onNewTotal(newCount)
          setTimeout(() => setToast(null), 4000)
        }
      } catch {}
    }, 120000)

    return () => clearInterval(interval)
  }, [])

  if (!toast) return null

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-bounce-once">
      <div className="bg-blue-600 text-white px-5 py-3 rounded-full shadow-xl text-sm font-semibold flex items-center gap-2">
        {toast}
      </div>
    </div>
  )
}

function ShareButton({ candidates }: { candidates: Candidate[] }) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const list = candidates.map((c, i) => `${i + 1}. ${c.name}`).join('\n')
    const text = `🗳️ הרשימה שלי לפריימריז הדמוקרטים:\n\n${list}\n\nבנו גם את הרשימה שלכם: ${window.location.origin}`

    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch {}
    }

    // Fallback: copy to clipboard
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (candidates.length === 0) return null

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 px-6 py-3 bg-white hover:bg-blue-50 text-blue-700 rounded-xl font-bold text-base transition-colors shadow-lg hover:shadow-xl flex-shrink-0"
    >
      {copied ? '✓ הועתק!' : '📤 שתפו את הרשימה שלכם'}
    </button>
  )
}

interface AnalyticsRevealProps {
  selectedCandidates: Candidate[]
  analytics: Analytics | null
  allCandidates?: Candidate[]
  selectedIds?: Set<string>
  onSelect?: (id: string) => void
  adminMode?: boolean
}

export default function AnalyticsReveal({
  selectedCandidates,
  analytics,
  allCandidates,
  selectedIds,
  onSelect,
  adminMode,
}: AnalyticsRevealProps) {
  const [activeTab, setActiveTab] = useState<'picks' | 'leaderboard' | 'graph' | 'cooccurrence' | 'sna' | 'fullmatrix' | 'convergence' | 'log'>('picks')
  const [liveTotal, setLiveTotal] = useState<number | null>(null)
  const [ballotHistory, setBallotHistory] = useState<string[][] | null>(null)

  // Fetch ballot history once per session (cached in sessionStorage)
  useEffect(() => {
    const cached = sessionStorage.getItem('ballot-history')
    const cachedAt = Number(sessionStorage.getItem('ballot-history-ts') || 0)
    if (cached && Date.now() - cachedAt < 5 * 60 * 1000) { setBallotHistory(JSON.parse(cached)); return }
    const nonce = import.meta.env.VITE_ADMIN_NONCE || ''
    const url = window.location.port === '5173'
      ? 'http://localhost:8888/.netlify/functions/ballot-history'
      : '/.netlify/functions/ballot-history'
    fetch(url)
      .then(r => r.json())
      .then(d => {
        const h = d.ballots || []
        setBallotHistory(h)
        if (h.length > 0) {
          sessionStorage.setItem('ballot-history', JSON.stringify(h))
          sessionStorage.setItem('ballot-history-ts', String(Date.now()))
        }
      })
      .catch(() => setBallotHistory(null)) // null = failed, don't cache
  }, [adminMode])
  const [ballotLog, setBallotLog] = useState<any[] | null>(null)
  const [ballotLogError, setBallotLogError] = useState<string | null>(null)
  const [graphColorMode, setGraphColorMode] = useState<'group' | 'community'>('group')
  const [graphLayout, setGraphLayout] = useState<'force' | 'spectral'>('force')
  const [snaSort, setSnaSort] = useState<'eigenvector' | 'pagerank' | 'degree' | 'votes'>('eigenvector')
  const [matrixOrder, setMatrixOrder] = useState<'louvain' | 'votes'>('votes')
  const [adminStats, setAdminStats] = useState<{ last10min: number; last1h: number; last6h: number; last12h: number } | null>(null)

  const snaData = useMemo(() => {
    if (!analytics || !allCandidates || allCandidates.length === 0) return null
    return computeSNA(allCandidates, analytics.coOccurrenceMatrix, analytics.candidatePickFrequency)
  }, [analytics, allCandidates])

  useEffect(() => {
    if (!adminMode) return
    const nonce = import.meta.env.VITE_ADMIN_NONCE || ''
    const url = window.location.port === '5173'
      ? 'http://localhost:8888/.netlify/functions/admin-stats'
      : '/.netlify/functions/admin-stats'
    fetch(url, { headers: { 'x-admin-nonce': nonce } })
      .then(r => r.json())
      .then(d => setAdminStats(d))
      .catch(() => {})
  }, [adminMode])


  useEffect(() => {
    if (!adminMode || activeTab !== 'log') return
    setBallotLog(null)
    setBallotLogError(null)
    const nonce = import.meta.env.VITE_ADMIN_NONCE || ''
    const url = window.location.port === '5173'
      ? 'http://localhost:8888/.netlify/functions/admin-ballots'
      : '/.netlify/functions/admin-ballots'
    fetch(url, { headers: { 'x-admin-nonce': nonce } })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
        return r.json()
      })
      .then(d => setBallotLog(d.ballots || []))
      .catch(e => setBallotLogError(e.message))
  }, [adminMode, activeTab])

  const LowVotesWarning = () => analytics && analytics.totalSubmissions < 10 ? (
    <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs mb-4">
      ⚠️ נאספו רק {analytics.totalSubmissions} הצבעות עד כה — הנתונים יהיו משמעותיים יותר עם יותר משיבים
    </p>
  ) : null

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p className="mt-4 text-slate-600">טוען ניתוחים...</p>
      </div>
    )
  }

  const getFrequencyColor = (frequency: number) => {
    if (frequency >= 0.6) return 'bg-green-100 text-green-900'
    if (frequency >= 0.3) return 'bg-yellow-100 text-yellow-900'
    if (frequency >= 0.1) return 'bg-blue-100 text-blue-900'
    return 'bg-red-100 text-red-900'
  }

  const getFrequencyLabel = (frequency: number) => {
    if (frequency >= 0.6) return 'קונסנזוס'
    if (frequency >= 0.3) return 'פופולרי'
    if (frequency >= 0.1) return 'נישתי'
    return 'נדיר'
  }

  const getHeatColor = (cooccurrence: number) => {
    // Continuous color gradient: white (0%) → blue (100%)
    const hue = 210 // blue hue
    const lightness = 100 - (cooccurrence * 80) // white (100) to darker blue (20)
    return `hsl(${hue}, 100%, ${lightness}%)`
  }

  return (
    <div className="space-y-6">
      <NewVoteToast totalSubmissions={analytics.totalSubmissions} onNewTotal={setLiveTotal} />

      {/* Header */}
      <div className="bg-gradient-to-br from-blue-800 via-blue-600 to-indigo-500 rounded-2xl px-6 py-5 text-white shadow-xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight mb-0.5">ניתוח הצבעתך</h2>
            <p className="text-blue-200 text-sm font-medium">תוצאות בזמן אמת · מתעדכן אוטומטית</p>
          </div>
          {analytics?.totalSubmissions ? (
            <div className="flex gap-3 items-stretch flex-wrap justify-end">
              <div className="bg-white/15 backdrop-blur rounded-xl px-5 py-3 text-center flex-shrink-0">
                <p className="text-3xl font-extrabold leading-none">{(liveTotal ?? analytics.totalSubmissions).toLocaleString('he-IL')}</p>
                <p className="text-blue-200 text-xs mt-1 font-medium">הצבעות נרשמו</p>
              </div>
              {adminMode && adminStats && (
                <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 text-xs flex flex-col gap-1 justify-center flex-shrink-0">
                  {[
                    { label: '10 דק׳', val: adminStats.last10min },
                    { label: 'שעה', val: adminStats.last1h },
                    { label: '6 שעות', val: adminStats.last6h },
                    { label: '12 שעות', val: adminStats.last12h },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between gap-3">
                      <span className="text-blue-300">{label}</span>
                      <span className="font-bold tabular-nums">{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
        {adminMode && (
          <div className="mt-3 pt-3 border-t border-blue-400/50 text-xs text-blue-200">
            ADMIN · {selectedCandidates.length} נבחרו
          </div>
        )}
      </div>

      {/* Share CTA */}
      {selectedCandidates.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-600 to-blue-500 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap shadow-md">
          <div>
            <p className="font-bold text-white text-base">רוצים להשפיע על התוצאות?</p>
            <p className="text-blue-100 text-sm mt-0.5">שתפו את הרשימה שלכם עם חברים — ככל שיותר אנשים יצביעו, כך הניתוח יהיה משמעותי יותר</p>
          </div>
          <ShareButton candidates={selectedCandidates} />
        </div>
      )}

      <div>
        <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('picks')}
            className={`px-5 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'picks'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            הבחירות שלך
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-5 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'leaderboard'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            לוח מובילים
          </button>
          <button
            onClick={() => setActiveTab('convergence')}
            className={`px-5 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'convergence'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            מגמה
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={`px-5 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'graph'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            גרף מועמדים
          </button>
          <button
            onClick={() => setActiveTab('cooccurrence')}
            className={`px-5 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'cooccurrence'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            השילובים שלך
          </button>
          <button
            onClick={() => setActiveTab('sna')}
            className={`px-5 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'sna'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            ניתוח רשת
          </button>
          <button
            onClick={() => setActiveTab('fullmatrix')}
            className={`px-5 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'fullmatrix'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            מטריצה מלאה
          </button>
          {adminMode && (<>
            <button
              onClick={() => setActiveTab('log')}
              className={`px-5 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
                activeTab === 'log'
                  ? 'bg-white text-yellow-700 shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              🔧 יומן הצבעות
            </button>
          </>)}
        </div>

        {activeTab === 'picks' && (
          <div className="space-y-3">
            {selectedCandidates.map(candidate => {
              const frequency = analytics.candidatePickFrequency[candidate.id] || 0
              const percentage = Math.round(frequency * 100)
              const label = getFrequencyLabel(frequency)
              const colorClass = getFrequencyColor(frequency)

              return (
                <div
                  key={candidate.id}
                  className="flex gap-3 items-start p-4 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-shadow"
                >
                  <img
                    src={candidate.photoUrl}
                    alt={candidate.name}
                    className="w-16 h-16 rounded object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{candidate.name}</p>
                    <p className={`text-sm px-2 py-1 rounded inline-block mt-1 ${colorClass}`}>
                      {percentage}% - {label}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      נבחר על ידי {percentage}% מהמשיבים
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {activeTab === 'cooccurrence' && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 overflow-auto">
            <p className="text-slate-600 mb-2 text-sm">
              מטריצת השילובים - כל ריבוע מראה כמה פעמים בחרו בשני מועמדים ביחד
            </p>
            <LowVotesWarning />

            {/* Heatmap Matrix */}
            <div className="inline-block min-w-full">
              {/* Header row with candidate names */}
              <div className="flex mb-2">
                <div style={{ width: '80px' }} className="flex-shrink-0" /> {/* Corner spacer */}
                {selectedCandidates.map(candidate => (
                  <div
                    key={`header-${candidate.id}`}
                    className="flex-shrink-0 flex items-center justify-center text-xs font-semibold text-slate-700 text-center p-1"
                    style={{ width: '80px', height: '80px', wordBreak: 'break-word' }}
                    title={candidate.name}
                  >
                    {candidate.name}
                  </div>
                ))}
              </div>

              {/* Matrix rows */}
              {selectedCandidates.map((c1, i) => (
                <div key={`row-${c1.id}`} className="flex mb-1">
                  {/* Row label */}
                  <div style={{ width: '80px' }} className="flex-shrink-0 text-xs font-semibold text-slate-700 px-1 flex items-center justify-end" title={c1.name}>
                    <span className="truncate">{c1.name}</span>
                  </div>

                  {/* Matrix cells */}
                  {selectedCandidates.map((c2, j) => {
                    let cooccurrence = 0
                    let cellClass = 'hsl(210, 100%, 95%)'

                    if (i === j) {
                      // Diagonal - self is always 100%
                      cooccurrence = 1
                      cellClass = '#2563eb'
                    } else if (i < j) {
                      const key = `${c1.id}_${c2.id}`
                      cooccurrence = analytics.coOccurrenceMatrix[key] || 0
                      cellClass = getHeatColor(cooccurrence)
                    } else {
                      // Mirror: use the same value from the upper triangle
                      const key = `${c2.id}_${c1.id}`
                      cooccurrence = analytics.coOccurrenceMatrix[key] || 0
                      cellClass = getHeatColor(cooccurrence)
                    }

                    const percentage = Math.round(cooccurrence * 100)

                    return (
                      <div
                        key={`cell-${i}-${j}`}
                        className="flex-shrink-0 flex items-center justify-center text-xs font-bold transition-all cursor-help"
                        style={{ width: '80px', height: '80px', backgroundColor: cellClass }}
                        title={`${c1.name} & ${c2.name}: ${percentage}%`}
                      >
                        {i === j ? (
                          <span className="text-white">100</span>
                        ) : (
                          <span className={percentage > 50 ? 'text-white' : 'text-slate-700'}>
                            {percentage}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-6 pt-4 border-t border-slate-200">
              <p className="text-xs text-slate-600 mb-2 font-semibold">מפתח הצבעים:</p>
              <div className="flex gap-4 flex-wrap text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#2563eb' }} />
                  <span>100% (עצמי)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-0.5">
                    {[0.2, 0.4, 0.6, 0.8, 1.0].map(v => (
                      <div key={v} className="w-4 h-4 rounded-sm" style={{ backgroundColor: `hsl(210, 100%, ${100 - v * 80}%)` }} />
                    ))}
                  </div>
                  <span>נמוך → גבוה</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'graph' && analytics && allCandidates && selectedIds && onSelect && (
          <div className="flex flex-col gap-2" style={{ height: 'calc(100vh - 300px)' }}>
            <LowVotesWarning />
            {/* Layout + color toggles — always visible */}
            <div className="flex gap-2 flex-wrap items-center">
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
                <button onClick={() => setGraphLayout('force')}
                  className={`px-3 py-1.5 transition-colors ${graphLayout === 'force' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  כוחות
                </button>
                <button onClick={() => setGraphLayout('spectral')}
                  className={`px-3 py-1.5 transition-colors ${graphLayout === 'spectral' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  ספקטרלי
                </button>
              </div>
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
                <button onClick={() => setGraphColorMode('group')}
                  className={`px-3 py-1.5 transition-colors ${graphColorMode === 'group' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  קבוצת ייצוג
                </button>
                <button onClick={() => setGraphColorMode('community')}
                  className={`px-3 py-1.5 transition-colors ${graphColorMode === 'community' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  קהילה
                </button>
              </div>
              <Tooltip term="מה זה?">
                {graphLayout === 'force'
                  ? 'פריסת כוחות: כל מועמד הוא "כדור" שדוחה אחרים, וקשרי co-occurrence הם "קפיצים" המושכים ביניהם. המיקום סימולציה פיזיקלית — קצת אקראי, אבל מועמדים שנבחרים יחד נוטים להתקרב.'
                  : 'פריסה ספקטרלית: מיקום מחושב מ-2 הווקטורים העצמיים הקטנים ביותר (אחרי הטריוויאלי) של ה-Laplacian הנורמלי L = I − D⁻¹ᐟ²WD⁻¹ᐟ². המיקום אינו אקראי — הוא נובע ישירות ממבנה הגרף. קהילות הצבעה מופיעות כאשכולות גיאוגרפיים.'
                }
              </Tooltip>
            </div>
            <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
              {/* Legend — compact strip on mobile, detailed sidebar on desktop */}
              <div className="md:w-56 bg-blue-50 border border-blue-200 rounded-lg p-3 flex-shrink-0">
                <h3 className="font-bold text-blue-900 mb-2 text-sm hidden md:block">📊 מקרא</h3>

                {/* Mobile: single line */}
                <div className="flex md:hidden flex-row flex-wrap gap-x-3 gap-y-1 text-xs text-blue-800">
                  <span>📏 גודל = פופולריות</span>
                  <span>🔗 קו = שילוב נפוץ</span>
                  <span>✓ = בחרת</span>
                </div>

                {/* Desktop: full legend */}
                <div className="hidden md:flex flex-col gap-3 text-xs text-blue-800">
                  <div className="space-y-1">
                    <div className="font-semibold text-blue-900">📏 גודל הצומת</div>
                    <div>ככל שגדול יותר — נבחר יותר פעמים</div>
                  </div>
                  <div className="space-y-1">
                    <div className="font-semibold text-blue-900">🔗 קווים</div>
                    <div>עובי הקו = תדירות השילוב</div>
                  </div>
                  <div className="space-y-1">
                    <div className="font-semibold text-blue-900">✓ סימון</div>
                    <div>מועמד שהצבעת עבורו</div>
                  </div>
                  <div className="pt-2 border-t border-blue-200 space-y-1.5">
                    <div className="font-semibold text-blue-900 mb-1">🎨 צבע גבול</div>
                    {graphColorMode === 'group' ? (
                      [
                        { color: '#dc2626', label: 'מרצ' },
                        { color: '#16a34a', label: 'כפרי' },
                        { color: '#9333ea', label: 'מיעוטים' },
                        { color: '#3b82f6', label: 'אחר / לא ידוע' },
                      ].map(({ color, label }) => (
                        <div key={label} className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span>{label}</span>
                        </div>
                      ))
                    ) : snaData ? (
                      Array.from(new Set(Object.values(snaData.communityDisplayIndex).filter(i => i >= 0))).sort().map(displayIdx => (
                        <div key={displayIdx} className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: getCommunityColor(displayIdx) }} />
                          <span>קהילה {displayIdx + 1}</span>
                        </div>
                      ))
                    ) : null}
                  </div>
                  <div className="pt-2 border-t border-blue-200 text-blue-500">
                    💡 גרור · גלגל עכבר לזום
                  </div>
                </div>
              </div>

              {/* Graph Canvas */}
              <div className="flex-1 bg-white border border-slate-200 rounded-lg p-2 min-w-0 min-h-0">
                <ForceDirectedGraph
                  candidates={allCandidates}
                  selectedIds={selectedIds}
                  onSelect={onSelect}
                  analytics={analytics}
                  snaData={snaData ?? undefined}
                  colorMode={graphColorMode}
                  layout={graphLayout}
                  spectralPositions={snaData?.spectralPositions}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && allCandidates && (
          <div className="space-y-2 max-w-2xl mx-auto">
            {(() => {
              // Precompute sparkline data per candidate from cached ballot history
              const sparkData: Record<string, number[]> = {}
              if (ballotHistory && ballotHistory.length >= 75) {
                const running: Record<string, number> = {}
                allCandidates.forEach(c => { running[c.id] = 0 })
                ballotHistory.forEach((ballot, i) => {
                  ballot.forEach(id => { if (id in running) running[id]++ })
                  const n = i + 1
                  if (n >= 75 && (n % Math.max(1, Math.floor(ballotHistory.length / 40)) === 0 || n === ballotHistory.length)) {
                    allCandidates.forEach(c => {
                      if (!sparkData[c.id]) sparkData[c.id] = []
                      sparkData[c.id].push(running[c.id] / n)
                    })
                  }
                })
              }

              // Shared absolute max so all sparklines are on same scale
              const globalMax = Math.max(...Object.values(sparkData).flat(), 0.01)

              const Sparkline = ({ candidateId, color }: { candidateId: string, color: string }) => {
                const data = sparkData[candidateId]
                if (!data || data.length < 3) return null
                const w = 72, h = 24, pad = 2
                const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (w - pad * 2))
                const ys = data.map(v => h - pad - (v / globalMax) * (h - pad * 2))
                const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
                return (
                  <svg width={w} height={h} className="flex-shrink-0 opacity-70">
                    <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )
              }

              return [...allCandidates]
              .sort((a, b) => {
                const fa = analytics.candidatePickFrequency[a.id] || 0
                const fb = analytics.candidatePickFrequency[b.id] || 0
                return fb - fa
              })
              .map((candidate, index) => {
                const frequency = analytics.candidatePickFrequency[candidate.id] || 0
                const percentage = Math.round(frequency * 100)
                const group = candidate.group || null

                const getGroupStyle = (g: string | null) => {
                  if (!g) return { pill: 'bg-blue-100 text-blue-800', bar: 'bg-blue-500' }
                  if (g.includes('מרצ')) return { pill: 'bg-red-100 text-red-800', bar: 'bg-red-500' }
                  if (g.includes('כפרי')) return { pill: 'bg-green-100 text-green-800', bar: 'bg-green-500' }
                  if (g.includes('מיעוטים')) return { pill: 'bg-purple-100 text-purple-800', bar: 'bg-purple-500' }
                  return { pill: 'bg-blue-100 text-blue-800', bar: 'bg-blue-500' }
                }

                const { pill: pillClass, bar: barClass } = getGroupStyle(group)

                return (
                  <div
                    key={candidate.id}
                    className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-shadow"
                  >
                    <span className="text-slate-400 font-mono text-sm w-6 text-right flex-shrink-0">{index + 1}</span>
                    <img
                      src={candidate.photoUrl}
                      alt={candidate.name}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    />
                    <span className="font-medium text-sm flex-1 min-w-0 truncate">{candidate.name}</span>
                    {group && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${pillClass}`}>
                        {group}
                      </span>
                    )}
                    {sparkData[candidate.id] && (
                      <Sparkline candidateId={candidate.id} color={barClass.includes('red') ? '#dc2626' : barClass.includes('green') ? '#16a34a' : barClass.includes('purple') ? '#9333ea' : '#3b82f6'} />
                    )}
                    <div className="flex items-center gap-2 flex-shrink-0 w-28">
                      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full ${barClass}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600 font-mono w-8 text-right">{percentage}%</span>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        )}

        {activeTab === 'sna' && snaData && allCandidates && (
          <div className="space-y-6">
            <LowVotesWarning />

            {/* Community section */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow">
              <h3 className="font-bold text-slate-800 mb-3 text-base">קהילות הצבעה</h3>
              <p className="text-xs text-slate-500 mb-4">
                קהילות שזוהו על ידי <Tooltip term="אלגוריתם Louvain">
                  ממקסם מודולריות Q = (1/2m)Σᵢⱼ[Aᵢⱼ − kᵢkⱼ/2m]δ(cᵢ,cⱼ) — ההפרש בין צפיפות הקשרים הנצפית לצפויה בגרף אקראי עם אותם דרגות.{'\n\n'}אם ממש מעניין אותך: שני שלבים — (1) Greedy local: כל קודקוד עובר לקהילה השכנה שממקסמת ΔQ; (2) Compression: כל קהילה מתכווצת לקודקוד יחיד וחוזר חלילה. מורכבות O(n log n). אופטימום גלובלי אינו מובטח — NP-hard.
                </Tooltip> — מועמדים שנבחרים ביחד בתדירות גבוהה
              </p>
              <div className="flex flex-wrap gap-4">
                {(() => {
                  // Use communityDisplayIndex — single source of truth
                  const displayIds = Array.from(new Set(
                    Object.values(snaData.communityDisplayIndex).filter(i => i >= 0)
                  )).sort()
                  const singletons = allCandidates.filter(c => (snaData.communityDisplayIndex[c.id] ?? -1) < 0)
                  const blocks = displayIds.map(displayIdx => {
                    const members = allCandidates.filter(c => snaData.communityDisplayIndex[c.id] === displayIdx)
                    if (members.length < 1) return null
                    const color = getCommunityColor(displayIdx)
                    return (
                      <div key={displayIdx} className="flex-1 min-w-[180px] rounded-xl border-2 p-3" style={{ borderColor: color, background: `${color}12` }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="font-semibold text-sm" style={{ color }}>קהילה {displayIdx + 1}</span>
                          <span className="text-xs text-slate-400">({members.length} מועמדים)</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {members.map(c => (
                            <div key={c.id} className="flex items-center gap-1 bg-white rounded-full px-2 py-0.5 text-xs shadow-sm border border-slate-100">
                              <img src={c.photoUrl} alt={c.name} className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                              <span className="text-slate-700">{c.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }).filter(Boolean)
                  if (singletons.length > 0) {
                    blocks.push(
                      <div key="singletons" className="flex-1 min-w-[180px] rounded-xl border-2 p-3 border-slate-200 bg-slate-50">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-block w-3 h-3 rounded-full flex-shrink-0 bg-slate-400" />
                          <span className="font-semibold text-sm text-slate-500">ללא קהילה</span>
                          <span className="text-xs text-slate-400">({singletons.length} מועמדים)</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {singletons.map(c => (
                            <div key={c.id} className="flex items-center gap-1 bg-white rounded-full px-2 py-0.5 text-xs shadow-sm border border-slate-100">
                              <img src={c.photoUrl} alt={c.name} className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                              <span className="text-slate-700">{c.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }
                  return blocks
                })()}
              </div>
            </div>

            {/* Metrics table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-base">מדדי רשת לפי מועמד</h3>
                <p className="text-xs text-slate-500 mt-0.5">לחצו על כותרת עמודה למיון</p>
              </div>
              <div className="overflow-auto">
                {(() => {
                  const SortTh = ({ col, label, className }: { col: typeof snaSort, label: React.ReactNode, className?: string }) => (
                    <th
                      className={`px-4 py-2 text-right font-semibold cursor-pointer select-none hover:bg-slate-100 transition-colors ${snaSort === col ? 'text-blue-600 bg-slate-100' : ''} ${className ?? ''}`}
                      onClick={() => setSnaSort(col)}
                    >
                      {label} {snaSort === col ? '↓' : ''}
                    </th>
                  )
                  const sortedCandidates = [...allCandidates].sort((a, b) => {
                    if (snaSort === 'votes') return (analytics.candidatePickFrequency[b.id] ?? 0) - (analytics.candidatePickFrequency[a.id] ?? 0)
                    if (snaSort === 'pagerank') return (snaData.pagerank[b.id] ?? 0) - (snaData.pagerank[a.id] ?? 0)
                    if (snaSort === 'degree') return (snaData.degree[b.id] ?? 0) - (snaData.degree[a.id] ?? 0)
                    return (snaData.eigenvector[b.id] ?? 0) - (snaData.eigenvector[a.id] ?? 0)
                  })
                  return (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-right font-semibold">מועמד</th>
                      <SortTh col="votes" label="% הצבעות" className="w-32" />
                      <SortTh col="eigenvector" label={<Tooltip term="Eigenvector">פתרון Ax = λx כאשר A מטריצת הסמיכות המשוקללת, λ הערך העצמי הדומיננטי. xᵢ = (1/λ)Σⱼ∈N(i) xⱼ. גבוה = נבחר עם מועמדים מרכזיים.</Tooltip>} className="w-36" />
                      <SortTh col="pagerank" label={<Tooltip term="PageRank">הסתברות שמצביע אקראי יבחר מועמד זה — לוקח בחשבון לא רק פופולריות אלא גם למי מצביעים ביחד איתו.</Tooltip>} className="w-36" />
                      <SortTh col="degree" label="Degree" className="w-32" />
                      <th className="px-4 py-2 text-right font-semibold w-20">קהילה</th>
                      <th className="px-4 py-2 text-right font-semibold">
                        <Tooltip term="דומים (CF)">מועמדים עם פרופיל co-occurrence דומה — לא בהכרח אלה שנבחרים הכי הרבה ביחד, אלא אלה שנבחרים יחד עם אותם מועמדים אחרים. חישוב: sim(i,j) = (vᵢ·vⱼ)/(‖vᵢ‖·‖vⱼ‖) כאשר vᵢ ∈ ℝ⁵¹ הוא וקטור ה-co-occurrence של מועמד i עם כל שאר המועמדים.</Tooltip>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCandidates.map(candidate => {
                        const votes = analytics.candidatePickFrequency[candidate.id] ?? 0
                        const bt = snaData.eigenvector[candidate.id] ?? 0
                        const pr = snaData.pagerank[candidate.id] ?? 0
                        const dg = snaData.degree[candidate.id] ?? 0
                        const communityId = snaData.communityDisplayIndex[candidate.id] ?? -1
                        const color = getCommunityColor(communityId)
                        const Bar = ({ val, color: c }: { val: number, color: string }) => (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="h-2 rounded-full" style={{ width: `${Math.round(val * 100)}%`, background: c }} />
                            </div>
                            <span className="text-xs text-slate-500 font-mono w-8 text-right">{Math.round(val * 100)}%</span>
                          </div>
                        )
                        return (
                          <tr key={candidate.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <img src={candidate.photoUrl} alt={candidate.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                                <span className="font-medium text-slate-800 text-xs">{candidate.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2"><Bar val={votes} color="#0ea5e9" /></td>
                            <td className="px-4 py-2"><Bar val={bt} color="#f59e0b" /></td>
                            <td className="px-4 py-2"><Bar val={pr} color="#8b5cf6" /></td>
                            <td className="px-4 py-2"><Bar val={dg} color="#3b82f6" /></td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                                <span className="text-xs text-slate-500">{communityId >= 0 ? communityId + 1 : '—'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1">
                                {(snaData.cosineSimTop3[candidate.id] ?? []).map(simId => {
                                  const simC = allCandidates.find(c => c.id === simId)
                                  if (!simC) return null
                                  return (
                                    <img key={simId} src={simC.photoUrl} alt={simC.name}
                                      title={simC.name}
                                      className="w-6 h-6 rounded-full object-cover border border-white shadow-sm" />
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fullmatrix' && analytics.allCandidates && (
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-base font-bold text-slate-800 mb-1">מטריצת הדפוסים</p>
            <p className="text-slate-500 text-sm mb-3">שילובים של כל 51 המשיבים</p>
            <LowVotesWarning />
            <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs mb-4 md:hidden">
              📱 המטריצה המלאה מתאימה לצפייה במסך רחב יותר
            </p>

            {/* Matrix order toggle */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-slate-500 font-medium">סדר:</span>
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
                <button
                  onClick={() => setMatrixOrder('votes')}
                  className={`px-3 py-1.5 transition-colors ${matrixOrder === 'votes' ? 'bg-blue-600 text-white font-semibold' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  לפי הצבעות
                </button>
                <button
                  onClick={() => setMatrixOrder('louvain')}
                  className={`px-3 py-1.5 transition-colors ${matrixOrder === 'louvain' ? 'bg-blue-600 text-white font-semibold' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  לפי קהילות Louvain
                </button>
              </div>
            </div>

            {/* Full Matrix - Scrollable */}
            <FullMatrix
              allCandidates={analytics.allCandidates}
              coOccurrenceMatrix={analytics.coOccurrenceMatrix}
              snaData={snaData}
              matrixOrder={matrixOrder}
              candidatePickFrequency={analytics.candidatePickFrequency}
            />

            {/* Legend */}
            <div className="mt-6 pt-4 border-t border-slate-200">
              <p className="text-xs text-slate-600 mb-2 font-semibold">מפתח הצבעים:</p>
              <div className="flex gap-4 flex-wrap text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-600 rounded" />
                  <span>100% (עצמי)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4" style={{backgroundColor: 'hsl(210, 100%, 30%)'}} />
                  <span>גבוה (80%+)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4" style={{backgroundColor: 'hsl(210, 100%, 50%)'}} />
                  <span>בינוני (50%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4" style={{backgroundColor: 'hsl(210, 100%, 75%)'}} />
                  <span>נמוך (20%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white border border-slate-300 rounded" />
                  <span>0%</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'convergence' && allCandidates && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base mb-0.5">מגמת הצבעות</h3>
                <p className="text-xs text-slate-500">שיעור מצטבר לפי סדר כניסת ההצבעות — קו מקווקו = n=75 (יציבות)</p>
              </div>
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
                <button onClick={() => setGraphColorMode('group')}
                  className={`px-3 py-1.5 transition-colors ${graphColorMode === 'group' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  קבוצת ייצוג
                </button>
                <button onClick={() => setGraphColorMode('community')}
                  className={`px-3 py-1.5 transition-colors ${graphColorMode === 'community' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  קהילה
                </button>
              </div>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-3 text-xs">
              {graphColorMode === 'group' ? (
                [
                  { color: '#dc2626', label: 'מרצ' },
                  { color: '#16a34a', label: 'כפרי' },
                  { color: '#9333ea', label: 'מיעוטים' },
                  { color: '#3b82f6', label: 'אחר' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="inline-block w-6 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-slate-600">{label}</span>
                  </div>
                ))
              ) : snaData ? (
                Array.from(new Set(Object.values(snaData.communityDisplayIndex).filter(i => i >= 0))).sort().map(idx => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="inline-block w-6 h-2 rounded-full" style={{ background: getCommunityColor(idx) }} />
                    <span className="text-slate-600">קהילה {idx + 1}</span>
                  </div>
                ))
              ) : null}
            </div>

            {ballotHistory === null ? (
              <div className="flex items-center justify-center h-64 text-slate-400">טוען...</div>
            ) : (
              <ConvergenceChart
                ballots={ballotHistory}
                candidates={allCandidates}
                minBallots={75}
                topN={20}
                colorMode={graphColorMode}
                snaData={snaData}
              />
            )}
          </div>
        )}

        {activeTab === 'log' && adminMode && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 text-slate-600 font-semibold">#</th>
                  <th className="px-4 py-2 text-slate-600 font-semibold">תאריך</th>
                  <th className="px-4 py-2 text-slate-600 font-semibold">IP Hash</th>
                  <th className="px-4 py-2 text-slate-600 font-semibold">זמן (שנ)</th>
                  <th className="px-4 py-2 text-slate-600 font-semibold">מועמדים</th>
                </tr>
              </thead>
              <tbody>
                {ballotLogError ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-red-500 text-xs font-mono">{ballotLogError}</td></tr>
                ) : ballotLog === null ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">טוען...</td></tr>
                ) : ballotLog.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">אין הצבעות</td></tr>
                ) : ballotLog.map((b, i) => (
                  <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-500">{b.id}</td>
                    <td className="px-4 py-2 text-slate-600 font-mono text-xs">{b.createdAt}</td>
                    <td className="px-4 py-2 text-slate-500 font-mono text-xs">{b.ipHash}</td>
                    <td className="px-4 py-2 text-slate-600">{b.timeToComplete}s</td>
                    <td className="px-4 py-2 text-slate-700">{b.selectedCandidates.length} מועמדים</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-bold text-lg mb-2">סה"כ הצבעות</h3>
          <p className="text-2xl font-bold text-blue-600">
            {analytics.totalSubmissions}
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="font-bold text-lg mb-2">ייחודיות הצבעתך</h3>
          {(() => {
            const avgFreq = selectedCandidates.length > 0
              ? selectedCandidates.reduce((sum, c) => sum + (analytics.candidatePickFrequency[c.id] || 0), 0) / selectedCandidates.length
              : 0
            const uniquenessScore = Math.round((1 - avgFreq) * 100)
            const label = uniquenessScore > 70 ? 'ייחודית מאוד' : uniquenessScore >= 40 ? 'בינונית' : 'פופולרית'
            return (
              <>
                <p className="text-2xl font-bold text-purple-600">{uniquenessScore}%</p>
                <p className="text-sm text-purple-700 mt-1">{label}</p>
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
