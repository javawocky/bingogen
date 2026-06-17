package com.motobingo.controller;

import com.motobingo.model.*;
import com.motobingo.repository.*;
import com.motobingo.security.SecurityUtil;
import com.motobingo.service.BoardService;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1")
public class RoundController {

    private final RoundRepository roundRepository;
    private final SuggestionRepository suggestionRepository;
    private final RoundPlayerRepository roundPlayerRepository;
    private final VoteRepository voteRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final BoardRepository boardRepository;
    private final BoardSquareRepository boardSquareRepository;
    private final ChampionshipRepository championshipRepository;
    private final SeasonRepository seasonRepository;

    public RoundController(RoundRepository roundRepository, SuggestionRepository suggestionRepository,
                           RoundPlayerRepository roundPlayerRepository, VoteRepository voteRepository,
                           UserRepository userRepository, BoardService boardService,
                           BoardRepository boardRepository, BoardSquareRepository boardSquareRepository,
                           ChampionshipRepository championshipRepository, SeasonRepository seasonRepository) {
        this.roundRepository = roundRepository;
        this.suggestionRepository = suggestionRepository;
        this.roundPlayerRepository = roundPlayerRepository;
        this.voteRepository = voteRepository;
        this.userRepository = userRepository;
        this.boardService = boardService;
        this.boardRepository = boardRepository;
        this.boardSquareRepository = boardSquareRepository;
        this.championshipRepository = championshipRepository;
        this.seasonRepository = seasonRepository;
    }

    @GetMapping("/seasons/{seasonId}/rounds")
    public List<Map<String, Object>> getBySeasonId(@PathVariable String seasonId) {
        return roundRepository.findBySeasonId(seasonId).stream().map(this::roundToMap).collect(Collectors.toList());
    }

