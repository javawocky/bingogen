CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    x_handle TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_users_x_handle_lower ON users(LOWER(x_handle));

-- Championships
CREATE TABLE championships (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    short_code TEXT NOT NULL UNIQUE
);

INSERT INTO championships (id, name, short_code) VALUES
    (gen_random_uuid()::text, 'Pro Motocross', 'MX'),
    (gen_random_uuid()::text, 'Supercross', 'SX'),
    (gen_random_uuid()::text, 'SuperMotocross', 'SMX');

-- Seasons
CREATE TABLE seasons (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    championship_id TEXT NOT NULL REFERENCES championships(id),
    year INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(championship_id, year)
);
CREATE INDEX idx_seasons_championship ON seasons(championship_id);

-- Rounds
CREATE TABLE rounds (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    season_id TEXT NOT NULL REFERENCES seasons(id),
    name TEXT NOT NULL,
    event_date DATE NOT NULL,
    phase TEXT NOT NULL DEFAULT 'suggestions' CHECK (phase IN ('suggestions', 'boards', 'raceday', 'complete')),
    suggestions_end TIMESTAMPTZ,
    boards_end TIMESTAMPTZ
);
CREATE INDEX idx_rounds_season ON rounds(season_id);

-- Active round (singleton)
CREATE TABLE active_round (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    round_id TEXT REFERENCES rounds(id) ON DELETE SET NULL
);
INSERT INTO active_round (id, round_id) VALUES (1, NULL);

-- Suggestions
CREATE TABLE suggestions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    selected BOOLEAN NOT NULL DEFAULT false,
    completed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_suggestions_round ON suggestions(round_id);

-- Votes
CREATE TABLE votes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    suggestion_id TEXT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
    voter_id TEXT NOT NULL,
    UNIQUE(suggestion_id, voter_id)
);
CREATE INDEX idx_votes_suggestion ON votes(suggestion_id);

-- Round players
CREATE TABLE round_players (
    round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (round_id, user_id)
);

-- Boards
CREATE TABLE boards (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board_size INTEGER NOT NULL DEFAULT 5,
    UNIQUE(round_id, user_id)
);
CREATE INDEX idx_boards_round ON boards(round_id);

-- Board squares
CREATE TABLE board_squares (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    suggestion_id TEXT,  -- NULL not used; 'FREE' stored as special value
    UNIQUE(board_id, position)
);
CREATE INDEX idx_board_squares_board ON board_squares(board_id);
