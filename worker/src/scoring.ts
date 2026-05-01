import { Round, RoundBoards, PlayerBoard, BoardSquare, Suggestion } from './types';

export function calculateScore(board: PlayerBoard, suggestions: Suggestion[], boardSize: number): { score: number; hasBingo: boolean } {
  const grid: boolean[] = board.squares.map(sq =>
    sq.suggestionId === 'FREE' || suggestions.find(s => s.id === sq.suggestionId)?.completed === true
  );

  let totalScore = 0;
  let hasBingo = false;

  const lines = getLines(boardSize);

  for (const line of lines) {
    const completed = line.map(i => grid[i]);
    if (completed.every(Boolean)) {
      totalScore += 100;
      hasBingo = true;
    } else {
      totalScore += countConsecutivePairs(completed);
    }
  }

  return { score: totalScore, hasBingo };
}

function getLines(size: number): number[][] {
  const lines: number[][] = [];

  // Rows
  for (let r = 0; r < size; r++) {
    const row: number[] = [];
    for (let c = 0; c < size; c++) row.push(r * size + c);
    lines.push(row);
  }

  // Columns
  for (let c = 0; c < size; c++) {
    const col: number[] = [];
    for (let r = 0; r < size; r++) col.push(r * size + c);
    lines.push(col);
  }

  // Main diagonal (top-left → bottom-right)
  const diag1: number[] = [];
  for (let i = 0; i < size; i++) diag1.push(i * size + i);
  lines.push(diag1);

  // Anti-diagonal (top-right → bottom-left)
  const diag2: number[] = [];
  for (let i = 0; i < size; i++) diag2.push(i * size + (size - 1 - i));
  lines.push(diag2);

  return lines;
}

function countConsecutivePairs(completed: boolean[]): number {
  let pairs = 0;
  for (let i = 0; i < completed.length - 1; i++) {
    if (completed[i] && completed[i + 1]) pairs++;
  }
  return pairs;
}

export function generateBoard(selectedSuggestionIds: string[], boardSize: number): PlayerBoard {
  const totalSquares = boardSize * boardSize;
  const centreIndex = Math.floor(totalSquares / 2);

  const shuffled = [...selectedSuggestionIds].sort(() => Math.random() - 0.5);
  const needed = totalSquares - 1;
  const picked = shuffled.slice(0, needed);

  const squares = [];
  let pickIdx = 0;
  for (let i = 0; i < totalSquares; i++) {
    if (i === centreIndex) {
      squares.push({ position: i, suggestionId: 'FREE' });
    } else {
      squares.push({ position: i, suggestionId: picked[pickIdx++] || '' });
    }
  }

  return { squares, score: 0, hasBingo: false };
}

export function updateBoardIntelligently(
  existingBoard: PlayerBoard,
  selectedSuggestionIds: string[],
  boardSize: number
): PlayerBoard {
  const totalSquares = boardSize * boardSize;
  const centreIndex = Math.floor(totalSquares / 2);
  const selectedSet = new Set(selectedSuggestionIds);

  // Keep existing squares that are still in the selected pool
  const newSquares: BoardSquare[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < totalSquares; i++) {
    if (i === centreIndex) {
      newSquares.push({ position: i, suggestionId: 'FREE' });
      continue;
    }
    const existing = existingBoard.squares.find(s => s.position === i);
    if (existing && existing.suggestionId !== 'FREE' && existing.suggestionId && selectedSet.has(existing.suggestionId)) {
      newSquares.push({ position: i, suggestionId: existing.suggestionId });
      usedIds.add(existing.suggestionId);
    } else {
      newSquares.push({ position: i, suggestionId: '' }); // placeholder
    }
  }

  // Fill empty slots with unused suggestions (randomised)
  const unused = selectedSuggestionIds.filter(id => !usedIds.has(id)).sort(() => Math.random() - 0.5);
  let unusedIdx = 0;
  for (let i = 0; i < newSquares.length; i++) {
    if (newSquares[i].suggestionId === '' && unusedIdx < unused.length) {
      newSquares[i].suggestionId = unused[unusedIdx++];
    }
  }

  return { squares: newSquares, score: existingBoard.score, hasBingo: existingBoard.hasBingo };
}
