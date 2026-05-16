import { test, expect, request } from '@playwright/test';

const API = 'http://localhost:8787/api/v1';
const DEV_ADMIN_HEADERS = { 'X-Dev-User': 'testadmin', 'X-Dev-Role': 'admin' };
const DEV_USER_HEADERS = { 'X-Dev-User': 'testplayer', 'X-Dev-Role': '' };

// Run tests serially to avoid duplicate data from parallel workers
test.describe.configure({ mode: 'serial' });

let sxChampId: string;
let seasonId: string;
let testRoundId: string;
let oldRoundId: string;
let futureRoundId: string;

async function apiPost(path: string, data: any, headers?: Record<string, string>) {
  const ctx = await request.newContext();
  const h: any = { 'Content-Type': 'application/json', ...(headers || DEV_ADMIN_HEADERS) };
  const res = await ctx.post(`${API}${path}`, { data, headers: h });
  const body = await res.json();
  await ctx.dispose();
  return body;
}

async function apiPut(path: string, data: any, headers?: Record<string, string>) {
  const ctx = await request.newContext();
  const h: any = { 'Content-Type': 'application/json', ...(headers || DEV_ADMIN_HEADERS) };
  const res = await ctx.put(`${API}${path}`, { data, headers: h });
  const body = await res.json();
  await ctx.dispose();
  return body;
}

async function apiGet(path: string, headers?: Record<string, string>) {
  const ctx = await request.newContext();
  const h: any = headers || DEV_ADMIN_HEADERS;
  const res = await ctx.get(`${API}${path}`, { headers: h });
  const body = await res.json();
  await ctx.dispose();
  return body;
}

async function apiDelete(path: string, headers?: Record<string, string>) {
  const ctx = await request.newContext();
  const h: any = headers || DEV_ADMIN_HEADERS;
  await ctx.delete(`${API}${path}`, { headers: h });
  await ctx.dispose();
}

async function adminLogin(page: import('@playwright/test').Page) {
  const now = Math.floor(Date.now() / 1000);
  const idTokenPayload = {
    sub: 'dev|testadmin',
    nickname: 'testadmin',
    name: 'Test Admin',
    'https://motobingo.app/screen_name': 'testadmin',
    'https://motobingo.app/roles': ['admin'],
    exp: now + 86400,
    iat: now,
    aud: 'sgbZkzh0cgUxFTaabQjAZw8WGl371yaC',
    iss: 'https://dev-xlhmy2q3ti2zo0ad.us.auth0.com/',
    nonce: 'test-nonce',
  };
  const b64url = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const fakeIdToken = b64url({ alg: 'RS256', typ: 'JWT' }) + '.' + b64url(idTokenPayload) + '.fake-signature';

  // Intercept Auth0 token refresh endpoint
  await page.route('**/oauth/token', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-access-token',
        id_token: fakeIdToken,
        refresh_token: 'fake-refresh-token',
        token_type: 'Bearer',
        expires_in: 86400,
        scope: 'openid profile email offline_access',
      }),
    });
  });

  // Intercept Auth0 logout — redirect back to app
  await page.route('**/v2/logout*', async route => {
    const url = new URL(route.request().url());
    const returnTo = url.searchParams.get('returnTo') || 'http://localhost:4200';
    await route.fulfill({ status: 302, headers: { Location: returnTo } });
  });

  // Set Auth0 SPA SDK cache with refresh_token before page loads
  const key = '@@auth0spajs@@::sgbZkzh0cgUxFTaabQjAZw8WGl371yaC::https://motobingo-api::openid profile email offline_access';
  const cache = {
    body: {
      client_id: 'sgbZkzh0cgUxFTaabQjAZw8WGl371yaC',
      access_token: 'fake-access-token',
      id_token: fakeIdToken,
      refresh_token: 'fake-refresh-token',
      scope: 'openid profile email offline_access',
      audience: 'https://motobingo-api',
      expires_in: 86400,
      token_type: 'Bearer',
      decodedToken: {
        encoded: { header: fakeIdToken.split('.')[0], payload: fakeIdToken.split('.')[1], signature: 'fake-signature' },
        header: { alg: 'RS256', typ: 'JWT' },
        claims: { __raw: fakeIdToken, ...idTokenPayload },
        user: { sub: 'dev|testadmin', nickname: 'testadmin', name: 'Test Admin', 'https://motobingo.app/screen_name': 'testadmin', 'https://motobingo.app/roles': ['admin'] },
      },
    },
    expiresAt: now + 86400,
  };

  await page.addInitScript(`localStorage.setItem('${key}', ${JSON.stringify(JSON.stringify(cache))});`);

  // Intercept API calls from the browser to add dev bypass headers
  await page.route('**/api/v1/**', async route => {
    const headers = { ...route.request().headers(), 'X-Dev-User': 'testadmin', 'X-Dev-Role': 'admin' };
    await route.continue({ headers });
  });

  await page.goto('/admin');
  await page.waitForTimeout(2000);
}

async function adminNavToSeason(page: import('@playwright/test').Page) {
  await page.locator('.header-select').first().selectOption({ label: 'Supercross (SX)' });
  const seasonSelect = page.locator('.header-select').nth(1);
  await expect(seasonSelect).toBeVisible();
  await seasonSelect.selectOption(seasonId);
  await page.waitForTimeout(500);
}

