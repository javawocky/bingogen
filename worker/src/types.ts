export interface Env {
  KV: KVNamespace;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  DEV_BYPASS_AUTH?: string;
}

export interface User {
  id: string;
  xHandle: string;
  displayName: string;
  createdAt: string;
}

export interface Championship {
  id: string;
  name: string;
  shortCode: string;
}

export interface Season {
  id: string;
  championshipId: string;
  year: number;
  active: boolean;
}

export interface Suggestion {
  id: string;
  text: string;
  status: 'pending' | 'approved' | 'rejected';
  selected: boolean;
  completed: boolean;
  votes: string[]; // anonymous voter IDs (from CSRF or cookie)
  createdAt: string;
}

export interface Round {
  id: string;
  seasonId: string;
  name: string;
  eventDate: string;
  phase: 'suggestions' | 'boards' | 'raceday' | 'complete';
  phaseDates: {
    suggestionsEnd: string;
    boardsEnd: string;
  };
  suggestions: Suggestion[];
  playerIds: string[];
}

export interface BoardSquare {
  position: number;
  suggestionId: string; // "FREE" for centre
}

export interface PlayerBoard {
  squares: BoardSquare[];
  score: number;
  hasBingo: boolean;
}

export interface RoundBoards {
  roundId: string;
  boardSize: number;
  boards: Record<string, PlayerBoard>;
}
