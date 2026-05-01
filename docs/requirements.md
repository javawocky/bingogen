# MotoBingo — Requirements

## Dev Phase 1 — Manual Mode

### Users & Auth
- [ ] Admin login page (username/password → JWT)
- [ ] Admin session management (JWT in sessionStorage, 8hr expiry)
- [ ] Player identification (enter X handle → cookie → personalised view)
- [ ] Spectator mode (no handle match → browse-only)

### Championships & Seasons
- [ ] Admin can create championships (SX, SMX, Pro MX)
- [ ] Admin can create seasons per championship (yearly)
- [ ] Admin can reset/start a new season
- [ ] Cumulative leaderboard per championship season

### Rounds
- [ ] Admin creates a round (name, event date, phase cutoff dates)
- [ ] Round phases: suggestions → boards → raceday → complete
- [ ] Admin advances phases manually
- [ ] Round history viewable after completion

### Suggestions
- [ ] Anyone can submit suggestions (anonymous, CSRF protected)
- [ ] Suggestions hidden by default (admin-only visibility)
- [ ] Admin approves/rejects suggestions
- [ ] Admin edits suggestion text (propagates to boards)
- [ ] Admin selects suggestions for the board pool (checkbox)
- [ ] Suggestions locked in boards phase (admin can still edit text)

### Boards
- [ ] Dynamic board size based on admin's selected suggestion count
- [ ] Centre square always "Free"
- [ ] Each player gets a unique randomised board
- [ ] Intelligent board updates when admin swaps a square (no full re-randomise)
- [ ] Late-joining players (Phase 2) get a random board

### Race Day
- [ ] Admin marks suggestions as complete
- [ ] All player boards update via polling
- [ ] No new players can join

### Scoring
- [ ] 1 point per consecutive completed pair along valid lines
- [ ] Valid lines: rows, columns, two main diagonals (through Free)
- [ ] Free square always counts as completed
- [ ] 100 points for bingo (replaces pair points on that line)
- [ ] Multiple bingos stack
- [ ] Scores cumulative across rounds in a season

### Leaderboard
- [ ] Per-round leaderboard (score descending)
- [ ] Per-season cumulative leaderboard
- [ ] Bingo players clearly indicated
- [ ] No tie-breaking

### Sharing
- [ ] Unique shareable URL per user board per round
- [ ] Share to X button
- [ ] PNG download (existing html2canvas)

### Frontend
- [ ] Single-page app (no routing, conditional rendering)
- [ ] Maintain current visual style
- [ ] Admin UI (manage rounds, users, suggestions, mark complete)
- [ ] Public UI (view boards, leaderboard, submit suggestions)

### Backend
- [ ] Cloudflare Workers (TypeScript)
- [ ] Cloudflare KV for all state
- [ ] CORS locked to Pages domain
- [ ] Rate limiting on suggestion endpoint
- [ ] Input validation on all endpoints

## Non-Functional Requirements
- Must work offline-capable for frontend (static assets)
- Deployable as Cloudflare Pages + Workers
- Unit tests for every feature (Jasmine/Karma)
- Code must compile (`ng build`) before feature is complete
- All tests must pass (`ng test`) before feature is complete