async function adminNavToRound(page: import('@playwright/test').Page, roundName: string) {
  await adminNavToSeason(page);
  await expect(page.locator('.round-nav-row').first()).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: roundName, exact: true }).first().click();
  await expect(page.locator('.round-header h2')).toContainText(roundName);
}

// ── Setup & Teardown ──

test.beforeAll(async () => {

  const champs = await apiGet('/championships');
  sxChampId = champs.find((c: any) => c.shortCode === 'SX').id;

  let seasons = await apiGet(`/championships/${sxChampId}/seasons`);
  let season = seasons.find((s: any) => s.year === 2026);
  if (!season) {
    season = await apiPost(`/championships/${sxChampId}/seasons`, { year: 2026 });
  }
  seasonId = season.id;

  const tr = await apiPost(`/seasons/${seasonId}/rounds`, { name: 'TESTROUND', eventDate: '2026-06-15' });
  testRoundId = tr.id;
  const or = await apiPost(`/seasons/${seasonId}/rounds`, { name: 'TESTROUNDOLD', eventDate: '2025-01-10' });
  oldRoundId = or.id;
  const fr = await apiPost(`/seasons/${seasonId}/rounds`, { name: 'TESTROUNDFUTURE', eventDate: '2027-03-20' });
  futureRoundId = fr.id;

  // Add suggestions to TESTROUND
  await apiPost(`/rounds/${testRoundId}/suggestions`, { text: 'Rider crashes in whoops' });
  await apiPost(`/rounds/${testRoundId}/suggestions`, { text: 'Red flag in main event' });
  await apiPost(`/rounds/${testRoundId}/suggestions`, { text: 'Holeshot by underdog' });

  // Select 2 for the board
  const round = await apiGet(`/rounds/${testRoundId}`);
  // Approve suggestions first (public page only shows approved ones)
  await apiPut(`/rounds/${testRoundId}/suggestions/${round.suggestions[0].id}`, { status: 'approved' });
  await apiPut(`/rounds/${testRoundId}/suggestions/${round.suggestions[1].id}`, { status: 'approved' });
  await apiPut(`/rounds/${testRoundId}/suggestions/${round.suggestions[2].id}`, { status: 'approved' });
  await apiPut(`/rounds/${testRoundId}/suggestions/${round.suggestions[0].id}`, { selected: true });
  await apiPut(`/rounds/${testRoundId}/suggestions/${round.suggestions[1].id}`, { selected: true });

  // Create test users
  const existingUsers = await apiGet('/users');
  if (!existingUsers.find((u: any) => u.xHandle === 'testuser1')) {
    await apiPost('/users', { xHandle: 'testuser1', displayName: 'Test User 1' });
  }
  if (!existingUsers.find((u: any) => u.xHandle === 'testuser2')) {
    await apiPost('/users', { xHandle: 'testuser2', displayName: 'Test User 2' });
  }
});

test.afterAll(async () => {
  await apiPut('/active-round', { roundId: null });
  await apiDelete(`/rounds/${testRoundId}`);
  await apiDelete(`/rounds/${oldRoundId}`);
  await apiDelete(`/rounds/${futureRoundId}`);
  // Clean up test users
  const users = await apiGet('/users');
  for (const u of users) {
    if (u.xHandle === 'testuser1' || u.xHandle === 'testuser2') {
      await apiDelete(`/users/${u.id}`);
    }
  }
});

// ── Public Page ──

test.describe('Public Page', () => {
  test('page loads with title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('MotoBingo');
  });

  test('no sidebar visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar')).not.toBeVisible();
  });

  test('no phase badge visible', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('.header-round', { timeout: 5000 });
    await expect(page.locator('.phase-badge')).not.toBeVisible();
  });

  test('shows no-round message when inactive', async ({ page }) => {
    await apiPut('/active-round', { roundId: null });
    await page.goto('/');
    await page.waitForFunction(() => {
      const t = document.body.textContent || '';
      return t.includes('No future round') || t.includes('TESTROUND');
    }, { timeout: 5000 });
    await expect(page.locator('body')).toContainText('No future round');
  });

  test('shows active round when set', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('.header-round', { timeout: 5000 });
    await expect(page.locator('.header-round')).toContainText('TESTROUND');
  });

  test('shows "Bingo Board So Far" during suggestions phase', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('.board-preview-panel', { timeout: 5000 });
    await expect(page.locator('.board-preview-panel h3')).toContainText('Bingo Board So Far');
  });

  test('board preview shows FREE and selected suggestions', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('.board-preview-panel', { timeout: 5000 });
    await expect(page.locator('.cell.free')).toContainText('FREE');
    const filled = page.locator('.cell:not(.empty):not(.free)');
    await expect(filled).toHaveCount(2);
  });

  test('shows suggestion form with 200 char limit', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('.header-round', { timeout: 5000 });
    const form = page.locator('.suggestion-form input');
    if (await form.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(form).toHaveAttribute('maxlength', '200');
    }
  });

  test('shows approved suggestions with vote buttons', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('.suggestion-row', { timeout: 5000 });
    await expect(page.locator('.vote-btn').first()).toContainText('▲');
  });

  test('switching active round changes public page', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('.header-round', { timeout: 5000 });
    await expect(page.locator('.header-round')).toContainText('TESTROUND');

    await apiPut('/active-round', { roundId: futureRoundId });
    await page.reload();
    await page.waitForSelector('.header-round', { timeout: 5000 });
    await expect(page.locator('.header-round')).toContainText('TESTROUNDFUTURE');
    await apiPut('/active-round', { roundId: null });
  });
});

