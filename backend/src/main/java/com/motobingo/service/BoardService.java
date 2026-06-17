package com.motobingo.service;

import com.motobingo.model.*;
import com.motobingo.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class BoardService {

    private final BoardRepository boardRepository;
    private final BoardSquareRepository boardSquareRepository;
    private final SuggestionRepository suggestionRepository;

    public BoardService(BoardRepository boardRepository, BoardSquareRepository boardSquareRepository, SuggestionRepository suggestionRepository) {
        this.boardRepository = boardRepository;
        this.boardSquareRepository = boardSquareRepository;
        this.suggestionRepository = suggestionRepository;
    }

    @Transactional
    public Board generateBoard(String roundId, String userId, List<String> selectedIds, int boardSize) {
        int totalSquares = boardSize * boardSize;
        int centreIndex = totalSquares / 2;

        List<String> shuffled = new ArrayList<>(selectedIds);
        Collections.shuffle(shuffled);
        List<String> picked = shuffled.subList(0, Math.min(shuffled.size(), totalSquares - 1));

        Board board = boardRepository.findByRoundIdAndUserId(roundId, userId).orElse(null);
        if (board != null) {
            boardSquareRepository.deleteByBoardId(board.getId());
        } else {
            board = new Board();
            board.setRoundId(roundId);
            board.setUserId(userId);
        }
        board.setBoardSize(boardSize);
        board = boardRepository.save(board);

        int pickIdx = 0;
        List<BoardSquare> squares = new ArrayList<>();
        for (int i = 0; i < totalSquares; i++) {
            BoardSquare sq = new BoardSquare();
            sq.setBoardId(board.getId());
            sq.setPosition(i);
            if (i == centreIndex) {
                sq.setSuggestionId("FREE");
            } else {
                sq.setSuggestionId(pickIdx < picked.size() ? picked.get(pickIdx++) : "");
            }
            squares.add(sq);
        }
        boardSquareRepository.saveAll(squares);
        return board;
    }

    @Transactional
    public Board updateBoardIntelligently(String roundId, String userId, List<String> selectedIds, int boardSize) {
        Board board = boardRepository.findByRoundIdAndUserId(roundId, userId).orElse(null);
        if (board == null) {
            return generateBoard(roundId, userId, selectedIds, boardSize);
        }

        int totalSquares = boardSize * boardSize;
        int centreIndex = totalSquares / 2;
        Set<String> selectedSet = new HashSet<>(selectedIds);

        List<BoardSquare> existing = boardSquareRepository.findByBoardIdOrderByPosition(board.getId());
        Set<String> usedIds = new HashSet<>();

        // Keep squares still in selected set
        for (BoardSquare sq : existing) {
            if (sq.getPosition() == centreIndex) {
                sq.setSuggestionId("FREE");
            } else if (sq.getSuggestionId() != null && !sq.getSuggestionId().equals("FREE")
                    && !sq.getSuggestionId().isEmpty() && selectedSet.contains(sq.getSuggestionId())) {
                usedIds.add(sq.getSuggestionId());
            } else {
                sq.setSuggestionId("");
            }
        }

        // Fill empty with unused selections
        List<String> unused = selectedIds.stream().filter(id -> !usedIds.contains(id)).collect(Collectors.toList());
        Collections.shuffle(unused);
        int unusedIdx = 0;
        for (BoardSquare sq : existing) {
            if ("".equals(sq.getSuggestionId()) && unusedIdx < unused.size()) {
                sq.setSuggestionId(unused.get(unusedIdx++));
            }
        }

        boardSquareRepository.saveAll(existing);
        return board;
    }

    public ScoreResult calculateScore(String roundId, String userId) {
        Board board = boardRepository.findByRoundIdAndUserId(roundId, userId).orElse(null);
        if (board == null) return new ScoreResult(0, false);
        return calculateScore(board);
    }

    public ScoreResult calculateScore(Board board) {
        List<BoardSquare> squares = boardSquareRepository.findByBoardIdOrderByPosition(board.getId());
        List<Suggestion> suggestions = suggestionRepository.findByRoundId(board.getRoundId());
        Map<String, Suggestion> sugMap = suggestions.stream().collect(Collectors.toMap(Suggestion::getId, s -> s, (a, b) -> a));

        int boardSize = board.getBoardSize();
        boolean[] grid = new boolean[squares.size()];
        for (int i = 0; i < squares.size(); i++) {
            String sid = squares.get(i).getSuggestionId();
            if ("FREE".equals(sid)) {
                grid[i] = true;
            } else {
                Suggestion s = sugMap.get(sid);
                grid[i] = s != null && s.isCompleted();
            }
        }

        List<int[]> lines = getLines(boardSize);
        int totalScore = 0;
        boolean hasBingo = false;

        for (int[] line : lines) {
            boolean allCompleted = true;
            for (int idx : line) {
                if (!grid[idx]) { allCompleted = false; break; }
            }
            if (allCompleted) {
                totalScore += 100;
                hasBingo = true;
            } else {
                int pairs = 0;
                for (int i = 0; i < line.length - 1; i++) {
                    if (grid[line[i]] && grid[line[i + 1]]) pairs++;
                }
                totalScore += pairs;
            }
        }

        return new ScoreResult(totalScore, hasBingo);
    }

    private List<int[]> getLines(int size) {
        List<int[]> lines = new ArrayList<>();
        for (int r = 0; r < size; r++) {
            int[] row = new int[size];
            for (int c = 0; c < size; c++) row[c] = r * size + c;
            lines.add(row);
        }
        for (int c = 0; c < size; c++) {
            int[] col = new int[size];
            for (int r = 0; r < size; r++) col[r] = r * size + c;
            lines.add(col);
        }
        int[] diag1 = new int[size];
        for (int i = 0; i < size; i++) diag1[i] = i * size + i;
        lines.add(diag1);
        int[] diag2 = new int[size];
        for (int i = 0; i < size; i++) diag2[i] = i * size + (size - 1 - i);
        lines.add(diag2);
        return lines;
    }

    public static class ScoreResult {
        private final int score;
        private final boolean hasBingo;

        public ScoreResult(int score, boolean hasBingo) {
            this.score = score;
            this.hasBingo = hasBingo;
        }

        public int getScore() { return score; }
        public boolean isHasBingo() { return hasBingo; }
    }
}
