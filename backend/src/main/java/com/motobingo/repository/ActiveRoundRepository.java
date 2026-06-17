package com.motobingo.repository;

import com.motobingo.model.ActiveRound;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActiveRoundRepository extends JpaRepository<ActiveRound, Integer> {
    default ActiveRound get() {
        return findById(1).orElseThrow();
    }
}
