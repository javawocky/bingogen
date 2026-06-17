package com.motobingo.model;

import jakarta.persistence.*;

@Entity
@Table(name = "votes", uniqueConstraints = @UniqueConstraint(columnNames = {"suggestion_id", "voter_id"}))
public class Vote {
    @Id
    private String id;

    @Column(name = "suggestion_id", nullable = false)
    private String suggestionId;

    @Column(name = "voter_id", nullable = false)
    private String voterId;

    @PrePersist
    void prePersist() {
        if (id == null) id = java.util.UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getSuggestionId() { return suggestionId; }
    public void setSuggestionId(String suggestionId) { this.suggestionId = suggestionId; }
    public String getVoterId() { return voterId; }
    public void setVoterId(String voterId) { this.voterId = voterId; }
}
