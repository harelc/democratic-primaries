import { useMemo } from 'react'
import { Candidate } from '../types'

interface CompetingPairsProps {
  ballots: string[][]
  candidates: Candidate[]
  topN?: number
  maxPairs?: number
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 10) return 0
  const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n
  const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    const ea = a[i] - meanA, eb = b[i] - meanB
    num += ea * eb; da += ea * ea; db += eb * eb
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

function Sparkline({ aData, bData, colorA, colorB }: {
  aData: number[]; bData: number[]; colorA: string; colorB: string
}) {
  const W = 80, H = 32
  const SAMPLES = 60
  const step = Math.max(1, Math.floor(aData.length / SAMPLES))
  const aS = aData.filter((_, i) => i % step === 0)
  const bS = bData.filter((_, i) => i % step === 0)
  const all = [...aS, ...bS]
  const lo = Math.min(...all), hi = Math.max(...all)
  const range = hi - lo || 0.01

  const pts = (arr: number[]) =>
    arr.map((v, i) => `${(i / (arr.length - 1)) * W},${H - ((v - lo) / range) * H}`).join(' ')

  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={pts(aS)} fill="none" stroke={colorA} strokeWidth="1.5" strokeLinejoin="round" opacity="0.85" />
      <polyline points={pts(bS)} fill="none" stroke={colorB} strokeWidth="1.5" strokeLinejoin="round" opacity="0.85" />
    </svg>
  )
}

const GROUP_COLOR: Record<string, string> = {
  'מרצ': '#dc2626',
  'כפרי': '#16a34a',
  'מיעוטים': '#9333ea',
}
const getColor = (c: Candidate) => {
  for (const [key, col] of Object.entries(GROUP_COLOR)) {
    if (c.group?.includes(key)) return col
  }
  return '#3b82f6'
}

export default function CompetingPairs({ ballots, candidates, topN = 25, maxPairs = 6 }: CompetingPairsProps) {
  const pairs = useMemo(() => {
    if (ballots.length < 75) return []

    // Build running proportions, but only from ballot 75 onward (stable)
    const running: Record<string, number> = {}
    candidates.forEach(c => { running[c.id] = 0 })
    const props: Record<string, number[]> = {}
    candidates.forEach(c => { props[c.id] = [] })

    ballots.forEach((ballot, i) => {
      ballot.forEach(id => { if (running[id] !== undefined) running[id]++ })
      const n = i + 1
      if (n >= 75) candidates.forEach(c => { props[c.id].push(running[c.id] / n) })
    })

    // Take top N candidates by final proportion
    const ranked = [...candidates]
      .sort((a, b) => (props[b.id].at(-1) ?? 0) - (props[a.id].at(-1) ?? 0))
      .slice(0, topN)

    // Find most negatively correlated pairs
    const results: Array<{ a: Candidate; b: Candidate; r: number; aData: number[]; bData: number[] }> = []
    for (let i = 0; i < ranked.length; i++) {
      for (let j = i + 1; j < ranked.length; j++) {
        const r = pearson(props[ranked[i].id], props[ranked[j].id])
        if (r < -0.3) {
          // Determine which rose and which fell (series starts at n=75)
          const aFinal = props[ranked[i].id].at(-1) ?? 0
          const aStart = props[ranked[i].id][0] ?? 0
          const riser = aFinal > aStart ? ranked[i] : ranked[j]
          const faller = aFinal > aStart ? ranked[j] : ranked[i]
          results.push({ a: riser, b: faller, r, aData: props[riser.id], bData: props[faller.id] })
        }
      }
    }

    results.sort((a, b) => a.r - b.r)
    return results.slice(0, maxPairs)
  }, [ballots, candidates, topN, maxPairs])

  if (pairs.length === 0) return null

  return (
    <div className="mt-6" dir="rtl">
      <div className="mb-3">
        <h3 className="font-bold text-slate-700 text-sm">כלים שלובים — תחרות ישירה</h3>
        <p className="text-xs text-slate-400 mt-0.5">זוגות מועמדים שעלייתו של אחד מתואמת עם ירידתו של השני לאורך זמן</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pairs.map(({ a, b, r, aData, bData }) => (
          <div key={`${a.id}-${b.id}`} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
            {/* Riser */}
            <div className="flex-1 min-w-0 text-right">
              <p className="text-xs font-semibold truncate" style={{ color: getColor(a) }}>{a.name}</p>
              <p className="text-xs text-emerald-600 font-mono">
                {Math.round((aData.at(-1) ?? 0) * 100)}% ↑
              </p>
            </div>

            {/* Sparkline */}
            <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
              <Sparkline aData={aData} bData={bData} colorA={getColor(a)} colorB={getColor(b)} />
              <span className="text-[9px] text-slate-400 tabular-nums">r={r.toFixed(2)}</span>
            </div>

            {/* Faller */}
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-semibold truncate" style={{ color: getColor(b) }}>{b.name}</p>
              <p className="text-xs text-red-500 font-mono">
                {Math.round((bData.at(-1) ?? 0) * 100)}% ↓
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
