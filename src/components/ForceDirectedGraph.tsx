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
  colorMode?: 'group' | 'community'
  layout?: 'force' | 'spectral'
  spectralPositions?: Record<string, { x: number; y: number }>
}

export default function ForceDirectedGraph({
  candidates,
  selectedIds,
  onSelect,
  analytics,
  snaData,
  colorMode = 'group',
  layout = 'force',
  spectralPositions,
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

    // Place community centroids evenly around a circle, then scatter nodes near their centroid
    const numCommunities = snaData
      ? new Set(Object.values(snaData.communityDisplayIndex).filter(i => i >= 0)).size || 1
      : 1
    const communityAngle = (displayIdx: number) =>
      (Math.max(0, displayIdx) / numCommunities) * 2 * Math.PI
    const radius = Math.min(width, height) * 0.3

    // Compute spectral scale if using spectral layout
    let spectralScaleX: ((v: number) => number) | null = null
    let spectralScaleY: ((v: number) => number) | null = null
    if (layout === 'spectral' && spectralPositions) {
      const xVals = candidates.map(c => spectralPositions[c.id]?.x ?? 0)
      const yVals = candidates.map(c => spectralPositions[c.id]?.y ?? 0)
      const xMin = Math.min(...xVals), xMax = Math.max(...xVals)
      const yMin = Math.min(...yVals), yMax = Math.max(...yVals)
      const padding = 80
      spectralScaleX = (v: number) => xMax === xMin ? width / 2 : padding + (v - xMin) / (xMax - xMin) * (width - 2 * padding)
      spectralScaleY = (v: number) => yMax === yMin ? height / 2 : padding + (v - yMin) / (yMax - yMin) * (height - 2 * padding)
    }

    const nodes: any[] = candidates.map((c) => {
      let x = width / 2, y = height / 2
      if (layout === 'spectral' && spectralPositions && spectralScaleX && spectralScaleY) {
        const pos = spectralPositions[c.id]
        if (pos) {
          x = spectralScaleX(pos.x)
          y = spectralScaleY(pos.y)
        }
      } else if (snaData) {
        const displayIdx = snaData.communityDisplayIndex[c.id] ?? -1
        const angle = communityAngle(displayIdx)
        const jitter = () => (Math.random() - 0.5) * 80
        x = width / 2 + Math.cos(angle) * radius + jitter()
        y = height / 2 + Math.sin(angle) * radius + jitter()
      }
      return {
        id: c.id,
        candidate: c,
        x, y,
        size: Math.max(8, Math.sqrt(analytics.candidatePickFrequency[c.id] || 0.02) * 60),
      }
    })

    // Create edges using candidate IDs (not array indices)
    const edges: any[] = []
    const coOccValues = Object.values(analytics.coOccurrenceMatrix).filter(v => typeof v === 'number') as number[]
    // Use a low threshold so edges show even with few submissions; fall back to 0 if no data
    const threshold = coOccValues.length > 0 ? (d3.quantile(coOccValues.sort(d3.ascending), 0.1) ?? 0) : 0

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i].id, b = candidates[j].id
        const coOcc = analytics.coOccurrenceMatrix[a < b ? `${a}:${b}` : `${b}:${a}`] || 0

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
        .distance((d: any) => 200 * (1 - Math.pow(d.value, 1.5)))  // shrinks fast at high co-occurrence
        .strength((d: any) => Math.pow(d.value, 2) * 2)             // superlinear: 52% → 0.54, 10% → 0.02
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', d3.forceCollide().radius((d: any) => d.size + 8))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05))

    // For spectral layout: resolve overlaps while preserving spectral structure
    if (layout === 'spectral') {
      // Store spectral target positions
      const spectralX = new Map(nodes.map(n => [n.id, n.x]))
      const spectralY = new Map(nodes.map(n => [n.id, n.y]))

      simulation
        .force('link', null)                                       // no link force — preserve spectral layout
        .force('charge', d3.forceManyBody().strength(-30))        // weak repulsion
        .force('collision', d3.forceCollide().radius((d: any) => d.size + 6).strength(1)) // strong collision
        .force('center', null)
        .force('x', d3.forceX((d: any) => spectralX.get(d.id) ?? width / 2).strength(0.4))  // pull back to spectral pos
        .force('y', d3.forceY((d: any) => spectralY.get(d.id) ?? height / 2).strength(0.4))
        .alpha(1)
        .alphaDecay(0.05)

      // Run synchronously for N ticks then stop
      for (let i = 0; i < 120; i++) simulation.tick()
      simulation.stop()
    }

    // Draw edges FIRST (behind nodes)
    const links = mainGroup.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', (d: any) => 0.3 + Math.pow(d.value, 1.5) * 12)
      .attr('opacity', 0.5)
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

    const getNodeColor = (d: any, dark = false): string => {
      if (colorMode === 'community' && snaData) {
        const displayIdx = snaData.communityDisplayIndex[d.id] ?? -1
        return getCommunityColor(displayIdx)
      }
      return dark
        ? getGroupColorDark(d.candidate.group)
        : getGroupColor(d.candidate.group)
    }

    // Node circles
    nodeGroups.append('circle')
      .attr('r', (d: any) => d.size)
      .attr('fill', (d: any) => getNodeColor(d, selectedIds.has(d.id)))
      .attr('stroke', (d: any) => getNodeColor(d, selectedIds.has(d.id)))
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
          if (layout !== 'spectral') {
            if (!event.active) simulation.alphaTarget(0.3).restart()
          }
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event: any, d: any) => {
          d.fx = event.x
          d.fy = event.y
          if (layout === 'spectral') {
            // Update position directly without simulation
            d.x = event.x
            d.y = event.y
            nodeGroups.filter((n: any) => n.id === d.id)
              .attr('transform', `translate(${d.x},${d.y})`)
            links
              .attr('x1', (e: any) => (typeof e.source === 'object' ? e.source.x : nodeMap.get(e.source)?.x) ?? 0)
              .attr('y1', (e: any) => (typeof e.source === 'object' ? e.source.y : nodeMap.get(e.source)?.y) ?? 0)
              .attr('x2', (e: any) => (typeof e.target === 'object' ? e.target.x : nodeMap.get(e.target)?.x) ?? 0)
              .attr('y2', (e: any) => (typeof e.target === 'object' ? e.target.y : nodeMap.get(e.target)?.y) ?? 0)
          }
        })
        .on('end', (event: any, d: any) => {
          if (layout !== 'spectral') {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          }
          // In spectral mode, keep node pinned where user dragged it
        })
    )

    // Create node index for faster lookup
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    const renderPositions = () => {
      links
        .attr('x1', (d: any) => (typeof d.source === 'object' ? d.source.x : nodeMap.get(d.source)?.x) ?? 0)
        .attr('y1', (d: any) => (typeof d.source === 'object' ? d.source.y : nodeMap.get(d.source)?.y) ?? 0)
        .attr('x2', (d: any) => (typeof d.target === 'object' ? d.target.x : nodeMap.get(d.target)?.x) ?? 0)
        .attr('y2', (d: any) => (typeof d.target === 'object' ? d.target.y : nodeMap.get(d.target)?.y) ?? 0)
      nodeGroups.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    }

    if (layout === 'spectral') {
      // Render once immediately — no animation needed
      renderPositions()
    } else {
      // Animation
      let tickCount = 0
      simulation.on('tick', () => {
        tickCount++
        renderPositions()

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
    }

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .on('zoom', (event: any) => {
        mainGroup.attr('transform', event.transform)
      })

    svg.call(zoom)

  }, [candidates, selectedIds, analytics, onSelect, snaData, colorMode, layout, spectralPositions])

  // Update opacity on hover without reinitializing
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)

    svg.selectAll('circle')
      .attr('opacity', (d: any) => hoveredId === null || hoveredId === d.id ? 1 : 0.25)
      .attr('stroke-dasharray', null)
      .attr('stroke-width', (d: any) => selectedIds.has(d.id) ? 4 : 3)

    svg.selectAll('.node-label')
      .attr('opacity', (d: any) => hoveredId !== null && hoveredId === d.id ? 1 : 0)

    svg.selectAll('line')
      .attr('opacity', (d: any) => {
        if (hoveredId === null) return 0.5
        const src = typeof d.source === 'object' ? d.source.id : d.source
        const tgt = typeof d.target === 'object' ? d.target.id : d.target
        return src === hoveredId || tgt === hoveredId ? 1 : 0.05
      })
      .attr('stroke-width', (d: any) => {
        if (hoveredId === null) return 0.3 + Math.pow(d.value, 1.5) * 12
        const src = typeof d.source === 'object' ? d.source.id : d.source
        const tgt = typeof d.target === 'object' ? d.target.id : d.target
        return src === hoveredId || tgt === hoveredId
          ? (0.3 + Math.pow(d.value, 1.5) * 12) * 1.8
          : 0.3 + Math.pow(d.value, 1.5) * 12
      })
      .attr('stroke', (d: any) => {
        if (hoveredId === null) return '#cbd5e1'
        const src = typeof d.source === 'object' ? d.source.id : d.source
        const tgt = typeof d.target === 'object' ? d.target.id : d.target
        return src === hoveredId || tgt === hoveredId ? '#2563eb' : '#cbd5e1'
      })
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
