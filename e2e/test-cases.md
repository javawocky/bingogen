# MotoBingo — Playwright E2E Test Cases

Test cases for implementation. Organised by feature area.

---

## 1. Public Visitor (Spectator)

### 1.1 Landing Page
- [ ] Page loads without errors
- [ ] Championship list is visible
- [ ] Can select a championship and see its seasons
- [ ] Can select a season and see rounds
- [ ] Can select a round and see the leaderboard and user list

### 1.2 Viewing Boards
- [ ] Click a user in the user list → their board is displayed
- [ ] Board shows correct grid size (NxN)
- [ ] Centre square shows "Free"
- [ ] Completed squares are visually distinct
- [ ] Board URL is shareable (navigate directly to `/round/:id/board/:userId`)

### 1.3 Leaderboard
- [ ] Leaderboard shows all players for the round
- [ ] Players sorted by score descending
- [ ] Bingo players are clearly indicated (visual badge/icon)
- [ ] Cumulative season leaderboard is accessible

### 1.4 Suggestions
- [ ] Suggestion input is visible during suggestions phase
- [ ] Can submit a suggestion (anonymous)
- [ ] Submitted suggestion is not visible in the public list (hidden by default)
- [ ] Cannot submit without CSRF token (mock expired/missing token)
- [ ] Cannot submit empty suggestion
- [ ] Suggestion input is hidden/disabled during boards and raceday phases

---

## 2. Player Identification

### 2.1 Identify Flow
- [ ] "Enter your X handle" input is visible
- [ ] Entering a valid handle (exists in user list) → board shown prominently
- [ ] Player highlighted on leaderboard
- [ ] Cookie is set — refreshing page retains identification
- [ ] Entering an invalid handle → spectator mode, no error (graceful)

### 2.2 Cookie Persistence
- [ ] Return visit with cookie → auto-identified, board shown
- [ ] Clear cookie → back to spectator mode
- [ ] Change handle → updates cookie, shows new player's board

---

## 3. Admin Login

### 3.1 Login Page
- [ ] Login form is accessible (e.g. via admin link/button)
- [ ] Valid credentials → redirected to admin view, JWT stored
- [ ] Invalid credentials → error message shown
- [ ] Empty fields → validation prevents submission

### 3.2 Session
- [ ] Admin UI elements visible after login
- [ ] Refreshing page retains admin session (sessionStorage)
- [ ] Logout clears session, returns to public view

---

## 4. Admin — User Management

### 4.1 Add User
- [ ] Can add a user with X handle and display name
- [ ] New user appears in the user list
- [ ] Cannot add duplicate X handle
- [ ] Cannot add with empty fields

### 4.2 Edit User
- [ ] Can edit display name
- [ ] Can edit X handle
- [ ] Changes reflected immediately in user list

### 4.3 Delete User
- [ ] Can delete a user
- [ ] Confirmation prompt before deletion
- [ ] User removed from list

---

## 5. Admin — Championship & Season Management

### 5.1 Championships
- [ ] Can create a championship (name, short code)
- [ ] Championship appears in the list
- [ ] Cannot create duplicate short code

### 5.2 Seasons
- [ ] Can create a season for a championship (year)
- [ ] Can start a new season (reset)
- [ ] Previous season remains in history

---

## 6. Admin — Round Management

### 6.1 Create Round
- [ ] Can create a round (name, event date, phase cutoff dates)
- [ ] Round appears in the season's round list
- [ ] Round starts in "suggestions" phase

### 6.2 Phase Transitions
- [ ] Can advance from suggestions → boards
- [ ] Can advance from boards → raceday
- [ ] Can advance from raceday → complete
- [ ] Cannot go backwards (or confirm if intentional)
- [ ] UI updates to reflect current phase restrictions

---

## 7. Admin — Suggestion Curation

### 7.1 Review Suggestions
- [ ] Admin sees all suggestions (including hidden/pending)
- [ ] Can approve a suggestion → becomes visible publicly
- [ ] Can reject a suggestion → removed from list
- [ ] Can edit suggestion text
- [ ] Edited text updates on any boards that include it

### 7.2 Board Pool Selection
- [ ] Can toggle "selected" checkbox on approved suggestions
- [ ] Selected count shown (determines board size)
- [ ] Cannot select fewer than 8 (minimum for 3x3 minus free square)

---

## 8. Admin — Board Generation

### 8.1 Generate Boards
- [ ] "Generate boards" button available in boards phase
- [ ] Generates unique board per player
- [ ] Each board has correct grid size
- [ ] Centre square is "Free"
- [ ] No duplicate suggestions on a single board
- [ ] Different players have different arrangements

### 8.2 Board Updates
- [ ] Admin removes a selected suggestion and adds another → affected boards update (only the swapped square changes)
- [ ] Remaining squares on affected boards stay in place

### 8.3 Late Joiners
- [ ] Admin adds a player during boards phase → player gets a random board
- [ ] Cannot add players during raceday phase

---

## 9. Admin — Race Day

### 9.1 Mark Complete
- [ ] Admin sees list of board pool suggestions with "Complete" toggle
- [ ] Marking a suggestion complete updates all player boards (poll and verify)
- [ ] Scores recalculate after marking complete
- [ ] Leaderboard updates with new scores
- [ ] Bingo detection works — player flagged when they achieve a full line

### 9.2 Scoring Verification
- [ ] Free square counts as completed for adjacency
- [ ] Consecutive pairs in a row score correctly
- [ ] Consecutive pairs in a column score correctly
- [ ] Consecutive pairs on main diagonals score correctly
- [ ] Non-main-diagonal adjacency does NOT score
- [ ] Bingo line scores 100 (replaces pair points for that line)
- [ ] Multiple bingo lines stack (200 for two lines)
- [ ] Mixed scoring: bingo on one line + pairs on another

---

## 10. Sharing

### 10.1 Board URL
- [ ] Each board has a unique URL
- [ ] Navigating to the URL shows the correct board
- [ ] URL works for non-identified visitors (spectator view)

### 10.2 Share to X
- [ ] Share button is visible on a board view
- [ ] Clicking opens X/Twitter intent with pre-filled text and board URL
- [ ] Share text includes round name and player handle

### 10.3 PNG Download
- [ ] Download button is visible on a board view
- [ ] Clicking downloads a PNG of the board
- [ ] PNG renders correctly (grid, text, completed markers)

---

## 11. Polling & Live Updates

### 11.1 Race Day Polling
- [ ] Board auto-updates when admin marks a square complete (within poll interval)
- [ ] Leaderboard auto-updates with new scores
- [ ] Polling stops when round phase is "complete"

### 11.2 Phase Awareness
- [ ] UI reflects correct phase restrictions without page reload
- [ ] Suggestion form disappears when phase advances past suggestions

---

## 12. Responsive & Edge Cases

### 12.1 Mobile
- [ ] Layout is usable on mobile viewport (375px width)
- [ ] Board grid scales appropriately
- [ ] Touch interactions work (submit suggestion, identify, view boards)

### 12.2 Edge Cases
- [ ] Round with no suggestions → appropriate empty state
- [ ] Round with exactly 8 suggestions → minimum 3x3 board
- [ ] Player with no completed squares → score is 0
- [ ] All squares completed → maximum score calculated correctly
- [ ] Very long suggestion text → truncated/wrapped gracefully
