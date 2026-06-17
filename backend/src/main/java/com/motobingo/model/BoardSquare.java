package com.motobingo.model;

import jakarta.persistence.*;

@Entity
@Table(name = "board_squares", uniqueConstraints = @UniqueConstraint(columnNames = {"board_id", "position"}))
public class BoardSquare {
    @Id
    private String id;

    @Column(name = "board_id", nullable = false)
    private String boardId;

    @Column(nullable = false)
    private int position;

    @Column(name = "suggestion_id")
    private String suggestionId; // "FREE" for centre square

    @PrePersist
    void prePersist() {
        if (id == null) id = java.util.UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getBoardId() { return boardId; }
    public void setBoardId(String boardId) { this.boardId = boardId; }
    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
    public String getSuggestionId() { return suggestionId; }
    public void setSuggestionId(String suggestionId) { this.suggestionId = suggestionId; }
}
