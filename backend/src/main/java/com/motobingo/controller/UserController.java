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
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserRepository userRepository;
    private final ActiveRoundRepository activeRoundRepository;
    private final RoundRepository roundRepository;
    private final RoundPlayerRepository roundPlayerRepository;
    private final SuggestionRepository suggestionRepository;
    private final BoardService boardService;

    public UserController(UserRepository userRepository, ActiveRoundRepository activeRoundRepository,
                          RoundRepository roundRepository, RoundPlayerRepository roundPlayerRepository,
                          SuggestionRepository suggestionRepository, BoardService boardService) {
        this.userRepository = userRepository;
        this.activeRoundRepository = activeRoundRepository;
        this.roundRepository = roundRepository;
        this.roundPlayerRepository = roundPlayerRepository;
        this.suggestionRepository = suggestionRepository;
        this.boardService = boardService;
    }

    @GetMapping
    public List<Map<String, Object>> getAll() {
        return userRepository.findAll().stream().map(AuthController::userToMap).collect(Collectors.toList());
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> create(@RequestBody Map<String, String> body) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));

        String xHandle = body.get("xHandle");
        String displayName = body.get("displayName");
        if (xHandle == null || xHandle.isBlank() || displayName == null || displayName.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "xHandle and displayName required"));
        }
        String cleanHandle = xHandle.trim().replaceFirst("^@", "");
        if (userRepository.existsByXHandleIgnoreCase(cleanHandle)) {
            return ResponseEntity.status(409).body(Map.of("error", "User already exists"));
        }

        User user = new User();
        user.setXHandle(cleanHandle);
        user.setDisplayName(displayName.trim());
        user = userRepository.save(user);

        // Auto-add to active round if in boards/raceday phase
        try {
            ActiveRound ar = activeRoundRepository.get();
            if (ar.getRoundId() != null) {
                Round round = roundRepository.findById(ar.getRoundId()).orElse(null);
                if (round != null && ("boards".equals(round.getPhase()) || "raceday".equals(round.getPhase()))) {
                    if (!roundPlayerRepository.existsByRoundIdAndUserId(round.getId(), user.getId())) {
                        RoundPlayer rp = new RoundPlayer();
                        rp.setRoundId(round.getId());
                        rp.setUserId(user.getId());
                        roundPlayerRepository.save(rp);
                    }
                    List<String> selected = suggestionRepository.findByRoundIdAndSelectedTrue(round.getId())
                            .stream().map(Suggestion::getId).collect(Collectors.toList());
                    boardService.generateBoard(round.getId(), user.getId(), selected, 5);
                }
            }
        } catch (Exception ignored) {}

        return ResponseEntity.status(201).body(AuthController.userToMap(user));
    }

    @PutMapping("/{id}")
    @Transactional
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody Map<String, String> body) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        User user = userRepository.findById(id).orElse(null);
        if (user == null) return ResponseEntity.status(404).body(Map.of("error", "Not found"));

        if (body.containsKey("xHandle") && body.get("xHandle") != null) user.setXHandle(body.get("xHandle").trim());
        if (body.containsKey("displayName") && body.get("displayName") != null) user.setDisplayName(body.get("displayName").trim());
        userRepository.save(user);
        return ResponseEntity.ok(AuthController.userToMap(user));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> delete(@PathVariable String id) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        if (!userRepository.existsById(id)) return ResponseEntity.status(404).body(Map.of("error", "Not found"));
        userRepository.deleteById(id);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
