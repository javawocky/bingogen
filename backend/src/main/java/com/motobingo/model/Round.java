package com.motobingo.model;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.Instant;

@Entity
@Table(name = "rounds")
public class Round {
    @Id
    private String id;

    @Column(name = "season_id", nullable = false)
    private String seasonId;

    @Column(nullable = false)
    private String name;

    @Column(name = "event_date", nullable = false)
    private LocalDate eventDate;

    @Column(nullable = false)
    private String phase = "suggestions";

    @Column(name = "suggestions_end")
    private Instant suggestionsEnd;

    @Column(name = "boards_end")
    private Instant boardsEnd;

    @PrePersist
    void prePersist() {
        if (id == null) id = java.util.UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getSeasonId() { return seasonId; }
    public void setSeasonId(String seasonId) { this.seasonId = seasonId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public LocalDate getEventDate() { return eventDate; }
    public void setEventDate(LocalDate eventDate) { this.eventDate = eventDate; }
    public String getPhase() { return phase; }
    public void setPhase(String phase) { this.phase = phase; }
    public Instant getSuggestionsEnd() { return suggestionsEnd; }
    public void setSuggestionsEnd(Instant suggestionsEnd) { this.suggestionsEnd = suggestionsEnd; }
    public Instant getBoardsEnd() { return boardsEnd; }
    public void setBoardsEnd(Instant boardsEnd) { this.boardsEnd = boardsEnd; }
}
