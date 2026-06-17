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
@RequestMapping("/api/v1/rounds/{roundId}/players")
public class PlayerController {

    private final RoundRepository roundRepository;
    private final RoundPlayerRepository roundPlayerRepository;
    private final SuggestionRepository suggestionRepository;
    private final BoardService boardService;
    private final RoundController roundController;

    public PlayerController(RoundRepository roundRepository, RoundPlayerRepository roundPlayerRepository,
                            SuggestionRepository suggestionRepository, BoardService boardService,
                            RoundController roundController) {
        this.roundRepository = roundRepository;
        this.roundPlayerRepository = roundPlayerRepository;
        this.suggestionRepository = suggestionRepository;
        this.boardService = boardService;
        this.roundController = roundController;
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> addPlayers(@PathVariable String roundId, @RequestBody Map<String, List<String>> body) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        Round round = roundRepository.findById(roundId).orElse(null);
        if (round == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));
        if ("raceday".equals(round.getPhase()) || "complete".equals(round.getPhase())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Cannot add players in this phase"));
        }

        List<String> userIds = body.get("userIds");
        if (userIds == null) userIds = List.of();

        List<String> newIds = new ArrayList<>();
        for (String uid : userIds) {
            if (!roundPlayerRepository.existsByRoundIdAndUserId(roundId, uid)) {
                RoundPlayer rp = new RoundPlayer();
                rp.setRoundId(roundId);
                rp.setUserId(uid);
                roundPlayerRepository.save(rp);
                newIds.add(uid);
            }
        }

        // Generate boards for new players if in boards phase
        if ("boards".equals(round.getPhase()) && !newIds.isEmpty()) {
            List<String> selected = suggestionRepository.findByRoundIdAndSelectedTrue(roundId)
                    .stream().map(Suggestion::getId).collect(Collectors.toList());
            for (String uid : newIds) {
                boardService.generateBoard(roundId, uid, selected, 5);
            }
        }

        return ResponseEntity.ok(roundController.roundToMap(round));
    }

    @DeleteMapping("/{userId}")
    @Transactional
    public ResponseEntity<?> removePlayer(@PathVariable String roundId, @PathVariable String userId) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        Round round = roundRepository.findById(roundId).orElse(null);
        if (round == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));

        roundPlayerRepository.deleteByRoundIdAndUserId(roundId, userId);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