    @GetMapping("/rounds/{id}")
    public ResponseEntity<?> getById(@PathVariable String id) {
        Round round = roundRepository.findById(id).orElse(null);
        if (round == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));
        Map<String, Object> result = roundToMap(round);
        if (!SecurityUtil.isAdmin()) {
            // Filter to approved only
            List<Suggestion> suggestions = suggestionRepository.findByRoundIdAndStatus(round.getId(), "approved");
            result.put("suggestions", suggestionsToList(suggestions));
        }
        return ResponseEntity.ok(result);
    }

    @PostMapping("/seasons/{seasonId}/rounds")
    @Transactional
    public ResponseEntity<?> create(@PathVariable String seasonId, @RequestBody Map<String, Object> body) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));

        String name = (String) body.get("name");
        String eventDate = (String) body.get("eventDate");
        if (name == null || name.isBlank() || eventDate == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "name and eventDate required"));
        }

        Round round = new Round();
        round.setSeasonId(seasonId);
        round.setName(name.trim());
        round.setEventDate(LocalDate.parse(eventDate));
        round.setPhase("suggestions");
        applyPhaseDates(round, body);
        round = roundRepository.save(round);
        return ResponseEntity.status(201).body(roundToMap(round));
    }

    @PutMapping("/rounds/{id}")
    @Transactional
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        Round round = roundRepository.findById(id).orElse(null);
        if (round == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));

        if (body.containsKey("name")) round.setName(((String) body.get("name")));
        if (body.containsKey("eventDate")) round.setEventDate(LocalDate.parse((String) body.get("eventDate")));
        applyPhaseDates(round, body);
        roundRepository.save(round);
        return ResponseEntity.ok(roundToMap(round));
    }

    @PutMapping("/rounds/{id}/phase")
    @Transactional
    public ResponseEntity<?> advancePhase(@PathVariable String id, @RequestBody Map<String, String> body) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        Round round = roundRepository.findById(id).orElse(null);
        if (round == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));

        String phase = body.get("phase");
        if (!List.of("suggestions", "boards", "raceday", "complete").contains(phase)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid phase"));
        }

        round.setPhase(phase);

        if ("boards".equals(phase)) {
            // Add all users as players
            List<User> allUsers = userRepository.findAll();
            for (User u : allUsers) {
                if (!roundPlayerRepository.existsByRoundIdAndUserId(round.getId(), u.getId())) {
                    RoundPlayer rp = new RoundPlayer();
                    rp.setRoundId(round.getId());
                    rp.setUserId(u.getId());
                    roundPlayerRepository.save(rp);
                }
            }

            // Generate/update boards
            List<String> selected = suggestionRepository.findByRoundIdAndSelectedTrue(round.getId())
                    .stream().map(Suggestion::getId).collect(Collectors.toList());
            List<RoundPlayer> players = roundPlayerRepository.findByRoundId(round.getId());
            for (RoundPlayer rp : players) {
                Board existing = boardRepository.findByRoundIdAndUserId(round.getId(), rp.getUserId()).orElse(null);
                if (existing != null) {
                    boardService.updateBoardIntelligently(round.getId(), rp.getUserId(), selected, 5);
                } else {
                    boardService.generateBoard(round.getId(), rp.getUserId(), selected, 5);
                }
            }
        }

        roundRepository.save(round);
        return ResponseEntity.ok(roundToMap(round));
    }

    @DeleteMapping("/rounds/{id}")
    @Transactional
    public ResponseEntity<?> delete(@PathVariable String id) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));

        // Clean up boards
        List<Board> boards = boardRepository.findByRoundId(id);
        for (Board b : boards) boardSquareRepository.deleteByBoardId(b.getId());
        boardRepository.deleteAll(boards);

        // Clean up suggestions, votes, players
        List<Suggestion> suggestions = suggestionRepository.findByRoundId(id);
        List<String> sugIds = suggestions.stream().map(Suggestion::getId).collect(Collectors.toList());
        if (!sugIds.isEmpty()) {
            List<Vote> votes = voteRepository.findBySuggestionIdIn(sugIds);
            voteRepository.deleteAll(votes);
        }
        suggestionRepository.deleteAll(suggestions);
        List<RoundPlayer> players = roundPlayerRepository.findByRoundId(id);
        roundPlayerRepository.deleteAll(players);

        roundRepository.deleteById(id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    Map<String, Object> roundToMap(Round r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("seasonId", r.getSeasonId());
        m.put("name", r.getName());
        m.put("eventDate", r.getEventDate().toString());
        m.put("phase", r.getPhase());
        Map<String, String> pd = new LinkedHashMap<>();
        pd.put("suggestionsEnd", r.getSuggestionsEnd() != null ? r.getSuggestionsEnd().toString() : "");
        pd.put("boardsEnd", r.getBoardsEnd() != null ? r.getBoardsEnd().toString() : "");
        m.put("phaseDates", pd);
        m.put("suggestions", suggestionsToList(suggestionRepository.findByRoundId(r.getId())));
        m.put("playerIds", roundPlayerRepository.findByRoundId(r.getId()).stream().map(RoundPlayer::getUserId).collect(Collectors.toList()));
        return m;
    }

    private List<Map<String, Object>> suggestionsToList(List<Suggestion> suggestions) {
        List<String> sIds = suggestions.stream().map(Suggestion::getId).collect(Collectors.toList());
        Map<String, List<String>> votesMap = new HashMap<>();
        if (!sIds.isEmpty()) {
            List<Vote> allVotes = voteRepository.findBySuggestionIdIn(sIds);
            for (Vote v : allVotes) {
                votesMap.computeIfAbsent(v.getSuggestionId(), k -> new ArrayList<>()).add(v.getVoterId());
            }
        }
        return suggestions.stream().map(s -> {
            Map<String, Object> sm = new LinkedHashMap<>();
            sm.put("id", s.getId());
            sm.put("text", s.getText());
            sm.put("status", s.getStatus());
            sm.put("selected", s.isSelected());
            sm.put("completed", s.isCompleted());
            sm.put("votes", votesMap.getOrDefault(s.getId(), List.of()));
            sm.put("createdAt", s.getCreatedAt().toString());
            return sm;
        }).collect(Collectors.toList());
    }

    private void applyPhaseDates(Round round, Map<String, Object> body) {
        if (body.containsKey("phaseDates") && body.get("phaseDates") instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, String> pd = (Map<String, String>) body.get("phaseDates");
            String se = pd.get("suggestionsEnd");
            String be = pd.get("boardsEnd");
            round.setSuggestionsEnd(se != null && !se.isEmpty() ? Instant.parse(se) : null);
            round.setBoardsEnd(be != null && !be.isEmpty() ? Instant.parse(be) : null);
        }
    }
}
