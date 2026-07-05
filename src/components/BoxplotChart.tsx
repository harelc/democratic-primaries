import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Candidate } from '../types'

interface BoxplotChartProps {
  ballots: string[][]
  candidates: Candidate[]
}

interface BoxStats {
  id: string
  name: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
  mean: number
}

function computeBoxStats(ballots: string[][], candidates: Candidate[], windowSize: number): BoxStats[] {
  if (ballots.length < windowSize + 1) return []

  const n = ballots.length
  const numWindows = n - windowSize + 1

  // Precompute per-candidate presence as 0/1 array, then use a sliding sum
  return candidates.map(c => {
    const presence = ballots.map(b => b.includes(c.id) ? 1 : 0)

    // Seed first window sum
    let windowSum = 0
    for (let i = 0; i < windowSize; i++) windowSum += presence[i]

    const rates: number[] = [windowSum / windowSize]
    for (let i = 1; i < numWindows; i++) {
      windowSum += presence[i + windowSize - 1] - presence[i - 1]
      rates.push(windowSum / windowSize)
    }

    rates.sort(d3.ascending)
    return {
      id: c.id,
      name: c.name,
      min: d3.quantileSorted(rates, 0.1) ?? 0,
      q1: d3.quantileSorted(rates, 0.25) ?? 0,
      median: d3.quantileSorted(rates, 0.5) ?? 0,
      q3: d3.quantileSorted(rates, 0.75) ?? 0,
      max: d3.quantileSorted(rates, 0.9) ?? 0,
      mean: d3.mean(rates) ?? 0,
    }
  }).sort((a, b) => b.median - a.median)
}

export default function BoxplotChart({ ballots, candidates }: BoxplotChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [windowSize, setWindowSize] = useState(50)

  const minWindow = 20
  const maxWindow = Math.max(20, Math.floor(ballots.length / 2))
  const numWindows = Math.max(0, ballots.length - windowSize + 1)

  useEffect(() => {
    if (!svgRef.current || ballots.length < windowSize * 2) return

    const stats = computeBoxStats(ballots, candidates, windowSize)
    if (!stats.length) return

    const container = svgRef.current.parentElement
    const width = container?.clientWidth || 900
    const margin = { top: 20, right: 16, bottom: 110, left: 44 }
    const height = 340
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    d3.select(svgRef.current).selectAll('*').remove()
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleBand()
      .domain(stats.map(s => s.id))
      .range([0, innerW])
      .padding(0.25)

    const yMax = d3.max(stats, (s: BoxStats) => s.max) ?? 1
    const y = d3.scaleLinear()
      .domain([0, Math.min(1, yMax * 1.15)])
      .range([innerH, 0])
      .nice()

    // Grid lines
    g.append('g')
      .call(d3.axisLeft(y).ticks(6).tickSize(-innerW).tickFormat(() => ''))
      .selectAll('line').attr('stroke', '#e2e8f0').attr('stroke-dasharray', '2 2')
    g.select('.domain').remove()

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(6).tickFormat((d: d3.NumberValue) => `${Math.round(+d * 100)}%`))
      .select('.domain').remove()

    // X axis labels (rotated Hebrew names)
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickFormat(() => ''))
      .select('.domain').remove()

    stats.forEach(s => {
      const cx = (x(s.id) ?? 0) + x.bandwidth() / 2
      const parts = s.name.split(' ')
      const label = parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1]}` : s.name
      g.append('text')
        .attr('transform', `translate(${cx},${innerH + 6}) rotate(55)`)
        .attr('text-anchor', 'start')
        .attr('font-size', '9px')
        .attr('fill', '#64748b')
        .text(label)
    })

    const bw = x.bandwidth()

    stats.forEach(s => {
      const cx = (x(s.id) ?? 0) + x.bandwidth() / 2
      const col = '#3b82f6'

      // Whisker lines (10th–90th)
      g.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', y(s.min)).attr('y2', y(s.q1))
        .attr('stroke', col).attr('stroke-width', 1).attr('stroke-dasharray', '2 2')

      g.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', y(s.q3)).attr('y2', y(s.max))
        .attr('stroke', col).attr('stroke-width', 1).attr('stroke-dasharray', '2 2')

      // Whisker caps
      ;[s.min, s.max].forEach(v => {
        g.append('line')
          .attr('x1', cx - bw * 0.25).attr('x2', cx + bw * 0.25)
          .attr('y1', y(v)).attr('y2', y(v))
          .attr('stroke', col).attr('stroke-width', 1)
      })

      // IQR box
      g.append('rect')
        .attr('x', x(s.id) ?? 0)
        .attr('y', y(s.q3))
        .attr('width', bw)
        .attr('height', Math.max(1, y(s.q1) - y(s.q3)))
        .attr('fill', '#dbeafe')
        .attr('stroke', col)
        .attr('stroke-width', 1.5)
        .attr('rx', 2)

      // Median line
      g.append('line')
        .attr('x1', x(s.id) ?? 0).attr('x2', (x(s.id) ?? 0) + bw)
        .attr('y1', y(s.median)).attr('y2', y(s.median))
        .attr('stroke', '#1d4ed8').attr('stroke-width', 2)

      // Mean dot
      g.append('circle')
        .attr('cx', cx).attr('cy', y(s.mean))
        .attr('r', 2)
        .attr('fill', '#f97316')

      // Tooltip rect (invisible, for hover)
      g.append('rect')
        .attr('x', x(s.id) ?? 0)
        .attr('y', 0)
        .attr('width', bw)
        .attr('height', innerH)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .append('title')
        .text(
          `${s.name}\n` +
          `חציון: ${(s.median * 100).toFixed(1)}%\n` +
          `רבעון עליון: ${(s.q3 * 100).toFixed(1)}%\n` +
          `רבעון תחתון: ${(s.q1 * 100).toFixed(1)}%\n` +
          `ממוצע: ${(s.mean * 100).toFixed(1)}%\n` +
          `טווח (10–90%): ${(s.min * 100).toFixed(1)}%–${(s.max * 100).toFixed(1)}%`
        )
    })

  }, [ballots, candidates, windowSize])

  if (ballots.length < minWindow * 2) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        נדרשות לפחות {minWindow * 2} הצבעות להצגת הבוקסיפלוט
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <label className="text-sm text-slate-600 font-medium">
          גודל חלון: <span className="text-blue-700 font-semibold">{windowSize} הצבעות</span>
          <span className="text-slate-400 font-normal mr-2">({numWindows} מדידות)</span>
        </label>
        <input
          type="range"
          min={minWindow}
          max={maxWindow}
          step={10}
          value={windowSize}
          onChange={e => setWindowSize(Number(e.target.value))}
          className="w-48 accent-blue-600"
          dir="ltr"
        />
      </div>
      <div className="flex gap-4 text-xs text-slate-500 mb-3 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-3 bg-dbeafe border border-blue-500 rounded-sm" style={{ background: '#dbeafe', border: '1.5px solid #3b82f6' }} />
          IQR (25–75%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-0.5 bg-blue-700" />
          חציון
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-orange-400" />
          ממוצע
        </span>
        <span className="flex items-center gap-1.5 text-slate-400">
          קווים מקווקווים = אחוזון 10–90
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg ref={svgRef} />
      </div>
      <p className="text-xs text-slate-400 mt-2">
        מועמדים ממוינים לפי חציון. החציון ורבעוני ה-IQR הם אומדנים עמידים לתמיכה אמיתית — פחות רגישים לגלי הצבעה אקטיביסטיים חולפים.
      </p>
    </div>
  )
}
