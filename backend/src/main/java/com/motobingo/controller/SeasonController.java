package com.motobingo.controller;

import com.motobingo.model.Season;
import com.motobingo.repository.SeasonRepository;
import com.motobingo.security.SecurityUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/championships/{champId}/seasons")
public class SeasonController {

    private final SeasonRepository seasonRepository;

    public SeasonController(SeasonRepository seasonRepository) {
        this.seasonRepository = seasonRepository;
    }

    @GetMapping
    public List<Season> getAll(@PathVariable String champId) {
        return seasonRepository.findByChampionshipId(champId);
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> create(@PathVariable String champId, @RequestBody Map<String, Object> body) {
        if (!SecurityUtil.isAdmin()) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));

        Integer year = (Integer) body.get("year");
        if (year == null) return ResponseEntity.badRequest().body(Map.of("error", "year required"));

        if (seasonRepository.findByChampionshipIdAndYear(champId, year).isPresent()) {
            return ResponseEntity.status(409).body(Map.of("error", "Season already exists for this year"));
        }

        seasonRepository.deactivateAll(champId);

        Season season = new Season();
        season.setChampionshipId(champId);
        season.setYear(year);
        season.setActive(true);
        season = seasonRepository.save(season);
        return ResponseEntity.status(201).body(season);
    }
}
