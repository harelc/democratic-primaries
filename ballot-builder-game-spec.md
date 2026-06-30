# 🗳️ Ballot Builder Game Specification

## Overview
A fast, fun interactive game where participants build their own 6-8 candidate ballot from 47 Democratic Party of Israel primary candidates. After submission, they instantly see aggregate voting pattern analytics and personalized insights.

---

## Game Flow

### Phase 1: Build Your Ballot
**Goal:** Select 6-8 candidates from 47-candidate list

**UI Elements:**
- Candidate grid (card-based, searchable/filterable)
- Ballot sidebar showing:
  - Current selections (count: X/6-X/8)
  - Visual indicator when valid (6-8 selected)
  - Clear button for each selection
- Submit button (only active when 6-8 candidates selected)
- Timer (optional): Counts up from 0:00, shown on final screen

**Candidate Card Format:**
```
[Candidate Photo/Avatar]
Name
[Optional: 1-line bio or role]
```

**Interaction:**
- Click candidate card to add/remove from ballot
- Visual feedback when selected (highlight, checkmark, color change)
- Search/filter candidates (optional: by name, region, background)

**Optional Micro-Challenges** (before voting):
- "Speed Run: Build in under 2 minutes"
- "Balance: Pick at least X women" 
- "Geographic: Pick from 3+ regions"
- Toggles on/off, shows completion status

---

### Phase 2: Instant Analytics Reveal
**Triggered on submit.** Shows insights immediately in sequence:

#### Section 1: Your Picks vs. Aggregate
**Display:**
- Your 6-8 candidates in a list/grid
- For each candidate: **"Picked by X% of all players"**
- Color-code:
  - 🟢 Green (60%+): Consensus pick
  - 🟡 Yellow (30-59%): Popular
  - 🔵 Blue (10-29%): Niche
  - 🔴 Red (<10%): Contrarian

**Example:**
```
✓ Alice Chen — 78% (Consensus)
✓ Bob Levi — 45% (Popular)
✓ Carol Nir — 8% (Contrarian)
...
```

#### Section 2: Co-Occurrence Heatmap
**Display:**
- Visual matrix or clustered visualization showing:
  - Which of YOUR candidates appear together in OTHER ballots?
  - Heat intensity = frequency of co-selection across all players
  - Highlight "combos" (e.g., "Alice + Bob appear together 67% of the time")

**Example:**
```
Your ballot co-occurrence:
Alice ↔ Bob: 67% (strong cluster)
Alice ↔ Carol: 12% (rarely together)
...
```

#### Section 3: Surprise Insights
**Personalized messages based on their ballot:**
- "You picked Alice + Bob, but they never appear together in other ballots!"
- "Your ballot is in the top 18% most unique combinations"
- "3 of your 8 picks are part of the same voting coalition"
- "You're the only one so far to pick this exact combination"
- "Your ballot matches the 'Left Coalition' bloc"

**Logic:**
- Rank ballot uniqueness percentile
- Identify co-occurrence anomalies
- Flag emerging coalition patterns

#### Section 4: Live Leaderboard
**Dynamic rankings across all players:**
- **Most-picked candidates** (top 10)
- **Least-picked candidates** (bottom 5, hidden gems)
- **Most unique ballots** (edit distance or uniqueness score)
- **Fastest builders** (if timer enabled)
- **Your rank:** "You're in top 15% for uniqueness!"

---

## Data Structure

### Candidate Object
```json
{
  "id": "candidate_001",
  "name": "Alice Chen",
  "bio": "Environmental lawyer, Tel Aviv",
  "photoUrl": "https://...",
  "region": "Tel Aviv",
  "background": "Law"
}
```

### Submission Object
```json
{
  "submissionId": "sub_001",
  "timestamp": "2026-06-30T14:23:45Z",
  "selectedCandidateIds": ["candidate_001", "candidate_005", ...],
  "timeToComplete": 145,
  "challengesMet": ["speed_run", "geographic_diversity"]
}
```

