package com.motobingo.model;

import jakarta.persistence.*;

@Entity
@Table(name = "active_round")
public class ActiveRound {
    @Id
    private int id = 1;

    @Column(name = "round_id")
    private String roundId;

    public int getId() { return id; }
    public String getRoundId() { return roundId; }
    public void setRoundId(String roundId) { this.roundId = roundId; }
}