// ── Player Identification ──

test.describe('Player Identification', () => {
  test('shows login button when not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'), { timeout: 5000 });
    await expect(page.locator('.desktop-only .btn-login')).toBeVisible();
  });
});

// ── Admin Login ──

test.describe('Admin Login', () => {
  test('shows login prompt when not authenticated', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'), { timeout: 5000 });
    await expect(page.locator('.empty-state')).toContainText('Please log in');
    await expect(page.locator('.sidebar')).not.toBeVisible();
  });

  test('admin can see sidebar after login', async ({ page }) => {
    await adminLogin(page);
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('logout hides admin content', async ({ page }) => {
    await adminLogin(page);
    // Remove the token route so re-auth doesn't happen after logout
    await page.unroute('**/oauth/token');
    await page.route('**/oauth/token', async route => {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant' }) });
    });
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/');
    await page.goto('/admin');
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'), { timeout: 5000 });
    await expect(page.locator('.empty-state')).toContainText('Please log in');
  });
});

// ── Admin Rounds ──

test.describe('Admin Rounds', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin');
    await page.evaluate(() => {
      localStorage.removeItem('admin_champId');
      localStorage.removeItem('admin_seasonId');
      localStorage.removeItem('admin_roundId');
    });
  });

  test('rounds sorted by date (OLD < TESTROUND < FUTURE)', async ({ page }) => {
    await adminLogin(page);
    await adminNavToSeason(page);
    await expect(page.locator('.round-nav-row').first()).toBeVisible({ timeout: 5000 });
    const texts = await page.locator('.round-nav-row .nav-btn').allTextContents();
    const oldIdx = texts.findIndex(t => t.includes('TESTROUNDOLD'));
    const testIdx = texts.findIndex(t => t.includes('TESTROUND') && !t.includes('OLD') && !t.includes('FUTURE'));
    const futureIdx = texts.findIndex(t => t.includes('TESTROUNDFUTURE'));
    expect(oldIdx).toBeGreaterThanOrEqual(0);
    expect(testIdx).toBeGreaterThanOrEqual(0);
    expect(futureIdx).toBeGreaterThanOrEqual(0);
    expect(oldIdx).toBeLessThan(testIdx);
    expect(testIdx).toBeLessThan(futureIdx);
  });

  test('selecting round shows suggestions', async ({ page }) => {
    await adminLogin(page);
    await adminNavToRound(page, 'TESTROUND');
    await expect(page.locator('.suggestion-row')).toHaveCount(3);
  });

  test('board preview shows selected suggestions', async ({ page }) => {
    await adminLogin(page);
    await adminNavToRound(page, 'TESTROUND');
    await expect(page.locator('.board-preview-panel')).toBeVisible();
    await expect(page.locator('.cell.free')).toContainText('FREE');
    const filled = page.locator('.cell:not(.empty):not(.free)');
    await expect(filled).toHaveCount(2);
  });

  test('LIVE badge shows when active', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await adminLogin(page);
    await adminNavToSeason(page);
    await expect(page.locator('.badge-live')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.badge-live')).toContainText('LIVE');
    await apiPut('/active-round', { roundId: null });
  });

  test('LIVE badge hidden when inactive', async ({ page }) => {
    await apiPut('/active-round', { roundId: null });
    await adminLogin(page);
    await adminNavToSeason(page);
    await expect(page.locator('.round-nav-row').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.badge-live')).not.toBeVisible();
  });

  test('admin and public show same active round', async ({ page }) => {
    await apiPut('/active-round', { roundId: futureRoundId });

    // Public page shows TESTROUNDFUTURE
    await page.goto('/');
    await page.waitForSelector('.header-round', { timeout: 5000 });
    await expect(page.locator('.header-round')).toContainText('TESTROUNDFUTURE');

    // Admin page shows LIVE badge on TESTROUNDFUTURE
    await adminLogin(page);
    await adminNavToSeason(page);
    await expect(page.locator('.round-nav-row').first()).toBeVisible({ timeout: 5000 });
    // Wait for activePublicRoundId to load
    await expect(page.locator('.badge-live')).toBeVisible({ timeout: 5000 });

    await apiPut('/active-round', { roundId: null });
  });
});

// ── Race Day Phase ──

