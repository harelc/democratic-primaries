import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import { betweenness } from 'graphology-metrics/centrality'
import { weightedDegree } from 'graphology-metrics/node'
import { Candidate } from '../types'

export interface SNAResult {
  communities: Record<string, number>        // candidateId → raw Louvain ID
  communityDisplayIndex: Record<string, number> // candidateId → stable display index (singletons = -1)
  betweenness: Record<string, number>
  degree: Record<string, number>
  weightedDegree: Record<string, number>
  clusteringCoefficient: Record<string, number>
}

function computeClusteringCoefficients(graph: Graph): Record<string, number> {
  const result: Record<string, number> = {}

  graph.forEachNode((nodeId) => {
    const neighbors = graph.neighbors(nodeId)
    const k = neighbors.length

    if (k < 2) {
      result[nodeId] = 0
      return
    }

    // Count triangles: how many pairs of neighbors are also connected to each other
    let triangles = 0
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        if (graph.hasEdge(neighbors[i], neighbors[j]) || graph.hasEdge(neighbors[j], neighbors[i])) {
          triangles++
        }
      }
    }

    // Clustering coefficient = 2 * triangles / (k * (k - 1))
    result[nodeId] = (2 * triangles) / (k * (k - 1))
  })

  return result
}

function normalizeRecord(record: Record<string, number>): Record<string, number> {
  const values = Object.values(record)
  if (values.length === 0) return record
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min
  if (range === 0) return Object.fromEntries(Object.keys(record).map(k => [k, 0]))
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, (v - min) / range]))
}

export function computeSNA(
  candidates: Candidate[],
  coOccurrenceMatrix: Record<string, number>
): SNAResult {
  const graph = new Graph({ type: 'undirected', multi: false })

  // Add all candidates as nodes
  for (const candidate of candidates) {
    graph.addNode(candidate.id, { label: candidate.name })
  }

  // Add edges for all pairs where co-occurrence > 0
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i].id
      const b = candidates[j].id
      const key = `${a}_${b}`
      const key2 = `${b}_${a}`
      const weight = coOccurrenceMatrix[key] ?? coOccurrenceMatrix[key2] ?? 0
      if (weight > 0) {
        graph.addEdge(a, b, { weight })
      }
    }
  }

  // Community detection via Louvain
  const communityMapping = louvain(graph, { getEdgeWeight: 'weight' })

  // Betweenness centrality (normalized)
  const betweennessRaw = betweenness(graph, { normalized: true })

  // Degree centrality (normalized: degree / (n - 1))
  const n = graph.order
  const degreeRaw: Record<string, number> = {}
  graph.forEachNode((nodeId) => {
    degreeRaw[nodeId] = n > 1 ? graph.degree(nodeId) / (n - 1) : 0
  })

  // Weighted degree per node
  const weightedDegreeRaw: Record<string, number> = {}
  graph.forEachNode((nodeId) => {
    weightedDegreeRaw[nodeId] = weightedDegree(graph, nodeId)
  })

  // Clustering coefficients
  const clusteringRaw = computeClusteringCoefficients(graph)

  // Normalize weighted degree (degree is already 0–1, betweenness already normalized, clustering is 0–1)
  const weightedDegreeNorm = normalizeRecord(weightedDegreeRaw)

  const result: SNAResult = {
    communities: communityMapping,
    communityDisplayIndex: {},
    betweenness: betweennessRaw,
    degree: degreeRaw,
    weightedDegree: weightedDegreeNorm,
    clusteringCoefficient: clusteringRaw,
  }

  // Fill in zeros for isolated nodes
  for (const candidate of candidates) {
    if (!(candidate.id in result.betweenness)) result.betweenness[candidate.id] = 0
    if (!(candidate.id in result.degree)) result.degree[candidate.id] = 0
    if (!(candidate.id in result.weightedDegree)) result.weightedDegree[candidate.id] = 0
    if (!(candidate.id in result.clusteringCoefficient)) result.clusteringCoefficient[candidate.id] = 0
    if (!(candidate.id in result.communities)) result.communities[candidate.id] = 0
  }

  // Build stable display index sorted by community size desc, then min candidateId as tiebreaker.
  // Largest community = 0, second largest = 1, etc. Singletons = -1.
  // This means even if Louvain reshuffles raw IDs, the biggest community keeps blue, etc.
  const rawIds = Array.from(new Set(Object.values(result.communities)))
  const communityMeta = rawIds.map(rawId => {
    const members = candidates.filter(c => result.communities[c.id] === rawId)
    const connectedSize = members.filter(c => (result.weightedDegree[c.id] ?? 0) > 0).length
    const minId = members.map(c => c.id).sort()[0] ?? ''
    return { rawId, connectedSize, minId }
  })
  communityMeta.sort((a, b) =>
    b.connectedSize !== a.connectedSize
      ? b.connectedSize - a.connectedSize
      : a.minId < b.minId ? -1 : 1
  )
  let displayIdx = 0
  const rawToDisplay: Record<number, number> = {}
  for (const { rawId, connectedSize } of communityMeta) {
    if (connectedSize > 0) rawToDisplay[rawId] = displayIdx++
  }
  for (const candidate of candidates) {
    const rawId = result.communities[candidate.id]
    result.communityDisplayIndex[candidate.id] = rawToDisplay[rawId] ?? -1
  }

  return result
}

export const COMMUNITY_COLORS: Record<number, string> = {
  0: '#3b82f6', // blue
  1: '#dc2626', // red
  2: '#16a34a', // green
  3: '#9333ea', // purple
  4: '#f97316', // orange
}

// Pass the stable display index (0,1,2...), not the raw Louvain ID
export function getCommunityColor(displayIndex: number): string {
  if (displayIndex < 0) return '#9ca3af' // gray for singletons
  return COMMUNITY_COLORS[displayIndex] ?? '#6b7280'
}
