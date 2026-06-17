package com.motobingo.repository;

import com.motobingo.model.Championship;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChampionshipRepository extends JpaRepository<Championship, String> {
}
