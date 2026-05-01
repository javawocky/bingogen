import { Router, json, cors } from './router';
import { createJwt, requireAdmin } from './auth';
import { calculateScore, generateBoard } from './scoring';
import { Env, User, Championship, Season, Round, RoundBoards, Suggestion } from './types';

const router = new Router();

// --- Auth ---
router.post('/api/v1/auth/login', async (req, env) => {
  const { username, password } = await req.json() as { username: string; password: string };
  if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
    return json({ error: 'Invalid credentials' }, 401);
  }
  const token = await createJwt({ role: 'admin', sub: username }, env.JWT_SECRET);
  return json({ token });
});

// --- CSRF ---
router.get('/api/v1/csrf', async (_req, env) => {
  const token = crypto.randomUUID();
  await env.KV.put(`csrf:${token}`, '1', { expirationTtl: 600 });
  return json({ token });
});

// --- Users ---
router.get('/api/v1/users', async (_req, env) => {
  const data = await env.KV.get('users', 'json') as User[] | null;
  return json(data || []);
});

router.post('/api/v1/users', async (req, env) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const { xHandle, displayName } = await req.json() as { xHandle: string; displayName: string };
  if (!xHandle?.trim() || !displayName?.trim()) return json({ error: 'xHandle and displayName required' }, 400);

  const users = (await env.KV.get('users', 'json') as User[] | null) || [];
  if (users.some(u => u.xHandle === xHandle.trim())) return json({ error: 'User already exists' }, 409);

  const user: User = { id: crypto.randomUUID(), xHandle: xHandle.trim(), displayName: displayName.trim(), createdAt: new Date().toISOString() };
  users.push(user);
  await env.KV.put('users', JSON.stringify(users));
  return json(user, 201);
});

router.put('/api/v1/users/:id', async (req, env, params) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const { xHandle, displayName } = await req.json() as { xHandle?: string; displayName?: string };
  const users = (await env.KV.get('users', 'json') as User[] | null) || [];
  const idx = users.findIndex(u => u.id === params.id);
  if (idx === -1) return json({ error: 'Not found' }, 404);

  if (xHandle) users[idx].xHandle = xHandle.trim();
  if (displayName) users[idx].displayName = displayName.trim();
  await env.KV.put('users', JSON.stringify(users));
  return json(users[idx]);
});

router.delete('/api/v1/users/:id', async (req, env, params) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const users = (await env.KV.get('users', 'json') as User[] | null) || [];
  const filtered = users.filter(u => u.id !== params.id);
  if (filtered.length === users.length) return json({ error: 'Not found' }, 404);
  await env.KV.put('users', JSON.stringify(filtered));
  return json({ ok: true });
});

// --- Championships (preset, seeded on first access) ---
const PRESET_CHAMPIONSHIPS: Omit<Championship, 'id'>[] = [
  { name: 'Pro Motocross', shortCode: 'MX' },
  { name: 'Supercross', shortCode: 'SX' },
  { name: 'SuperMotocross', shortCode: 'SMX' },
];

async function getOrSeedChampionships(env: Env): Promise<Championship[]> {
  let champs = await env.KV.get('championships', 'json') as Championship[] | null;
  if (!champs || champs.length === 0) {
    champs = PRESET_CHAMPIONSHIPS.map(c => ({ ...c, id: crypto.randomUUID() }));
    await env.KV.put('championships', JSON.stringify(champs));
  }
  return champs;
}

router.get('/api/v1/championships', async (_req, env) => {
  return json(await getOrSeedChampionships(env));
});

// --- Seasons ---
router.get('/api/v1/championships/:id/seasons', async (_req, env, params) => {
  const data = await env.KV.get(`championship:${params.id}:seasons`, 'json') as Season[] | null;
  return json(data || []);
});