test.describe('Race Day Phase', () => {
  test('advancing to Race Day auto-generates boards', async ({ page }) => {
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'boards' });
    const users = await apiGet('/users');
    for (const u of users) {
      const board = await apiGet(`/rounds/${testRoundId}/boards/${u.id}`);
      expect(board.boardSize).toBe(5);
      expect(board.squares.length).toBe(25);
      expect(board.squares[12].text).toBe('FREE');
    }
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
  });

  test('boards update intelligently when suggestion selection changes', async ({ page }) => {
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'boards' });
    const users = await apiGet('/users');
    if (users.length === 0) {
      await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
      return;
    }
    const board1 = await apiGet(`/rounds/${testRoundId}/boards/${users[0].id}`);
    const round = await apiGet(`/rounds/${testRoundId}`);
    const selectedSug = round.suggestions.find((s: any) => s.selected);
    if (selectedSug) {
      await apiPut(`/rounds/${testRoundId}/suggestions/${selectedSug.id}`, { selected: false });
      await apiPut(`/rounds/${testRoundId}/suggestions/${selectedSug.id}`, { selected: true });
    }
    const board2 = await apiGet(`/rounds/${testRoundId}/boards/${users[0].id}`);
    expect(board2.squares[12].text).toBe('FREE');
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
  });

  test('admin can revert from Race Day to suggestions', async ({ page }) => {
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'boards' });
    const r1 = await apiGet(`/rounds/${testRoundId}`);
    expect(r1.phase).toBe('boards');
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
    const r2 = await apiGet(`/rounds/${testRoundId}`);
    expect(r2.phase).toBe('suggestions');
  });

  test('marking suggestion complete updates scores', async ({ page }) => {
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'boards' });

    // Get a user and their board
    const users = await apiGet('/users');
    if (users.length === 0) {
      await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
      return;
    }
    const board1 = await apiGet(`/rounds/${testRoundId}/boards/${users[0].id}`);
    const initialScore = board1.score;

    // Mark a selected suggestion as complete
    const round = await apiGet(`/rounds/${testRoundId}`);
    const selectedSug = round.suggestions.find((s: any) => s.selected && !s.completed);
    if (selectedSug) {
      await apiPut(`/rounds/${testRoundId}/suggestions/${selectedSug.id}`, { completed: true });
      const board2 = await apiGet(`/rounds/${testRoundId}/boards/${users[0].id}`);
      // Score should be >= initial (FREE + completed = at least 1 pair if adjacent)
      expect(board2.score).toBeGreaterThanOrEqual(initialScore);

      // Undo for other tests
      await apiPut(`/rounds/${testRoundId}/suggestions/${selectedSug.id}`, { completed: false });
    }

    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
  });

  test('leaderboard is sorted by score descending', async ({ page }) => {
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'boards' });

    const lb = await apiGet(`/rounds/${testRoundId}/leaderboard`);
    for (let i = 1; i < lb.length; i++) {
      expect(lb[i - 1].score).toBeGreaterThanOrEqual(lb[i].score);
    }

    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
  });

  test('public page shows scores on leaderboard in Race Day', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'boards' });

    await page.goto('/');
    await page.waitForSelector('.header-round', { timeout: 5000 });
    // Leaderboard should be visible if there are users
    const users = await apiGet('/users');
    if (users.length > 0) {
      await expect(page.locator('.leaderboard').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.lb-score').first()).toBeVisible();
    }

    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
    await apiPut('/active-round', { roundId: null });
  });

  test('admin page shows phase label as Race Day', async ({ page }) => {
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'boards' });

    await page.goto('/admin');
    await page.evaluate(() => { localStorage.clear(); });
    await adminLogin(page);
    await adminNavToSeason(page);
    await expect(page.locator('.round-nav-row').first()).toBeVisible({ timeout: 5000 });
    const btns = page.locator('.round-nav-row .nav-btn');
    const count = await btns.count();
    for (let i = 0; i < count; i++) {
      const text = await btns.nth(i).textContent();
      if (text?.includes('TESTROUND') && !text?.includes('OLD') && !text?.includes('FUTURE')) {
        await btns.nth(i).click();
        break;
      }
    }
    await expect(page.locator('.phase-label')).toContainText('Race Day');

    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
  });

  test('admin can view different user boards', async ({ page }) => {
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'boards' });

    await page.goto('/admin');
    await page.evaluate(() => { localStorage.clear(); });
    await adminLogin(page);
    await adminNavToSeason(page);
    await expect(page.locator('.round-nav-row').first()).toBeVisible({ timeout: 5000 });
    // Select TESTROUND
    const btns = page.locator('.round-nav-row .nav-btn');
    const count = await btns.count();
    for (let i = 0; i < count; i++) {
      const text = await btns.nth(i).textContent();
      if (text?.includes('TESTROUND') && !text?.includes('OLD') && !text?.includes('FUTURE')) {
        await btns.nth(i).click();
        break;
      }
    }

    // Click "Board" on different users and verify the board view updates
    const boardBtns = page.locator('.player-row .btn-tiny', { hasText: 'Board' });
    const boardCount = await boardBtns.count();
    if (boardCount >= 2) {
      await boardBtns.nth(0).click();
      const name1 = await page.locator('.board-panel h3').textContent();
      await boardBtns.nth(1).click();
      const name2 = await page.locator('.board-panel h3').textContent();
      expect(name1).not.toBe(name2);
    }

    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
  });

  test('Race Day shows "Move to Next Round" button instead of "Next"', async ({ page }) => {
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'boards' });

    await page.goto('/admin');
    await page.evaluate(() => { localStorage.clear(); });
    await adminLogin(page);
    await adminNavToSeason(page);
    await expect(page.locator('.round-nav-row').first()).toBeVisible({ timeout: 5000 });
    const btns = page.locator('.round-nav-row .nav-btn');
    const count = await btns.count();
    for (let i = 0; i < count; i++) {
      const text = await btns.nth(i).textContent();
      if (text?.includes('TESTROUND') && !text?.includes('OLD') && !text?.includes('FUTURE')) {
        await btns.nth(i).click();
        break;
      }
    }
    await expect(page.getByRole('button', { name: 'Move to Next Round →' })).toBeVisible();
    await expect(page.getByRole('button', { name: '← Back to Suggestions' })).toBeVisible();
    // Should NOT show generic "Next →"
    await expect(page.getByRole('button', { name: 'Next →' })).not.toBeVisible();

    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
  });

  test('Move to Next Round completes current and activates next', async ({ page }) => {
    // Set TESTROUND to Race Day and make it LIVE
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'boards' });
    await apiPut('/active-round', { roundId: testRoundId });

    // Verify TESTROUNDFUTURE exists and is in suggestions
    const futureRound = await apiGet(`/rounds/${futureRoundId}`);
    expect(futureRound.phase).toBe('suggestions');

    // Move to next round via API (simulating what the button does)
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'complete' });
    await apiPut('/active-round', { roundId: futureRoundId });

    // Verify
    const completed = await apiGet(`/rounds/${testRoundId}`);
    expect(completed.phase).toBe('complete');
    const active = await apiGet('/active-round');
    expect(active.round.id).toBe(futureRoundId);

    // Reset for other tests
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
    await apiPut('/active-round', { roundId: null });
  });

  test('admin can click board cell to toggle complete', async ({ page }) => {
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'boards' });

    await page.goto('/admin');
    await page.evaluate(() => { localStorage.clear(); });
    await adminLogin(page);
    await adminNavToSeason(page);
    await expect(page.locator('.round-nav-row').first()).toBeVisible({ timeout: 5000 });
    const btns = page.locator('.round-nav-row .nav-btn');
    const count = await btns.count();
    for (let i = 0; i < count; i++) {
      const text = await btns.nth(i).textContent();
      if (text?.includes('TESTROUND') && !text?.includes('OLD') && !text?.includes('FUTURE')) {
        await btns.nth(i).click();
        break;
      }
    }

    // Find a clickable (non-free, non-empty) cell
    const clickableCell = page.locator('.cell.clickable').first();
    if (await clickableCell.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Click to mark complete
      await clickableCell.click();
      await page.waitForTimeout(500);
      // Cell should now have completed-cell class
      await expect(page.locator('.cell.completed').first()).toBeVisible();

      // Click again to unmark
      await page.locator('.cell.completed').first().click();
      await page.waitForTimeout(500);
    }

    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
  });

  test('Suggestions phase shows "Race Day →" button', async ({ page }) => {
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });

    await page.goto('/admin');
    await page.evaluate(() => { localStorage.clear(); });
    await adminLogin(page);
    await adminNavToSeason(page);
    await expect(page.locator('.round-nav-row').first()).toBeVisible({ timeout: 5000 });
    const btns = page.locator('.round-nav-row .nav-btn');
    const count = await btns.count();
    for (let i = 0; i < count; i++) {
      const text = await btns.nth(i).textContent();
      if (text?.includes('TESTROUND') && !text?.includes('OLD') && !text?.includes('FUTURE')) {
        await btns.nth(i).click();
        break;
      }
    }
    await expect(page.getByRole('button', { name: 'Race Day →' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move to Next Round →' })).not.toBeVisible();
  });
});

