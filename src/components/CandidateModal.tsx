import { Candidate } from '../types'

interface CandidateModalProps {
  candidate: Candidate | null
  onClose: () => void
}

export default function CandidateModal({ candidate, onClose }: CandidateModalProps) {
  if (!candidate) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-500 text-white p-6 flex justify-between items-start gap-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{candidate.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-blue-700 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 transition-colors"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {/* Candidate Photo */}
          <div className="mb-6">
            <img
              src={candidate.photoUrl}
              alt={candidate.name}
              className="w-full max-w-sm h-auto rounded-lg shadow-md mx-auto"
            />
          </div>

          {/* Bio Section */}
          {candidate.bio && (
            <div className="mb-6">
              <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{candidate.bio}</p>
            </div>
          )}

          {/* Social Links */}
          {candidate.socialLinks && Object.keys(candidate.socialLinks).length > 0 && (
            <div className="mb-6">
              <div className="flex gap-4 flex-wrap">
                {candidate.socialLinks.website && (
                  <a
                    href={candidate.socialLinks.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
                  >
                    🌐 אתר
                  </a>
                )}
                {candidate.socialLinks.facebook && (
                  <a
                    href={candidate.socialLinks.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
                  >
                    f Facebook
                  </a>
                )}
                {candidate.socialLinks.instagram && (
                  <a
                    href={candidate.socialLinks.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-pink-50 text-pink-700 rounded-lg hover:bg-pink-100 transition-colors font-medium text-sm"
                  >
                    📷 Instagram
                  </a>
                )}
                {candidate.socialLinks.twitter && (
                  <a
                    href={candidate.socialLinks.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors font-medium text-sm"
                  >
                    𝕏 X/Twitter
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
