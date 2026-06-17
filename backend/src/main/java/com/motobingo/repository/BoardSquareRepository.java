package com.motobingo.repository;

import com.motobingo.model.BoardSquare;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface BoardSquareRepository extends JpaRepository<BoardSquare, String> {
    List<BoardSquare> findByBoardIdOrderByPosition(String boardId);
    List<BoardSquare> findByBoardIdIn(List<String> boardIds);
    void deleteByBoardId(String boardId);
}
