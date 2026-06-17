package com.motobingo.controller;

import com.motobingo.model.*;
import com.motobingo.repository.*;
import com.motobingo.security.SecurityUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/active-round")
public class ActiveRoundController {

    private final ActiveRoundRepository activeRoundRepository;
    private final RoundRepository roundRepository;
    private final SuggestionRepository suggestionRepository;
    private final RoundPlayerRepository roundPlayerRepository;
    private final VoteRepository voteRepository;
    private final ChampionshipRepository championshipRepository;
    private final SeasonRepository seasonRepository;

    public ActiveRoundController(ActiveRoundRepository activeRoundRepository, RoundRepository roundRepository,
                                 SuggestionRepository suggestionRepository, RoundPlayerRepository roundPlayerRepository,
                                 VoteRepository voteRepository, ChampionshipRepository championshipRepository,
                                 SeasonRepository seasonRepository) {
        this.activeRoundRepository = activeRoundRepository;
        this.roundRepository = roundRepository;
        this.suggestionRepository = suggestionRepository;
        this.roundPlayerRepository = roundPlayerRepository;
        this.voteRepository = voteRepository;
        this.championshipRepository = championshipRepository;
        this.seasonRepository = seasonRepository;
    }

    @GetMapping
    public ResponseEntity<?> get() {
        ActiveRound ar;
        try {
            ar = activeRoundRepository.get();
        } catch (Exception e) {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("round", null);
            resp.put("message", "No future round is ready to play just yet. Check back soon!");
            return ResponseEntity.ok(resp);
        }

        if (ar.getRoundId() == null) {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("round", null);
            resp.put("message", "No future round is ready to play just yet. Check back soon!");
            return ResponseEntity.ok(resp);
        }

        Round round = roundRepository.findById(ar.getRoundId()).orElse(null);
        if (round == null || "complete".equals(round.getPhase())) {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("round", null);
            resp.put("message", "No future round is ready to play just yet. Check back soon!");
            return ResponseEntity.ok(resp);
        }

        // Filter to approved suggestions only for public
        List<Suggestion> suggestions = suggestionRepository.findByRoundIdAndStatus(round.getId(), "approved");

        // Find championship and season
        Season season = seasonRepository.findById(round.getSeasonId()).orElse(null);
        Championship championship = season != null ? championshipRepository.findById(season.getChampionshipId()).orElse(null) : null;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("round", buildRoundMap(round, suggestions));
        result.put("championship", championship);
        result.put("season", season);
        return ResponseEntity.ok(result);
    }

    @PutMapping
    @Transactional
    public ResponseEntity<?> set(@RequestBody Map<String, String> body) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));

        String roundId = body.get("roundId");
        ActiveRound ar;
        try {
            ar = activeRoundRepository.get();
        } catch (Exception e) {
            ar = new ActiveRound();
        }
        ar.setRoundId(roundId);
        activeRoundRepository.save(ar);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    private Map<String, Object> buildRoundMap(Round r, List<Suggestion> suggestions) {
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

        List<String> sIds = suggestions.stream().map(Suggestion::getId).toList();
        Map<String, List<String>> votesMap = new HashMap<>();
        if (!sIds.isEmpty()) {
            List<Vote> allVotes = voteRepository.findBySuggestionIdIn(sIds);
            for (Vote v : allVotes) {
                votesMap.computeIfAbsent(v.getSuggestionId(), k -> new ArrayList<>()).add(v.getVoterId());
            }
        }

        List<Map<String, Object>> sugList = suggestions.stream().map(s -> {
            Map<String, Object> sm = new LinkedHashMap<>();
            sm.put("id", s.getId());
            sm.put("text", s.getText());
            sm.put("status", s.getStatus());
            sm.put("selected", s.isSelected());
            sm.put("completed", s.isCompleted());
            sm.put("votes", votesMap.getOrDefault(s.getId(), List.of()));
            sm.put("createdAt", s.getCreatedAt().toString());
            return sm;
        }).toList();
        m.put("suggestions", sugList);
        m.put("playerIds", roundPlayerRepository.findByRoundId(r.getId()).stream().map(RoundPlayer::getUserId).toList());
        return m;
    }

}
