# MotoBingo — Development Guidelines

## SPA Approach

- Keep as a **single-page application** — no Angular routing for now
- Use component visibility toggling (ngIf / conditional rendering) for different views
- Maintain the current visual style (clean, minimal, blue buttons, grid-based layouts)

## Testing & Quality

Every feature must:

1. **Compile without errors** — run `ng build` before considering a feature complete
2. **Have unit tests** — write Jasmine/Karma tests for each new component, service, and utility
3. **Pass all tests** — run `ng test` and confirm green before merging
4. **Update E2E test cases** — add/update entries in `e2e/test-cases.md` for any new or changed behaviour
5. **Write Playwright tests** — implement corresponding Playwright specs in `e2e/` for the feature (tests will be run manually, not as part of the build)
6. **Play a system beep** — run `afplay /System/Library/Sounds/Glass.aiff` before starting the servers for manual testing, so the user knows it's ready

### Test expectations per feature

| Feature area | What to test |
|---|---|
| Scoring logic | All scoring scenarios: pairs, bingo, multi-line, free square, edge cases |
| Board generation | Correct size, free square placement, randomisation, uniqueness per user |
| Board updates | Square swap doesn't re-randomise, completed squares propagate |
| Admin actions | Create round, add/remove users, approve/reject suggestions, mark complete |
| Player identification | Cookie set/read, match against user list, spectator fallback |
| Suggestion submission | CSRF validation, input sanitisation |
| Leaderboard | Correct ordering, bingo indication, cumulative scoring |
| API service | HTTP calls, error handling, JWT attachment on admin requests |
| Phase transitions | Correct lockdowns per phase (suggestions, player joins, etc.) |

### Running checks

```bash
# Compile check
ng build

# Unit tests
ng test

# Single run (CI-friendly)
ng test --watch=false --browsers=ChromeHeadless

# E2E tests (Playwright)
npx playwright test

# E2E with UI mode (interactive)
npx playwright test --ui
```
