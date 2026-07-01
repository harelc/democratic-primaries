import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface VoteRateChartProps {
  timestamps: string[]
  bucketMinutes?: number
}

export default function VoteRateChart({ timestamps, bucketMinutes = 10 }: VoteRateChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || timestamps.length === 0) return

    const times = timestamps.map(t => new Date(t)).filter(d => !isNaN(d.getTime()))
    if (times.length === 0) return

    const bucketMs = bucketMinutes * 60 * 1000
    const minTime = times[0].getTime()
    const maxTime = times[times.length - 1].getTime()

    // Build buckets
    const numBuckets = Math.ceil((maxTime - minTime) / bucketMs) + 1
    const buckets = new Array(numBuckets).fill(0)
    times.forEach(t => {
      const idx = Math.floor((t.getTime() - minTime) / bucketMs)
      if (idx >= 0 && idx < numBuckets) buckets[idx]++
    })

    const data = buckets.map((count, i) => ({
      t: new Date(minTime + i * bucketMs),
      rate: count, // votes per bucket
    }))

    const width = svgRef.current.clientWidth || 600
    const height = svgRef.current.clientHeight || 160
    const margin = { top: 12, right: 12, bottom: 36, left: 36 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    d3.select(svgRef.current).selectAll('*').remove()
    const svg = d3.select(svgRef.current)
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleTime()
      .domain([new Date(minTime), new Date(maxTime + bucketMs)])
      .range([0, innerW])

    const maxRate = d3.max(data, d => d.rate) ?? 1
    const y = d3.scaleLinear().domain([0, maxRate]).nice().range([innerH, 0])

    // Mean line for spike threshold visual reference
    const mean = d3.mean(data, d => d.rate) ?? 0
    const std = Math.sqrt(d3.mean(data, d => (d.rate - mean) ** 2) ?? 0)
    const spikeThreshold = mean + std

    // Grid
    g.append('g').attr('class', 'grid')
      .call(d3.axisLeft(y).tickSize(-innerW).tickFormat(() => ''))
      .selectAll('line').attr('stroke', '#e2e8f0').attr('stroke-dasharray', '2 2')
    g.select('.grid .domain').remove()

    // Bars
    const barW = Math.max(1, innerW / data.length - 1)
    g.selectAll('rect.bar')
      .data(data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.t))
      .attr('y', d => y(d.rate))
      .attr('width', barW)
      .attr('height', d => innerH - y(d.rate))
      .attr('fill', d => d.rate > spikeThreshold ? '#f97316' : '#3b82f6')
      .attr('opacity', d => d.rate > spikeThreshold ? 0.85 : 0.6)

    // Spike threshold line
    g.append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', y(spikeThreshold)).attr('y2', y(spikeThreshold))
      .attr('stroke', '#f97316').attr('stroke-dasharray', '4 3').attr('stroke-width', 1).attr('opacity', 0.6)

    g.append('text')
      .attr('x', innerW - 4).attr('y', y(spikeThreshold) - 3)
      .attr('text-anchor', 'end').attr('font-size', '9px').attr('fill', '#f97316').attr('opacity', 0.8)
      .text('סף קצב גבוה')

    // Axes
    const tickCount = Math.min(8, data.length)
    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(
        d3.axisBottom(x)
          .ticks(tickCount)
          .tickFormat(d => {
            const dt = d as Date
            return `${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`
          })
      )
      .selectAll('text')
      .attr('font-size', '9px')
      .attr('transform', 'rotate(-35)')
      .attr('text-anchor', 'end')
      .attr('dx', '-4').attr('dy', '2')

    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => `${d}`))
      .selectAll('text').attr('font-size', '9px')

    // Y axis label
    g.append('text')
      .attr('transform', 'rotate(-90)').attr('x', -innerH / 2).attr('y', -28)
      .attr('text-anchor', 'middle').attr('font-size', '9px').attr('fill', '#94a3b8')
      .text(`הצבעות / ${bucketMinutes} דק׳`)

  }, [timestamps, bucketMinutes])

  if (timestamps.length === 0) return null

  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-slate-500 mb-1">קצב הצבעות לאורך זמן</p>
      <svg ref={svgRef} className="w-full" style={{ height: '180px' }} />
    </div>
  )
}
