package com.motobingo.repository;

import com.motobingo.model.Suggestion;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SuggestionRepository extends JpaRepository<Suggestion, String> {
    List<Suggestion> findByRoundId(String roundId);
    List<Suggestion> findByRoundIdAndStatus(String roundId, String status);
    List<Suggestion> findByRoundIdAndSelectedTrue(String roundId);
}
