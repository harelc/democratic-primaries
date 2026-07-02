import Graph from 'graphology'
import { eigenvector, pagerank } from 'graphology-metrics/centrality'
import { weightedDegree } from 'graphology-metrics/node'
import { Matrix, EigenvalueDecomposition } from 'ml-matrix'
import { Candidate } from '../types'

export interface SNAResult {
  communities: Record<string, number>
  communityDisplayIndex: Record<string, number>
  eigenvector: Record<string, number>
  degree: Record<string, number>
  weightedDegree: Record<string, number>
  clusteringCoefficient: Record<string, number>
  pagerank: Record<string, number>
  cosineSimTop3: Record<string, string[]>
  spectralPositions: Record<string, { x: number; y: number }>
}

// ── φ affinity ────────────────────────────────────────────────────────────────

function getPhi(
  a: string, b: string,
  coOccurrenceMatrix: Record<string, number>,
  freq: Record<string, number>
): number {
  const pA = freq[a] ?? 0, pB = freq[b] ?? 0
  const pAB = coOccurrenceMatrix[a < b ? `${a}:${b}` : `${b}:${a}`] ?? 0
  const denom = Math.sqrt(pA * (1 - pA) * pB * (1 - pB))
  return denom > 0 ? (pAB - pA * pB) / denom : 0
}

// Affinity matrix: A[i][j] = max(0, φ[i][j]), diagonal = 0
function buildPhiAffinity(
  candidates: Candidate[],
  coOccurrenceMatrix: Record<string, number>,
  freq: Record<string, number>
): number[][] {
  const n = candidates.length
  const ids = candidates.map(c => c.id)
  const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const v = Math.max(0, getPhi(ids[i], ids[j], coOccurrenceMatrix, freq))
      A[i][j] = A[j][i] = v
    }
  return A
}

// ── Spectral decomposition ────────────────────────────────────────────────────

interface SpectralDecomp {
  sorted: { val: number; idx: number }[]
  eigenvectors: Matrix
}

function spectralDecompose(A: number[][]): SpectralDecomp {
  const n = A.length
  const W = new Matrix(A)

  const dInvSqrt = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    let deg = 0
    for (let j = 0; j < n; j++) deg += W.get(i, j)
    dInvSqrt[i] = deg > 0 ? 1 / Math.sqrt(deg) : 0
  }

  // Normalized Laplacian L = I − D^{-1/2} W D^{-1/2}
  const L = Matrix.identity(n)
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (i !== j)
        L.set(i, j, -dInvSqrt[i] * W.get(i, j) * dInvSqrt[j])

  const eig = new EigenvalueDecomposition(L)
  const sorted = eig.realEigenvalues
    .map((val, idx) => ({ val, idx }))
    .sort((a, b) => a.val - b.val)

  return { sorted, eigenvectors: eig.eigenvectorMatrix }
}

// ── Eigengap heuristic ────────────────────────────────────────────────────────

function eigengapK(sorted: { val: number }[], minK = 2, maxK = 8): number {
  let bestGap = -1, bestK = minK
  for (let k = minK; k <= Math.min(maxK, sorted.length - 1); k++) {
    const gap = sorted[k].val - sorted[k - 1].val
    if (gap > bestGap) { bestGap = gap; bestK = k }
  }
  return bestK
}

// ── k-means with farthest-first initialization (deterministic) ────────────────

