package com.motobingo.repository;

import com.motobingo.model.Season;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;

public interface SeasonRepository extends JpaRepository<Season, String> {
    List<Season> findByChampionshipId(String championshipId);
    Optional<Season> findByChampionshipIdAndYear(String championshipId, int year);

    @Modifying
    @Query("UPDATE Season s SET s.active = false WHERE s.championshipId = :champId")
    void deactivateAll(String champId);
}