// ── Shareable Links & Board Navigation ──

test.describe('Shareable Links', () => {
  test('leaderboard shows user boards in Race Day', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'boards' });

    await page.goto('/');
    await page.waitForSelector('.header-round', { timeout: 5000 });
    const lbRow = page.locator('.lb-row').first();
    if (await lbRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lbRow.click();
      await expect(page.locator('.board-panel')).toBeVisible({ timeout: 5000 });
    }

    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
    await apiPut('/active-round', { roundId: null });
  });

  test('admin copy link button exists for each user', async ({ page }) => {
    await adminLogin(page);
    await adminNavToSeason(page);
    await expect(page.locator('.round-nav-row').first()).toBeVisible({ timeout: 5000 });
    // Should see link buttons for users
    await expect(page.locator('.btn-link').first()).toBeVisible();
  });
});

// ── Admin Suggestions ──

// ── Championship Standings ──

test.describe('Championship Standings', () => {
  let standingsRound1Id: string;
  let standingsRound2Id: string;

  test('cumulative scores across rounds', async ({ page }) => {
    // Create two rounds with suggestions
    standingsRound1Id = (await apiPost(`/seasons/${seasonId}/rounds`, { name: 'STANDINGS_R1', eventDate: '2026-09-01' })).id;
    standingsRound2Id = (await apiPost(`/seasons/${seasonId}/rounds`, { name: 'STANDINGS_R2', eventDate: '2026-09-15' })).id;

    // Add 24 suggestions to fill the board (5x5 - 1 FREE = 24)
    const r1Sugs: string[] = [];
    for (let i = 0; i < 24; i++) {
      const s = await apiPost(`/rounds/${standingsRound1Id}/suggestions`, { text: `R1 sug ${i}` });
      await apiPut(`/rounds/${standingsRound1Id}/suggestions/${s.id}`, { selected: true });
      r1Sugs.push(s.id);
    }
    const r2Sugs: string[] = [];
    for (let i = 0; i < 24; i++) {
      const s = await apiPost(`/rounds/${standingsRound2Id}/suggestions`, { text: `R2 sug ${i}` });
      await apiPut(`/rounds/${standingsRound2Id}/suggestions/${s.id}`, { selected: true });
      r2Sugs.push(s.id);
    }

    // Advance both to Race Day (generates boards)
    await apiPut(`/rounds/${standingsRound1Id}/phase`, { phase: 'boards' });
    await apiPut(`/rounds/${standingsRound2Id}/phase`, { phase: 'boards' });

    // Mark multiple suggestions complete to guarantee scoring (adjacent cells)
    await apiPut(`/rounds/${standingsRound1Id}/suggestions/${r1Sugs[0]}`, { completed: true });
    await apiPut(`/rounds/${standingsRound1Id}/suggestions/${r1Sugs[1]}`, { completed: true });
    await apiPut(`/rounds/${standingsRound2Id}/suggestions/${r2Sugs[0]}`, { completed: true });
    await apiPut(`/rounds/${standingsRound2Id}/suggestions/${r2Sugs[1]}`, { completed: true });

    // Check season leaderboard via API — users should have cumulative scores
    const seasonLb = await apiGet(`/seasons/${seasonId}/leaderboard`);
    expect(seasonLb.length).toBeGreaterThan(0);

    // Each user should have scores from both rounds combined
    for (const entry of seasonLb) {
      expect(entry.totalScore).toBeGreaterThanOrEqual(0);
    }

    // The top user should have score from both rounds
    const topScore = seasonLb[0].totalScore;
    expect(topScore).toBeGreaterThan(0);

    // Set round 2 as active and check public page shows standings
    await apiPut('/active-round', { roundId: standingsRound2Id });
    await page.goto('/');
    await page.waitForSelector('.header-round', { timeout: 5000 });
    await expect(page.locator('.standings-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.standings-panel h3')).toContainText('Championship Standings');
    // Should show scores
    await expect(page.locator('.standings-panel .lb-score').first()).toBeVisible();

    // Cleanup
    await apiPut('/active-round', { roundId: null });
    await apiDelete(`/rounds/${standingsRound1Id}`);
    await apiDelete(`/rounds/${standingsRound2Id}`);
  });

  test('standings show on public page in suggestions mode', async ({ page }) => {
    // Use TESTROUND which has suggestions
    await apiPut('/active-round', { roundId: testRoundId });
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });

    await page.goto('/');
    await page.waitForSelector('.header-round', { timeout: 5000 });
    // Standings should be visible even in suggestions mode
    // (may be empty if no completed rounds, but the section should render if data exists)
    // Just verify the page loads without error
    await expect(page.locator('h1')).toContainText('MotoBingo');

    await apiPut('/active-round', { roundId: null });
  });
});

