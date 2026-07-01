import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { Candidate } from '../types'
import { SNAResult, getCommunityColor } from '../utils/sna'

interface ConvergenceChartProps {
  ballots: string[][]
  candidates: Candidate[]
  minBallots?: number
  topN?: number
  colorMode?: 'group' | 'community'
  snaData?: SNAResult | null
  windowSize?: number // if set, use rolling window instead of cumulative
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
  candidates,
  minBallots = 75,
  topN = 20,
  colorMode = 'group',
  snaData,
  windowSize,
}: ConvergenceChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

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

    svg.append('defs').append('clipPath').attr('id', 'convergence-clip')
      .append('rect').attr('width', innerW).attr('height', innerH)

    const chartArea = g.append('g').attr('clip-path', 'url(#convergence-clip)')

    const counts: Record<string, number[]> = {}
    candidates.forEach(c => { counts[c.id] = [] })

    // xStart: first ballot index whose data is plotted (0-based)
    const xStart = windowSize ? windowSize - 1 : 0

    if (windowSize) {
      // Rolling window: proportion of last W ballots that contain candidate
      // Only emit values once the window is full (i >= W-1)
      const W = windowSize
      const presence: Record<string, number[]> = {}
      candidates.forEach(c => { presence[c.id] = [] })
      ballots.forEach(ballot => {
        const picked = new Set(ballot)
        candidates.forEach(c => { presence[c.id].push(picked.has(c.id) ? 1 : 0) })
      })
      candidates.forEach(c => {
        const p = presence[c.id]
        let windowSum = 0
        for (let i = 0; i < p.length; i++) {
          windowSum += p[i]
          if (i >= W) windowSum -= p[i - W]
          if (i >= W - 1) counts[c.id].push(windowSum / W)
        }
      })
    } else {
      // Cumulative proportion since ballot 0
      const running: Record<string, number> = {}
      candidates.forEach(c => { running[c.id] = 0 })
      ballots.forEach((ballot, i) => {
        ballot.forEach(id => { if (running[id] !== undefined) running[id]++ })
        const n = i + 1
        candidates.forEach(c => { counts[c.id].push(running[c.id] / n) })
      })
    }

    const finalProps = candidates.map(c => ({ c, final: counts[c.id].at(-1) ?? 0 }))
    finalProps.sort((a, b) => b.final - a.final)
    const topCandidates = finalProps.slice(0, effectiveTopN).map(x => x.c)

    const x = d3.scaleLinear().domain([xStart + 1, ballots.length]).range([0, innerW])
    const y = d3.scaleLinear().domain([0, d3.max(topCandidates, c => d3.max(counts[c.id]) ?? 0) ?? 1]).nice().range([innerH, 0])

    g.append('g').attr('class', 'grid')
      .call(d3.axisLeft(y).tickSize(-innerW).tickFormat(() => ''))
      .selectAll('line').attr('stroke', '#e2e8f0').attr('stroke-dasharray', '2 2')
    g.select('.grid .domain').remove()

    g.append('g').attr('class', 'y-axis').call(d3.axisLeft(y).ticks(6).tickFormat(d => `${Math.round(+d * 100)}%`))

    const xAxisG = g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(d => `${d}`))

    g.append('text').attr('x', innerW / 2).attr('y', innerH + (isMobile ? 24 : 35)).attr('text-anchor', 'middle')
      .attr('font-size', isMobile ? '9px' : '11px').attr('fill', '#64748b').text('מספר הצבעה')
    if (!isMobile) {
      g.append('text').attr('transform', 'rotate(-90)').attr('x', -innerH / 2).attr('y', -40)
        .attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', '#64748b').text('שיעור הצבעות')
    }

    const stableLine = chartArea.append('line')
      .attr('x1', x(minBallots)).attr('x2', x(minBallots))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#94a3b8').attr('stroke-dasharray', '6 3').attr('stroke-width', 1.5)
      .attr('display', windowSize ? 'none' : null)
    if (!windowSize) {
      g.append('text')
        .attr('x', x(minBallots) + 4).attr('y', 14)
        .attr('font-size', '11px').attr('fill', '#94a3b8').text(`n=${minBallots}`)
    }

    const makeLine = (xScale: d3.ScaleLinear<number, number>) =>
      d3.line<number>().x((_, i) => xScale(xStart + i + 1)).y(d => y(d)).curve(d3.curveCatmullRom.alpha(0.5))

    const paths: Array<{ path: d3.Selection<SVGPathElement, number[], SVGGElement, unknown>; data: number[] }> = []
    const endLabelEls: Array<{ el: d3.Selection<SVGTextElement, unknown, null, undefined>; data: number[] }> = []

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

    topCandidates.forEach((candidate, ci) => {
      const color = getColor(candidate)
      const data = counts[candidate.id]

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
        path.attr('opacity', 1).attr('stroke-width', 3)
        el.attr('opacity', 1)
      }
      const unhighlight = () => {
        chartArea.selectAll('path[class^="line-"]').attr('opacity', 0.7).attr('stroke-width', 2)
        g.selectAll('text[class^="label-"]').attr('opacity', 0.7)
      }

      el.on('mouseenter', highlight).on('mouseleave', unhighlight)

      chartArea.append<SVGPathElement>('path')
        .datum(data)
        .attr('fill', 'none').attr('stroke', 'transparent').attr('stroke-width', 16)
        .attr('d', makeLine(x))
        .style('cursor', 'pointer')
        .on('mouseenter', highlight)
        .on('mouseleave', unhighlight)
    })

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
            d3.line<number>().x((_, i) => newX(xStart + i + 1)).y(v => newY(v)).curve(d3.curveCatmullRom.alpha(0.5))(data) ?? ''
          )
        })
        spreadLabels(endLabelEls.map(({ el, data }) => ({
          el, y: newY(data[data.length - 1] ?? 0)
        })))
      })

    svg.call(zoom).style('cursor', 'grab')

    spreadLabels(endLabelEls.map(({ el, data }) => ({ el, y: y(data[data.length - 1] ?? 0) })))

  }, [ballots, candidates, minBallots, topN, colorMode, snaData, windowSize])

  if (ballots.length < minBallots) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        נדרשות לפחות {minBallots} הצבעות כדי להציג מגמה (יש {ballots.length})
      </div>
    )
  }

  return (
    <svg ref={svgRef} className="w-full" style={{ height: 'clamp(300px, 85vw, 620px)' }} />
  )
}
