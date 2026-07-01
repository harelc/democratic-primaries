import { useMemo } from 'react'
import { Candidate } from '../types'

interface CompetingPairsProps {
  ballots: string[][]
  candidates: Candidate[]
  topK?: number
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

// r in [-1,1] → color: negative=red, zero=white, positive=blue
function corrColor(r: number): string {
  if (isNaN(r)) return '#f8fafc'
  const t = Math.abs(r)
  if (r < 0) {
    // white → red
    const v = Math.round(255 - t * 180)
    return `rgb(255,${v},${v})`
  } else {
    // white → blue
    const v = Math.round(255 - t * 180)
    return `rgb(${v},${v},255)`
  }
}

export default function CompetingPairs({ ballots, candidates, topK = 20 }: CompetingPairsProps) {
  const { ranked, matrix } = useMemo(() => {
    if (ballots.length < 75) return { ranked: [], matrix: [] }

    const running: Record<string, number> = {}
    candidates.forEach(c => { running[c.id] = 0 })
    const props: Record<string, number[]> = {}
    candidates.forEach(c => { props[c.id] = [] })

    ballots.forEach((ballot, i) => {
      ballot.forEach(id => { if (running[id] !== undefined) running[id]++ })
      const n = i + 1
      if (n >= 75) candidates.forEach(c => { props[c.id].push(running[c.id] / n) })
    })

    const ranked = [...candidates]
      .sort((a, b) => (props[b.id].at(-1) ?? 0) - (props[a.id].at(-1) ?? 0))
      .slice(0, topK)

    const matrix = ranked.map(a =>
      ranked.map(b => a.id === b.id ? 1 : pearson(props[a.id], props[b.id]))
    )

    return { ranked, matrix }
  }, [ballots, candidates, topK])

  if (ranked.length === 0) return null

  const cellSize = Math.max(18, Math.min(30, Math.floor(500 / ranked.length)))
  const labelW = 110

  return (
    <div className="mt-6" dir="rtl">
      <div className="mb-3">
        <h3 className="font-bold text-slate-700 text-sm">כלים שלובים — מטריצת קורלציה</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          קורלציה בין מסלולי הפופולריות של המועמדים לאורך זמן · כחול = עולים יחד · אדום = תחרות ישירה
        </p>
      </div>

      <div className="overflow-x-auto flex justify-center">
        <div style={{ display: 'inline-block', direction: 'ltr' }}>
          {/* Column headers */}
          <div style={{ display: 'flex', marginLeft: labelW }}>
            {ranked.map((c, j) => (
              <div
                key={c.id}
                title={c.name}
                style={{
                  width: cellSize,
                  height: labelW,
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  fontSize: 10,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  paddingBottom: 4,
                  cursor: 'default',
                }}
              >
                {c.name}
              </div>
            ))}
          </div>

          {/* Rows */}
          {ranked.map((rowC, i) => (
            <div key={rowC.id} style={{ display: 'flex', alignItems: 'center' }}>
              {/* Row label */}
              <div style={{
                width: labelW,
                fontSize: 10,
                color: '#475569',
                textAlign: 'right',
                paddingRight: 6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                direction: 'rtl',
              }}>
                {rowC.name}
              </div>
              {/* Cells */}
              {ranked.map((colC, j) => {
                const r = matrix[i]?.[j] ?? 0
                const isDiag = i === j
                return (
                  <div
                    key={colC.id}
                    title={isDiag ? rowC.name : `${rowC.name} ↔ ${colC.name}: r=${r.toFixed(2)}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      background: isDiag ? '#1e3a5f' : corrColor(r),
                      flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.4)',
                      cursor: 'default',
                    }}
                  />
                )
              })}
            </div>
          ))}

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, marginLeft: labelW, direction: 'rtl' }}>
            <span style={{ fontSize: 10, color: '#64748b' }}>תחרות −1</span>
            {[-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map(v => (
              <div key={v} style={{ width: 16, height: 10, background: corrColor(v), border: '1px solid #e2e8f0' }} />
            ))}
            <span style={{ fontSize: 10, color: '#64748b' }}>+1 עולים יחד</span>
          </div>
        </div>
      </div>
    </div>
  )
}
