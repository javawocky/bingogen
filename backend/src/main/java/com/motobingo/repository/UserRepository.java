package com.motobingo.repository;

import com.motobingo.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, String> {
    @Query("SELECT u FROM User u WHERE LOWER(u.xHandle) = LOWER(:xHandle)")
    Optional<User> findByXHandleIgnoreCase(String xHandle);

    @Query("SELECT CASE WHEN COUNT(u) > 0 THEN true ELSE false END FROM User u WHERE LOWER(u.xHandle) = LOWER(:xHandle)")
    boolean existsByXHandleIgnoreCase(String xHandle);
}
