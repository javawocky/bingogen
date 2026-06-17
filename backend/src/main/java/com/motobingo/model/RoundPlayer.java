package com.motobingo.model;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.Objects;

@Entity
@Table(name = "round_players")
@IdClass(RoundPlayer.RoundPlayerId.class)
public class RoundPlayer {
    @Id
    @Column(name = "round_id")
    private String roundId;

    @Id
    @Column(name = "user_id")
    private String userId;

    public String getRoundId() { return roundId; }
    public void setRoundId(String roundId) { this.roundId = roundId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public static class RoundPlayerId implements Serializable {
        private String roundId;
        private String userId;

        public RoundPlayerId() {}
        public RoundPlayerId(String roundId, String userId) { this.roundId = roundId; this.userId = userId; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof RoundPlayerId that)) return false;
            return Objects.equals(roundId, that.roundId) && Objects.equals(userId, that.userId);
        }

        @Override
        public int hashCode() { return Objects.hash(roundId, userId); }
    }
}
