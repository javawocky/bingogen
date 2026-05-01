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
  votes: string[];
  createdAt: string;
}

export interface Round {
  id: string;
  seasonId: string;
  name: string;
  eventDate: string;
  phase: 'suggestions' | 'boards' | 'raceday' | 'complete';
  phaseDates: { suggestionsEnd: string; boardsEnd: string };
  suggestions: Suggestion[];
  playerIds: string[];
}

export interface BoardSquare {
  position: number;
  suggestionId: string;
  text: string;
  completed: boolean;
}

export interface BoardResponse {
  boardSize: number;
  squares: BoardSquare[];
  score: number;
  hasBingo: boolean;
}

export interface LeaderboardEntry {
  userId: string;
  xHandle: string;
  displayName: string;
  score: number;
  hasBingo: boolean;
}

export interface SeasonLeaderboardEntry extends LeaderboardEntry {
  totalScore: number;
  bingos: number;
}
