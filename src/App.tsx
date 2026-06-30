import { useState, useEffect } from 'react'
import { Candidate, Analytics } from './types'
import candidatesData from './data/candidates.json'
import Disclaimer from './components/Disclaimer'
import CandidateGrid from './components/CandidateGrid'
import BallotSidebar from './components/BallotSidebar'
import AnalyticsReveal from './components/AnalyticsReveal'
import CaptchaVerification from './components/CaptchaVerification'
import CandidateModal from './components/CandidateModal'
import Footer from './components/Footer'

const MIN_CANDIDATES = 6
const MAX_CANDIDATES = 8

type Phase = 'building' | 'captcha' | 'analytics'

// Generate random sparse connectivity matrix
const generateSparseMatrix = (candidates: Candidate[], sparsity: number = 0.15) => {
  const matrix: Record<string, number> = {}

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      // Random sparsity - most entries are 0
      if (Math.random() < sparsity) {
        const key = `${candidates[i].id}_${candidates[j].id}`
        // Random value between 0.1 and 1.0
        matrix[key] = Math.random() * 0.9 + 0.1
      }
    }
  }

  return matrix
}

const isAdminMode = () => {
  // Auto-enable on localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return true
  }

  // Check if already authenticated
  if (localStorage.getItem('admin_authenticated') === 'true') {
    return true
  }

  // Check for nonce in URL
  const params = new URLSearchParams(window.location.search)
  const nonce = params.get('admin')

  if (nonce) {
    // Verify nonce against Netlify secret
    const expectedNonce = import.meta.env.VITE_ADMIN_NONCE
    if (nonce === expectedNonce && expectedNonce) {
      localStorage.setItem('admin_authenticated', 'true')
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
      return true
    }
  }

  return false
}

