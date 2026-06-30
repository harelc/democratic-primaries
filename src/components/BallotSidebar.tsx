import { Candidate } from '../types'

interface BallotSidebarProps {
  candidates: Candidate[]
  selectedIds: Set<string>
  onRemove: (id: string) => void
  onClear: () => void
  isValid: boolean
}

const MIN_CANDIDATES = 6
const MAX_CANDIDATES = 8

export default function BallotSidebar({
  candidates,
  selectedIds,
  onRemove,
  onClear,
  isValid,
}: BallotSidebarProps) {
  const selected = candidates.filter(c => selectedIds.has(c.id))
  const count = selectedIds.size

  return (
    <div className="bg-gradient-to-b from-blue-50 to-slate-50 border-l border-slate-200 p-4 w-full md:w-72 flex flex-col h-full shadow-inner">
      <h2 className="font-bold text-lg mb-4 text-blue-900">🗳️ הרשימה שלכם</h2>

      <div className="mb-4 p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg text-white shadow-md">
        <div className="text-3xl font-bold text-center">
          {count}
        </div>
        <div className="text-xs text-center text-blue-100 mt-1">
          מתוך {MAX_CANDIDATES}-{MIN_CANDIDATES}
        </div>
      </div>

      {isValid && (
        <div className="mb-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg text-sm text-green-700 text-center font-semibold animate-pulse">
          ✨ מוכן להגשה!
        </div>
      )}

      <div className="flex-1 overflow-y-auto mb-4 pr-2">
        {selected.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            בחר מועמדים כדי לראות את הצבעתך כאן 👈
          </p>
        ) : (
          <ul className="space-y-2">
            {selected.map((candidate, index) => (
              <li
                key={candidate.id}
                className="flex gap-2 bg-white p-2 rounded-lg text-sm border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all"
              >
                <img
                  src={candidate.photoUrl}
                  alt={candidate.name}
                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 text-xs line-clamp-1">{candidate.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">#{index + 1}</div>
                </div>
                <button
                  onClick={() => onRemove(candidate.id)}
                  className="text-red-500 hover:text-red-700 font-bold px-1 flex-shrink-0 hover:bg-red-50 rounded transition-colors"
                  title="הסר"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {count > 0 && (
        <button
          onClick={onClear}
          className="w-full py-2 px-3 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium transition-colors border border-red-200"
        >
          נקה הכל
        </button>
      )}
    </div>
  )
}
