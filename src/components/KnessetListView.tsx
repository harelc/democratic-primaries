import { useMemo } from 'react'
import { Candidate } from '../types'
import { buildKnessetList } from '../utils/knessetList'

interface KnessetListViewProps {
  candidates: Candidate[]
  pickFrequency: Record<string, number>
}

const getGroupStyle = (g: string | null) => {
  if (!g) return { pill: 'bg-blue-100 text-blue-800' }
  if (g.includes('מרצ')) return { pill: 'bg-red-100 text-red-800' }
  if (g.includes('כפרי')) return { pill: 'bg-green-100 text-green-800' }
  if (g.includes('מיעוטים')) return { pill: 'bg-purple-100 text-purple-800' }
  return { pill: 'bg-blue-100 text-blue-800' }
}

export default function KnessetListView({ candidates, pickFrequency }: KnessetListViewProps) {
  const list = useMemo(() => buildKnessetList(candidates, pickFrequency), [candidates, pickFrequency])

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-xs text-slate-500 mb-4 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        סימולציה של הרשימה הסופית לכנסת: יו״ר המפלגה במקום הראשון, ולאחריו חלוקה מתחלפת בין נשים וגברים לפי תוצאות הפריימריז,
        עם מקומות שמורים לנציגי מרצ (6, 8, 14) ול-4 נציגי מיעוטים ונציג/ת כפרי אחד/ת, ממוינים יחד (12, 13, 18, 23, 27). מקום שמור שמופר את סדר ההתחלפות ״מתוקן״
        על ידי שני מקומות רצופים של המגדר הנגדי מיד לאחריו.
      </p>
      <div className="space-y-2">
        {list.map(entry => {
          const group = entry.candidate.group || null
          const { pill: pillClass } = getGroupStyle(group)
          return (
            <div
              key={entry.position}
              className={`flex items-center gap-3 p-3 rounded-xl shadow-sm border transition-shadow hover:shadow-md ${
                entry.isChairman
                  ? 'bg-blue-50 border-blue-200'
                  : entry.isReserved
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-white border-slate-100'
              }`}
            >
              <span className="text-slate-400 font-mono text-sm w-7 text-right flex-shrink-0">{entry.position}</span>
              <img
                src={entry.candidate.photoUrl}
                alt={entry.candidate.name}
                className="w-9 h-9 rounded-full object-cover flex-shrink-0"
              />
              <span className={`font-medium text-sm flex-1 min-w-0 truncate ${entry.isChairman ? 'text-blue-800' : ''}`}>
                {entry.candidate.name}
                {entry.isChairman && <span className="text-xs font-normal text-blue-600 mr-2">יו״ר המפלגה</span>}
              </span>
              {group && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${pillClass}`}>
                  {group}
                </span>
              )}
              {entry.isReserved && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 bg-amber-200 text-amber-900"
                  title={entry.reservedLabel}
                >
                  שריון
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
