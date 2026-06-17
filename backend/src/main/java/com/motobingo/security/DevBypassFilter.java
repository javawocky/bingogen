package com.motobingo.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * In dev mode, accepts X-Dev-User and X-Dev-Role headers to bypass Auth0.
 * This mirrors the Cloudflare Worker's DEV_BYPASS_AUTH behavior.
 */
public class DevBypassFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String devUser = request.getHeader("X-Dev-User");
        if (devUser != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            String devRole = request.getHeader("X-Dev-Role");
            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            if ("admin".equals(devRole)) {
                authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
            }

            Map<String, Object> details = Map.of(
                "sub", "dev|" + devUser,
                "nickname", devUser,
                "screen_name", devUser,
                "dev_bypass", true
            );

            var auth = new UsernamePasswordAuthenticationToken(devUser, null, authorities);
            auth.setDetails(details);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }
        filterChain.doFilter(request, response);
    }
}
