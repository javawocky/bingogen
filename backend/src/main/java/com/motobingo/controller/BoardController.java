package com.motobingo.controller;

import com.motobingo.model.*;
import com.motobingo.repository.*;
import com.motobingo.security.SecurityUtil;
import com.motobingo.service.BoardService;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/rounds/{roundId}")
public class BoardController {

    private final RoundRepository roundRepository;
    private final SuggestionRepository suggestionRepository;
    private final BoardRepository boardRepository;
    private final BoardSquareRepository boardSquareRepository;
    private final RoundPlayerRepository roundPlayerRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

    public BoardController(RoundRepository roundRepository, SuggestionRepository suggestionRepository,
                           BoardRepository boardRepository, BoardSquareRepository boardSquareRepository,
                           RoundPlayerRepository roundPlayerRepository, UserRepository userRepository,
                           BoardService boardService) {
        this.roundRepository = roundRepository;
        this.suggestionRepository = suggestionRepository;
        this.boardRepository = boardRepository;
        this.boardSquareRepository = boardSquareRepository;
        this.roundPlayerRepository = roundPlayerRepository;
        this.userRepository = userRepository;
        this.boardService = boardService;
    }

    @PostMapping("/generate-boards")
    @Transactional
    public ResponseEntity<?> generateBoards(@PathVariable String roundId) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        Round round = roundRepository.findById(roundId).orElse(null);
        if (round == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));

        List<String> selected = suggestionRepository.findByRoundIdAndSelectedTrue(roundId)
                .stream().map(Suggestion::getId).collect(Collectors.toList());
        if (selected.size() < 8) return ResponseEntity.badRequest().body(Map.of("error", "Need at least 8 selected suggestions"));

        int boardSize = (int) Math.ceil(Math.sqrt(selected.size() + 1));
        List<RoundPlayer> players = roundPlayerRepository.findByRoundId(roundId);
        for (RoundPlayer rp : players) {
            boardService.generateBoard(roundId, rp.getUserId(), selected, boardSize);
        }
        return ResponseEntity.ok(Map.of("boardSize", boardSize, "playerCount", players.size()));
    }

    @GetMapping("/boards/{userId}")
    @Transactional
    public ResponseEntity<?> getBoard(@PathVariable String roundId, @PathVariable String userId) {
        Round round = roundRepository.findById(roundId).orElse(null);
        if (round == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));

        Board board = boardRepository.findByRoundIdAndUserId(roundId, userId).orElse(null);

        // Auto-create if missing in boards/raceday phase
        if (board == null && ("boards".equals(round.getPhase()) || "raceday".equals(round.getPhase()))) {
            if (!userRepository.existsById(userId)) return ResponseEntity.status(404).body(Map.of("error", "User not found"));
            List<String> selected = suggestionRepository.findByRoundIdAndSelectedTrue(roundId)
                    .stream().map(Suggestion::getId).collect(Collectors.toList());
            board = boardService.generateBoard(roundId, userId, selected, 5);
            if (!roundPlayerRepository.existsByRoundIdAndUserId(roundId, userId)) {
                RoundPlayer rp = new RoundPlayer();
                rp.setRoundId(roundId);
                rp.setUserId(userId);
                roundPlayerRepository.save(rp);
            }
        }

        if (board == null) return ResponseEntity.status(404).body(Map.of("error", "No boards generated"));

        List<BoardSquare> squares = boardSquareRepository.findByBoardIdOrderByPosition(board.getId());
        List<Suggestion> suggestions = suggestionRepository.findByRoundId(roundId);
        Map<String, Suggestion> sugMap = suggestions.stream().collect(Collectors.toMap(Suggestion::getId, s -> s, (a, b) -> a));

        List<Map<String, Object>> enriched = squares.stream().map(sq -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("position", sq.getPosition());
            m.put("suggestionId", sq.getSuggestionId());
            if ("FREE".equals(sq.getSuggestionId())) {
                m.put("text", "FREE");
                m.put("completed", true);
            } else {
                Suggestion s = sugMap.get(sq.getSuggestionId());
                m.put("text", s != null ? s.getText() : "");
                m.put("completed", s != null && s.isCompleted());
            }
            return m;
        }).collect(Collectors.toList());

        BoardService.ScoreResult result = boardService.calculateScore(board);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("boardSize", board.getBoardSize());
        response.put("squares", enriched);
        response.put("score", result.getScore());
        response.put("hasBingo", result.isHasBingo());
        return ResponseEntity.ok(response);
    }
}