router.post('/api/v1/championships/:id/seasons', async (req, env, params) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const { year } = await req.json() as { year: number };
  if (!year) return json({ error: 'year required' }, 400);

  const key = `championship:${params.id}:seasons`;
  const seasons = (await env.KV.get(key, 'json') as Season[] | null) || [];

  // Deactivate previous active season
  seasons.forEach(s => { s.active = false; });

  const season: Season = { id: crypto.randomUUID(), championshipId: params.id, year, active: true };
  seasons.push(season);
  await env.KV.put(key, JSON.stringify(seasons));
  return json(season, 201);
});

// --- Rounds ---
router.get('/api/v1/seasons/:id/rounds', async (_req, env, params) => {
  const data = await env.KV.get(`season:${params.id}:rounds`, 'json') as Round[] | null;
  return json(data || []);
});

router.get('/api/v1/seasons/:id/leaderboard', async (_req, env, params) => {
  const rounds = (await env.KV.get(`season:${params.id}:rounds`, 'json') as Round[] | null) || [];
  const users = (await env.KV.get('users', 'json') as User[] | null) || [];
  const cumulative: Record<string, { userId: string; xHandle: string; displayName: string; totalScore: number; bingos: number }> = {};

  for (const round of rounds) {
    const boardsData = await env.KV.get(`round:${round.id}:boards`, 'json') as RoundBoards | null;
    if (!boardsData) continue;
    for (const [userId, board] of Object.entries(boardsData.boards)) {
      if (!cumulative[userId]) {
        const user = users.find(u => u.id === userId);
        cumulative[userId] = { userId, xHandle: user?.xHandle || '', displayName: user?.displayName || '', totalScore: 0, bingos: 0 };
      }
      const { score, hasBingo } = calculateScore(board, round.suggestions, boardsData.boardSize);
      cumulative[userId].totalScore += score;
      if (hasBingo) cumulative[userId].bingos++;
    }
  }

  const leaderboard = Object.values(cumulative).sort((a, b) => b.totalScore - a.totalScore);
  return json(leaderboard);
});

router.get('/api/v1/rounds/:id', async (req, env, params) => {
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  if (!round) return json({ error: 'Not found' }, 404);

  const isAdmin = await requireAdmin(req, env);
  // Non-admins only see approved suggestions
  if (!isAdmin) {
    round.suggestions = round.suggestions.filter(s => s.status === 'approved');
  }
  return json(round);
});

router.post('/api/v1/seasons/:id/rounds', async (req, env, params) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const { name, eventDate, phaseDates } = await req.json() as { name: string; eventDate: string; phaseDates: Round['phaseDates'] };
  if (!name?.trim() || !eventDate) return json({ error: 'name and eventDate required' }, 400);

  const round: Round = {
    id: crypto.randomUUID(), seasonId: params.id, name: name.trim(), eventDate,
    phase: 'suggestions', phaseDates: phaseDates || { suggestionsEnd: '', boardsEnd: '' },
    suggestions: [], playerIds: [],
  };

  await env.KV.put(`round:${round.id}`, JSON.stringify(round));

  // Add to season's round list
  const key = `season:${params.id}:rounds`;
  const rounds = (await env.KV.get(key, 'json') as Round[] | null) || [];
  rounds.push(round);
  await env.KV.put(key, JSON.stringify(rounds));

  return json(round, 201);
});

router.put('/api/v1/rounds/:id', async (req, env, params) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  if (!round) return json({ error: 'Not found' }, 404);

  const updates = await req.json() as Partial<Round>;
  if (updates.name) round.name = updates.name;
  if (updates.eventDate) round.eventDate = updates.eventDate;
  if (updates.phaseDates) round.phaseDates = updates.phaseDates;

  await env.KV.put(`round:${round.id}`, JSON.stringify(round));

  // Sync the season's round list
  const key = `season:${round.seasonId}:rounds`;
  const rounds = (await env.KV.get(key, 'json') as Round[] | null) || [];
  const idx = rounds.findIndex(r => r.id === round.id);
  if (idx !== -1) { rounds[idx] = round; await env.KV.put(key, JSON.stringify(rounds)); }

  return json(round);
});