function kmeans(points: number[][], k: number, maxIter = 100): number[] {
  const n = points.length
  const dim = points[0]?.length ?? 0
  if (k >= n) return points.map((_, i) => i)

  // Farthest-first: deterministic, good coverage
  const centIdx: number[] = [0]
  while (centIdx.length < k) {
    let best = -1, bestDist = -1
    for (let i = 0; i < n; i++) {
      if (centIdx.includes(i)) continue
      const minD = Math.min(...centIdx.map(ci =>
        points[ci].reduce((s, v, d) => s + (v - points[i][d]) ** 2, 0)
      ))
      if (minD > bestDist) { bestDist = minD; best = i }
    }
    if (best >= 0) centIdx.push(best)
  }
  const centroids = centIdx.map(i => [...points[i]])

  let assignments = new Array(n).fill(0)
  for (let iter = 0; iter < maxIter; iter++) {
    const next = points.map(p => {
      let best = 0, bestD = Infinity
      for (let c = 0; c < k; c++) {
        const d = centroids[c].reduce((s, v, dd) => s + (v - p[dd]) ** 2, 0)
        if (d < bestD) { bestD = d; best = c }
      }
      return best
    })
    if (next.every((a, i) => a === assignments[i])) break
    assignments = next
    for (let c = 0; c < k; c++) {
      const members = points.filter((_, i) => assignments[i] === c)
      if (members.length === 0) continue
      for (let d = 0; d < dim; d++)
        centroids[c][d] = members.reduce((s, p) => s + p[d], 0) / members.length
    }
  }
  return assignments
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeClusteringCoefficients(graph: Graph): Record<string, number> {
  const result: Record<string, number> = {}
  graph.forEachNode(nodeId => {
    const neighbors = graph.neighbors(nodeId)
    const k = neighbors.length
    if (k < 2) { result[nodeId] = 0; return }
    let triangles = 0
    for (let i = 0; i < neighbors.length; i++)
      for (let j = i + 1; j < neighbors.length; j++)
        if (graph.hasEdge(neighbors[i], neighbors[j]) || graph.hasEdge(neighbors[j], neighbors[i]))
          triangles++
    result[nodeId] = (2 * triangles) / (k * (k - 1))
  })
  return result
}

function computeCosineSimilarityTop3(
  candidates: Candidate[],
  coOccurrenceMatrix: Record<string, number>
): Record<string, string[]> {
  const ids = candidates.map(c => c.id)
  const getCoOcc = (a: string, b: string) =>
    coOccurrenceMatrix[`${a}:${b}`] ?? coOccurrenceMatrix[`${b}:${a}`] ?? 0

  const result: Record<string, string[]> = {}
  for (const a of ids) {
    let magA = 0
    for (const b of ids) { if (b !== a) { const v = getCoOcc(a, b); magA += v * v } }
    magA = Math.sqrt(magA)

    const sims: { id: string; sim: number }[] = []
    for (const b of ids) {
      if (b === a) continue
      let dot = 0, magB = 0
      for (const c of ids) {
        if (c === a || c === b) continue
        const va = getCoOcc(a, c), vb = getCoOcc(b, c)
        dot += va * vb; magB += vb * vb
      }
      dot += getCoOcc(a, b) * getCoOcc(b, a)
      magB += getCoOcc(b, a) ** 2
      magB = Math.sqrt(magB)
      const sim = magA > 0 && magB > 0 ? dot / (magA * magB) : 0
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
  const candidateIds = candidates.map(c => c.id)
  const edges: { a: string; b: string; w: number }[] = []

  for (let i = 0; i < candidateIds.length; i++)
    for (let j = i + 1; j < candidateIds.length; j++) {
      const a = candidateIds[i], b = candidateIds[j]
      const w = coOccurrenceMatrix[`${a}:${b}`] ?? coOccurrenceMatrix[`${b}:${a}`] ?? 0
      if (w > 0) edges.push({ a, b, w })
    }

  const totalWeight = edges.reduce((s, e) => s + e.w, 0)
  if (totalWeight === 0) { for (const g of groups) result[g] = 0; return result }

  const degreeMap: Record<string, number> = {}
  for (const { a, b, w } of edges) {
    degreeMap[a] = (degreeMap[a] ?? 0) + w
    degreeMap[b] = (degreeMap[b] ?? 0) + w
  }
  const inGroup = (id: string, g: string) => !!(candidates.find(c => c.id === id)?.group?.includes(g))

  for (const group of groups) {
    const sumDeg = candidateIds.reduce((s, id) => s + (inGroup(id, group) ? (degreeMap[id] ?? 0) : 0), 0)
    const e = sumDeg / (2 * totalWeight)
    const withinWeight = edges.filter(({ a, b }) => inGroup(a, group) && inGroup(b, group)).reduce((s, ed) => s + ed.w, 0)
    const observedFrac = withinWeight / totalWeight
    const denom = e - e * e
    result[group] = denom > 0 ? (observedFrac - e * e) / denom : 0
  }
  return result
}

function normalizeRecord(record: Record<string, number>): Record<string, number> {
  const values = Object.values(record)
  if (values.length === 0) return record
  const max = Math.max(...values), min = Math.min(...values)
  const range = max - min
  if (range === 0) return Object.fromEntries(Object.keys(record).map(k => [k, 0]))
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, (v - min) / range]))
}

