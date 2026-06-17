package com.motobingo.repository;

import com.motobingo.model.RoundPlayer;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface RoundPlayerRepository extends JpaRepository<RoundPlayer, RoundPlayer.RoundPlayerId> {
    List<RoundPlayer> findByRoundId(String roundId);
    boolean existsByRoundIdAndUserId(String roundId, String userId);
    void deleteByRoundIdAndUserId(String roundId, String userId);
}
