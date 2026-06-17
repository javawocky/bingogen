package com.motobingo.controller;

import com.motobingo.model.*;
import com.motobingo.repository.*;
import com.motobingo.service.BoardService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1")
public class LeaderboardController {

    private final RoundRepository roundRepository;
    private final BoardRepository boardRepository;
    private final BoardSquareRepository boardSquareRepository;
    private final SuggestionRepository suggestionRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

    public LeaderboardController(RoundRepository roundRepository, BoardRepository boardRepository,
                                 BoardSquareRepository boardSquareRepository, SuggestionRepository suggestionRepository,
                                 UserRepository userRepository, BoardService boardService) {
        this.roundRepository = roundRepository;
        this.boardRepository = boardRepository;
        this.boardSquareRepository = boardSquareRepository;
        this.suggestionRepository = suggestionRepository;
        this.userRepository = userRepository;
        this.boardService = boardService;
    }

    @GetMapping("/rounds/{roundId}/leaderboard")
    public ResponseEntity<?> roundLeaderboard(@PathVariable String roundId) {
        Round round = roundRepository.findById(roundId).orElse(null);
        if (round == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));

        List<Board> boards = boardRepository.findByRoundId(roundId);
        List<User> users = userRepository.findAll();
        Set<String> userIds = users.stream().map(User::getId).collect(Collectors.toSet());
        Map<String, User> userMap = users.stream().collect(Collectors.toMap(User::getId, u -> u));

        List<Map<String, Object>> entries = boards.stream()
                .filter(b -> userIds.contains(b.getUserId()))
                .map(b -> {
                    BoardService.ScoreResult sr = boardService.calculateScore(b);
                    User u = userMap.get(b.getUserId());
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("userId", b.getUserId());
                    m.put("xHandle", u != null ? u.getXHandle() : "");
                    m.put("displayName", u != null ? u.getDisplayName() : "");
                    m.put("score", sr.getScore());
                    m.put("hasBingo", sr.isHasBingo());
                    return m;
                })
                .sorted((a, b) -> Integer.compare((int) b.get("score"), (int) a.get("score")))
                .collect(Collectors.toList());

        return ResponseEntity.ok(entries);
    }

    @GetMapping("/seasons/{seasonId}/leaderboard")
    public ResponseEntity<?> seasonLeaderboard(@PathVariable String seasonId) {
        List<Round> rounds = roundRepository.findBySeasonId(seasonId);
        List<User> users = userRepository.findAll();
        Map<String, User> userMap = users.stream().collect(Collectors.toMap(User::getId, u -> u));
        Set<String> userIds = userMap.keySet();

        Map<String, int[]> cumulative = new HashMap<>(); // [totalScore, bingos]

        for (Round round : rounds) {
            List<Board> boards = boardRepository.findByRoundId(round.getId());
            for (Board b : boards) {
                if (!userIds.contains(b.getUserId())) continue;
                BoardService.ScoreResult sr = boardService.calculateScore(b);
                cumulative.computeIfAbsent(b.getUserId(), k -> new int[2]);
                cumulative.get(b.getUserId())[0] += sr.getScore();
                if (sr.isHasBingo()) cumulative.get(b.getUserId())[1]++;
            }
        }

        List<Map<String, Object>> entries = cumulative.entrySet().stream().map(e -> {
            User u = userMap.get(e.getKey());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", e.getKey());
            m.put("xHandle", u != null ? u.getXHandle() : "");
            m.put("displayName", u != null ? u.getDisplayName() : "");
            m.put("totalScore", e.getValue()[0]);
            m.put("bingos", e.getValue()[1]);
            return m;
        }).sorted((a, b) -> Integer.compare((int) b.get("totalScore"), (int) a.get("totalScore")))
                .collect(Collectors.toList());

        return ResponseEntity.ok(entries);
    }

    @GetMapping("/seasons/{seasonId}/user/{userId}/boards")
    public ResponseEntity<?> userSeasonBoards(@PathVariable String seasonId, @PathVariable String userId) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.status(404).body(Map.of("error", "User not found"));

        List<Round> rounds = roundRepository.findBySeasonId(seasonId);
        List<Map<String, Object>> results = new ArrayList<>();

        for (Round round : rounds) {
            Board board = boardRepository.findByRoundIdAndUserId(round.getId(), userId).orElse(null);
            if (board == null) continue;

            List<BoardSquare> squares = boardSquareRepository.findByBoardIdOrderByPosition(board.getId());
            List<Suggestion> suggestions = suggestionRepository.findByRoundId(round.getId());
            Map<String, Suggestion> sugMap = suggestions.stream().collect(Collectors.toMap(Suggestion::getId, s -> s, (a, b) -> a));

            List<Map<String, Object>> squaresList = squares.stream().map(sq -> {
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

            BoardService.ScoreResult sr = boardService.calculateScore(board);

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("roundId", round.getId());
            entry.put("roundName", round.getName());
            entry.put("eventDate", round.getEventDate().toString());
            entry.put("score", sr.getScore());
            entry.put("hasBingo", sr.isHasBingo());
            entry.put("boardSize", board.getBoardSize());
            entry.put("squares", squaresList);
            results.add(entry);
        }

        results.sort(Comparator.comparing(a -> (String) a.get("eventDate")));

        Map<String, Object> userInfo = new LinkedHashMap<>();
        userInfo.put("id", user.getId());
        userInfo.put("displayName", user.getDisplayName());
        userInfo.put("xHandle", user.getXHandle());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("user", userInfo);
        response.put("rounds", results);
        return ResponseEntity.ok(response);
    }
}
