import { Candidate } from '../types'

export interface QuotaBadge {
  label: string
  isReserved: boolean
  placedAboveReservedSeat: boolean
}

export interface KnessetListEntry {
  position: number
  candidate: Candidate
  isChairman?: boolean
  badges: QuotaBadge[]
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

  // Cumulative floor: at each checkpoint position, at least N pool members must
  // have appeared in the list so far (for any reason) — force the highest-ranked
  // unplaced pool member into the slot only if the running count falls short.
  const meretzPool = ranked.filter(isMeretz)
  const meretzCheckpoints: Checkpoint[] = [
    { position: 6, requiredCount: 1, label: 'שריון מרצ #1' },
    { position: 8, requiredCount: 2, label: 'שריון מרצ #2' },
    { position: 14, requiredCount: 3, label: 'שריון מרצ #3' },
  ]

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

  const meretzLast = meretzCheckpoints[meretzCheckpoints.length - 1]
  const sectorLast = sectorCheckpoints[sectorCheckpoints.length - 1]
  const sectorPoolIds = new Set(sectorPool.map(c => c.id))

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
    { position: 1, candidate: GOLAN_CHAIRMAN, isChairman: true, badges: [] },
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
    let reserved: { candidate: Candidate; label: string; pool: 'meretz' | 'sector' } | null = null

    const meretzCheckpoint = meretzCheckpoints.find(cp => cp.position === p)
    const sectorCheckpoint = sectorCheckpoints.find(cp => cp.position === p)

    if (meretzCheckpoint && meretzPlacedCount < meretzCheckpoint.requiredCount) {
      const candidate = nextUnplacedInPool(meretzPool)
      if (candidate) reserved = { candidate, label: meretzCheckpoint.label, pool: 'meretz' }
    } else if (sectorCheckpoint && sectorPlacedCount < sectorCheckpoint.requiredCount) {
      const candidate = nextUnplacedInPool(sectorPool)
      if (candidate) reserved = { candidate, label: sectorLabels.get(candidate.id) || 'שריון מגזרים', pool: 'sector' }
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

    // Each pool's guarantee is checked independently — a candidate placed for
    // one reason (or naturally) can also fulfill the other pool's quota early,
    // in which case both badges show, with a note on whichever wasn't the
    // official trigger for this exact checkpoint position.
    const badges: QuotaBadge[] = []

    const meretzForcedHere = reserved?.pool === 'meretz'
    const meretzApplies = isMeretz(candidate) && meretzPlacedCount < meretzLast.requiredCount
    if (meretzForcedHere) {
      badges.push({ label: reserved!.label, isReserved: true, placedAboveReservedSeat: false })
    } else if (meretzApplies && p < meretzLast.position) {
      badges.push({ label: `שריון מרצ #${meretzPlacedCount + 1}`, isReserved: false, placedAboveReservedSeat: true })
    }

    const sectorForcedHere = reserved?.pool === 'sector'
    const sectorApplies = sectorPoolIds.has(candidate.id) && sectorPlacedCount < sectorLast.requiredCount
    if (sectorForcedHere) {
      badges.push({ label: reserved!.label, isReserved: true, placedAboveReservedSeat: false })
    } else if (sectorApplies && p < sectorLast.position) {
      badges.push({ label: sectorLabels.get(candidate.id) || 'שריון מגזרים', isReserved: false, placedAboveReservedSeat: true })
    }

    placed.add(candidate.id)
    if (isMeretz(candidate)) meretzPlacedCount++
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

    result.push({ position: p, candidate, badges })
  }

  return result
}
