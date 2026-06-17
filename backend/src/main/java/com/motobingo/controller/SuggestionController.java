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
@RequestMapping("/api/v1/rounds/{roundId}/suggestions")
public class SuggestionController {

    private final RoundRepository roundRepository;
    private final SuggestionRepository suggestionRepository;
    private final VoteRepository voteRepository;
    private final BoardRepository boardRepository;
    private final BoardService boardService;

    public SuggestionController(RoundRepository roundRepository, SuggestionRepository suggestionRepository,
                                VoteRepository voteRepository, BoardRepository boardRepository,
                                BoardService boardService) {
        this.roundRepository = roundRepository;
        this.suggestionRepository = suggestionRepository;
        this.voteRepository = voteRepository;
        this.boardRepository = boardRepository;
        this.boardService = boardService;
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> create(@PathVariable String roundId, @RequestBody Map<String, Object> body) {
        Round round = roundRepository.findById(roundId).orElse(null);
        if (round == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));

        boolean isAdmin = SecurityUtil.isAdmin();
        if (!isAdmin && !SecurityUtil.isAuthenticated()) {
            return ResponseEntity.status(401).body(Map.of("error", "Login required to submit suggestions"));
        }
        if (!isAdmin && !"suggestions".equals(round.getPhase())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Suggestions are closed"));
        }

        String text = (String) body.get("text");
        if (text == null || text.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "text required"));
        if (text.trim().length() > 200) return ResponseEntity.badRequest().body(Map.of("error", "text must be 200 characters or less"));

        Boolean adminApprove = (Boolean) body.get("adminApprove");

        Suggestion s = new Suggestion();
        s.setRoundId(roundId);
        s.setText(text.trim().substring(0, Math.min(text.trim().length(), 200)));
        s.setStatus(isAdmin && Boolean.TRUE.equals(adminApprove) ? "approved" : "pending");
        s = suggestionRepository.save(s);

        Map<String, Object> result = suggestionToMap(s, List.of());
        return ResponseEntity.status(201).body(result);
    }

    @PutMapping("/{sid}")
    @Transactional
    public ResponseEntity<?> update(@PathVariable String roundId, @PathVariable String sid, @RequestBody Map<String, Object> body) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        Round round = roundRepository.findById(roundId).orElse(null);
        if (round == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));

        Suggestion s = suggestionRepository.findById(sid).orElse(null);
        if (s == null || !s.getRoundId().equals(roundId)) return ResponseEntity.status(404).body(Map.of("error", "Suggestion not found"));

        if (body.containsKey("text")) s.setText(((String) body.get("text")).trim());
        if (body.containsKey("status")) s.setStatus((String) body.get("status"));
        boolean selectedChanged = false;
        if (body.containsKey("selected")) { s.setSelected((Boolean) body.get("selected")); selectedChanged = true; }
        boolean completedChanged = false;
        if (body.containsKey("completed")) { s.setCompleted((Boolean) body.get("completed")); completedChanged = true; }
        suggestionRepository.save(s);

        // If selection changed in boards phase, update boards intelligently
        if (selectedChanged && "boards".equals(round.getPhase())) {
            List<String> selected = suggestionRepository.findByRoundIdAndSelectedTrue(roundId)
                    .stream().map(Suggestion::getId).collect(Collectors.toList());
            List<Board> boards = boardRepository.findByRoundId(roundId);
            for (Board b : boards) {
                boardService.updateBoardIntelligently(roundId, b.getUserId(), selected, b.getBoardSize());
            }
        }

        // If completed changed, scores are recalculated on read — no explicit store needed since we compute on the fly

        List<Vote> votes = voteRepository.findBySuggestionId(sid);
        return ResponseEntity.ok(suggestionToMap(s, votes.stream().map(Vote::getVoterId).collect(Collectors.toList())));
    }

    @DeleteMapping("/{sid}")
    @Transactional
    public ResponseEntity<?> delete(@PathVariable String roundId, @PathVariable String sid) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        Round round = roundRepository.findById(roundId).orElse(null);
        if (round == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));

        Suggestion s = suggestionRepository.findById(sid).orElse(null);
        if (s == null || !s.getRoundId().equals(roundId)) return ResponseEntity.status(404).body(Map.of("error", "Suggestion not found"));

        List<Vote> votes = voteRepository.findBySuggestionId(sid);
        voteRepository.deleteAll(votes);
        suggestionRepository.delete(s);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/{sid}/vote")
    @Transactional
    public ResponseEntity<?> vote(@PathVariable String roundId, @PathVariable String sid, @RequestBody Map<String, String> body) {
        Round round = roundRepository.findById(roundId).orElse(null);
        if (round == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));
        if (!"suggestions".equals(round.getPhase())) return ResponseEntity.badRequest().body(Map.of("error", "Voting is closed"));

        String voterId = body.get("voterId");
        if (voterId == null || voterId.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "voterId required"));

        Suggestion s = suggestionRepository.findById(sid).orElse(null);
        if (s == null || !s.getRoundId().equals(roundId)) return ResponseEntity.status(404).body(Map.of("error", "Suggestion not found"));
        if (!"approved".equals(s.getStatus())) return ResponseEntity.badRequest().body(Map.of("error", "Cannot vote on unapproved suggestion"));

        Optional<Vote> existing = voteRepository.findBySuggestionIdAndVoterId(sid, voterId);
        boolean voted;
        if (existing.isPresent()) {
            voteRepository.delete(existing.get());
            voted = false;
        } else {
            Vote v = new Vote();
            v.setSuggestionId(sid);
            v.setVoterId(voterId);
            voteRepository.save(v);
            voted = true;
        }

        long count = voteRepository.findBySuggestionId(sid).size();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("votes", (int) count);
        result.put("voted", voted);
        return ResponseEntity.ok(result);
    }

    private Map<String, Object> suggestionToMap(Suggestion s, List<String> voterIds) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.getId());
        m.put("text", s.getText());
        m.put("status", s.getStatus());
        m.put("selected", s.isSelected());
        m.put("completed", s.isCompleted());
        m.put("votes", voterIds);
        m.put("createdAt", s.getCreatedAt().toString());
        return m;
    }
}
