package com.motobingo.security;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Extracts roles from Auth0's custom claim "https://motobingo.app/roles"
 * and converts them to Spring Security granted authorities.
 */
public class Auth0RolesConverter implements Converter<Jwt, Collection<GrantedAuthority>> {

    private static final String ROLES_CLAIM = "https://motobingo.app/roles";

    @Override
    @SuppressWarnings("unchecked")
    public Collection<GrantedAuthority> convert(Jwt jwt) {
        Object rolesClaim = jwt.getClaim(ROLES_CLAIM);
        if (rolesClaim instanceof List<?> roles) {
            return roles.stream()
                .map(r -> new SimpleGrantedAuthority("ROLE_" + r.toString().toUpperCase()))
                .collect(Collectors.toList());
        }
        return Collections.emptyList();
    }
}
