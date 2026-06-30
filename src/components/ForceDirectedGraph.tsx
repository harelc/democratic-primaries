import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Candidate, Analytics } from '../types'
import { SNAResult, getCommunityColor } from '../utils/sna'

interface ForceDirectedGraphProps {
  candidates: Candidate[]
  selectedIds: Set<string>
  onSelect: (id: string) => void
  analytics: Analytics | null
  snaData?: SNAResult
}

export default function ForceDirectedGraph({
  candidates,
  selectedIds,
  onSelect,
  analytics,
  snaData,
}: ForceDirectedGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    if (!svgRef.current || !analytics) return

    // Get actual dimensions
    const rect = svgRef.current.getBoundingClientRect()
    const width = rect.width || 800
    const height = rect.height || 600

    console.log('SVG dimensions:', { width, height, rect })

    // Clear
    d3.select(svgRef.current).selectAll('*').remove()

    // Create SVG with proper structure
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .style('background', '#f8f9fa')

    // Create main group for content
    const mainGroup = svg.append('g')

    // Create nodes array
    const nodes: any[] = candidates.map((c, i) => ({
      id: c.id,
      candidate: c,
      fx: undefined,
      fy: undefined,
      size: Math.max(8, Math.sqrt(analytics.candidatePickFrequency[c.id] || 0.02) * 60),
    }))

    // Create edges using candidate IDs (not array indices)
    const edges: any[] = []
    const coOccValues = Object.values(analytics.coOccurrenceMatrix).filter(v => typeof v === 'number') as number[]
    // Use a low threshold so edges show even with few submissions; fall back to 0 if no data
    const threshold = coOccValues.length > 0 ? (d3.quantile(coOccValues.sort(d3.ascending), 0.1) ?? 0) : 0

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const key = `${candidates[i].id}_${candidates[j].id}`
        const key2 = `${candidates[j].id}_${candidates[i].id}`
        const coOcc = analytics.coOccurrenceMatrix[key] || analytics.coOccurrenceMatrix[key2] || 0

        if (coOcc >= threshold && coOcc > 0) {
          edges.push({
            source: candidates[i].id,
            target: candidates[j].id,
            value: coOcc,
          })
        }
      }
    }

    console.log(`Graph: ${nodes.length} nodes, ${edges.length} edges, threshold: ${threshold}`)
    console.log('Sample co-occurrence values:', coOccValues.slice(0, 10))
    console.log('Max co-occurrence:', Math.max(...coOccValues))
    console.log('Min co-occurrence:', Math.min(...coOccValues))

    // Simulation with more spread-out forces
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges)
        .id((d: any) => d.id)
        .distance((d: any) => 80 + (1 - d.value) * 120)
        .strength((d: any) => d.value * 0.6))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', d3.forceCollide().radius((d: any) => d.size + 8))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05))

    // Draw edges FIRST (behind nodes)
    const links = mainGroup.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', '#64748b')
      .attr('stroke-width', (d: any) => {
        const minVal = Math.min(...edges.map((e: any) => e.value))
        const maxVal = Math.max(...edges.map((e: any) => e.value))
        const range = maxVal - minVal || 1
        const normalized = (d.value - minVal) / range  // 0–1 relative to actual range
        return 1 + normalized * 5  // 1px to 6px
      })
      .attr('opacity', 0.6)
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', 0)

    console.log('Links appended:', edges.length)

    // Draw nodes
    const nodeGroups = mainGroup.selectAll('g.node')
      .data(nodes, (d: any) => d.id)
      .join('g')
      .attr('class', 'node')

    // Color helpers
    const getGroupColor = (group: string | null | undefined): string => {
      if (!group) return '#3b82f6'
      if (group.includes('מרצ')) return '#dc2626'
      if (group.includes('כפרי')) return '#16a34a'
      if (group.includes('מיעוטים')) return '#9333ea'
      return '#3b82f6'
    }

    const getGroupColorDark = (group: string | null | undefined): string => {
      if (!group) return '#1d4ed8'
      if (group.includes('מרצ')) return '#991b1b'
      if (group.includes('כפרי')) return '#15803d'
      if (group.includes('מיעוטים')) return '#7e22ce'
      return '#1d4ed8'
    }

    const getNodeColor = (d: any): string => {
      if (snaData) {
        return getCommunityColor(snaData.communities[d.id] ?? 0)
      }
      return selectedIds.has(d.id)
        ? getGroupColorDark(d.candidate.group)
        : getGroupColor(d.candidate.group)
    }

    // Node circles
    nodeGroups.append('circle')
      .attr('r', (d: any) => d.size)
      .attr('fill', (d: any) => getNodeColor(d))
      .attr('stroke', (d: any) => selectedIds.has(d.id)
        ? getGroupColorDark(d.candidate.group)
        : getGroupColor(d.candidate.group))
      .attr('stroke-width', (d: any) => selectedIds.has(d.id) ? 4 : 3)
      .attr('opacity', 1)
      .style('cursor', 'default')
      .on('mouseenter', (event: any, d: any) => {
        setHoveredId(d.id)
      })
      .on('mouseleave', () => {
        setHoveredId(null)
      })

    // Node images
    nodeGroups.append('image')
      .attr('xlink:href', (d: any) => d.candidate.photoUrl)
      .attr('x', (d: any) => -d.size)
      .attr('y', (d: any) => -d.size)
      .attr('width', (d: any) => d.size * 2)
      .attr('height', (d: any) => d.size * 2)
      .style('pointer-events', 'none')
      .style('clip-path', (d: any) => `circle(${d.size}px)`)

    // Vote % label below node
    nodeGroups.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d: any) => d.size + 10)
      .attr('font-size', '11px')
      .attr('fill', '#475569')
      .attr('pointer-events', 'none')
      .text((d: any) => {
        const freq = analytics.candidatePickFrequency[d.id]
        if (!freq) return ''
        const pct = Math.round(freq * 100)
        return pct > 0 ? `${pct}%` : ''
      })

    // Checkmark for selected (only shown when selected)
    nodeGroups.filter((d: any) => selectedIds.has(d.id))
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .attr('font-size', (d: any) => d.size * 1.5)
      .attr('font-weight', 'bold')
      .attr('fill', 'white')
      .attr('pointer-events', 'none')
      .style('text-shadow', '0 0 2px #2563eb')
      .text('✓')

    // Name label (shown on hover)
    nodeGroups.append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('dy', (d: any) => d.size + 22)
      .attr('font-size', '11px')
      .attr('fill', '#1e293b')
      .attr('pointer-events', 'none')
      .attr('opacity', 0)
      .text((d: any) => d.candidate.name)

    // Tooltip with vote count
    nodeGroups.append('title')
      .text((d: any) => {
        const freq = analytics.candidatePickFrequency[d.id] || 0
        const pct = Math.round(freq * 100)
        return `${d.candidate.name}\nנבחר ב-${pct}% מהרשימות`
      })

    // Drag (mouse + touch)
    nodeGroups.call(
      d3.drag<any, any>()
        .touchable(true)
        .on('start', (event: any, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event: any, d: any) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event: any, d: any) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
    )

    // Create node index for faster lookup
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    // Animation
    let tickCount = 0
    simulation.on('tick', () => {
      tickCount++

      // D3 forceLink replaces source/target IDs with node objects
      links
        .attr('x1', (d: any) => (typeof d.source === 'object' ? d.source.x : nodeMap.get(d.source)?.x) ?? 0)
        .attr('y1', (d: any) => (typeof d.source === 'object' ? d.source.y : nodeMap.get(d.source)?.y) ?? 0)
        .attr('x2', (d: any) => (typeof d.target === 'object' ? d.target.x : nodeMap.get(d.target)?.x) ?? 0)
        .attr('y2', (d: any) => (typeof d.target === 'object' ? d.target.y : nodeMap.get(d.target)?.y) ?? 0)

      nodeGroups.attr('transform', (d: any) => `translate(${d.x},${d.y})`)

      if (tickCount === 1) {
        console.log('First tick - checking edges:', {
          sampleEdge: edges[0],
          sourceType: typeof edges[0]?.source,
          sourceHasX: edges[0]?.source?.x !== undefined,
          targetType: typeof edges[0]?.target,
          targetHasX: edges[0]?.target?.x !== undefined,
        })
      }
    })

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .on('zoom', (event: any) => {
        mainGroup.attr('transform', event.transform)
      })

    svg.call(zoom)

  }, [candidates, selectedIds, analytics, onSelect, snaData])

  // Update opacity on hover without reinitializing
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll('circle')
      .attr('opacity', (d: any) => hoveredId === null || hoveredId === d.id ? 1 : 0.4)
    d3.select(svgRef.current).selectAll('.node-label')
      .attr('opacity', (d: any) => hoveredId !== null && hoveredId === d.id ? 1 : 0)
  }, [hoveredId])

  if (!analytics) {
    return <div className="w-full h-full flex items-center justify-center text-slate-600">Loading graph...</div>
  }

  return (
    <svg
      ref={svgRef}
      className="w-full h-full"
      style={{ cursor: 'grab', background: '#f8f9fa' }}
    />
  )
}
