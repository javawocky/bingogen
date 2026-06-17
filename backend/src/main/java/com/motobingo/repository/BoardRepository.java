package com.motobingo.repository;

import com.motobingo.model.Board;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface BoardRepository extends JpaRepository<Board, String> {
    Optional<Board> findByRoundIdAndUserId(String roundId, String userId);
    List<Board> findByRoundId(String roundId);
}