router.put('/api/v1/rounds/:id/phase', async (req, env, params) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  if (!round) return json({ error: 'Not found' }, 404);

  const { phase } = await req.json() as { phase: Round['phase'] };
  const order: Round['phase'][] = ['suggestions', 'boards', 'raceday', 'complete'];
  const currentIdx = order.indexOf(round.phase);
  const newIdx = order.indexOf(phase);
  if (newIdx <= currentIdx) return json({ error: 'Can only advance phase forward' }, 400);

  round.phase = phase;
  await env.KV.put(`round:${round.id}`, JSON.stringify(round));
  return json(round);
});

router.delete('/api/v1/rounds/:id', async (req, env, params) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  if (!round) return json({ error: 'Not found' }, 404);

  await env.KV.delete(`round:${round.id}`);
  await env.KV.delete(`round:${round.id}:boards`);

  // Remove from season's round list
  const key = `season:${round.seasonId}:rounds`;
  const rounds = (await env.KV.get(key, 'json') as Round[] | null) || [];
  const filtered = rounds.filter(r => r.id !== round.id);
  await env.KV.put(key, JSON.stringify(filtered));

  return json({ ok: true });
});

// --- Active Round (public: returns the admin-selected active round) ---
router.get('/api/v1/active-round', async (_req, env) => {
  const activeRoundId = await env.KV.get('active-round-id');
  if (!activeRoundId) {
    return json({ round: null, message: 'No future round is ready to play just yet. Check back soon!' });
  }

  const round = await env.KV.get(`round:${activeRoundId}`, 'json') as Round | null;
  if (!round || round.phase === 'complete') {
    return json({ round: null, message: 'No future round is ready to play just yet. Check back soon!' });
  }

  round.suggestions = round.suggestions.filter(s => s.status === 'approved');

  // Find championship and season for context
  const champs = await getOrSeedChampionships(env);
  let championship: Championship | null = null;
  let season: Season | null = null;
  for (const champ of champs) {
    const seasons = (await env.KV.get(`championship:${champ.id}:seasons`, 'json') as Season[] | null) || [];
    for (const s of seasons) {
      if (s.id === round.seasonId) { championship = champ; season = s; break; }
    }
    if (season) break;
  }

  return json({ round, championship, season });
});

router.put('/api/v1/active-round', async (req, env) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const { roundId } = await req.json() as { roundId: string | null };
  if (roundId) {
    await env.KV.put('active-round-id', roundId);
  } else {
    await env.KV.delete('active-round-id');
  }
  return json({ ok: true });
});

// --- Suggestions ---
router.post('/api/v1/rounds/:id/suggestions', async (req, env, params) => {
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  if (!round) return json({ error: 'Not found' }, 404);

  const isAdmin = await requireAdmin(req, env);

  // Non-admin: check CSRF and phase
  if (!isAdmin) {
    if (round.phase !== 'suggestions') return json({ error: 'Suggestions are closed' }, 400);
    const csrfToken = req.headers.get('X-CSRF-Token');
    if (!csrfToken) return json({ error: 'CSRF token required' }, 403);
    const csrfValid = await env.KV.get(`csrf:${csrfToken}`);
    if (!csrfValid) return json({ error: 'Invalid CSRF token' }, 403);
    await env.KV.delete(`csrf:${csrfToken}`);
  }

  const { text } = await req.json() as { text: string };
  if (!text?.trim()) return json({ error: 'text required' }, 400);
  if (text.trim().length > 200) return json({ error: 'text must be 200 characters or less' }, 400);

  const suggestion: Suggestion = {
    id: crypto.randomUUID(), text: text.trim().slice(0, 200),
    status: isAdmin ? 'approved' : 'pending',
    selected: false, completed: false, votes: [], createdAt: new Date().toISOString(),
  };
  round.suggestions.push(suggestion);
  await env.KV.put(`round:${round.id}`, JSON.stringify(round));
  return json(suggestion, 201);
});

