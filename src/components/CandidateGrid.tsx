import { Candidate } from '../types'

interface CandidateGridProps {
  candidates: Candidate[]
  selectedIds: Set<string>
  onSelect: (id: string) => void
  onViewBio: (id: string) => void
  searchTerm: string
}

export default function CandidateGrid({
  candidates,
  selectedIds,
  onSelect,
  onViewBio,
  searchTerm,
}: CandidateGridProps) {
  const filtered = candidates.filter(c =>
    c.name.includes(searchTerm) || c.bio.includes(searchTerm)
  )

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8 gap-2">
      {filtered.map(candidate => (
        <div
          key={candidate.id}
          className={`flex flex-col rounded-lg transition-all ${
            selectedIds.has(candidate.id)
              ? 'ring-3 ring-blue-500'
              : ''
          }`}
        >
          {/* Image - clickable to select */}
          <button
            onClick={() => onSelect(candidate.id)}
            className="relative w-full mb-1 cursor-pointer group rounded"
            title={`Click to ${selectedIds.has(candidate.id) ? 'deselect' : 'select'}`}
          >
            <img
              src={candidate.photoUrl}
              alt={candidate.name}
              className="w-full aspect-square object-cover rounded bg-slate-200 group-hover:opacity-80 transition-opacity"
            />

            {/* Selection indicator - center */}
            {selectedIds.has(candidate.id) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg shadow-lg">
                  ✓
                </div>
              </div>
            )}

            {/* Info icon - top right corner */}
            {candidate.bio && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onViewBio(candidate.id)
                }}
                className="absolute top-1 right-1 bg-white/90 hover:bg-white text-slate-700 hover:text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow-md transition-colors"
                title="View full bio"
              >
                ℹ
              </button>
            )}
          </button>

          {/* Name */}
          <h3 className="font-semibold text-xs text-center line-clamp-1 leading-tight text-slate-900 px-1">
            {candidate.name}
          </h3>
        </div>
      ))}
    </div>
  )
}
