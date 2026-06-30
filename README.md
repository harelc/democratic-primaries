# 🗳️ Ballot Builder Game

An interactive ballot builder game for exploring voting patterns in the Democratic Party of Israel primary elections.

**[Live Demo](https://ballot-builder-game.netlify.app)**

## Features

### Game Mechanics
- **Ballot Construction** — Select 6-8 candidates from 47-candidate list
- **Instant Analytics** — See how your ballot compares to aggregated data
- **Spam Prevention** — reCAPTCHA integration to prevent botting
- **Real-time Leaderboard** — Explore voting patterns across all players

### Data Insights
- **Frequency Analysis** — See what percentage of players picked each candidate
- **Co-occurrence Patterns** — Discover which candidates appear together
- **Uniqueness Scoring** — Find out how unique your ballot is
- **Live Rankings** — Most-picked candidates, hidden gems, and more

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Security**: Google reCAPTCHA v3
- **Hosting**: Netlify
- **Database**: Netlify Postgres (for analytics)

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Populate Candidates Data

The app scrapes candidates from democrats.org.il using Puppeteer (headless browser):

```bash
npm run scrape:candidates
```

This will fetch the 47 candidates and save them to `src/data/candidates.json`.

### Run Dev Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Environment Setup

1. Get reCAPTCHA keys from [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Copy `.env.local.example` to `.env.local`
3. Add your reCAPTCHA site key and secret key:

```bash
VITE_RECAPTCHA_SITE_KEY=your_site_key_here
RECAPTCHA_SECRET_KEY=your_secret_key_here
```

## How It Works

### Phase 1: Build Your Ballot
Players select 6-8 candidates from a searchable grid. Real-time feedback shows their current selection count and validates when they're ready to submit.

### Phase 2: Verify with CAPTCHA
Before submission, players complete reCAPTCHA verification to prevent spam and botting.

### Phase 3: Analytics Reveal
Upon submission, players instantly see:
- How many voters picked each of their candidates
- Color-coded frequency bands (consensus, popular, niche, contrarian)
- Total submission count
- How their ballot ranks in uniqueness

## Data Structure

### Candidates
Located in `src/data/candidates.json`:
```json
{
  "id": "candidate_001",
  "name": "יאיר גולן",
  "bio": "מנהל המפלגה, עורך דין",
  "region": "תל אביב",
  "background": "משפט",
  "photoUrl": "https://..."
}
```

### API Endpoints (Netlify Functions)

- `POST /api/submit-ballot` — Save submission with CAPTCHA validation
- `GET /api/analytics` — Fetch aggregated voting data
- `GET /api/leaderboard` — Get rankings and statistics

## Important Disclaimer

⚠️ **This project is NOT affiliated with the Democratic Party of Israel or their official primary election process.** It is an independent, fan-created exploration tool for understanding voting patterns and collective decision-making. Data collected here is for analytical purposes only and should not be used for actual voting decisions.

## License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — Harel Cain

---

© 2026 Harel Cain | [Source Code](https://github.com/harelc/ballot-builder-game) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
