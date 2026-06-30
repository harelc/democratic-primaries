import { useState, useEffect, useMemo } from 'react'
import { Candidate, Analytics } from '../types'
import ForceDirectedGraph from './ForceDirectedGraph'
import { computeSNA, getCommunityColor } from '../utils/sna'

function FullMatrix({ allCandidates, coOccurrenceMatrix, snaData }: {
  allCandidates: Candidate[]
  coOccurrenceMatrix: Record<string, number>
  snaData: ReturnType<typeof computeSNA> | null
}) {
  const ordered = snaData
    ? [...allCandidates].sort((a, b) => {
        const ca = snaData.communities[a.id] ?? 99
        const cb = snaData.communities[b.id] ?? 99
        if (ca !== cb) return ca - cb
        return (snaData.weightedDegree[b.id] ?? 0) - (snaData.weightedDegree[a.id] ?? 0)
      })
    : allCandidates

  return (
    <div className="overflow-auto border border-slate-200 rounded" style={{ maxHeight: '600px' }}>
      <div className="inline-block min-w-full">
        <div className="flex mb-1 sticky top-0 bg-white z-10">
          <div className="flex-shrink-0 bg-slate-50 border-r border-b border-slate-200" style={{ width: '120px' }} />
          {ordered.map(c => (
            <div key={`h-${c.id}`} className="flex-shrink-0 flex items-center justify-center text-xs font-semibold bg-slate-50 border-r border-b border-slate-200 p-0.5"
              title={c.name} style={{ width: '60px', height: '60px', wordBreak: 'break-word', fontSize: '10px',
                color: snaData ? getCommunityColor(snaData.communities[c.id] ?? 0) : '#475569' }}>
              {c.name}
            </div>
          ))}
        </div>
        {ordered.map(c1 => {
          const comm = snaData?.communities[c1.id] ?? null
          return (
            <div key={`r-${c1.id}`} className="flex mb-1">
              <div className="flex-shrink-0 text-xs font-semibold px-1 flex items-center justify-end border-r border-slate-200 truncate"
                title={c1.name} style={{ width: '120px',
                  color: comm !== null ? getCommunityColor(comm) : '#475569',
                  backgroundColor: comm !== null ? `${getCommunityColor(comm)}15` : '#f8fafc' }}>
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
      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-base transition-colors shadow-md hover:shadow-lg"
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
  const [activeTab, setActiveTab] = useState<'picks' | 'cooccurrence' | 'fullmatrix' | 'graph' | 'leaderboard' | 'sna' | 'log'>('picks')
  const [ballotLog, setBallotLog] = useState<any[]>([])

  const snaData = useMemo(() => {
    if (!analytics || !allCandidates || allCandidates.length === 0) return null
    return computeSNA(allCandidates, analytics.coOccurrenceMatrix)
  }, [analytics, allCandidates])

  useEffect(() => {
    if (!adminMode || activeTab !== 'log') return
    const nonce = import.meta.env.VITE_ADMIN_NONCE || ''
    fetch('/.netlify/functions/admin-ballots', { headers: { 'x-admin-nonce': nonce } })
      .then(r => r.json())
      .then(d => setBallotLog(d.ballots || []))
      .catch(() => {})
  }, [adminMode, activeTab])

  const LowVotesWarning = () => analytics && analytics.totalSubmissions < 10 ? (
    <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs mb-4">
      ⚠️ נאספו רק {analytics.totalSubmissions} הצבעות עד כה — הנתונים יהיו משמעותיים יותר עם יותר משתתפים
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
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-500 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold mb-1">ניתוח הצבעתך</h2>
            <p className="text-blue-200 text-sm">
              {analytics?.totalSubmissions ? `${analytics.totalSubmissions.toLocaleString('he-IL')} הצבעות נרשמו עד כה` : 'טוען נתונים...'}
            </p>
          </div>
          <ShareButton candidates={selectedCandidates} />
        </div>
        {adminMode && (
          <div className="mt-3 pt-3 border-t border-blue-400 text-xs text-blue-200">
            ADMIN · {selectedCandidates.length} נבחרו
          </div>
        )}
      </div>

      <div>
        <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('picks')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'picks'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            הבחירות שלך
          </button>
          <button
            onClick={() => setActiveTab('cooccurrence')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'cooccurrence'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            השילובים שלך
          </button>
          <button
            onClick={() => setActiveTab('fullmatrix')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'fullmatrix'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            מטריצה מלאה (51×51)
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'graph'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            גרף מועמדים
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'leaderboard'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            לוח מובילים
          </button>
          <button
            onClick={() => setActiveTab('sna')}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
              activeTab === 'sna'
                ? 'bg-white text-blue-700 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            ניתוח רשת
          </button>
          {adminMode && (
            <button
              onClick={() => setActiveTab('log')}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all text-sm ${
                activeTab === 'log'
                  ? 'bg-white text-yellow-700 shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              🔧 יומן הצבעות
            </button>
          )}
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
                      נבחר על ידי {percentage}% מהמשתתפים
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
                    <div className="font-semibold text-blue-900">🎨 צבע גבול</div>
                    {snaData ? (
                      <>
                        <div className="text-blue-600 mb-1">קהילות (Louvain)</div>
                        {Array.from(new Set(Object.values(snaData.communities))).sort().map(cId => (
                          <div key={cId} className="flex items-center gap-2">
                            <span className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-white/50" style={{ background: getCommunityColor(cId) }} />
                            <span>קהילה {cId + 1}</span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className="text-blue-600 mb-1">קבוצת ייצוג</div>
                        {[
                          { color: '#dc2626', label: 'מרצ' },
                          { color: '#16a34a', label: 'כפרי' },
                          { color: '#9333ea', label: 'מיעוטים' },
                          { color: '#3b82f6', label: 'אחר / לא ידוע' },
                        ].map(({ color, label }) => (
                          <div key={label} className="flex items-center gap-2">
                            <span className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-white/50" style={{ background: color }} />
                            <span>{label}</span>
                          </div>
                        ))}
                      </>
                    )}
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
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && allCandidates && (
          <div className="space-y-2">
            {[...allCandidates]
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
                    <div className="flex items-center gap-2 flex-shrink-0 w-32">
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
              })}
          </div>
        )}

        {activeTab === 'sna' && snaData && allCandidates && (
          <div className="space-y-6">
            <LowVotesWarning />

            {/* Community section */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="font-bold text-slate-800 mb-3 text-base">קהילות הצבעה</h3>
              <p className="text-xs text-slate-500 mb-4">קהילות שזוהו על ידי אלגוריתם Louvain — מועמדים שנבחרים ביחד בתדירות גבוהה</p>
              <div className="flex flex-wrap gap-4">
                {Array.from(new Set(Object.values(snaData.communities))).sort().map(communityId => {
                  const color = getCommunityColor(communityId)
                  const members = allCandidates.filter(c => snaData.communities[c.id] === communityId)
                  return (
                    <div key={communityId} className="flex-1 min-w-[180px] rounded-xl border-2 p-3" style={{ borderColor: color, background: `${color}12` }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="font-semibold text-sm" style={{ color }}>קהילה {communityId + 1}</span>
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
                })}
              </div>
            </div>

            {/* Metrics table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-base">מדדי רשת לפי מועמד</h3>
                <p className="text-xs text-slate-500 mt-0.5">ממויין לפי betweenness — מי מחבר בין קהילות</p>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-right font-semibold">מועמד</th>
                      <th className="px-4 py-2 text-right font-semibold w-40">Betweenness (גישור)</th>
                      <th className="px-4 py-2 text-right font-semibold w-40">Degree (קשרים)</th>
                      <th className="px-4 py-2 text-right font-semibold w-20">קהילה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...allCandidates]
                      .sort((a, b) => (snaData.betweenness[b.id] ?? 0) - (snaData.betweenness[a.id] ?? 0))
                      .map(candidate => {
                        const bt = snaData.betweenness[candidate.id] ?? 0
                        const dg = snaData.degree[candidate.id] ?? 0
                        const communityId = snaData.communities[candidate.id] ?? 0
                        const color = getCommunityColor(communityId)
                        return (
                          <tr key={candidate.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <img src={candidate.photoUrl} alt={candidate.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                                <span className="font-medium text-slate-800 text-xs">{candidate.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                                  <div className="h-2 rounded-full bg-amber-500" style={{ width: `${Math.round(bt * 100)}%` }} />
                                </div>
                                <span className="text-xs text-slate-500 font-mono w-8 text-right">{Math.round(bt * 100)}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                                  <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.round(dg * 100)}%` }} />
                                </div>
                                <span className="text-xs text-slate-500 font-mono w-8 text-right">{Math.round(dg * 100)}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                                <span className="text-xs text-slate-500">{communityId + 1}</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fullmatrix' && analytics.allCandidates && (
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-slate-600 mb-2 text-sm">מטריצת הדפוסים - שילובים של כל 51 המשתתפים, מסודרת לפי קהילות הצבעה</p>
            <LowVotesWarning />
            <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs mb-4 md:hidden">
              📱 המטריצה המלאה מתאימה לצפייה במסך רחב יותר
            </p>

            {/* Full Matrix - Scrollable, sorted by community for block structure */}
            <FullMatrix
              allCandidates={analytics.allCandidates}
              coOccurrenceMatrix={analytics.coOccurrenceMatrix}
              snaData={snaData}
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
                {ballotLog.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">טוען...</td></tr>
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
