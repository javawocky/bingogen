package com.motobingo.repository;

import com.motobingo.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByXHandleIgnoreCase(String xHandle);
    boolean existsByXHandleIgnoreCase(String xHandle);
}