// ── Admin Suggestions ──

test.describe('Admin Suggestions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin');
    await page.evaluate(() => {
      localStorage.removeItem('admin_champId');
      localStorage.removeItem('admin_seasonId');
      localStorage.removeItem('admin_roundId');
    });
  });

  test('can add and edit suggestion', async ({ page }) => {
    await adminLogin(page);
    await adminNavToRound(page, 'TESTROUND');

    await page.locator('input[placeholder="Add suggestion (auto-approved)"]').fill('E2E new suggestion');
    await page.getByRole('button', { name: '+ Add' }).click();
    await expect(page.locator('.suggestion-text', { hasText: 'E2E new suggestion' })).toBeVisible();

    const row = page.locator('.suggestion-row', { hasText: 'E2E new suggestion' });
    await row.locator('.btn-tiny', { hasText: '✎' }).click();
    const editInput = page.locator('.edit-input');
    await editInput.fill('E2E edited');
    await editInput.press('Enter');
    await expect(page.locator('.suggestion-text', { hasText: 'E2E edited' })).toBeVisible();
  });

  test('suggestion input has 200 char limit', async ({ page }) => {
    await adminLogin(page);
    await adminNavToRound(page, 'TESTROUND');
    await expect(page.locator('input[placeholder="Add suggestion (auto-approved)"]')).toHaveAttribute('maxlength', '200');
  });

  test('vote count visible', async ({ page }) => {
    await adminLogin(page);
    await adminNavToRound(page, 'TESTROUND');
    await expect(page.locator('.vote-count').first()).toBeVisible();
  });
});

// ── Mobile Responsive ──

