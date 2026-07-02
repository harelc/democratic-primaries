import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import { eigenvector, pagerank } from 'graphology-metrics/centrality'
import { weightedDegree } from 'graphology-metrics/node'
import { Matrix, EigenvalueDecomposition } from 'ml-matrix'
import { Candidate } from '../types'

export interface SNAResult {
  communities: Record<string, number>        // candidateId → raw Louvain ID
  communityDisplayIndex: Record<string, number> // candidateId → stable display index (singletons = -1)
  eigenvector: Record<string, number>
  degree: Record<string, number>
  weightedDegree: Record<string, number>
  clusteringCoefficient: Record<string, number>
  pagerank: Record<string, number>           // candidateId → normalized PageRank
  cosineSimTop3: Record<string, string[]>    // candidateId → top 3 most similar candidate IDs
  spectralPositions: Record<string, { x: number; y: number }>
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

function computeCosineSimilarityTop3(
  candidates: Candidate[],
  coOccurrenceMatrix: Record<string, number>
): Record<string, string[]> {
  const ids = candidates.map(c => c.id)

  // Build vector for each candidate: v_i[j] = coOccurrence(i,j)
  const getCoOcc = (a: string, b: string): number => {
    return coOccurrenceMatrix[`${a}:${b}`] ?? coOccurrenceMatrix[`${b}:${a}`] ?? 0
  }

  const result: Record<string, string[]> = {}

  for (const a of ids) {
    // Compute dot products and magnitudes
    const sims: { id: string; sim: number }[] = []

    // Precompute ||v_a||
    let magA = 0
    for (const b of ids) {
      if (b === a) continue
      const v = getCoOcc(a, b)
      magA += v * v
    }
    magA = Math.sqrt(magA)

    for (const b of ids) {
      if (b === a) continue

      // dot product v_a · v_b
      let dot = 0
      let magB = 0
      for (const c of ids) {
        if (c === a || c === b) continue
        const va = getCoOcc(a, c)
        const vb = getCoOcc(b, c)
        dot += va * vb
        magB += vb * vb
      }
      // Include the a↔b co-occurrence as part of the b dimension for a, and a dimension for b
      // Actually, v_i[j] = coOcc(i,j) for j != i. For a: includes getCoOcc(a,b)
      // For b: includes getCoOcc(b,a) = same. These are in each other's vectors.
      // Re-compute properly: v_a[k] for all k != a; dot(v_a, v_b) sums over k != a AND k != b
      // plus we need the dimension k=b in v_a and k=a in v_b
      // dimension k=b in v_a: getCoOcc(a,b)
      // dimension k=a in v_b: getCoOcc(b,a) = getCoOcc(a,b)
      dot += getCoOcc(a, b) * getCoOcc(b, a) // same value, symmetric

      magB += getCoOcc(b, a) * getCoOcc(b, a) // dimension k=a in v_b
      magB = Math.sqrt(magB)

      // Also need proper magA including dimension k=b
      // magA already includes k=b dimension via: for b2 of ids, if b2==a skip → b2=b is included
      const sim = (magA > 0 && magB > 0) ? dot / (magA * magB) : 0
      if (sim > 0) sims.push({ id: b, sim })
    }

    sims.sort((x, y) => y.sim - x.sim)
    result[a] = sims.slice(0, 3).map(s => s.id)
  }

  return result
}

export function computeGroupAssortativity(
  candidates: Candidate[],
  coOccurrenceMatrix: Record<string, number>
): Record<string, number> {
  const groups = ['מרצ', 'כפרי', 'מיעוטים']
  const result: Record<string, number> = {}

  // Build adjacency: treat coOccurrence as edge weight, binarize to 0/1 presence
  const candidateIds = candidates.map(c => c.id)
  const edges: { a: string; b: string; w: number }[] = []
  for (let i = 0; i < candidateIds.length; i++) {
    for (let j = i + 1; j < candidateIds.length; j++) {
      const a = candidateIds[i], b = candidateIds[j]
      const w = coOccurrenceMatrix[`${a}:${b}`] ?? coOccurrenceMatrix[`${b}:${a}`] ?? 0
      if (w > 0) edges.push({ a, b, w })
    }
  }

  const totalWeight = edges.reduce((s, e) => s + e.w, 0)
  if (totalWeight === 0) {
    for (const g of groups) result[g] = 0
    return result
  }

  // Build degree map (weighted)
  const degreeMap: Record<string, number> = {}
  for (const { a, b, w } of edges) {
    degreeMap[a] = (degreeMap[a] ?? 0) + w
    degreeMap[b] = (degreeMap[b] ?? 0) + w
  }

  // Group membership
  const inGroup = (candidateId: string, group: string): boolean => {
    const c = candidates.find(x => x.id === candidateId)
    return !!(c?.group && c.group.includes(group))
  }

  for (const group of groups) {
    // e = fraction of edge endpoints in group (expected fraction)
    const sumDegInGroup = candidateIds.reduce((s, id) => s + (inGroup(id, group) ? (degreeMap[id] ?? 0) : 0), 0)
    const e = sumDegInGroup / (2 * totalWeight)

    // fraction of edges that connect two group members
    const edgesWithin = edges.filter(({ a, b }) => inGroup(a, group) && inGroup(b, group))
    const withinWeight = edgesWithin.reduce((s, ed) => s + ed.w, 0)
    const observedFrac = withinWeight / totalWeight

    // r = (observed - expected^2) / (e_ii_max - expected^2)
    // where e_ii_max = e (when all edges within group → observedFrac = e)
    // Standard formula: r = (observedFrac - e^2) / (e - e^2)
    const denom = e - e * e
    result[group] = denom > 0 ? (observedFrac - e * e) / denom : 0
  }

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

export function computeSpectralEmbedding(
  candidates: Candidate[],
  coOccurrenceMatrix: Record<string, number>
): Record<string, { x: number; y: number }> {
  const n = candidates.length
  const ids = candidates.map(c => c.id)

  // Build weighted adjacency matrix W
  const W = Matrix.zeros(n, n)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = coOccurrenceMatrix[`${ids[i]}:${ids[j]}`] ?? coOccurrenceMatrix[`${ids[j]}:${ids[i]}`] ?? 0
      if (w > 0) {
        W.set(i, j, w)
        W.set(j, i, w)
      }
    }
  }

