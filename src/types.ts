export interface Candidate {
  id: string
  name: string
  bio: string
  region: string
  background: string
  photoUrl: string
  group?: string | null
  socialLinks?: Record<string, string>
}

export interface Submission {
  submissionId: string
  timestamp: string
  selectedCandidateIds: string[]
  timeToComplete: number
  challengesMet?: string[]
}

export interface Analytics {
  candidatePickFrequency: Record<string, number>
  coOccurrenceMatrix: Record<string, number>
  totalSubmissions: number
  allCandidates?: Candidate[]
}
