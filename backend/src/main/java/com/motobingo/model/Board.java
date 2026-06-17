package com.motobingo.model;

import jakarta.persistence.*;

@Entity
@Table(name = "boards", uniqueConstraints = @UniqueConstraint(columnNames = {"round_id", "user_id"}))
public class Board {
    @Id
    private String id;

    @Column(name = "round_id", nullable = false)
    private String roundId;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "board_size", nullable = false)
    private int boardSize = 5;

    @PrePersist
    void prePersist() {
        if (id == null) id = java.util.UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getRoundId() { return roundId; }
    public void setRoundId(String roundId) { this.roundId = roundId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public int getBoardSize() { return boardSize; }
    public void setBoardSize(int boardSize) { this.boardSize = boardSize; }
}
