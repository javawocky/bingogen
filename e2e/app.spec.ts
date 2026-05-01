import { test, expect, request } from '@playwright/test';

const API = 'http://localhost:8787/api/v1';

// Get an admin JWT for API cleanup calls
async function getAdminToken(): Promise<string> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${API}/auth/login`, { data: { username: 'admin', password: 'testpass123' } });
  const { token } = await res.json();
  await ctx.dispose();
  return token;
}

// Delete a round via API
async function deleteRound(roundId: string, token: string) {
  const ctx = await request.newContext();
  await ctx.delete(`${API}/rounds/${roundId}`, { headers: { Authorization: `Bearer ${token}` } });
  await ctx.dispose();
}

async function adminLogin(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.locator('.header').getByRole('button', { name: 'Login' }).click();
  await page.locator('.modal-content input[type="text"]').fill('admin');
  await page.locator('.modal-content input[type="password"]').fill('testpass123');
  await page.locator('.modal-content button').click();
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
}

// Creates a round and returns its ID (extracted from the API response via network interception)
async function navigateToRound(page: import('@playwright/test').Page, roundName: string): Promise<string> {
  await page.locator('.nav-select').first().selectOption({ label: 'Supercross (SX)' });
  const seasonSelect = page.locator('.nav-select').nth(1);
  await expect(seasonSelect).toBeVisible();
  const options = seasonSelect.locator('option:not([disabled])');
  await expect(options.first()).toBeAttached();
  await seasonSelect.selectOption({ index: 1 });
  await page.waitForTimeout(1000);
  const seasonSelect2 = page.locator('.nav-select').nth(1);
  // Check if rounds section loaded, if not re-select season
  const addRoundBtn = page.locator('.rounds-header-actions .btn-tiny', { hasText: '+' });
  if (!await addRoundBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await seasonSelect2.selectOption({ index: 1 });
    await page.waitForTimeout(500);
  }

  // Open add round modal
  await addRoundBtn.click();
  await expect(page.locator('.modal-content h2')).toContainText('Add Round');
  await page.locator('.modal-content input[placeholder="Round name"]').fill(roundName);
  await page.locator('.modal-content input[type="date"]').fill('2026-08-01');

  // Intercept the round creation response to get the ID
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/rounds') && r.request().method() === 'POST' && r.status() === 201),
    page.locator('.modal-content').getByRole('button', { name: 'Add Round' }).click(),
  ]);
  const round = await response.json();

  await page.getByRole('button', { name: new RegExp(roundName) }).click();
  await expect(page.locator('.round-header h2')).toContainText(roundName);
  return round.id;
}

// ── Public Page ──

test.describe('Public Page (/)', () => {
  test('page loads with title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('MotoBingo');
  });

  test('shows no-round message or active round automatically', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'), { timeout: 5000 });
    const body = await page.locator('body').textContent();
    const hasRound = body?.includes('suggestions') || body?.includes('boards') || body?.includes('raceday');
    const hasNoRound = body?.includes('No future round') || body?.includes('Check back soon');
    expect(hasRound || hasNoRound).toBeTruthy();
  });

  test('does not show sidebar navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar')).not.toBeVisible();
  });

  test('shows player handle input', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.handle-input')).toBeVisible();
  });

  test('does not show admin button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Admin' })).not.toBeVisible();
  });

  test('entering unknown handle stays as spectator', async ({ page }) => {
    await page.goto('/');
    await page.locator('.handle-input').fill('nonexistent_user');
    await page.getByRole('button', { name: 'Go' }).click();
    await expect(page.locator('.identified-badge')).not.toBeVisible();
  });

  test('suggestion input has 200 char maxlength', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'), { timeout: 5000 });
    const input = page.locator('.suggestion-form input');
    if (await input.isVisible()) {
      await expect(input).toHaveAttribute('maxlength', '200');
    }
  });
});

// ── Admin Login ──

test.describe('Admin Login & Access Control', () => {
  test('admin page shows login prompt when not authenticated', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('.empty-state')).toContainText('Please log in');
  });

  test('admin page does not show sidebar when not authenticated', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('.sidebar')).not.toBeVisible();
  });

  test('shows login modal on login click', async ({ page }) => {
    await page.goto('/admin');
    await page.locator('.header').getByRole('button', { name: 'Login' }).click();
    await expect(page.locator('.modal-content h2')).toContainText('Admin Login');
  });

  test('rejects invalid credentials', async ({ page }) => {
    await page.goto('/admin');
    await page.locator('.header').getByRole('button', { name: 'Login' }).click();
    await page.locator('.modal-content input[type="text"]').fill('wrong');
    await page.locator('.modal-content input[type="password"]').fill('wrong');
    await page.locator('.modal-content button').click();
    await expect(page.locator('.error')).toContainText('Invalid credentials');
  });

  test('logs in with valid credentials and shows admin content', async ({ page }) => {
    await adminLogin(page);
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('logout hides admin content', async ({ page }) => {
    await adminLogin(page);
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.locator('.empty-state')).toContainText('Please log in');
    await expect(page.locator('.sidebar')).not.toBeVisible();
  });
});

// ── Admin CRUD (with cleanup) ──

test.describe('Admin CRUD', () => {
  let token: string;
  const createdRoundIds: string[] = [];

  test.beforeAll(async () => {
    token = await getAdminToken();
  });

  test.beforeEach(async ({ page }) => {
    // Clear admin localStorage to avoid stale selections
    await page.goto('/admin');
    await page.evaluate(() => {
      localStorage.removeItem('admin_champId');
      localStorage.removeItem('admin_seasonId');
      localStorage.removeItem('admin_roundId');
    });
  });

  test.afterAll(async () => {
    for (const id of createdRoundIds) {
      await deleteRound(id, token);
    }
  });

  test('admin can select championship, create season and round', async ({ page }) => {
    await adminLogin(page);
    const roundName = `CRUDRound_${Date.now()}`;
    const roundId = await navigateToRound(page, roundName);
    createdRoundIds.push(roundId);
    await expect(page.locator('.round-header h2')).toBeVisible();
  });

  test('admin can add suggestion with 200 char limit', async ({ page }) => {
    await adminLogin(page);
    const roundName = `SugLimit_${Date.now()}`;
    const roundId = await navigateToRound(page, roundName);
    createdRoundIds.push(roundId);

    const input = page.locator('input[placeholder="Add suggestion (auto-approved)"]');
    await expect(input).toHaveAttribute('maxlength', '200');
    await input.fill('Test crash in turn 1');
    await page.getByRole('button', { name: '+ Add' }).click();
    await expect(page.locator('.suggestion-text')).toContainText('Test crash in turn 1');
  });

  test('admin can edit suggestion inline', async ({ page }) => {
    await adminLogin(page);
    const roundName = `EditSug_${Date.now()}`;
    const roundId = await navigateToRound(page, roundName);
    createdRoundIds.push(roundId);

    await page.locator('input[placeholder="Add suggestion (auto-approved)"]').fill('Original text');
    await page.getByRole('button', { name: '+ Add' }).click();
    await expect(page.locator('.suggestion-text')).toContainText('Original text');

    await page.locator('.suggestion-actions .btn-tiny', { hasText: '✎' }).click();
    const editInput = page.locator('.edit-input');
    await expect(editInput).toBeVisible();
    await expect(editInput).toHaveAttribute('maxlength', '200');
    await editInput.fill('Edited text');
    await editInput.press('Enter');
    await expect(page.locator('.suggestion-text')).toContainText('Edited text');
  });

  test('admin can see vote count on suggestions', async ({ page }) => {
    await adminLogin(page);
    const roundName = `VoteCount_${Date.now()}`;
    const roundId = await navigateToRound(page, roundName);
    createdRoundIds.push(roundId);

    await page.locator('input[placeholder="Add suggestion (auto-approved)"]').fill('Voteable suggestion');
    await page.getByRole('button', { name: '+ Add' }).click();
    await expect(page.locator('.vote-count')).toContainText('0');
  });

  test('rounds are sorted by date', async ({ page }) => {
    await adminLogin(page);
    await page.locator('.nav-select').first().selectOption({ label: 'Supercross (SX)' });
    const seasonSelect = page.locator('.nav-select').nth(1);
    await expect(seasonSelect).toBeVisible();
    await seasonSelect.selectOption({ index: 1 });
    await page.waitForTimeout(1000);
    if (!await page.locator('.rounds-header').isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.locator('.nav-select').nth(1).selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }

    const ts = Date.now();
    // Create round with later date first
    const addBtn = page.locator('.rounds-header-actions .btn-tiny', { hasText: '+' });

    await addBtn.click();
    await page.locator('.modal-content input[placeholder="Round name"]').fill(`Late_${ts}`);
    await page.locator('.modal-content input[type="date"]').fill('2026-12-01');
    const [res1] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/rounds') && r.request().method() === 'POST' && r.status() === 201),
      page.locator('.modal-content').getByRole('button', { name: 'Add Round' }).click(),
    ]);
    createdRoundIds.push((await res1.json()).id);

    // Create round with earlier date
    await addBtn.click();
    await page.locator('.modal-content input[placeholder="Round name"]').fill(`Early_${ts}`);
    await page.locator('.modal-content input[type="date"]').fill('2026-02-01');
    const [res2] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/rounds') && r.request().method() === 'POST' && r.status() === 201),
      page.locator('.modal-content').getByRole('button', { name: 'Add Round' }).click(),
    ]);
    createdRoundIds.push((await res2.json()).id);

    // Verify Early appears before Late in the round list
    const roundButtons = page.locator('.round-nav-row .round-btn-name');
    const texts = await roundButtons.allTextContents();
    const earlyIdx = texts.findIndex(t => t.includes(`Early_${ts}`));
    const lateIdx = texts.findIndex(t => t.includes(`Late_${ts}`));
    expect(earlyIdx).toBeGreaterThanOrEqual(0);
    expect(lateIdx).toBeGreaterThanOrEqual(0);
    expect(earlyIdx).toBeLessThan(lateIdx);
  });
});

// ── Public Upvoting ──

test.describe('Public Active Round', () => {
  let token: string;
  let roundId: string;

  test.beforeAll(async () => {
    token = await getAdminToken();
    const ctx = await request.newContext();
    const champsRes = await ctx.get(`${API}/championships`);
    const champs = await champsRes.json();
    const sx = champs.find((c: any) => c.shortCode === 'SX');
    const seasonsRes = await ctx.get(`${API}/championships/${sx.id}/seasons`);
    let seasons = await seasonsRes.json();
    if (seasons.length === 0) {
      await ctx.post(`${API}/championships/${sx.id}/seasons`, { data: { year: 2026 }, headers: { Authorization: `Bearer ${token}` } });
      const s2 = await ctx.get(`${API}/championships/${sx.id}/seasons`);
      seasons = await s2.json();
    }
    const season = seasons[0];
    // Create a round and set it active
    const roundRes = await ctx.post(`${API}/seasons/${season.id}/rounds`, {
      data: { name: 'ActiveRound_E2E', eventDate: '2026-08-01' },
      headers: { Authorization: `Bearer ${token}` },
    });
    const round = await roundRes.json();
    roundId = round.id;
    // Set as active
    await ctx.put(`${API}/active-round`, {
      data: { roundId },
      headers: { Authorization: `Bearer ${token}` },
    });
    await ctx.dispose();
  });

  test.afterAll(async () => {
    const ctx = await request.newContext();
    // Clear active round
    await ctx.put(`${API}/active-round`, {
      data: { roundId: null },
      headers: { Authorization: `Bearer ${token}` },
    });
    await deleteRound(roundId, token);
    await ctx.dispose();
  });

  test('public page shows the admin-selected active round', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'), { timeout: 5000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('ActiveRound_E2E');
  });

  test('public page shows no-round message when no active round set', async ({ page }) => {
    // Temporarily clear active round
    const ctx = await request.newContext();
    await ctx.put(`${API}/active-round`, {
      data: { roundId: null },
      headers: { Authorization: `Bearer ${token}` },
    });
    await ctx.dispose();

    await page.goto('/');
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'), { timeout: 5000 });
    const body = await page.locator('body').textContent();
    expect(body).toContain('No future round');

    // Restore active round for other tests
    const ctx2 = await request.newContext();
    await ctx2.put(`${API}/active-round`, {
      data: { roundId },
      headers: { Authorization: `Bearer ${token}` },
    });
    await ctx2.dispose();
  });
});

test.describe('Public Upvoting', () => {
  test('suggestion shows vote button during suggestions phase', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'), { timeout: 5000 });
    const body = await page.locator('body').textContent();
    if (body?.includes('suggestions')) {
      const voteBtn = page.locator('.vote-btn').first();
      if (await voteBtn.isVisible()) {
        await expect(voteBtn).toContainText('▲');
      }
    }
  });
});
