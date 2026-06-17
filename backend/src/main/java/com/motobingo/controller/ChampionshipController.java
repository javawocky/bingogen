package com.motobingo.controller;

import com.motobingo.model.Championship;
import com.motobingo.repository.ChampionshipRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/championships")
public class ChampionshipController {

    private final ChampionshipRepository championshipRepository;

    public ChampionshipController(ChampionshipRepository championshipRepository) {
        this.championshipRepository = championshipRepository;
    }

    @PostConstruct
    void seed() {
        if (championshipRepository.count() == 0) {
            String[][] presets = {{"Pro Motocross", "MX"}, {"Supercross", "SX"}, {"SuperMotocross", "SMX"}};
            for (String[] p : presets) {
                Championship c = new Championship();
                c.setName(p[0]);
                c.setShortCode(p[1]);
                championshipRepository.save(c);
            }
        }
    }

    @GetMapping
    public List<Championship> getAll() {
        return championshipRepository.findAll();
    }
}
