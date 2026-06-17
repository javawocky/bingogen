package com.motobingo.repository;

import com.motobingo.model.Vote;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface VoteRepository extends JpaRepository<Vote, String> {
    List<Vote> findBySuggestionId(String suggestionId);
    Optional<Vote> findBySuggestionIdAndVoterId(String suggestionId, String voterId);
    void deleteBySuggestionIdAndVoterId(String suggestionId, String voterId);
    List<Vote> findBySuggestionIdIn(List<String> suggestionIds);
}
