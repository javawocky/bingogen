package com.motobingo.controller;

import com.motobingo.model.User;
import com.motobingo.repository.UserRepository;
import com.motobingo.security.SecurityUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1")
public class AuthController {

    private final UserRepository userRepository;

    @Value("${motobingo.admin.username:admin}")
    private String adminUsername;

    @Value("${motobingo.admin.password:}")
    private String adminPassword;

    public AuthController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @PostMapping("/auth/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        String password = body.get("password");
        if (!adminUsername.equals(username) || !adminPassword.equals(password)) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid credentials"));
        }
        String token = UUID.randomUUID().toString();
        return ResponseEntity.ok(Map.of("token", token));
    }

    @GetMapping("/auth/me")
    public ResponseEntity<?> getMe(@RequestParam(required = false) String handle) {
        if (!SecurityUtil.isAuthenticated()) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        String screenName = SecurityUtil.getScreenName();
        if (screenName == null || screenName.isBlank()) {
            screenName = handle;
        }
        if (screenName == null || screenName.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Could not determine X handle"));
        }
        String xHandle = screenName.replaceFirst("^@", "");

        User user = userRepository.findByXHandleIgnoreCase(xHandle).orElse(null);
        if (user == null) {
            user = new User();
            user.setXHandle(xHandle);
            user.setDisplayName(xHandle);
            user = userRepository.save(user);
        }

        List<String> roles = SecurityUtil.isAdmin() ? List.of("admin") : List.of();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("user", userToMap(user));
        result.put("roles", roles);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/csrf")
    public ResponseEntity<?> csrf() {
        return ResponseEntity.ok(Map.of("token", UUID.randomUUID().toString()));
    }

    static Map<String, Object> userToMap(User u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("xHandle", u.getXHandle());
        m.put("displayName", u.getDisplayName());
        m.put("createdAt", u.getCreatedAt().toString());
        return m;
    }
}