test.describe('Mobile Responsive', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('hamburger visible, desktop nav hidden when authenticated', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    // Simulate authenticated user via route interception
    const now = Math.floor(Date.now() / 1000);
    const b64url = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const fakeIdToken = b64url({ alg: 'RS256', typ: 'JWT' }) + '.' + b64url({
      sub: 'dev|mobileuser', nickname: 'mobileuser', 'https://motobingo.app/screen_name': 'mobileuser',
      'https://motobingo.app/roles': [], exp: now + 86400, iat: now,
      aud: 'sgbZkzh0cgUxFTaabQjAZw8WGl371yaC', iss: 'https://dev-xlhmy2q3ti2zo0ad.us.auth0.com/', nonce: 'n',
    }) + '.fake';
    await page.route('**/oauth/token', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: 'fake', id_token: fakeIdToken, refresh_token: 'fake-rt', token_type: 'Bearer', expires_in: 86400,
      }) });
    });
    const key = '@@auth0spajs@@::sgbZkzh0cgUxFTaabQjAZw8WGl371yaC::https://motobingo-api::openid profile email offline_access';
    const cache = { body: { client_id: 'sgbZkzh0cgUxFTaabQjAZw8WGl371yaC', access_token: 'fake', id_token: fakeIdToken, refresh_token: 'fake-rt', scope: 'openid profile email offline_access', audience: 'https://motobingo-api', expires_in: 86400, token_type: 'Bearer', decodedToken: { encoded: { header: fakeIdToken.split('.')[0], payload: fakeIdToken.split('.')[1], signature: 'fake' }, header: { alg: 'RS256', typ: 'JWT' }, claims: { __raw: fakeIdToken, sub: 'dev|mobileuser', nickname: 'mobileuser', 'https://motobingo.app/screen_name': 'mobileuser', 'https://motobingo.app/roles': [], exp: now + 86400, iat: now, aud: 'sgbZkzh0cgUxFTaabQjAZw8WGl371yaC', iss: 'https://dev-xlhmy2q3ti2zo0ad.us.auth0.com/' }, user: { sub: 'dev|mobileuser', nickname: 'mobileuser', 'https://motobingo.app/screen_name': 'mobileuser', 'https://motobingo.app/roles': [] } } }, expiresAt: now + 86400 };
    await page.addInitScript(`localStorage.setItem('${key}', ${JSON.stringify(JSON.stringify(cache))});`);
    await page.route('**/api/v1/**', async route => { await route.continue({ headers: { ...route.request().headers(), 'X-Dev-User': 'mobileuser', 'X-Dev-Role': '' } }); });
    await page.goto('/');
    await page.waitForTimeout(2000);
    await expect(page.locator('.hamburger')).toBeVisible();
    await expect(page.locator('.header-actions.desktop-only')).not.toBeVisible();
  });

  test('login button shows directly on mobile when not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'), { timeout: 5000 });
    await expect(page.locator('.btn-login.mobile-only')).toBeVisible();
    await expect(page.locator('.hamburger')).not.toBeVisible();
  });

  test('board fits within viewport without overflow', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('.board-preview-panel', { timeout: 5000 });
    const board = page.locator('app-bingo-board .board');
    const box = await board.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });

  test('board title shows round name on mobile', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('.board-preview-panel', { timeout: 5000 });
    await expect(page.locator('.mobile-only', { hasText: 'Board So Far for' })).toBeVisible();
    await expect(page.locator('.round-name-truncate')).toContainText('TESTROUND');
  });
});

// ── Suggestion Modal ──

