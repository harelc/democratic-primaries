import { Candidate } from '../types'

export interface KnessetListEntry {
  position: number
  candidate: Candidate
  isChairman?: boolean
  isReserved?: boolean
  reservedLabel?: string
  placedAboveReservedSeat?: boolean
  quotaLabel?: string
}

export const GOLAN_CHAIRMAN: Candidate = {
  id: 'chairman_golan',
  name: 'יאיר גולן',
  bio: 'יו"ר מפלגת הדמוקרטים',
  region: '',
  background: '',
  photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Yair_Golan_%28SHL_9404%29.jpg',
  gender: 'M',
}

const opposite = (g: 'F' | 'M'): 'F' | 'M' => (g === 'F' ? 'M' : 'F')

interface Checkpoint {
  position: number
  requiredCount: number
  label: string
}

export function buildKnessetList(candidates: Candidate[], pickFrequency: Record<string, number>): KnessetListEntry[] {
  const ranked = [...candidates].sort((a, b) => (pickFrequency[b.id] || 0) - (pickFrequency[a.id] || 0))

  const isMeretz = (c: Candidate) => (c.group || '').includes('מרצ')
  const isKfari = (c: Candidate) => (c.group || '').includes('כפרי')
  const isMiutim = (c: Candidate) => (c.group || '').includes('מיעוטים')

  // Fixed pool of 5 designees (top 4 מיעוטים + top 1 כפרי), re-ranked together;
  // cumulative floor checked at each of the 5 designated positions.
  const top4Miutim = ranked.filter(isMiutim).slice(0, 4)
  const top1Kfari = ranked.filter(isKfari).slice(0, 1)
  const sectorLabels = new Map<string, string>()
  top4Miutim.forEach((c, i) => sectorLabels.set(c.id, `שריון מיעוטים #${i + 1}`))
  top1Kfari.forEach(c => sectorLabels.set(c.id, 'שריון כפרי #1'))
  const sectorPool = [...top4Miutim, ...top1Kfari].sort((a, b) => ranked.indexOf(a) - ranked.indexOf(b))
  const sectorCheckpoints: Checkpoint[] = [12, 13, 18, 23, 27].map((position, i) => ({
    position,
    requiredCount: i + 1,
    label: `שריון מגזרים #${i + 1}`,
  }))
  const sectorPoolIds = new Set(sectorPool.map(c => c.id))

  // Cumulative floor: at each checkpoint position, at least N pool members must
  // have appeared in the list so far (for any reason) — force the highest-ranked
  // unplaced pool member into the slot only if the running count falls short.
  // Sector designees are excluded so each guarantee is fulfilled by a distinct person.
  const meretzPool = ranked.filter(c => isMeretz(c) && !sectorPoolIds.has(c.id))
  const meretzCheckpoints: Checkpoint[] = [
    { position: 6, requiredCount: 1, label: 'שריון מרצ #1' },
    { position: 8, requiredCount: 2, label: 'שריון מרצ #2' },
    { position: 14, requiredCount: 3, label: 'שריון מרצ #3' },
  ]

  const meretzLast = meretzCheckpoints[meretzCheckpoints.length - 1]
  const sectorLast = sectorCheckpoints[sectorCheckpoints.length - 1]
  const meretzPoolIds = new Set(meretzPool.map(c => c.id))

  const queueF = ranked.filter(c => c.gender === 'F')
  const queueM = ranked.filter(c => c.gender === 'M')
  let ptrF = 0
  let ptrM = 0
  const placed = new Set<string>()

  const nextFromQueue = (gender: 'F' | 'M'): Candidate | undefined => {
    if (gender === 'F') {
      while (ptrF < queueF.length && placed.has(queueF[ptrF].id)) ptrF++
      return queueF[ptrF]
    }
    while (ptrM < queueM.length && placed.has(queueM[ptrM].id)) ptrM++
    return queueM[ptrM]
  }
  const consumeFromQueue = (gender: 'F' | 'M') => { if (gender === 'F') ptrF++; else ptrM++ }

  const nextUnplacedInPool = (pool: Candidate[]): Candidate | undefined => pool.find(c => !placed.has(c.id))

  const result: KnessetListEntry[] = [
    { position: 1, candidate: GOLAN_CHAIRMAN, isChairman: true },
  ]

  let stateNext: 'F' | 'M' = 'F'
  let meretzPlacedCount = 0
  let sectorPlacedCount = 0
  let placedMaleCount = 0
  let placedFemaleCount = 0
  let balanceCorrection: { gender: 'F' | 'M'; remaining: number } | null = null
  let balanceChecked = false

  const totalPositions = 1 + candidates.length
  for (let p = 2; p <= totalPositions; p++) {
    let reserved: { candidate: Candidate; label: string } | null = null

    const meretzCheckpoint = meretzCheckpoints.find(cp => cp.position === p)
    const sectorCheckpoint = sectorCheckpoints.find(cp => cp.position === p)

    if (meretzCheckpoint && meretzPlacedCount < meretzCheckpoint.requiredCount) {
      const candidate = nextUnplacedInPool(meretzPool)
      if (candidate) reserved = { candidate, label: meretzCheckpoint.label }
    } else if (sectorCheckpoint && sectorPlacedCount < sectorCheckpoint.requiredCount) {
      const candidate = nextUnplacedInPool(sectorPool)
      if (candidate) reserved = { candidate, label: sectorLabels.get(candidate.id) || 'שריון מגזרים' }
    }

    const expected: 'F' | 'M' = balanceCorrection && balanceCorrection.remaining > 0 ? balanceCorrection.gender : stateNext

    let candidate: Candidate
    let actualGender: 'F' | 'M'
    const isReserved = !!reserved

    if (reserved) {
      candidate = reserved.candidate
      actualGender = candidate.gender || expected
    } else {
      const picked = nextFromQueue(expected) || nextFromQueue(opposite(expected))
      if (!picked) break
      candidate = picked
      actualGender = candidate.gender === expected ? expected : opposite(expected)
      consumeFromQueue(actualGender)
    }

    // A natural (non-reserved) placement of a pool member counts toward the
    // quota early — flag it only while that pool's quota isn't fully met yet.
    const meretzNoteApplies = meretzPoolIds.has(candidate.id) && meretzPlacedCount < meretzLast.requiredCount && p < meretzLast.position
    const sectorNoteApplies = sectorPoolIds.has(candidate.id) && sectorPlacedCount < sectorLast.requiredCount && p < sectorLast.position
    const placedAboveReservedSeat = !isReserved && (meretzNoteApplies || sectorNoteApplies)
    const quotaLabel = !isReserved
      ? (meretzNoteApplies ? `שריון מרצ #${meretzPlacedCount + 1}` : sectorNoteApplies ? sectorLabels.get(candidate.id) : undefined)
      : undefined

    placed.add(candidate.id)
    if (meretzPoolIds.has(candidate.id)) meretzPlacedCount++
    if (sectorPoolIds.has(candidate.id)) sectorPlacedCount++
    if (actualGender === 'F') placedFemaleCount++
    else placedMaleCount++

    if (balanceCorrection) {
      if (actualGender === balanceCorrection.gender) balanceCorrection.remaining--
      if (balanceCorrection.remaining <= 0) balanceCorrection = null
    }

    // One-time gender-balance check right after position 15: top up the
    // missing gender in the following seats until positions 2-15 are even.
    if (!balanceChecked && p === 15) {
      balanceChecked = true
      const diff = placedMaleCount - placedFemaleCount
      if (diff !== 0) balanceCorrection = { gender: diff > 0 ? 'F' : 'M', remaining: Math.abs(diff) }
    }

    stateNext = opposite(actualGender)

    result.push({ position: p, candidate, isReserved, reservedLabel: reserved?.label, placedAboveReservedSeat, quotaLabel })
  }

  return result
}
