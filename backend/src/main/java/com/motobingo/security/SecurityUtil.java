package com.motobingo.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public class SecurityUtil {

    public static boolean isAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return false;
        return auth.getAuthorities().stream()
            .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
    }

    public static boolean isAuthenticated() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getPrincipal());
    }

    public static String getScreenName() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return null;

        // Dev bypass stores details as Map
        if (auth.getDetails() instanceof java.util.Map<?, ?> details) {
            Object name = details.get("screen_name");
            if (name != null) return name.toString();
        }

        // Auth0 JWT stores in claims
        if (auth.getPrincipal() instanceof org.springframework.security.oauth2.jwt.Jwt jwt) {
            String screenName = jwt.getClaimAsString("https://motobingo.app/screen_name");
            if (screenName != null) return screenName;
            return jwt.getClaimAsString("nickname");
        }

        return null;
    }
}