  // Build degree vector and D^(-1/2)
  const dInvSqrt = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    let deg = 0
    for (let j = 0; j < n; j++) deg += W.get(i, j)
    dInvSqrt[i] = deg > 0 ? 1 / Math.sqrt(deg) : 0
  }

  // Normalized Laplacian: L = I - D^(-1/2) * W * D^(-1/2)
  const L = Matrix.identity(n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const val = dInvSqrt[i] * W.get(i, j) * dInvSqrt[j]
        L.set(i, j, -val)
      }
    }
  }

  // Eigendecomposition
  const eig = new EigenvalueDecomposition(L)
  const eigenvalues = eig.realEigenvalues
  const eigenvectors = eig.eigenvectorMatrix // columns are eigenvectors

  // Sort eigenvectors by eigenvalue ascending
  const sorted = eigenvalues
    .map((val, idx) => ({ val, idx }))
    .sort((a, b) => a.val - b.val)

  // Skip the trivial first (index 0), use 2nd and 3rd
  const col1 = sorted[1]?.idx ?? 1
  const col2 = sorted[2]?.idx ?? 2

  const result: Record<string, { x: number; y: number }> = {}
  for (let i = 0; i < n; i++) {
    result[ids[i]] = {
      x: eigenvectors.get(i, col1),
      y: eigenvectors.get(i, col2),
    }
  }

  return result
}

