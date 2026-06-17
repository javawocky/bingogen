package com.motobingo.model;

import jakarta.persistence.*;

@Entity
@Table(name = "seasons")
public class Season {
    @Id
    private String id;

    @Column(name = "championship_id", nullable = false)
    private String championshipId;

    @Column(nullable = false)
    private int year;

    @Column(nullable = false)
    private boolean active = true;

    @PrePersist
    void prePersist() {
        if (id == null) id = java.util.UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getChampionshipId() { return championshipId; }
    public void setChampionshipId(String championshipId) { this.championshipId = championshipId; }
    public int getYear() { return year; }
    public void setYear(int year) { this.year = year; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