router.put('/api/v1/rounds/:id/suggestions/:sid', async (req, env, params) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  if (!round) return json({ error: 'Not found' }, 404);

  const idx = round.suggestions.findIndex(s => s.id === params.sid);
  if (idx === -1) return json({ error: 'Suggestion not found' }, 404);

  const updates = await req.json() as Partial<Suggestion>;
  if (updates.text !== undefined) round.suggestions[idx].text = updates.text.trim();
  if (updates.status !== undefined) round.suggestions[idx].status = updates.status;
  if (updates.selected !== undefined) round.suggestions[idx].selected = updates.selected;
  if (updates.completed !== undefined) round.suggestions[idx].completed = updates.completed;

  await env.KV.put(`round:${round.id}`, JSON.stringify(round));

  // If marking complete, recalculate all board scores
  if (updates.completed !== undefined) {
    const boardsData = await env.KV.get(`round:${round.id}:boards`, 'json') as RoundBoards | null;
    if (boardsData) {
      for (const [userId, board] of Object.entries(boardsData.boards)) {
        const result = calculateScore(board, round.suggestions, boardsData.boardSize);
        boardsData.boards[userId].score = result.score;
        boardsData.boards[userId].hasBingo = result.hasBingo;
      }
      await env.KV.put(`round:${round.id}:boards`, JSON.stringify(boardsData));
    }
  }

  return json(round.suggestions[idx]);
});

router.delete('/api/v1/rounds/:id/suggestions/:sid', async (req, env, params) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  if (!round) return json({ error: 'Not found' }, 404);

  round.suggestions = round.suggestions.filter(s => s.id !== params.sid);
  await env.KV.put(`round:${round.id}`, JSON.stringify(round));
  return json({ ok: true });
});

// --- Votes (toggle) ---
router.post('/api/v1/rounds/:id/suggestions/:sid/vote', async (req, env, params) => {
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  if (!round) return json({ error: 'Not found' }, 404);
  if (round.phase !== 'suggestions') return json({ error: 'Voting is closed' }, 400);

  const { voterId } = await req.json() as { voterId: string };
  if (!voterId) return json({ error: 'voterId required' }, 400);

  const idx = round.suggestions.findIndex(s => s.id === params.sid);
  if (idx === -1) return json({ error: 'Suggestion not found' }, 404);
  if (round.suggestions[idx].status !== 'approved') return json({ error: 'Cannot vote on unapproved suggestion' }, 400);

  const s = round.suggestions[idx];
  if (!s.votes) s.votes = [];
  const voteIdx = s.votes.indexOf(voterId);
  if (voteIdx === -1) {
    s.votes.push(voterId);
  } else {
    s.votes.splice(voteIdx, 1);
  }

  await env.KV.put(`round:${round.id}`, JSON.stringify(round));
  return json({ votes: s.votes.length, voted: s.votes.includes(voterId) });
});

// --- Players in round ---
router.post('/api/v1/rounds/:id/players', async (req, env, params) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  if (!round) return json({ error: 'Not found' }, 404);
  if (round.phase === 'raceday' || round.phase === 'complete') return json({ error: 'Cannot add players in this phase' }, 400);

  const { userIds } = await req.json() as { userIds: string[] };
  const newIds = userIds.filter(id => !round.playerIds.includes(id));
  round.playerIds.push(...newIds);
  await env.KV.put(`round:${round.id}`, JSON.stringify(round));

  // If in boards phase, generate boards for new players
  if (round.phase === 'boards' && newIds.length > 0) {
    const selected = round.suggestions.filter(s => s.selected).map(s => s.id);
    const boardSize = Math.ceil(Math.sqrt(selected.length + 1));
    const boardsData = (await env.KV.get(`round:${round.id}:boards`, 'json') as RoundBoards | null) || { roundId: round.id, boardSize, boards: {} };
    for (const userId of newIds) {
      boardsData.boards[userId] = generateBoard(selected, boardSize);
    }
    await env.KV.put(`round:${round.id}:boards`, JSON.stringify(boardsData));
  }

  return json(round);
});

