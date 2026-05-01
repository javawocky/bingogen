# MotoBingo — Steering

Scratchpad for ideas, decisions, and direction. Items that get confirmed move to `requirements.md`.

---

## Vision

A **motocross bingo game** built around AMA Supercross (SX), SuperMotocross (SMX), and Pro Motocross races. Community-driven square suggestions, admin-curated boards, per-user randomised cards, live scoring on race day.

## Context

- The app is shared on **X (Twitter)** — linked from posts
- Managed by a single admin who runs the games
- Frontend on **Cloudflare Pages**, backend on **Cloudflare Workers**
- Target audience: motocross fans, tens of users initially

---

## Hierarchy

```
Championship (SX / SMX / Pro MX)
  └── Season (e.g. 2026)
       └── Round (e.g. "Anaheim 1 — Jan 10 2026")
            ├── Suggestions
            ├── Board (selected suggestions)
            └── Player boards (randomised per user)
```

- **3 championships**: SX, SMX, Pro Motocross — each tracked separately
- **Seasons**: yearly, admin can reset via "new season" button
- **Rounds**: individual race events within a season
- **Cumulative leaderboard**: points carry across rounds within a championship season
- **Round history**: past rounds remain viewable with scores

---

## Game Flow

### Phase 1 — Suggestion Gathering
- Admin creates a new round: **event name**, **event date**, **phase cutoff dates**
- Anyone can submit square suggestions (anonymous, CSRF token required)
- Suggestions are **hidden by default** — only admins see them
- Admin reviews: **approve** (make visible to all) or **reject** (spam/abuse)
- Once approved, all visitors can see the suggestion
- Runs until Phase 2 cutoff date

### Phase 2 — Board Allocation
- New suggestions are **locked**
- Admin can still **edit suggestion text** — updates propagate to all user boards
- Admin **selects suggestions** (checkbox) to include in the board pool — board size is dynamic
- If admin swaps a square, user boards update **intelligently** (replace only the affected square, don't re-randomise)
- Each user gets a **unique board** with centre square always **"Free"**
- Remaining squares **randomly assigned** from the selected pool
- **New players can still join** — admin adds them, they get a random board
- Runs until Phase 3 cutoff

### Phase 3 — Race Day
- **No new players** can join
- Admin marks suggestions as **"Complete"** as events happen
- Completed squares update on **all user boards** (via polling)
- Users see their board + **leaderboard**
- Players with **bingo are clearly indicated** on the leaderboard

### Scoring
- **Valid scoring lines**: all rows, all columns, and the **two main diagonals** (top-left↘bottom-right, top-right↙bottom-left — both pass through Free square)
- **Free square** always counts as completed
- **1 point** per consecutive pair of completed squares along a valid line
- **100 points for bingo** — complete line (replaces pair points for that line)
- No bonus points
- Scores from all lines **stack**
- Diagonal pairs only count along the two main diagonals
- Multiple bingos allowed (unlikely but possible)
- Leaderboard sorted by score descending, no tie-breaking
- Points are **cumulative across rounds** within a championship season

### Suggestion Lifecycle
```
submitted (hidden) → approved (visible) → selected for board → completed on race day
                   → rejected (discarded)
```

---

## Sharing & Board Links

- Each user's board has a **unique shareable URL** (e.g. `/round/anaheim-1/board/rider_handle`)
- **Share to X button** — lets users post their board link to Twitter
- **PNG download** — optional, export board as image (existing html2canvas feature)

---

## Development Phases

### Dev Phase 1 — Manual Mode (build first)
- **Admin auth**: simple login page, predefined username/password (Worker env vars)
- **Session**: JWT issued on login, sent as Authorization header
- **Player identification** (frontend only): user enters X handle → frontend matches against user list → cookie stored → their board shown prominently, highlighted on leaderboard. No match = spectator mode.
- **Suggestions**: anyone can submit (anonymous), CSRF token to prevent bot spam. Admin curates.
- **User management**: admin manually adds users (X handle + display name), central user base across rounds
- **Public access**: anyone can view user list, click a user, see their board and progress

#### Security (Phase 1)
- **Admin endpoints** (writes): JWT required, validated per request
- **Public endpoints** (reads): no auth
- **Suggestion endpoint**: CSRF token required
- **CORS**: locked to Cloudflare Pages domain
- **Rate limiting**: Cloudflare built-in or Worker-level throttle
- **Input validation**: sanitise all inputs server-side
- **HTTPS**: automatic via Cloudflare
- **Secrets**: credentials + JWT secret in Worker env vars (encrypted at rest)

### Dev Phase 2 — Authenticated Mode (future)
- X OAuth 2.0 for player login (or Auth0 for multi-platform)
- Players self-register, submit suggestions with identity, upvote
- Admin retains superpowers

---

## Architecture

### Frontend Approach
- **Single-page app** — no routing, use conditional rendering for views
- **Maintain current visual style** — clean, minimal, blue accent, grid layouts
- See `development.md` for testing and quality requirements

### Target Stack
- **Frontend**: Angular on Cloudflare Pages
- **Backend**: Cloudflare Workers (TypeScript)
- **Data**: Cloudflare KV (game state as JSON blobs, 25 MB max per value)
- **Auth (Phase 1)**: username/password → JWT
- **Updates**: polling (no WebSockets)

### Why KV
- Simple get/put for JSON blobs
- Fast edge-cached reads
- Free tier: 100k reads/day, 1k writes/day
- No schema to manage
- R2 available later for binary assets if needed

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-01 | Backend on Cloudflare Workers + KV | Frontend already on CF, unified stack, free tier sufficient |
| 2026-05-01 | No real-time / polling only | Non-real-time game, avoids Durable Objects complexity + cost |
| 2026-05-01 | Free tier first | Tens of users, scale later if needed |
| 2026-05-01 | X OAuth deferred to Phase 2 | Simple admin login first, layer auth later |
| 2026-05-01 | Admin = username/password + JWT | Simplest viable auth for Phase 1 |
| 2026-05-01 | Player ID via cookie (no auth) | Frontend-only personalisation, boards are public anyway |
| 2026-05-01 | Anonymous suggestions + CSRF | Low friction for users, admin curates quality |
| 2026-05-01 | 3 championships, seasonal reset | SX / SMX / Pro MX tracked separately, cumulative points per season |
| 2026-05-01 | Shareable board URLs + X share button | Social visibility, players show off boards on Twitter |
| 2026-05-01 | Consecutive pairs scoring, 100pt bingo | Simple, fair, no arguments |

---

## Open Questions

- **Upvoting in Phase 1**: do we still want upvoting on approved suggestions, or skip it since admin curates directly? (Could add it in Phase 2 when players have identity)
- **Board size limits**: minimum/maximum number of squares the admin can select?
- **Season archive**: how much history to keep? All seasons, or just current + last?