export function computeSNA(
  candidates: Candidate[],
  coOccurrenceMatrix: Record<string, number>,
  candidatePickFrequency: Record<string, number> = {}
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
      const weight = coOccurrenceMatrix[`${a}:${b}`] ?? coOccurrenceMatrix[`${b}:${a}`] ?? 0
      if (weight > 0) {
        graph.addEdge(a, b, { weight })
      }
    }
  }

  // Community detection via Louvain
  const communityMapping = louvain(graph, { getEdgeWeight: 'weight' })

  // Eigenvector centrality — prestige: central if connected to other central nodes
  let eigenvectorRaw: Record<string, number> = {}
  try {
    eigenvectorRaw = eigenvector(graph)
  } catch {
    // Falls back to 0 for disconnected graphs
    graph.forEachNode(id => { eigenvectorRaw[id] = 0 })
  }

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

  // PageRank centrality
  let pagerankRaw: Record<string, number> = {}
  try {
    pagerankRaw = pagerank(graph)
  } catch {
    graph.forEachNode(id => { pagerankRaw[id] = 0 })
  }

  // Cosine similarity (item-item collaborative filtering)
  const cosineSimTop3 = computeCosineSimilarityTop3(candidates, coOccurrenceMatrix)

  // Spectral embedding via normalized graph Laplacian
  const spectralPositions = computeSpectralEmbedding(candidates, coOccurrenceMatrix)

  // Normalize weighted degree (degree is already 0–1, betweenness already normalized, clustering is 0–1)
  const weightedDegreeNorm = normalizeRecord(weightedDegreeRaw)

  const result: SNAResult = {
    communities: communityMapping,
    communityDisplayIndex: {},
    eigenvector: normalizeRecord(eigenvectorRaw),
    degree: degreeRaw,
    weightedDegree: weightedDegreeNorm,
    clusteringCoefficient: clusteringRaw,
    pagerank: normalizeRecord(pagerankRaw),
    cosineSimTop3,
    spectralPositions,
  }

  // Fill in zeros for isolated nodes
  for (const candidate of candidates) {
    if (!(candidate.id in result.eigenvector)) result.eigenvector[candidate.id] = 0
    if (!(candidate.id in result.degree)) result.degree[candidate.id] = 0
    if (!(candidate.id in result.weightedDegree)) result.weightedDegree[candidate.id] = 0
    if (!(candidate.id in result.clusteringCoefficient)) result.clusteringCoefficient[candidate.id] = 0
    if (!(candidate.id in result.communities)) result.communities[candidate.id] = 0
    if (!(candidate.id in result.pagerank)) result.pagerank[candidate.id] = 0
    if (!(candidate.id in result.cosineSimTop3)) result.cosineSimTop3[candidate.id] = []
  }

  // Build stable display index with two improvements:
  // 1. Sort by total INTERNAL edge weight (cohesion), not member count — more stable across votes
  // 2. Filter out statistically insignificant communities via modularity contribution Qc
  //    Qc = Lc/m - (dc/2m)^2, where Lc = internal weight, dc = sum of degrees, m = total edge weight
  //    Qc > 0 means more internal edges than expected in a random graph with the same degree sequence

  const totalEdgeWeight = weightedDegreeRaw
    ? Object.values(weightedDegreeRaw).reduce((s, v) => s + v, 0) / 2
    : 0
  const m2 = totalEdgeWeight * 2 // 2m for formula

  const rawIds = Array.from(new Set(Object.values(result.communities)))
  const communityMeta = rawIds.map(rawId => {
    const members = candidates.filter(c => result.communities[c.id] === rawId)
    const memberIds = new Set(members.map(c => c.id))

    // Internal edge weight Lc and sum of degrees dc
    let lc = 0
    let dc = 0
    members.forEach(c => {
      dc += weightedDegreeRaw[c.id] ?? 0
      graph.forEachNeighbor(c.id, (neighbor, attrs) => {
        if (memberIds.has(neighbor)) {
          lc += (attrs.weight ?? 1) / 2 // divide by 2 since each edge counted twice
        }
      })
    })

    const qc = m2 > 0 ? (lc / totalEdgeWeight) - Math.pow(dc / m2, 2) : 0
    const connectedSize = members.filter(c => (weightedDegreeRaw[c.id] ?? 0) > 0).length
    const minId = members.map(c => c.id).sort()[0] ?? ''
    return { rawId, lc, qc, connectedSize, minId }
  })

  // Sort by sum of vote share of members — stable and directly interpretable
  communityMeta.sort((a, b) => {
    const sumA = candidates.filter(c => result.communities[c.id] === a.rawId)
      .reduce((s, c) => s + (candidatePickFrequency[c.id] ?? 0), 0)
    const sumB = candidates.filter(c => result.communities[c.id] === b.rawId)
      .reduce((s, c) => s + (candidatePickFrequency[c.id] ?? 0), 0)
    return sumB !== sumA ? sumB - sumA : a.minId < b.minId ? -1 : 1
  })

  let displayIdx = 0
  const rawToDisplay: Record<number, number> = {}
  for (const { rawId, qc, connectedSize } of communityMeta) {
    // Show community only if: has connected members AND Qc > 0 (statistically significant)
    if (connectedSize > 0 && qc > 0) rawToDisplay[rawId] = displayIdx++
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
