# MotoBingo — API & Data Model

## KV Key Structure

All game state stored in Cloudflare KV as JSON blobs.

```
admins                                → ["admin_username"]
users                                 → { users[] }
championships                         → { championships[] }
championship:{champId}:seasons        → { seasons[] }
season:{seasonId}:rounds              → { rounds[] }
round:{roundId}                       → { round detail + suggestions + board pool }
round:{roundId}:boards                → { userId → board mapping }
csrf:{token}                          → { expires } (short TTL)
```

---

## Data Models

### User
```json
{
  "id": "uuid",
  "xHandle": "rider_fan_42",
  "displayName": "Mike",
  "createdAt": "2026-01-15T00:00:00Z"
}
```

### Championship
```json
{
  "id": "uuid",
  "name": "Supercross",
  "shortCode": "SX"
}
```

### Season
```json
{
  "id": "uuid",
  "championshipId": "uuid",
  "year": 2026,
  "active": true
}
```

### Round
```json
{
  "id": "uuid",
  "seasonId": "uuid",
  "name": "Anaheim 1",
  "eventDate": "2026-01-10",
  "phase": "suggestions" | "boards" | "raceday" | "complete",
  "phaseDates": {
    "suggestionsEnd": "2026-01-08T00:00:00Z",
    "boardsEnd": "2026-01-10T12:00:00Z"
  },
  "boardSize": 3,
  "suggestions": [
    {
      "id": "uuid",
      "text": "Jett Lawrence crashes in whoops",
      "status": "pending" | "approved" | "rejected",
      "selected": false,
      "completed": false,
      "createdAt": "2026-01-06T00:00:00Z"
    }
  ],
  "playerIds": ["userId1", "userId2"]
}
```

### Boards (per round)
```json
{
  "roundId": "uuid",
  "boards": {
    "userId1": {
      "squares": [
        { "position": 0, "suggestionId": "uuid" },
        { "position": 1, "suggestionId": "uuid" },
        { "position": 2, "suggestionId": "uuid" },
        { "position": 3, "suggestionId": "uuid" },
        { "position": 4, "suggestionId": "FREE" },
        { "position": 5, "suggestionId": "uuid" },
        { "position": 6, "suggestionId": "uuid" },
        { "position": 7, "suggestionId": "uuid" },
        { "position": 8, "suggestionId": "uuid" }
      ],
      "score": 0,
      "hasBingo": false
    }
  }
}
```

The centre position is always `FREE`. For a dynamic NxN board, centre = `Math.floor(n*n / 2)`.

Completed status lives on the suggestion in the round — when the admin marks a suggestion complete, every board that contains it is affected. Score is recalculated on read or on admin action.

---

## API Endpoints

Base: `/api/v1`

### Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/championships` | List all championships |
| GET | `/championships/:id/seasons` | List seasons for a championship |
| GET | `/seasons/:id/rounds` | List rounds for a season |
| GET | `/seasons/:id/leaderboard` | Cumulative leaderboard for a season |
| GET | `/rounds/:id` | Round detail (phase, suggestions if approved, board size) |
| GET | `/rounds/:id/leaderboard` | Round leaderboard |
| GET | `/rounds/:id/boards/:userId` | A specific user's board for a round |
| GET | `/users` | List all users |
| POST | `/rounds/:id/suggestions` | Submit a suggestion (anonymous, CSRF required) |
| GET | `/csrf` | Get a CSRF token (stored in KV with short TTL) |

### Admin (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login → returns JWT |
| POST | `/users` | Add a user (xHandle + displayName) |
| PUT | `/users/:id` | Edit a user |
| DELETE | `/users/:id` | Remove a user |
| POST | `/championships` | Create a championship |
| POST | `/championships/:id/seasons` | Create a season |
| POST | `/seasons/:id/rounds` | Create a round |
| PUT | `/rounds/:id` | Update round (name, dates, phase) |
| PUT | `/rounds/:id/phase` | Advance round phase |
| PUT | `/rounds/:id/suggestions/:sid` | Edit suggestion (text, status, selected) |
| DELETE | `/rounds/:id/suggestions/:sid` | Delete a suggestion |
| POST | `/rounds/:id/players` | Add player(s) to a round |
| DELETE | `/rounds/:id/players/:userId` | Remove player from a round |
| POST | `/rounds/:id/generate-boards` | Generate boards for all players |
| PUT | `/rounds/:id/suggestions/:sid/complete` | Mark a suggestion as complete |

---

## Auth Flow (Phase 1)

```
1. POST /api/v1/auth/login  { username, password }
2. Worker validates against env vars ADMIN_USERNAME, ADMIN_PASSWORD
3. Returns { token: "jwt..." } signed with env var JWT_SECRET
4. Frontend stores token in sessionStorage
5. All admin requests send: Authorization: Bearer <token>
6. Worker validates JWT signature + expiry on every admin endpoint
7. JWT expires after 8 hours
```

---

## CSRF Flow (Suggestions)

```
1. GET /api/v1/csrf → { token: "random-string" }
2. Token stored in KV with 10-minute TTL
3. POST /api/v1/rounds/:id/suggestions sends token in X-CSRF-Token header
4. Worker validates token exists in KV, then deletes it (single use)
```

---

## Score Calculation

Scores are recalculated when:
- Admin marks a suggestion as complete
- A board is requested (GET)

Algorithm:
```
for each valid line (rows, columns, two main diagonals):
  completed = squares in line that are completed or FREE
  if all squares in line are completed:
    lineScore = 100  (bingo)
  else:
    lineScore = count of consecutive completed pairs in the line
  totalScore += lineScore
```

---

## Polling Strategy

Frontend polls for updates during race day:
- `GET /rounds/:id` — check for newly completed suggestions
- `GET /rounds/:id/boards/:userId` — get updated board + score
- `GET /rounds/:id/leaderboard` — updated rankings
- Poll interval: **10 seconds** during race day, **60 seconds** otherwise
- Stop polling when round phase is `complete`
