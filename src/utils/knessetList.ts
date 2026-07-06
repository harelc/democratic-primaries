import { Candidate } from '../types'

export interface KnessetListEntry {
  position: number
  candidate: Candidate
  isChairman?: boolean
  isReserved?: boolean
  reservedLabel?: string
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

export function buildKnessetList(candidates: Candidate[], pickFrequency: Record<string, number>): KnessetListEntry[] {
  const ranked = [...candidates].sort((a, b) => (pickFrequency[b.id] || 0) - (pickFrequency[a.id] || 0))

  const isMeretz = (c: Candidate) => (c.group || '').includes('מרצ')
  const isKfariOrMiutim = (c: Candidate) => (c.group || '').includes('כפרי') || (c.group || '').includes('מיעוטים')

  const [meretz1, meretz2, meretz3] = ranked.filter(isMeretz)

  // Joint כפרי + מיעוטים ranking: top 5 fill positions 12, 13, 18, 23, 27 in rank order
  const jointRanked = ranked.filter(isKfariOrMiutim)
  const JOINT_POSITIONS = [12, 13, 18, 23, 27]
  const jointSlots = new Map<number, Candidate>()
  JOINT_POSITIONS.forEach((pos, i) => {
    if (jointRanked[i]) jointSlots.set(pos, jointRanked[i])
  })

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

  const result: KnessetListEntry[] = [
    { position: 1, candidate: GOLAN_CHAIRMAN, isChairman: true },
  ]

  let stateNext: 'F' | 'M' = 'F'
  let catchup: { gender: 'F' | 'M'; remaining: number } | null = null

  const totalPositions = 1 + candidates.length
  for (let p = 2; p <= totalPositions; p++) {
    let reserved: { candidate: Candidate; label: string } | null = null
    if (p === 6 && meretz1 && !placed.has(meretz1.id)) reserved = { candidate: meretz1, label: 'שריון: נציג/ת מרצ המוביל/ה' }
    else if (p === 8 && meretz2 && !placed.has(meretz2.id)) reserved = { candidate: meretz2, label: 'שריון: נציג/ת מרצ השני/ה' }
    else if (p === 14 && meretz3 && !placed.has(meretz3.id)) reserved = { candidate: meretz3, label: 'שריון: נציג/ת מרצ השלישי/ת' }
    else if (jointSlots.has(p) && !placed.has(jointSlots.get(p)!.id)) reserved = { candidate: jointSlots.get(p)!, label: 'שריון: דירוג משותף כפרי / מיעוטים' }

    const expected: 'F' | 'M' = catchup && catchup.remaining > 0 ? catchup.gender : stateNext

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

    placed.add(candidate.id)

    if (actualGender === expected) {
      if (catchup && catchup.remaining > 0) {
        catchup.remaining--
        if (catchup.remaining === 0) catchup = null
      }
      stateNext = opposite(actualGender)
    } else {
      catchup = { gender: opposite(actualGender), remaining: 2 }
      stateNext = opposite(actualGender)
    }

    result.push({ position: p, candidate, isReserved, reservedLabel: reserved?.label })
  }

  return result
}