### Analytics (Server-side aggregation)
```json
{
  "candidatePickFrequency": {
    "candidate_001": 0.78,
    "candidate_002": 0.45,
    ...
  },
  "coOccurrenceMatrix": {
    "candidate_001_candidate_005": 0.67,
    ...
  },
  "totalSubmissions": 1247
}
```

---

## Technical Requirements

### Frontend (React)
- **State Management:** useState for ballot selection, phase tracking
- **Components:**
  - CandidateGrid (searchable, selectable cards)
  - BallotSidebar (current picks, count)
  - AnalyticsReveal (4 sections as tabs or scroll)
  - Leaderboard (live-updating rankings)
- **Styling:** Tailwind CSS (or CSS-in-JS)
- **Interactivity:** Smooth transitions between Phase 1 → Phase 2

### Backend (Netlify)
- **API Endpoints:**
  - `POST /api/submit-ballot` — Save submission, calculate analytics
  - `GET /api/analytics` — Fetch aggregated data for reveal
  - `GET /api/leaderboard` — Fetch rankings
- **Data Storage:** Netlify DB, Firestore, or Supabase (persistent across sessions)
- **Analytics Calculation:**
  - Co-occurrence frequency (Jaccard similarity or Pearson correlation)
  - Percentile ranking (uniqueness)
  - Coalition detection (clustering)

### Deployment
- **Host:** Netlify
- **Functions:** Netlify Functions for API endpoints
- **Database:** Netlify Postgres / Supabase (recommended for cross-filtering)

---

## Features Checklist

### MVP (Minimum Viable Product)
- [ ] Candidate list (47 candidates, with names + optional bios)
- [ ] Build ballot UI (select 6-8 candidates)
- [ ] Submit button
- [ ] Instant analytics reveal:
  - Your picks vs. aggregate %
  - Basic leaderboard (most-picked candidates)

### Nice-to-Have
- [ ] Co-occurrence heatmap visualization
- [ ] Surprise insights (personalized messages)
- [ ] Speed timer
- [ ] Search/filter candidates
- [ ] Optional challenges
- [ ] Uniqueness percentile scoring
- [ ] Coalition detection

### Polish
- [ ] Animations (slide-in cards, reveal effects)
- [ ] Share ballot to social media
- [ ] Candidate photos
- [ ] Responsive mobile design
- [ ] Dark mode

---

## Input Data Required

To build this, you'll need to provide:

1. **Candidate List** (CSV or JSON):
   ```
   id, name, bio (optional), region (optional), photoUrl (optional)
   1, Alice Chen, Environmental lawyer, Tel Aviv, https://...
   2, Bob Levi, ...
   ...
   ```

2. **Configuration:**
   - Min candidates: 6
   - Max candidates: 8
   - Total candidates: 47
   - Optional: Challenge rules
   - Optional: Coalition labels

---

## Example User Journey

1. **Player opens game** → Sees 47 candidate cards in a grid
2. **Player selects 8 candidates** → Sidebar updates count, submit button activates
3. **Player clicks submit** → Page transitions to analytics reveal (smooth animation)
4. **Phase 2 loads:**
   - "Your Picks vs. Aggregate" section (scrolls into view)
   - "Co-Occurrence" tab (clickable)
   - "Surprise Insights" reveal (personalized message)
   - "Live Leaderboard" (rankings, player's rank highlighted)
5. **Player explores leaderboard** → Sees top candidates, unique ballots, etc.
6. **Optional:** Player shares ballot → "I'm in the top 18% for uniqueness! 🗳️"

---

## Notes for Developer

- **Data Privacy:** Don't expose individual player ballots publicly; only aggregate stats
- **Real-time Updates:** Leaderboard should refresh as new submissions come in
- **Scalability:** Design for 1000+ simultaneous players
- **Edge Cases:**
  - What if a candidate is picked 0 times? (Show rare badge)
  - What if all ballots are identical? (Leaderboard shows ties)
  - What if < 10 submissions? (Show "loading..." or sample data)