router.delete('/api/v1/rounds/:id/players/:userId', async (req, env, params) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  if (!round) return json({ error: 'Not found' }, 404);

  round.playerIds = round.playerIds.filter(id => id !== params.userId);
  await env.KV.put(`round:${round.id}`, JSON.stringify(round));
  return json({ ok: true });
});

// --- Boards ---
router.post('/api/v1/rounds/:id/generate-boards', async (req, env, params) => {
  if (!await requireAdmin(req, env)) return json({ error: 'Unauthorized' }, 401);
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  if (!round) return json({ error: 'Not found' }, 404);

  const selected = round.suggestions.filter(s => s.selected).map(s => s.id);
  if (selected.length < 8) return json({ error: 'Need at least 8 selected suggestions' }, 400);

  const boardSize = Math.ceil(Math.sqrt(selected.length + 1)); // +1 for free square
  const boardsData: RoundBoards = { roundId: round.id, boardSize, boards: {} };

  for (const userId of round.playerIds) {
    boardsData.boards[userId] = generateBoard(selected, boardSize);
  }

  await env.KV.put(`round:${round.id}:boards`, JSON.stringify(boardsData));
  return json({ boardSize, playerCount: round.playerIds.length });
});

router.get('/api/v1/rounds/:id/boards/:userId', async (_req, env, params) => {
  const boardsData = await env.KV.get(`round:${params.id}:boards`, 'json') as RoundBoards | null;
  if (!boardsData) return json({ error: 'No boards generated' }, 404);

  const board = boardsData.boards[params.userId];
  if (!board) return json({ error: 'Board not found' }, 404);

  // Get round for suggestion text
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  const sugMap = new Map(round?.suggestions.map(s => [s.id, s]) || []);

  const enriched = board.squares.map(sq => ({
    position: sq.position,
    suggestionId: sq.suggestionId,
    text: sq.suggestionId === 'FREE' ? 'FREE' : sugMap.get(sq.suggestionId)?.text || '',
    completed: sq.suggestionId === 'FREE' || (sugMap.get(sq.suggestionId)?.completed ?? false),
  }));

  // Recalculate score live
  const result = round ? calculateScore(board, round.suggestions, boardsData.boardSize) : { score: 0, hasBingo: false };

  return json({ boardSize: boardsData.boardSize, squares: enriched, score: result.score, hasBingo: result.hasBingo });
});

router.get('/api/v1/rounds/:id/leaderboard', async (_req, env, params) => {
  const round = await env.KV.get(`round:${params.id}`, 'json') as Round | null;
  if (!round) return json({ error: 'Not found' }, 404);

  const boardsData = await env.KV.get(`round:${round.id}:boards`, 'json') as RoundBoards | null;
  const users = (await env.KV.get('users', 'json') as User[] | null) || [];

  if (!boardsData) return json([]);

  const entries = Object.entries(boardsData.boards).map(([userId, board]) => {
    const user = users.find(u => u.id === userId);
    const result = calculateScore(board, round.suggestions, boardsData.boardSize);
    return { userId, xHandle: user?.xHandle || '', displayName: user?.displayName || '', score: result.score, hasBingo: result.hasBingo };
  }).sort((a, b) => b.score - a.score);

  return json(entries);
});

// --- Main handler ---
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }), env.CORS_ORIGIN);
    }
    const response = await router.handle(request, env);
    return cors(response, env.CORS_ORIGIN);
  },
};