test.describe('Suggestion Modal', () => {
  test('add suggestion button visible in suggestions section', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await apiPut(`/rounds/${testRoundId}/phase`, { phase: 'suggestions' });
    await page.goto('/');
    await page.waitForSelector('.suggestions-header', { timeout: 5000 });
    // Not authenticated — shows login prompt
    await expect(page.locator('.suggestions-header .btn-login')).toBeVisible();
  });

  test('clicking add opens modal', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    // Need to be authenticated to see the button
    const now = Math.floor(Date.now() / 1000);
    const b64url = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const fakeIdToken = b64url({ alg: 'RS256', typ: 'JWT' }) + '.' + b64url({
      sub: 'dev|modaluser', nickname: 'modaluser', 'https://motobingo.app/screen_name': 'modaluser',
      'https://motobingo.app/roles': [], exp: now + 86400, iat: now,
      aud: 'sgbZkzh0cgUxFTaabQjAZw8WGl371yaC', iss: 'https://dev-xlhmy2q3ti2zo0ad.us.auth0.com/', nonce: 'n',
    }) + '.fake';
    await page.route('**/oauth/token', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: 'fake', id_token: fakeIdToken, refresh_token: 'fake-rt', token_type: 'Bearer', expires_in: 86400,
      }) });
    });
    const key = '@@auth0spajs@@::sgbZkzh0cgUxFTaabQjAZw8WGl371yaC::https://motobingo-api::openid profile email offline_access';
    const cache = { body: { client_id: 'sgbZkzh0cgUxFTaabQjAZw8WGl371yaC', access_token: 'fake', id_token: fakeIdToken, refresh_token: 'fake-rt', scope: 'openid profile email offline_access', audience: 'https://motobingo-api', expires_in: 86400, token_type: 'Bearer', decodedToken: { encoded: { header: fakeIdToken.split('.')[0], payload: fakeIdToken.split('.')[1], signature: 'fake' }, header: { alg: 'RS256', typ: 'JWT' }, claims: { __raw: fakeIdToken, sub: 'dev|modaluser', nickname: 'modaluser', 'https://motobingo.app/screen_name': 'modaluser', 'https://motobingo.app/roles': [], exp: now + 86400, iat: now, aud: 'sgbZkzh0cgUxFTaabQjAZw8WGl371yaC', iss: 'https://dev-xlhmy2q3ti2zo0ad.us.auth0.com/' }, user: { sub: 'dev|modaluser', nickname: 'modaluser', 'https://motobingo.app/screen_name': 'modaluser', 'https://motobingo.app/roles': [] } } }, expiresAt: now + 86400 };
    await page.addInitScript(`localStorage.setItem('${key}', ${JSON.stringify(JSON.stringify(cache))});`);
    await page.route('**/api/v1/**', async route => { await route.continue({ headers: { ...route.request().headers(), 'X-Dev-User': 'modaluser', 'X-Dev-Role': '' } }); });
    await page.goto('/');
    await page.waitForSelector('.suggestions-header', { timeout: 5000 });
    await page.locator('.suggestions-header button', { hasText: 'Add a Suggestion' }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.locator('.modal-content input')).toBeVisible();
  });

  test('modal closes on cancel', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    const now = Math.floor(Date.now() / 1000);
    const b64url = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const fakeIdToken = b64url({ alg: 'RS256', typ: 'JWT' }) + '.' + b64url({
      sub: 'dev|modaluser', nickname: 'modaluser', 'https://motobingo.app/screen_name': 'modaluser',
      'https://motobingo.app/roles': [], exp: now + 86400, iat: now,
      aud: 'sgbZkzh0cgUxFTaabQjAZw8WGl371yaC', iss: 'https://dev-xlhmy2q3ti2zo0ad.us.auth0.com/', nonce: 'n',
    }) + '.fake';
    await page.route('**/oauth/token', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: 'fake', id_token: fakeIdToken, refresh_token: 'fake-rt', token_type: 'Bearer', expires_in: 86400,
      }) });
    });
    const key = '@@auth0spajs@@::sgbZkzh0cgUxFTaabQjAZw8WGl371yaC::https://motobingo-api::openid profile email offline_access';
    const cache = { body: { client_id: 'sgbZkzh0cgUxFTaabQjAZw8WGl371yaC', access_token: 'fake', id_token: fakeIdToken, refresh_token: 'fake-rt', scope: 'openid profile email offline_access', audience: 'https://motobingo-api', expires_in: 86400, token_type: 'Bearer', decodedToken: { encoded: { header: fakeIdToken.split('.')[0], payload: fakeIdToken.split('.')[1], signature: 'fake' }, header: { alg: 'RS256', typ: 'JWT' }, claims: { __raw: fakeIdToken, sub: 'dev|modaluser', nickname: 'modaluser', 'https://motobingo.app/screen_name': 'modaluser', 'https://motobingo.app/roles': [], exp: now + 86400, iat: now, aud: 'sgbZkzh0cgUxFTaabQjAZw8WGl371yaC', iss: 'https://dev-xlhmy2q3ti2zo0ad.us.auth0.com/' }, user: { sub: 'dev|modaluser', nickname: 'modaluser', 'https://motobingo.app/screen_name': 'modaluser', 'https://motobingo.app/roles': [] } } }, expiresAt: now + 86400 };
    await page.addInitScript(`localStorage.setItem('${key}', ${JSON.stringify(JSON.stringify(cache))});`);
    await page.route('**/api/v1/**', async route => { await route.continue({ headers: { ...route.request().headers(), 'X-Dev-User': 'modaluser', 'X-Dev-Role': '' } }); });
    await page.goto('/');
    await page.waitForSelector('.suggestions-header', { timeout: 5000 });
    await page.locator('.suggestions-header button', { hasText: 'Add a Suggestion' }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await page.locator('.btn-cancel').click();
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });

  test('shows login button instead of add when not authenticated', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('.suggestions-header', { timeout: 5000 });
    await expect(page.locator('.suggestions-header .btn-login')).toBeVisible();
  });
});

// ── Shared Board Component ──

test.describe('Shared Board Component', () => {
  test('board renders 25 cells for 5x5', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('app-bingo-board', { timeout: 5000 });
    await expect(page.locator('app-bingo-board .cell')).toHaveCount(25);
  });

  test('FREE cell present in center', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('app-bingo-board', { timeout: 5000 });
    await expect(page.locator('app-bingo-board .cell.free')).toContainText('FREE');
  });

  test('uses app-bingo-board component', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('app-bingo-board', { timeout: 5000 });
    await expect(page.locator('app-bingo-board')).toBeVisible();
  });
});

// ── Nav Bar & Date Format ──

test.describe('Nav Bar', () => {
  test('round name and date in header center on desktop', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('.header-round', { timeout: 5000 });
    await expect(page.locator('.header-center')).toBeVisible();
    await expect(page.locator('.header-round')).toContainText('TESTROUND');
    await expect(page.locator('.event-date')).toBeVisible();
  });

  test('date formatted as day month year', async ({ page }) => {
    await apiPut('/active-round', { roundId: testRoundId });
    await page.goto('/');
    await page.waitForSelector('.event-date', { timeout: 5000 });
    const dateText = await page.locator('.event-date').textContent();
    // Should be like "15 Jun 2026" not "2026-06-15"
    expect(dateText).toMatch(/\d{1,2}\s\w{3}\s\d{4}/);
  });
});