export default function App() {
  const [candidates, setCandidates] = useState<Candidate[]>(() => {
    // Randomize initial candidate order
    const shuffled = [...candidatesData].sort(() => Math.random() - 0.5)
    return shuffled
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [phase, setPhase] = useState<Phase>('building')
  const [loading, setLoading] = useState(false)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [startTime] = useState(Date.now())
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const adminMode = isAdminMode()

  // Load demo data in admin mode
  useEffect(() => {
    if (adminMode && phase === 'building') {
      // Auto-generate analytics and jump to analytics view
      const selectedArray = Array.from(selectedIds).length > 0
        ? Array.from(selectedIds)
        : candidates.slice(0, 8).map(c => c.id)

      setSelectedIds(new Set(selectedArray))

      // Generate demo analytics with sparse random matrix
      const mockFrequency: Record<string, number> = {}
      selectedArray.forEach(id => {
        mockFrequency[id] = Math.random() * 0.8 + 0.2
      })

      const mockCoOccurrence = generateSparseMatrix(candidates, 0.12)

      setAnalytics({
        candidatePickFrequency: mockFrequency,
        coOccurrenceMatrix: mockCoOccurrence,
        totalSubmissions: Math.floor(Math.random() * 2000) + 500,
        allCandidates: candidates,
      })

      setPhase('analytics')
    }
  }, [adminMode, phase, candidates, selectedIds])

  const handleRandomize = () => {
    const shuffled = [...candidatesData].sort(() => Math.random() - 0.5)
    setCandidates(shuffled)
    setSelectedIds(new Set())
    setSearchTerm('')
  }

  const selectedCount = selectedIds.size
  const isValid = selectedCount >= MIN_CANDIDATES && selectedCount <= MAX_CANDIDATES

  const handleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else if (newSet.size < MAX_CANDIDATES) {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleViewBio = (id: string) => {
    const candidate = candidates.find(c => c.id === id)
    if (candidate) {
      setSelectedCandidate(candidate)
    }
  }

  const handleRemove = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      newSet.delete(id)
      return newSet
    })
  }

  const handleClear = () => {
    setSelectedIds(new Set())
  }

  const handleSubmit = () => {
    if (isValid) {
      setPhase('captcha')
    }
  }

  const handleCaptchaVerify = async (token: string) => {
    setLoading(true)
    try {
      const timeToComplete = Math.round((Date.now() - startTime) / 1000)
      const selectedArray = Array.from(selectedIds)

      // Submit ballot to API
      const submitResponse = await fetch('/.netlify/functions/submit-ballot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCandidateIds: selectedArray,
          timeToComplete,
          captchaToken: token,
        }),
      })

      if (!submitResponse.ok) {
        throw new Error(`Submit failed: ${submitResponse.status}`)
      }

      // Fetch analytics from API
      const analyticsResponse = await fetch('/.netlify/functions/analytics')
      if (!analyticsResponse.ok) {
        throw new Error(`Analytics fetch failed: ${analyticsResponse.status}`)
      }

      const analyticsData = await analyticsResponse.json()

      setAnalytics({
        candidatePickFrequency: analyticsData.candidatePickFrequency || {},
        coOccurrenceMatrix: analyticsData.coOccurrenceMatrix || {},
        totalSubmissions: analyticsData.totalSubmissions || 0,
        allCandidates: candidates,
      })

      setPhase('analytics')
    } catch (error) {
      console.error('Submission failed:', error)
      alert('אירעה שגיאה בהגשת ההצעה. נא לנסות שוב.')
      setPhase('building')
    } finally {
      setLoading(false)
    }
  }

  const selectedCandidates = candidates.filter(c => selectedIds.has(c.id))

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex-1 flex flex-col overflow-hidden">
        {phase === 'building' && (
          <>
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 md:px-6 py-4 shadow-lg relative">
              <h1 className="text-2xl md:text-3xl font-bold">הרשימה שלי לפריימריז</h1>
              <p className="text-blue-100 text-sm mt-1">בחרו 8-6 מועמדים</p>
              {adminMode && (
                <div className="absolute top-2 right-4 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded">
                  ADMIN MODE
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-6">
                <Disclaimer />

                <div className="mb-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="חפש..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 transition-all"
                  />
                  <button
                    onClick={handleRandomize}
                    className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors font-medium text-sm"
                    title="סדר אקראי חדש"
                  >
                    🔄 סדר אקראי חדש
                  </button>
                </div>

                {selectedCount > 0 && (
                  <p className="text-xs text-slate-600 mb-3">
                    ✓ בחרת {selectedCount} מועמדים
                  </p>
                )}

                <div className="flex-1 overflow-y-auto pr-2">
                  <CandidateGrid
                    candidates={candidates}
                    selectedIds={selectedIds}
                    onSelect={handleSelect}
                    onViewBio={handleViewBio}
                    searchTerm={searchTerm}
                  />
                </div>
              </div>

              <BallotSidebar
                candidates={candidates}
                selectedIds={selectedIds}
                onRemove={handleRemove}
                onClear={handleClear}
                isValid={isValid}
              />
            </div>

            <div className="border-t border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 md:px-6 py-4 flex justify-between items-center shadow-lg">
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{selectedCount}</span> / {MAX_CANDIDATES}-{MIN_CANDIDATES}
              </div>
              <button
                onClick={handleSubmit}
                disabled={!isValid}
                className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                  isValid
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                הגש הצעה
              </button>
            </div>
          </>
        )}

        {phase === 'analytics' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <button
              onClick={() => {
                setSelectedIds(new Set())
                setPhase('building')
                setAnalytics(null)
                setSearchTerm('')
              }}
              className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
            >
              ← חזור לעריכה
            </button>
            <AnalyticsReveal
              selectedCandidates={selectedCandidates}
              analytics={analytics}
              allCandidates={candidates}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              adminMode={adminMode}
            />
          </div>
        )}
      </div>

      {phase === 'captcha' && (
        <CaptchaVerification
          onVerify={handleCaptchaVerify}
          loading={loading}
        />
      )}

      <CandidateModal
        candidate={selectedCandidate}
        onClose={() => setSelectedCandidate(null)}
      />

      <Footer />
    </div>
  )
}
