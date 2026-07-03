import React, { useState } from 'react'

export function PrivacyLink() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hover:text-slate-600 transition-colors underline-offset-2 hover:underline"
      >
        פרטיות ומידע
      </button>
      {open && <PrivacyModal onClose={() => setOpen(false)} />}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="font-bold text-slate-800 mb-1.5 text-sm">{title}</h3>
      <div className="text-slate-600 text-sm leading-relaxed space-y-1">{children}</div>
    </div>
  )
}

export default function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center rounded-t-2xl">
          <h2 className="text-lg font-bold text-slate-900">פרטיות ואבטחת מידע</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5">

          <Section title="מה אנחנו אוספים">
            <p>כאשר אתם מצביעים, אנו שומרים:</p>
            <ul className="list-disc list-inside space-y-1 mt-1 text-slate-600">
              <li><strong>בחירת המועמדים</strong> — אילו 6–8 מועמדים בחרתם. הבחירה אנונימית לחלוטין ואינה מזוהה אתכם.</li>
              <li><strong>זמן מילוי</strong> — כמה שניות לקח למלא את הטופס (לצורך זיהוי בוטים).</li>
              <li><strong>גיבוב כתובת IP</strong> — ראו הסבר מפורט למטה.</li>
            </ul>
            <p className="mt-2">אנו <strong>לא</strong> אוספים: שם, אימייל, מספר טלפון, מיקום מדויק, זהות אישית כלשהי.</p>
          </Section>

          <Section title="גיבוב כתובת IP — מה זה אומר?">
            <p>
              כתובת ה-IP שלכם <em>אינה נשמרת</em> בצורתה המקורית. במקום זאת, אנו מפעילים עליה פונקציית גיבוב
              חד-כיוונית (SHA-256) עם מלח קבוע:
            </p>
            <code className="block bg-slate-50 rounded px-3 py-2 mt-2 text-xs font-mono text-slate-700 leading-relaxed">
              hash = SHA256(ip_address + "democratim-salt")
            </code>
            <p className="mt-2">
              תוצאת הגיבוב היא מחרוזת של 64 תווים הקסדצימליים. <strong>לא ניתן לשחזר</strong> ממנה את כתובת ה-IP המקורית —
              זה תכונה מתמטית של פונקציות גיבוב קריפטוגרפיות. הגיבוב נשמר אך ורק למניעת הצבעה כפולה
              (הצבעה אחת לכל כתובת לכל אורך חיי האתר) ואינו משמש לשום מטרה אחרת.
            </p>
          </Section>

          <Section title="למה אנחנו אוספים את זה?">
            <ul className="list-disc list-inside space-y-1">
              <li><strong>ניתוח דפוסי הצבעה</strong> — המטרה הראשית: להבין אילו שילובי מועמדים נפוצים, לזהות קהילות הצבעה ומועמדים מרכזיים.</li>
              <li><strong>מניעת ספאם</strong> — הגיבוב מאפשר לנו לאכוף הגבלה של הצבעה אחת לכל כתובת IP לכל אורך חיי האתר, ללא זיהוי המשתמש.</li>
              <li><strong>אנטי-בוט</strong> — Google reCAPTCHA v3 פועל ברקע כדי לסנן בוטים. ראו מדיניות הפרטיות של Google.</li>
            </ul>
          </Section>

          <Section title="מי רואה את הנתונים?">
            <p>
              הנתונים הגולמיים (רשימת הצבעות עם גיבובי IP) נגישים רק למנהל האתר דרך ממשק מוגן בסיסמה.
              הניתוח המצטבר — כמה פעמים נבחר כל מועמד, שיעורי שילוב — מוצג לכל המצביעים לאחר הצבעתם.
            </p>
          </Section>

          <Section title="אחסון ומחיקה">
            <p>
              הנתונים מאוחסנים ב-<strong>Turso</strong> (מסד נתונים SQLite בענן, שרתים באיחוד האירופי).
              הנתונים ישמרו לאורך תקופת הפריימריז ויימחקו בתומה.
              אין גיבויים אוטומטיים המועברים לצדדים שלישיים.
            </p>
          </Section>

          <Section title="מה נשמר אצלכם בדפדפן?">
            <p>
              ב-<code className="bg-slate-100 px-1 rounded text-xs">localStorage</code> נשמרים:
            </p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li><code className="bg-slate-100 px-1 rounded text-xs">has_voted</code> — דגל שמסמן שהצבעתם (כדי להציג לכם את התוצאות בחזרה).</li>
              <li><code className="bg-slate-100 px-1 rounded text-xs">voted_candidates</code> — מזהי המועמדים שבחרתם, כדי שהניתוח האישי שלכם יוצג נכון.</li>
            </ul>
            <p className="mt-1.5">אתם יכולים למחוק אותם בכל עת דרך כלי המפתח של הדפדפן שלכם.</p>
          </Section>

          <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 text-center">
            אתר זה אינו רשמי ואינו קשור למפלגת הדמוקרטים. לשאלות: צרו קשר עם מנהל האתר.
          </div>
        </div>
      </div>
    </div>
  )
}
