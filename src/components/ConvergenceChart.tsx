import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { Candidate } from '../types'
import { SNAResult, getCommunityColor } from '../utils/sna'

interface ConvergenceChartProps {
  ballots: string[][]
  timestamps?: string[]
  candidates: Candidate[]
  minBallots?: number
  topN?: number
  colorMode?: 'group' | 'community'
  snaData?: SNAResult | null
}

const getGroupColor = (group: string | null | undefined) => {
  if (!group) return '#3b82f6'
  if (group.includes('מרצ')) return '#dc2626'
  if (group.includes('כפרי')) return '#16a34a'
  if (group.includes('מיעוטים')) return '#9333ea'
  return '#3b82f6'
}

export default function ConvergenceChart({
  ballots,
  timestamps,
  candidates,
  minBallots = 75,
  topN = 20,
  colorMode = 'group',
  snaData,
}: ConvergenceChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Compute voting-rate spikes and candidate anomalies from timestamps
  const { spikeBallots, anomalies } = (() => {
    if (!timestamps || timestamps.length !== ballots.length) return { spikeBallots: new Set<number>(), anomalies: new Map<string, Map<number, 'up' | 'down'>>() }

    // Parse timestamps; compute votes-per-minute in a sliding 30-min window
    const times = timestamps.map(t => new Date(t).getTime()).filter(t => !isNaN(t))
    if (times.length < 10) return { spikeBallots: new Set<number>(), anomalies: new Map() }

    const WINDOW_MS = 30 * 60 * 1000 // 30 min window
    const WINDOW_MIN = WINDOW_MS / 60000 // fixed 30-min denominator
    const rates: number[] = times.map((t, i) => {
      let lo = i, hi = i
      while (lo > 0 && t - times[lo - 1] < WINDOW_MS) lo--
      while (hi < times.length - 1 && times[hi + 1] - t < WINDOW_MS) hi++
      return (hi - lo + 1) / WINDOW_MIN
    })

    const mean = rates.reduce((s, r) => s + r, 0) / rates.length
    const std = Math.sqrt(rates.reduce((s, r) => s + (r - mean) ** 2, 0) / rates.length)
    const threshold = mean + 1.0 * std
    const spikeBallots = new Set<number>(rates.map((r, i) => r > threshold ? i : -1).filter(i => i >= 0))

    // Find anomalous candidate movements: during spike windows, which candidates changed proportion unusually?
    // Group spikes into contiguous bursts
    const bursts: Array<[number, number]> = []
    let burstStart = -1
    for (let i = 0; i < ballots.length; i++) {
      if (spikeBallots.has(i)) {
        if (burstStart === -1) burstStart = i
      } else if (burstStart !== -1) {
        bursts.push([burstStart, i - 1])
        burstStart = -1
      }
    }
    if (burstStart !== -1) bursts.push([burstStart, ballots.length - 1])

    // Running proportions at each ballot index
    const running: Record<string, number> = {}
    candidates.forEach(c => { running[c.id] = 0 })
    const props: Record<string, number[]> = {}
    candidates.forEach(c => { props[c.id] = [] })
    ballots.forEach((ballot, i) => {
      ballot.forEach(id => { if (running[id] !== undefined) running[id]++ })
      const n = i + 1
      candidates.forEach(c => { props[c.id].push(running[c.id] / n) })
    })

    const anomalies = new Map<string, Map<number, 'up' | 'down'>>()
    for (const [start, end] of bursts) {
      if (end - start < 5) continue // ignore tiny bursts
      const deltas = candidates.map(c => ({
        id: c.id,
        delta: (props[c.id][end] ?? 0) - (props[c.id][start] ?? 0),
      }))
      const ds = deltas.map(d => Math.abs(d.delta))
      const dmean = ds.reduce((s, v) => s + v, 0) / ds.length
      const dstd = Math.sqrt(ds.reduce((s, v) => s + (v - dmean) ** 2, 0) / ds.length)
      const midpoint = Math.round((start + end) / 2)
      for (const { id, delta } of deltas) {
        if (Math.abs(delta) > dmean + 1.5 * dstd && Math.abs(delta) > 0.02) {
          if (!anomalies.has(id)) anomalies.set(id, new Map())
          anomalies.get(id)!.set(midpoint, delta > 0 ? 'up' : 'down')
        }
      }
    }

    return { spikeBallots, anomalies }
  })()

  useEffect(() => {
    if (!svgRef.current || ballots.length < minBallots) return

    const getColor = (candidate: Candidate) => {
      if (colorMode === 'community' && snaData) {
        return getCommunityColor(snaData.communityDisplayIndex[candidate.id] ?? -1)
      }
      return getGroupColor(candidate.group)
    }

    const width = svgRef.current.clientWidth || 800
    const height = svgRef.current.clientHeight || 400
    const isMobile = width < 500
    const margin = {
      top: 20,
      right: isMobile ? 110 : 220,
      bottom: isMobile ? 30 : 40,
      left: isMobile ? 36 : 50,
    }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    const effectiveTopN = isMobile ? Math.min(topN, 10) : topN

    d3.select(svgRef.current).selectAll('*').remove()
    const svg = d3.select(svgRef.current)
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Add clip path so lines don't overflow axes
    svg.append('defs').append('clipPath').attr('id', 'convergence-clip')
      .append('rect').attr('width', innerW).attr('height', innerH)

    const chartArea = g.append('g').attr('clip-path', 'url(#convergence-clip)')

    // Build cumulative proportions for each candidate at each ballot step
    const counts: Record<string, number[]> = {}
    candidates.forEach(c => { counts[c.id] = [] })

    const running: Record<string, number> = {}
    candidates.forEach(c => { running[c.id] = 0 })

    ballots.forEach((ballot, i) => {
      ballot.forEach(id => { if (running[id] !== undefined) running[id]++ })
      const n = i + 1
      candidates.forEach(c => { counts[c.id].push(running[c.id] / n) })
    })

    // Pick top N by final proportion
    const finalProps = candidates.map(c => ({ c, final: counts[c.id][ballots.length - 1] ?? 0 }))
    finalProps.sort((a, b) => b.final - a.final)
    const topCandidates = finalProps.slice(0, effectiveTopN).map(x => x.c)

    // Scales
    const x = d3.scaleLinear().domain([1, ballots.length]).range([0, innerW])
    const y = d3.scaleLinear().domain([0, d3.max(topCandidates, c => d3.max(counts[c.id]) ?? 0) ?? 1]).nice().range([innerH, 0])

    // Grid lines (static, on top of clip)
    g.append('g').attr('class', 'grid')
      .call(d3.axisLeft(y).tickSize(-innerW).tickFormat(() => ''))
      .selectAll('line').attr('stroke', '#e2e8f0').attr('stroke-dasharray', '2 2')
    g.select('.grid .domain').remove()

    // Y axis
    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(y).ticks(6).tickFormat(d => `${Math.round(+d * 100)}%`))

    // X axis — will be updated on zoom
    const xAxisG = g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(d => `${d}`))

    // Axis labels
    g.append('text').attr('x', innerW / 2).attr('y', innerH + (isMobile ? 24 : 35)).attr('text-anchor', 'middle')
      .attr('font-size', isMobile ? '9px' : '11px').attr('fill', '#64748b').text('מספר הצבעה')
    if (!isMobile) {
      g.append('text').attr('transform', 'rotate(-90)').attr('x', -innerH / 2).attr('y', -40)
        .attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', '#64748b').text('שיעור הצבעות')
    }

    // N=75 stable line (inside chart area, zooms with x)
    const stableLine = chartArea.append('line')
      .attr('x1', x(minBallots)).attr('x2', x(minBallots))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#94a3b8').attr('stroke-dasharray', '6 3').attr('stroke-width', 1.5)
    g.append('text')
      .attr('x', x(minBallots) + 4).attr('y', 14)
      .attr('font-size', '11px').attr('fill', '#94a3b8').text(`n=${minBallots}`)

    // Lines (inside clip area)
    const makeLine = (xScale: d3.ScaleLinear<number, number>) =>
      d3.line<number>().x((_, i) => xScale(i + 1)).y(d => y(d)).curve(d3.curveCatmullRom.alpha(0.5))

    const paths: Array<{ path: d3.Selection<SVGPathElement, number[], SVGGElement, unknown>; data: number[] }> = []
    const endLabelEls: Array<{ el: d3.Selection<SVGTextElement, unknown, null, undefined>; data: number[] }> = []

    // Spread overlapping labels apart — min 14px gap
    const spreadLabels = (items: Array<{ el: d3.Selection<SVGTextElement, unknown, null, undefined>; y: number }>) => {
      const minGap = 14
      const sorted = [...items].sort((a, b) => a.y - b.y)
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].y < sorted[i - 1].y + minGap) sorted[i].y = sorted[i - 1].y + minGap
      }
      for (let i = sorted.length - 2; i >= 0; i--) {
        if (sorted[i].y > sorted[i + 1].y - minGap) sorted[i].y = sorted[i + 1].y - minGap
      }
      sorted.forEach(({ el, y: ly }) => el.attr('y', ly + 4))
    }

    // Wider invisible hit area per line for hover detection
    topCandidates.forEach((candidate, ci) => {
      const color = getColor(candidate)
      const data = counts[candidate.id]

      // Visible line
      const path = chartArea.append<SVGPathElement>('path')
        .datum(data)
        .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('opacity', 0.7)
        .attr('class', `line-${ci}`)
        .attr('d', makeLine(x))
      paths.push({ path, data })

      const labelName = isMobile
        ? (candidate.name.split(' ')[0] ?? candidate.name)
        : candidate.name
      const el = g.append<SVGTextElement>('text')
        .attr('x', innerW + 6).attr('y', y(data[data.length - 1] ?? 0) + 4)
        .attr('font-size', isMobile ? '10px' : '12px').attr('fill', color).attr('font-weight', '600').attr('opacity', 0.7)
        .attr('class', `label-${ci}`)
        .style('cursor', 'pointer')
        .text(`${labelName} ${Math.round((data[data.length - 1] ?? 0) * 100)}%`)
      endLabelEls.push({ el, data })

      const highlight = () => {
        chartArea.selectAll('path[class^="line-"]').attr('opacity', 0.1).attr('stroke-width', 1.5)
        g.selectAll('text[class^="label-"]').attr('opacity', 0.15)
        chartArea.selectAll('rect.spike-band').attr('opacity', 0.03)
        g.selectAll('path.spike-tri').attr('opacity', 0.15)
        chartArea.selectAll('path[class^="anomaly-"]').attr('opacity', 0.05)
        path.attr('opacity', 1).attr('stroke-width', 3)
        el.attr('opacity', 1)
        chartArea.selectAll(`path.anomaly-band-${ci}`).attr('opacity', 1)
        chartArea.selectAll(`path.anomaly-glow-${ci}`).attr('opacity', 0.18)
      }
      const unhighlight = () => {
        chartArea.selectAll('path[class^="line-"]').attr('opacity', 0.7).attr('stroke-width', 2)
        g.selectAll('text[class^="label-"]').attr('opacity', 0.7)
        chartArea.selectAll('rect.spike-band').attr('opacity', 0.07)
        g.selectAll('path.spike-tri').attr('opacity', 0.8)
        chartArea.selectAll('path[class^="anomaly-band-"]').attr('opacity', 1)
        chartArea.selectAll('path[class^="anomaly-glow-"]').attr('opacity', 0.18)
      }

      el.on('mouseenter', highlight).on('mouseleave', unhighlight)

      // Invisible wide hit area
      chartArea.append<SVGPathElement>('path')
        .datum(data)
        .attr('fill', 'none').attr('stroke', 'transparent').attr('stroke-width', 16)
        .attr('d', makeLine(x))
        .style('cursor', 'pointer')
        .on('mouseenter', highlight)
        .on('mouseleave', unhighlight)
    })

    // --- Rate spike markers (drawn before zoom so refs exist) ---
    type BandRef = { el: d3.Selection<SVGRectElement, unknown, null, undefined>; runStart: number; runEnd: number }
    type TriRef  = { el: d3.Selection<SVGPathElement, unknown, null, undefined>; mid: number }
    type AnomalyBandRef = { glow: d3.Selection<SVGPathElement, unknown, null, undefined>; el: d3.Selection<SVGPathElement, unknown, null, undefined>; slice: number[]; burstStart: number; ci: number }

    const spikeBandRefs: BandRef[] = []
    const spikeTriRefs: TriRef[] = []
    const anomalyBandRefs: AnomalyBandRef[] = []

    if (spikeBallots.size > 0) {
      const spikeSorted = [...spikeBallots].sort((a, b) => a - b)
      const runs: Array<[number, number]> = []
      let rs = spikeSorted[0], re = spikeSorted[0]
      for (let k = 1; k < spikeSorted.length; k++) {
        if (spikeSorted[k] <= re + 3) { re = spikeSorted[k] }
        else { runs.push([rs, re]); rs = re = spikeSorted[k] }
      }
      runs.push([rs, re])

      const spikesG = g.append('g').attr('class', 'spikes')
      runs.forEach(([runStart, runEnd]) => {
        const mid = (runStart + runEnd) / 2
        const px = x(mid + 1)
        const runW = Math.max(4, x(runEnd + 1) - x(runStart + 1))

        const band = chartArea.append<SVGRectElement>('rect')
          .attr('class', 'spike-band')
          .attr('x', x(runStart + 1)).attr('y', 0)
          .attr('width', runW).attr('height', innerH)
          .attr('fill', '#f97316').attr('opacity', 0.07)
        spikeBandRefs.push({ el: band, runStart, runEnd })

        const tri = spikesG.append<SVGPathElement>('path')
          .attr('class', 'spike-tri')
          .attr('d', `M${px - 5},${innerH + 6} L${px + 5},${innerH + 6} L${px},${innerH + 1} Z`)
          .attr('fill', '#f97316').attr('opacity', 0.8)
        spikeTriRefs.push({ el: tri, mid })
      })
    }

    // For each anomalous (candidate, burst), draw a thicker highlighted segment over the burst range
    if (anomalies.size > 0) {
      // Collect burst ranges from spikeBandRefs (already computed above)
      const burstRanges = spikeBandRefs.map(b => [b.runStart, b.runEnd] as [number, number])

      topCandidates.forEach((candidate, ci) => {
        const cAnomalies = anomalies.get(candidate.id)
        if (!cAnomalies) return
        const color = getColor(candidate)
        const propData = counts[candidate.id]

        for (const [burstStart, burstEnd] of burstRanges) {
          const mid = Math.round((burstStart + burstEnd) / 2)
          if (!cAnomalies.has(mid)) continue

          const slice = propData.slice(burstStart, burstEnd + 1)
          const makeSegment = (xScale: d3.ScaleLinear<number, number>) =>
            d3.line<number>()
              .x((_, i) => xScale(burstStart + i + 1))
              .y(v => y(v))
              .curve(d3.curveCatmullRom.alpha(0.5))(slice) ?? ''

          const glow = chartArea.append<SVGPathElement>('path')
            .attr('class', `anomaly-glow-${ci}`)
            .attr('fill', 'none')
            .attr('stroke', color).attr('stroke-width', 10).attr('opacity', 0.18)
            .attr('stroke-linecap', 'round')
            .style('pointer-events', 'none')
            .attr('d', makeSegment(x))

          const el = chartArea.append<SVGPathElement>('path')
            .attr('class', `anomaly-band-${ci}`)
            .attr('fill', 'none')
            .attr('stroke', color).attr('stroke-width', 3.5).attr('opacity', 1)
            .attr('stroke-linecap', 'round')
            .style('pointer-events', 'none')
            .attr('d', makeSegment(x))

          anomalyBandRefs.push({ glow, el, slice, burstStart, ci })
        }
      })
    }

    // Zoom & pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 20])
      .on('zoom', (event) => {
        const newX = event.transform.rescaleX(x)
        const newY = event.transform.rescaleY(y)
        xAxisG.call(d3.axisBottom(newX).ticks(8).tickFormat(d => `${d}`))
        g.select<SVGGElement>('.y-axis').call(d3.axisLeft(newY).ticks(6).tickFormat(d => `${Math.round(+d * 100)}%`))
        stableLine.attr('x1', newX(minBallots)).attr('x2', newX(minBallots))
        paths.forEach(({ path, data }) => {
          path.attr('d',
            d3.line<number>().x((_, i) => newX(i + 1)).y(v => newY(v)).curve(d3.curveCatmullRom.alpha(0.5))(data) ?? ''
          )
        })
        spreadLabels(endLabelEls.map(({ el, data }) => ({
          el, y: newY(data[data.length - 1] ?? 0)
        })))
        // Update spike bands
        spikeBandRefs.forEach(({ el, runStart, runEnd }) => {
          el.attr('x', newX(runStart + 1))
            .attr('width', Math.max(2, newX(runEnd + 1) - newX(runStart + 1)))
        })
        // Update spike triangles
        spikeTriRefs.forEach(({ el, mid }) => {
          const px = newX(mid + 1)
          el.attr('d', `M${px - 5},${innerH + 6} L${px + 5},${innerH + 6} L${px},${innerH + 1} Z`)
        })
        // Update anomaly bands
        anomalyBandRefs.forEach(({ glow, el, slice, burstStart }) => {
          const seg = d3.line<number>()
            .x((_, i) => newX(burstStart + i + 1))
            .y(v => newY(v))
            .curve(d3.curveCatmullRom.alpha(0.5))(slice) ?? ''
          glow.attr('d', seg)
          el.attr('d', seg)
        })
      })

    svg.call(zoom).style('cursor', 'grab')

    // Initial label spread
    spreadLabels(endLabelEls.map(({ el, data }) => ({ el, y: y(data[data.length - 1] ?? 0) })))

  }, [ballots, timestamps, candidates, minBallots, topN, colorMode, snaData, spikeBallots, anomalies])

  if (ballots.length < minBallots) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        נדרשות לפחות {minBallots} הצבעות כדי להציג מגמה (יש {ballots.length})
      </div>
    )
  }

  const hasSpikes = spikeBallots.size > 0
  const hasAnomalies = anomalies.size > 0

  return (
    <div>
      {(hasSpikes || hasAnomalies) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-2 px-1" dir="rtl">
          {hasSpikes && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm opacity-60" style={{ background: '#f97316' }} />
              פרק זמן עם קצב הצבעה גבוה במיוחד
            </span>
          )}
          {hasAnomalies && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-6 h-1.5 rounded-full opacity-90" style={{ background: '#64748b' }} />
              שינוי חריג בפופולריות באותה תקופה
            </span>
          )}
        </div>
      )}
      <svg ref={svgRef} className="w-full" style={{ height: 'clamp(300px, 85vw, 620px)' }} />
    </div>
  )
}