// ── Public: spectral embedding (2D) ──────────────────────────────────────────

export function computeSpectralEmbedding(
  candidates: Candidate[],
  coOccurrenceMatrix: Record<string, number>,
  candidatePickFrequency: Record<string, number> = {}
): Record<string, { x: number; y: number }> {
  const ids = candidates.map(c => c.id)
  const A = buildPhiAffinity(candidates, coOccurrenceMatrix, candidatePickFrequency)
  const { sorted, eigenvectors } = spectralDecompose(A)
  const col1 = sorted[1]?.idx ?? 1
  const col2 = sorted[2]?.idx ?? 2
  const result: Record<string, { x: number; y: number }> = {}
  for (let i = 0; i < candidates.length; i++)
    result[ids[i]] = { x: eigenvectors.get(i, col1), y: eigenvectors.get(i, col2) }
  return result
}

// ── Public: full SNA ──────────────────────────────────────────────────────────

export function computeSNA(
  candidates: Candidate[],
  coOccurrenceMatrix: Record<string, number>,
  candidatePickFrequency: Record<string, number> = {}
): SNAResult {
  const ids = candidates.map(c => c.id)

  // Graph for centrality metrics (joint probability edges)
  const graph = new Graph({ type: 'undirected', multi: false })
  for (const c of candidates) graph.addNode(c.id, { label: c.name })
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i].id, b = candidates[j].id
      const w = coOccurrenceMatrix[`${a}:${b}`] ?? coOccurrenceMatrix[`${b}:${a}`] ?? 0
      if (w > 0) graph.addEdge(a, b, { weight: w })
    }

  // Spectral decomposition on φ affinity (one eigendecomposition for both clustering + embedding)
  const A = buildPhiAffinity(candidates, coOccurrenceMatrix, candidatePickFrequency)
  const { sorted, eigenvectors } = spectralDecompose(A)

  // 2D embedding: eigenvectors 2 and 3 (skip trivial #1)
  const col1 = sorted[1]?.idx ?? 1
  const col2 = sorted[2]?.idx ?? 2
  const spectralPositions: Record<string, { x: number; y: number }> = {}
  for (let i = 0; i < candidates.length; i++)
    spectralPositions[ids[i]] = { x: eigenvectors.get(i, col1), y: eigenvectors.get(i, col2) }

  // Spectral clustering: eigengap selects k, k-means on top-k eigenvectors
  const k = eigengapK(sorted, 2, 8)
  const embeddingCols = sorted.slice(1, k + 1).map(s => s.idx)
  const points = ids.map((_, i) => embeddingCols.map(col => eigenvectors.get(i, col)))
  // Row-normalize for k-means stability
  const normPoints = points.map(p => {
    const mag = Math.sqrt(p.reduce((s, v) => s + v * v, 0))
    return mag > 0 ? p.map(v => v / mag) : p
  })
  const clusterAssignments = kmeans(normPoints, k)
  const communityMapping: Record<string, number> = {}
  ids.forEach((id, i) => { communityMapping[id] = clusterAssignments[i] })

  // Centrality metrics
  let eigenvectorRaw: Record<string, number> = {}
  try { eigenvectorRaw = eigenvector(graph) }
  catch { graph.forEachNode(id => { eigenvectorRaw[id] = 0 }) }

  const n = graph.order
  const degreeRaw: Record<string, number> = {}
  graph.forEachNode(id => { degreeRaw[id] = n > 1 ? graph.degree(id) / (n - 1) : 0 })

  const weightedDegreeRaw: Record<string, number> = {}
  graph.forEachNode(id => { weightedDegreeRaw[id] = weightedDegree(graph, id) })

  const clusteringRaw = computeClusteringCoefficients(graph)

  let pagerankRaw: Record<string, number> = {}
  try { pagerankRaw = pagerank(graph) }
  catch { graph.forEachNode(id => { pagerankRaw[id] = 0 }) }

  const cosineSimTop3 = computeCosineSimilarityTop3(candidates, coOccurrenceMatrix)

  const result: SNAResult = {
    communities: communityMapping,
    communityDisplayIndex: {},
    eigenvector: normalizeRecord(eigenvectorRaw),
    degree: degreeRaw,
    weightedDegree: normalizeRecord(weightedDegreeRaw),
    clusteringCoefficient: clusteringRaw,
    pagerank: normalizeRecord(pagerankRaw),
    cosineSimTop3,
    spectralPositions,
  }

  for (const c of candidates) {
    if (!(c.id in result.eigenvector)) result.eigenvector[c.id] = 0
    if (!(c.id in result.degree)) result.degree[c.id] = 0
    if (!(c.id in result.weightedDegree)) result.weightedDegree[c.id] = 0
    if (!(c.id in result.clusteringCoefficient)) result.clusteringCoefficient[c.id] = 0
    if (!(c.id in result.communities)) result.communities[c.id] = 0
    if (!(c.id in result.pagerank)) result.pagerank[c.id] = 0
    if (!(c.id in result.cosineSimTop3)) result.cosineSimTop3[c.id] = []
  }

  // Build display index: filter communities by Qc > 0, sort by total vote share
  const totalEdgeWeight = Object.values(weightedDegreeRaw).reduce((s, v) => s + v, 0) / 2
  const m2 = totalEdgeWeight * 2

  const rawIds = Array.from(new Set(Object.values(result.communities)))
  const communityMeta = rawIds.map(rawId => {
    const members = candidates.filter(c => result.communities[c.id] === rawId)
    const memberIds = new Set(members.map(c => c.id))
    let lc = 0, dc = 0
    members.forEach(c => {
      dc += weightedDegreeRaw[c.id] ?? 0
      graph.forEachNeighbor(c.id, (neighbor, attrs) => {
        if (memberIds.has(neighbor)) lc += (attrs.weight ?? 1) / 2
      })
    })
    const qc = m2 > 0 ? (lc / totalEdgeWeight) - Math.pow(dc / m2, 2) : 0
    const connectedSize = members.filter(c => (weightedDegreeRaw[c.id] ?? 0) > 0).length
    const minId = members.map(c => c.id).sort()[0] ?? ''
    return { rawId, lc, qc, connectedSize, minId }
  })

  communityMeta.sort((a, b) => {
    const sumA = candidates.filter(c => result.communities[c.id] === a.rawId)
      .reduce((s, c) => s + (candidatePickFrequency[c.id] ?? 0), 0)
    const sumB = candidates.filter(c => result.communities[c.id] === b.rawId)
      .reduce((s, c) => s + (candidatePickFrequency[c.id] ?? 0), 0)
    return sumB !== sumA ? sumB - sumA : a.minId < b.minId ? -1 : 1
  })

  let displayIdx = 0
  const rawToDisplay: Record<number, number> = {}
  for (const { rawId, qc, connectedSize } of communityMeta)
    if (connectedSize > 0 && qc > 0) rawToDisplay[rawId] = displayIdx++

  for (const c of candidates) {
    const rawId = result.communities[c.id]
    result.communityDisplayIndex[c.id] = rawToDisplay[rawId] ?? -1
  }

  return result
}

export const COMMUNITY_COLORS: Record<number, string> = {
  0: '#3b82f6',
  1: '#dc2626',
  2: '#16a34a',
  3: '#9333ea',
  4: '#f97316',
}

export function getCommunityColor(displayIndex: number): string {
  if (displayIndex < 0) return '#9ca3af'
  return COMMUNITY_COLORS[displayIndex] ?? '#6b7280'
}
