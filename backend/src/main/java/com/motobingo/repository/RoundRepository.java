package com.motobingo.repository;

import com.motobingo.model.Round;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface RoundRepository extends JpaRepository<Round, String> {
    List<Round> findBySeasonId(String seasonId);
}
