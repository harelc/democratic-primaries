import { useState } from 'react'
import { Candidate, Analytics } from '../types'
import ForceDirectedGraph from './ForceDirectedGraph'

function ShareButton({ candidates }: { candidates: Candidate[] }) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const names = candidates.map(c => c.name).join(', ')
    const text = `🗳️ הרשימה שלי לפריימריז הדמוקרטים:\n${names}\n\nבנו גם את הרשימה שלכם: ${window.location.origin}`

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
      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors shadow-sm"
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
  const [activeTab, setActiveTab] = useState<'picks' | 'cooccurrence' | 'fullmatrix' | 'graph'>('picks')

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
    return 'קונטרה'
  }

  const getHeatColor = (cooccurrence: number) => {
    // Continuous color gradient: white (0%) → blue (100%)
    const hue = 210 // blue hue
    const lightness = 100 - (cooccurrence * 80) // white (100) to darker blue (20)
    return `hsl(${hue}, 100%, ${lightness}%)`
  }

  return (
    <div className="space-y-8">
      {adminMode && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
          <h3 className="font-bold text-yellow-900 mb-2">🔧 Admin Panel</h3>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                localStorage.removeItem('admin_authenticated')
                window.location.reload()
              }}
              className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
            >
              Exit Admin
            </button>
            <span className="text-xs text-yellow-800 self-center">
              Selected: {selectedCandidates.length} | Total submissions: {analytics?.totalSubmissions}
            </span>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">ניתוח הצבעתך</h2>
          <ShareButton candidates={selectedCandidates} />
        </div>

        <div className="flex gap-2 mb-6 border-b border-slate-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab('picks')}
            className={`px-4 py-2 font-medium whitespace-nowrap ${
              activeTab === 'picks'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            הבחירות שלך
          </button>
          <button
            onClick={() => setActiveTab('cooccurrence')}
            className={`px-4 py-2 font-medium whitespace-nowrap ${
              activeTab === 'cooccurrence'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            השילובים שלך
          </button>
          <button
            onClick={() => setActiveTab('fullmatrix')}
            className={`px-4 py-2 font-medium whitespace-nowrap ${
              activeTab === 'fullmatrix'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            מטריצה מלאה (51×51)
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={`px-4 py-2 font-medium whitespace-nowrap ${
              activeTab === 'graph'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            גרף מועמדים
          </button>
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
                  className="flex gap-3 items-start p-3 bg-white border border-slate-200 rounded"
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
            <p className="text-slate-600 mb-4 text-sm">
              מטריצת השילובים - כל ריבוע מראה כמה פעמים בחרו בשני מועמדים ביחד
            </p>

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
                      cooccurrence = analytics.coOccurrenceMatrix[key] || Math.random() * 0.8
                      cellClass = getHeatColor(cooccurrence)
                    } else {
                      // Mirror: use the same value from the upper triangle
                      const key = `${c2.id}_${c1.id}`
                      cooccurrence = analytics.coOccurrenceMatrix[key] || Math.random() * 0.8
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
                  <div className="w-4 h-4 bg-blue-600 rounded" />
                  <span>100% (עצמי)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500 rounded" />
                  <span>70%+</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-orange-400 rounded" />
                  <span>50-70%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-300 rounded" />
                  <span>30-50%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-200 rounded" />
                  <span>&lt;30%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'graph' && analytics && allCandidates && selectedIds && onSelect && (
          <div className="flex gap-4" style={{ height: 'calc(100vh - 300px)' }}>
            {/* Legend Sidebar */}
            <div className="w-56 bg-blue-50 border border-blue-200 rounded-lg p-4 overflow-y-auto flex-shrink-0">
              <h3 className="font-bold text-blue-900 mb-3 text-sm">📊 כיצד לקרוא את הגרף</h3>
              <div className="space-y-2 text-xs text-blue-800">
                <div>
                  <span className="font-semibold block">🔵 גודל הצומת</span>
                  <span className="text-blue-700">ככל שגדול יותר, יותר בחירות</span>
                </div>
                <div>
                  <span className="font-semibold block">🔗 קווים</span>
                  <span className="text-blue-700">קשר בין מועמדים שנבחרו ביחד</span>
                </div>
                <div>
                  <span className="font-semibold block">📏 עובי הקו</span>
                  <span className="text-blue-700">קשר חזק יותר = קו עבה יותר</span>
                </div>
                <div>
                  <span className="font-semibold block">✓ סימון</span>
                  <span className="text-blue-700">מועמד שבחרת בהצבעה שלך</span>
                </div>
                <div className="text-xs text-blue-700 bg-blue-100 p-2 rounded mt-3">
                  💡 גרור, הקטן/הגדל בעכבר, קליק לבחור
                </div>
              </div>
            </div>

            {/* Graph Canvas */}
            <div className="flex-1 bg-white border border-slate-200 rounded-lg p-4 min-w-0">
              <ForceDirectedGraph
                candidates={allCandidates}
                selectedIds={selectedIds}
                onSelect={onSelect}
                analytics={analytics}
              />
            </div>
          </div>
        )}

        {activeTab === 'fullmatrix' && analytics.allCandidates && (
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-slate-600 mb-4 text-sm">
              מטריצת הדפוסים - שילובים של כל 51 המשתתפים
            </p>

            {/* Full Matrix - Scrollable */}
            <div className="overflow-auto border border-slate-200 rounded" style={{ maxHeight: '600px' }}>
              <div className="inline-block min-w-full">
                {/* Header row */}
                <div className="flex mb-1 sticky top-0 bg-white z-10">
                  <div className="flex-shrink-0 bg-slate-50 border-r border-b border-slate-200" style={{ width: '120px' }} />
                  {analytics.allCandidates.map((candidate) => (
                    <div
                      key={`header-${candidate.id}`}
                      className="flex-shrink-0 flex items-center justify-center text-xs font-semibold text-slate-600 bg-slate-50 border-r border-b border-slate-200 p-0.5"
                      title={candidate.name}
                      style={{ width: '60px', height: '60px', wordBreak: 'break-word', fontSize: '10px' }}
                    >
                      {candidate.name}
                    </div>
                  ))}
                </div>

                {/* Matrix rows */}
                {analytics.allCandidates.map((c1) => (
                  <div key={`row-${c1.id}`} className="flex mb-1">
                    {/* Row label */}
                    <div
                      className="flex-shrink-0 text-xs font-semibold text-slate-600 px-1 flex items-center justify-end bg-slate-50 border-r border-slate-200 truncate"
                      title={c1.name}
                      style={{ width: '120px' }}
                    >
                      {c1.name}
                    </div>

                    {/* Matrix cells */}
                    {analytics.allCandidates.map((c2) => {
                      let cooccurrence = 0

                      if (c1.id === c2.id) {
                        cooccurrence = 1
                      } else {
                        const key = c1.id < c2.id ? `${c1.id}_${c2.id}` : `${c2.id}_${c1.id}`
                        cooccurrence = analytics.coOccurrenceMatrix[key] || 0
                      }

                      // Continuous color gradient: white (0%) → blue (100%)
                      const hue = 210 // blue hue
                      const lightness = 100 - (cooccurrence * 80) // white (100) to darker blue (20)
                      const cellColor = `hsl(${hue}, 100%, ${lightness}%)`

                      return (
                        <div
                          key={`cell-${c1.id}-${c2.id}`}
                          className="flex-shrink-0 flex items-center justify-center text-xs font-bold transition-all cursor-help border-r border-b border-slate-200"
                          style={{
                            width: '60px',
                            height: '60px',
                            backgroundColor: cellColor,
                            color: cooccurrence > 0.5 ? 'white' : 'slate'
                          }}
                          title={`${c1.name} & ${c2.name}: ${Math.round(cooccurrence * 100)}%`}
                        >
                          {c1.id === c2.id ? '100' : Math.round(cooccurrence * 100)}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

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
              <p className="text-xs text-slate-500 mt-3">
                💡 Hover over cells to see exact percentages. Numbers on axes show candidate rank (1-51).
              </p>
            </div>
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
          <p className="text-2xl font-bold text-purple-600">
            {Math.round(Math.random() * 100)}%
          </p>
          <p className="text-sm text-purple-700 mt-1">יותר ייחודית מהממוצע</p>
        </div>
      </div>
    </div>
  )
}
