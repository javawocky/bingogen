# MotoBingo: Spring Boot + PostgreSQL Migration Plan

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Spring Boot Project Structure](#2-spring-boot-project-structure)
3. [API Endpoint Mapping](#3-api-endpoint-mapping)
4. [Security Setup](#4-security-setup)
5. [Scoring Logic](#5-scoring-logic)
6. [Docker Setup](#6-docker-setup)
7. [Deployment Pipeline](#7-deployment-pipeline)
8. [Oracle Cloud Instance Setup](#8-oracle-cloud-instance-setup)
9. [Data Migration Strategy](#9-data-migration-strategy)
10. [Cutover Plan](#10-cutover-plan)
11. [Environment Configuration](#11-environment-configuration)
12. [JVM Tuning for 1GB RAM](#12-jvm-tuning-for-1gb-ram)
13. [Testing Strategy](#13-testing-strategy)
14. [Rollback Plan](#14-rollback-plan)

---

## 1. Database Schema

Normalizes the KV blob structure into proper relational tables. UUIDs stored as `TEXT` for simplicity (matching the existing string IDs from KV).

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    x_handle TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_x_handle ON users(x_handle);

-- ============================================================
-- CHAMPIONSHIPS
-- ============================================================
CREATE TABLE championships (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    short_code TEXT NOT NULL UNIQUE
);

-- Seed data (inserted on first migration)
INSERT INTO championships (id, name, short_code) VALUES
    (gen_random_uuid()::text, 'Pro Motocross', 'MX'),
    (gen_random_uuid()::text, 'Supercross', 'SX'),
    (gen_random_uuid()::text, 'SuperMotocross', 'SMX');

-- ============================================================
-- SEASONS
-- ============================================================
CREATE TABLE seasons (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    championship_id TEXT NOT NULL REFERENCES championships(id),
    year INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(championship_id, year)
);

CREATE INDEX idx_seasons_championship ON seasons(championship_id);

-- ============================================================
-- ROUNDS
-- ============================================================
CREATE TABLE rounds (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    season_id TEXT NOT NULL REFERENCES seasons(id),
    name TEXT NOT NULL,
    event_date DATE NOT NULL,
    phase TEXT NOT NULL DEFAULT 'suggestions' CHECK (phase IN ('suggestions', 'boards', 'raceday', 'complete')),
    suggestions_end TIMESTAMPTZ,
    boards_end TIMESTAMPTZ
);

CREATE INDEX idx_rounds_season ON rounds(season_id);

-- ============================================================
-- ACTIVE ROUND (singleton row)
-- ============================================================
CREATE TABLE active_round (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    round_id TEXT REFERENCES rounds(id) ON DELETE SET NULL
);

INSERT INTO active_round (id, round_id) VALUES (1, NULL);

-- ============================================================
-- SUGGESTIONS
-- ============================================================
CREATE TABLE suggestions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    text TEXT NOT NULL CHECK (char_length(text) <= 200),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    selected BOOLEAN NOT NULL DEFAULT false,
    completed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suggestions_round ON suggestions(round_id);
CREATE INDEX idx_suggestions_round_selected ON suggestions(round_id) WHERE selected = true;

-- ============================================================
-- VOTES (replaces string[] in suggestion)
-- ============================================================
CREATE TABLE votes (
    suggestion_id TEXT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
    voter_id TEXT NOT NULL,
    PRIMARY KEY (suggestion_id, voter_id)
);

-- ============================================================
-- ROUND PLAYERS
-- ============================================================
CREATE TABLE round_players (
    round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (round_id, user_id)
);

-- ============================================================
-- BOARDS
-- ============================================================
CREATE TABLE boards (
    round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board_size INTEGER NOT NULL DEFAULT 5,
    score INTEGER NOT NULL DEFAULT 0,
    has_bingo BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (round_id, user_id)
);

-- ============================================================
-- BOARD SQUARES
-- ============================================================
CREATE TABLE board_squares (
    round_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    suggestion_id TEXT NOT NULL, -- 'FREE' for free square
    PRIMARY KEY (round_id, user_id, position),
    FOREIGN KEY (round_id, user_id) REFERENCES boards(round_id, user_id) ON DELETE CASCADE
);

CREATE INDEX idx_board_squares_suggestion ON board_squares(suggestion_id) WHERE suggestion_id != 'FREE';

-- ============================================================
-- CSRF TOKENS (with expiry, cleaned by scheduled task)
-- ============================================================
CREATE TABLE csrf_tokens (
    token TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '600 seconds'
);

CREATE INDEX idx_csrf_expires ON csrf_tokens(expires_at);
```

**Key design decisions:**
- Suggestions stored in their own table (not embedded in round JSON) — enables proper querying and updates
- Votes normalized into junction table — eliminates array manipulation
- Board squares in separate table — enables efficient score calculation queries
- `active_round` is a singleton table (always one row) — simple to query and update
- CASCADE deletes handle round cleanup automatically
- No `round_id` array on seasons — use `SELECT FROM rounds WHERE season_id = ?` instead

---

## 2. Spring Boot Project Structure

```
backend/
├── pom.xml
├── Dockerfile
├── src/main/java/com/motobingo/
│   ├── MotoBingoApplication.java
│   ├── config/
│   │   ├── SecurityConfig.java          # Spring Security + Auth0 OAuth2
│   │   ├── CorsConfig.java              # CORS filter configuration
│   │   └── DevBypassFilter.java         # X-Dev-User / X-Dev-Role filter (dev profile only)
│   ├── controller/
│   │   ├── AuthController.java          # POST /auth/login, GET /auth/me
│   │   ├── CsrfController.java          # GET /csrf
│   │   ├── UserController.java          # CRUD /users
│   │   ├── ChampionshipController.java  # GET /championships
│   │   ├── SeasonController.java        # GET/POST seasons
│   │   ├── RoundController.java         # CRUD /rounds, phase transitions
│   │   ├── ActiveRoundController.java   # GET/PUT /active-round
│   │   ├── SuggestionController.java    # CRUD suggestions + votes
│   │   ├── PlayerController.java        # POST/DELETE round players
│   │   ├── BoardController.java         # POST generate, GET board
│   │   └── LeaderboardController.java   # Round/season leaderboards, user boards
│   ├── service/
│   │   ├── AuthService.java             # Legacy JWT + Auth0 user resolution
│   │   ├── UserService.java             # User CRUD + active round side effects
│   │   ├── ChampionshipService.java     # Championship seeding + queries
│   │   ├── SeasonService.java           # Season management
│   │   ├── RoundService.java            # Round CRUD + phase transitions
│   │   ├── SuggestionService.java       # Suggestion CRUD + vote toggling
│   │   ├── BoardService.java            # Board generation + scoring
│   │   └── LeaderboardService.java      # Score aggregation
│   ├── model/
│   │   ├── User.java
│   │   ├── Championship.java
│   │   ├── Season.java
│   │   ├── Round.java
│   │   ├── Suggestion.java
│   │   ├── Vote.java
│   │   ├── Board.java
│   │   ├── BoardSquare.java
│   │   └── ActiveRound.java
│   ├── repository/
│   │   ├── UserRepository.java
│   │   ├── ChampionshipRepository.java
│   │   ├── SeasonRepository.java
│   │   ├── RoundRepository.java
│   │   ├── SuggestionRepository.java
│   │   ├── VoteRepository.java
│   │   ├── RoundPlayerRepository.java
│   │   ├── BoardRepository.java
│   │   ├── BoardSquareRepository.java
│   │   ├── ActiveRoundRepository.java
│   │   └── CsrfTokenRepository.java
│   ├── dto/
│   │   ├── request/                     # Request DTOs (LoginRequest, CreateRoundRequest, etc.)
│   │   └── response/                    # Response DTOs matching current API JSON shapes
│   ├── security/
│   │   ├── Auth0JwtDecoder.java         # Custom claims extraction
│   │   ├── AdminAuthorizationManager.java
│   │   └── CurrentUser.java             # Helper to get current user from SecurityContext
│   └── exception/
│       ├── GlobalExceptionHandler.java  # @ControllerAdvice
│       └── ApiException.java            # Custom exceptions (404, 409, 400)
├── src/main/resources/
│   ├── application.yml                  # Common config
│   ├── application-dev.yml              # Local dev (bypass auth, localhost CORS)
│   ├── application-test.yml             # Test env
│   ├── application-prod.yml             # Production
│   └── db/migration/
│       └── V1__initial_schema.sql       # Flyway migration (the SQL from section 1)
└── src/test/java/com/motobingo/
    ├── service/
    │   ├── BoardServiceTest.java        # Scoring algorithm unit tests
    │   └── LeaderboardServiceTest.java
    └── controller/
        └── *ControllerTest.java         # @WebMvcTest integration tests
```

**Key dependencies (pom.xml):**
```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.4.1</version>
</parent>

<properties>
    <java.version>21</java.version>
</properties>

<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
        <scope>runtime</scope>
    </dependency>
    <dependency>
        <groupId>org.flywaydb</groupId>
        <artifactId>flyway-core</artifactId>
    </dependency>
    <dependency>
        <groupId>org.flywaydb</groupId>
        <artifactId>flyway-database-postgresql</artifactId>
    </dependency>
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-api</artifactId>
        <version>0.12.6</version>
    </dependency>
    <!-- Test -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>com.h2database</groupId>
        <artifactId>h2</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

---

## 3. API Endpoint Mapping

Every endpoint must return identical JSON shapes. The `@RequestMapping("/api/v1")` prefix is on all controllers.

### AuthController

| # | Method | Path | Auth | Handler | Service Method | Notes |
|---|--------|------|------|---------|---------------|-------|
| 1 | POST | `/auth/login` | None | `login(@RequestBody LoginRequest)` | `AuthService.login(username, password)` | Returns `{ token }` HS256 JWT, 8hr expiry |
| 2 | GET | `/auth/me` | Auth0 | `me(@RequestParam(required=false) handle, JwtAuthenticationToken)` | `AuthService.getOrCreateUser(token, handle)` | Returns `{ user, roles }` |

### CsrfController

| # | Method | Path | Auth | Handler | Service Method |
|---|--------|------|------|---------|---------------|
| 3 | GET | `/csrf` | None | `getCsrfToken()` | Generates UUID, stores in `csrf_tokens` table | Returns `{ token }` |

### UserController

| # | Method | Path | Auth | Handler | Service Method |
|---|--------|------|------|---------|---------------|
| 4 | GET | `/users` | None | `getAllUsers()` | `UserService.findAll()` |
| 5 | POST | `/users` | Admin | `createUser(@RequestBody CreateUserRequest)` | `UserService.create(xHandle, displayName)` |
| 6 | PUT | `/users/{id}` | Admin | `updateUser(@PathVariable id, @RequestBody UpdateUserRequest)` | `UserService.update(id, fields)` |
| 7 | DELETE | `/users/{id}` | Admin | `deleteUser(@PathVariable id)` | `UserService.delete(id)` |

**POST /users side effect**: `UserService.create()` checks active round. If in `boards`/`raceday` phase, calls `BoardService.addPlayerToRound(roundId, userId)`.

### ChampionshipController

| # | Method | Path | Auth | Handler | Service Method |
|---|--------|------|------|---------|---------------|
| 8 | GET | `/championships` | None | `getAll()` | `ChampionshipService.findAll()` |

Championships are seeded via Flyway migration. No auto-seed logic needed at runtime.

### SeasonController

| # | Method | Path | Auth | Handler | Service Method |
|---|--------|------|------|---------|---------------|
| 9 | GET | `/championships/{id}/seasons` | None | `getSeasons(@PathVariable id)` | `SeasonService.findByChampionship(id)` |
| 10 | POST | `/championships/{id}/seasons` | Admin | `createSeason(@PathVariable id, @RequestBody CreateSeasonRequest)` | `SeasonService.create(champId, year)` |

**Create logic**: `@Transactional` — deactivate all existing seasons for championship, insert new active one. 409 if duplicate year.

### RoundController

| # | Method | Path | Auth | Handler | Service Method |
|---|--------|------|------|---------|---------------|
| 11 | GET | `/seasons/{id}/rounds` | None | `getRounds(@PathVariable id)` | `RoundService.findBySeason(id)` |
| 12 | GET | `/rounds/{id}` | Varies | `getRound(@PathVariable id, Authentication)` | `RoundService.findById(id, isAdmin)` |
| 13 | POST | `/seasons/{id}/rounds` | Admin | `createRound(@PathVariable id, @RequestBody CreateRoundRequest)` | `RoundService.create(seasonId, name, eventDate, phaseDates)` |
| 14 | PUT | `/rounds/{id}` | Admin | `updateRound(@PathVariable id, @RequestBody UpdateRoundRequest)` | `RoundService.update(id, fields)` |
| 15 | PUT | `/rounds/{id}/phase` | Admin | `updatePhase(@PathVariable id, @RequestBody PhaseRequest)` | `RoundService.setPhase(id, phase)` |
| 16 | DELETE | `/rounds/{id}` | Admin | `deleteRound(@PathVariable id)` | `RoundService.delete(id)` |

**GET /rounds/{id}**: If not admin, filter suggestions to `status = 'approved'` only.

**PUT phase to 'boards'**: `@Transactional` — add all users as players, call `BoardService.generateAllBoards(roundId)`.

**DELETE**: CASCADE handles cleanup (no need to iterate championships/seasons like KV did).

### ActiveRoundController

| # | Method | Path | Auth | Handler | Service Method |
|---|--------|------|------|---------|---------------|
| 17 | GET | `/active-round` | None | `getActiveRound()` | `RoundService.getActiveRound()` |
| 18 | PUT | `/active-round` | Admin | `setActiveRound(@RequestBody ActiveRoundRequest)` | `RoundService.setActiveRound(roundId)` |

**GET**: Returns `{ round, championship, season }` or `{ round: null, message }`. Filters suggestions to approved. Returns null if round is `complete`.

### SuggestionController

| # | Method | Path | Auth | Handler | Service Method |
|---|--------|------|------|---------|---------------|
| 19 | POST | `/rounds/{id}/suggestions` | Auth0/Admin | `addSuggestion(@PathVariable id, @RequestBody SuggestionRequest, Authentication)` | `SuggestionService.create(roundId, text, adminApprove, isAdmin)` |
| 20 | PUT | `/rounds/{id}/suggestions/{sid}` | Admin | `updateSuggestion(@PathVariable id, @PathVariable sid, @RequestBody UpdateSuggestionRequest)` | `SuggestionService.update(roundId, sid, fields)` |
| 21 | DELETE | `/rounds/{id}/suggestions/{sid}` | Admin | `deleteSuggestion(@PathVariable id, @PathVariable sid)` | `SuggestionService.delete(roundId, sid)` |
| 22 | POST | `/rounds/{id}/suggestions/{sid}/vote` | None | `vote(@PathVariable id, @PathVariable sid, @RequestBody VoteRequest)` | `SuggestionService.toggleVote(roundId, sid, voterId)` |

**PUT side effects**: If `selected` changes during `boards` phase → `BoardService.updateAllBoardsIntelligently(roundId)`. If `completed` changes → `BoardService.recalculateAllScores(roundId)`.

### PlayerController

| # | Method | Path | Auth | Handler | Service Method |
|---|--------|------|------|---------|---------------|
| 23 | POST | `/rounds/{id}/players` | Admin | `addPlayers(@PathVariable id, @RequestBody AddPlayersRequest)` | `RoundService.addPlayers(roundId, userIds)` |
| 24 | DELETE | `/rounds/{id}/players/{userId}` | Admin | `removePlayer(@PathVariable id, @PathVariable userId)` | `RoundService.removePlayer(roundId, userId)` |

### BoardController

| # | Method | Path | Auth | Handler | Service Method |
|---|--------|------|------|---------|---------------|
| 25 | POST | `/rounds/{id}/generate-boards` | Admin | `generateBoards(@PathVariable id)` | `BoardService.generateAllBoards(roundId)` |
| 26 | GET | `/rounds/{id}/boards/{userId}` | None | `getBoard(@PathVariable id, @PathVariable userId)` | `BoardService.getBoard(roundId, userId)` |

**GET boards/{userId}**: Auto-creates board if missing and round is in `boards`/`raceday`. Calculates score on read. Returns enriched squares with suggestion text + completed status.

### LeaderboardController

| # | Method | Path | Auth | Handler | Service Method |
|---|--------|------|------|---------|---------------|
| 27 | GET | `/rounds/{id}/leaderboard` | None | `getRoundLeaderboard(@PathVariable id)` | `LeaderboardService.roundLeaderboard(roundId)` |
| 28 | GET | `/seasons/{id}/leaderboard` | None | `getSeasonLeaderboard(@PathVariable id)` | `LeaderboardService.seasonLeaderboard(seasonId)` |
| 29 | GET | `/seasons/{id}/user/{userId}/boards` | None | `getUserBoards(@PathVariable id, @PathVariable userId)` | `LeaderboardService.userSeasonBoards(seasonId, userId)` |

---

## 4. Security Setup

### SecurityConfig.java

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${app.auth0.audience}")
    private String audience;

    @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}")
    private String issuerUri;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Admin-only endpoints
                .requestMatchers(HttpMethod.POST, "/api/v1/users").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/v1/users/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/users/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/v1/championships/*/seasons").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/v1/seasons/*/rounds").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/v1/rounds/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/rounds/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/v1/active-round").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/v1/rounds/*/generate-boards").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/v1/rounds/*/players").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/rounds/*/players/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/v1/rounds/*/suggestions/**").hasAuthority("ROLE_ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/rounds/*/suggestions/**").hasAuthority("ROLE_ADMIN")
                // Auth required (any valid token)
                .requestMatchers(HttpMethod.POST, "/api/v1/rounds/*/suggestions").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/v1/auth/me").authenticated()
                // Everything else is public
                .anyRequest().permitAll()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtDecoder(jwtDecoder()))
            );
        return http.build();
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        NimbusJwtDecoder decoder = JwtDecoders.fromIssuerLocation(issuerUri);
        // Validate audience
        OAuth2TokenValidator<Jwt> audienceValidator = token ->
            token.getAudience().contains(audience)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_audience"));
        OAuth2TokenValidator<Jwt> withIssuer = JwtValidators.createDefaultWithIssuer(issuerUri);
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(withIssuer, audienceValidator));
        return decoder;
    }

    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            List<String> roles = jwt.getClaimAsStringList("https://motobingo.app/roles");
            if (roles == null) return Collections.emptyList();
            return roles.stream()
                .map(role -> new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()))
                .collect(Collectors.toList());
        });
        return converter;
    }
}
```

### DevBypassFilter.java (active only with `dev` profile)

```java
@Component
@Profile("dev")
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class DevBypassFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String devUser = request.getHeader("X-Dev-User");
        if (devUser != null) {
            List<GrantedAuthority> authorities = new ArrayList<>();
            authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
            if ("admin".equalsIgnoreCase(request.getHeader("X-Dev-Role"))) {
                authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
            }
            // Create fake JWT-like authentication
            Map<String, Object> claims = Map.of(
                "sub", devUser,
                "nickname", devUser,
                "https://motobingo.app/screen_name", devUser,
                "https://motobingo.app/roles",
                    "admin".equalsIgnoreCase(request.getHeader("X-Dev-Role"))
                        ? List.of("admin") : List.of()
            );
            Jwt fakeJwt = Jwt.withTokenValue("dev-token")
                .header("alg", "none")
                .claims(c -> c.putAll(claims))
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
            JwtAuthenticationToken auth = new JwtAuthenticationToken(fakeJwt, authorities);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }
        chain.doFilter(request, response);
    }
}
```

### CORS Configuration

```java
@Configuration
public class CorsConfig {

    @Value("${app.cors.origin}")
    private String allowedOrigin;

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.addAllowedOrigin(allowedOrigin);
        config.addAllowedMethod("*");
        config.addAllowedHeader("*");
        config.setAllowCredentials(true);
        config.setExposedHeaders(List.of("Content-Type"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return new CorsFilter(source);
    }
}
```

### Legacy Admin Login (AuthService)

```java
public String login(String username, String password) {
    if (!adminUsername.equals(username) || !adminPassword.equals(password)) {
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
    }
    return Jwts.builder()
        .subject(username)
        .claim("role", "admin")
        .issuedAt(new Date())
        .expiration(new Date(System.currentTimeMillis() + 8 * 3600 * 1000))
        .signWith(Keys.hmacShaKeyFor(jwtSecret.getBytes()), Jwts.SIG.HS256)
        .compact();
}
```

**Note on POST /rounds/{id}/suggestions**: The SecurityConfig marks it as `authenticated()`, but the controller also allows admin access (admin can post suggestions). The `SuggestionController` checks: if user has ROLE_ADMIN OR is authenticated, proceed. Non-admin must also verify round is in `suggestions` phase.

---

## 5. Scoring Logic

Exact port of the TypeScript algorithm to Java.

```java
@Service
public class BoardService {

    /**
     * Calculate score for a single board.
     * Called on every GET /boards/{userId} and when suggestions are completed.
     */
    public ScoreResult calculateScore(List<BoardSquare> squares, List<Suggestion> roundSuggestions, int boardSize) {
        // Build completion grid
        Map<String, Boolean> completionMap = roundSuggestions.stream()
            .collect(Collectors.toMap(Suggestion::getId, Suggestion::isCompleted));

        boolean[] completed = new boolean[squares.size()];
        for (BoardSquare sq : squares) {
            if ("FREE".equals(sq.getSuggestionId())) {
                completed[sq.getPosition()] = true;
            } else {
                completed[sq.getPosition()] = completionMap.getOrDefault(sq.getSuggestionId(), false);
            }
        }

        // Get all lines
        List<int[]> lines = getLines(boardSize);

        int totalScore = 0;
        boolean hasBingo = false;

        for (int[] line : lines) {
            boolean allCompleted = true;
            for (int idx : line) {
                if (!completed[idx]) { allCompleted = false; break; }
            }
            if (allCompleted) {
                totalScore += 100;
                hasBingo = true;
            } else {
                totalScore += countConsecutivePairs(line, completed);
            }
        }

        return new ScoreResult(totalScore, hasBingo);
    }

    /**
     * Generate all lines for a board of given size.
     * Returns 2*size + 2 lines (rows + columns + 2 diagonals).
     */
    private List<int[]> getLines(int size) {
        List<int[]> lines = new ArrayList<>();

        // Rows
        for (int r = 0; r < size; r++) {
            int[] row = new int[size];
            for (int c = 0; c < size; c++) row[c] = r * size + c;
            lines.add(row);
        }

        // Columns
        for (int c = 0; c < size; c++) {
            int[] col = new int[size];
            for (int r = 0; r < size; r++) col[r] = r * size + c;
            lines.add(col);
        }

        // Main diagonal (top-left to bottom-right)
        int[] diag1 = new int[size];
        for (int i = 0; i < size; i++) diag1[i] = i * size + i;
        lines.add(diag1);

        // Anti-diagonal (top-right to bottom-left)
        int[] diag2 = new int[size];
        for (int i = 0; i < size; i++) diag2[i] = i * size + (size - 1 - i);
        lines.add(diag2);

        return lines;
    }

    /**
     * Count consecutive pairs of completed squares in a line.
     * For each adjacent pair where both are completed, add 1.
     */
    private int countConsecutivePairs(int[] line, boolean[] completed) {
        int pairs = 0;
        for (int i = 0; i < line.length - 1; i++) {
            if (completed[line[i]] && completed[line[i + 1]]) {
                pairs++;
            }
        }
        return pairs;
    }

    /**
     * Generate a board for a player.
     * @param selectedSuggestionIds IDs of all selected suggestions for the round
     * @param boardSize calculated board size
     * @return list of BoardSquare with positions
     */
    public List<BoardSquare> generateBoard(List<String> selectedSuggestionIds, int boardSize) {
        int totalSquares = boardSize * boardSize;
        int centreIndex = totalSquares / 2;

        List<String> shuffled = new ArrayList<>(selectedSuggestionIds);
        Collections.shuffle(shuffled);
        List<String> picked = shuffled.subList(0, Math.min(totalSquares - 1, shuffled.size()));

        List<BoardSquare> squares = new ArrayList<>();
        int pickIdx = 0;
        for (int pos = 0; pos < totalSquares; pos++) {
            if (pos == centreIndex) {
                squares.add(new BoardSquare(pos, "FREE"));
            } else if (pickIdx < picked.size()) {
                squares.add(new BoardSquare(pos, picked.get(pickIdx++)));
            }
        }
        return squares;
    }

    /**
     * Board size calculation: ceil(sqrt(selectedCount + 1))
     * The +1 accounts for the FREE square.
     */
    public int calculateBoardSize(int selectedCount) {
        return (int) Math.ceil(Math.sqrt(selectedCount + 1));
    }

    /**
     * Intelligently update an existing board when selections change.
     * Preserves squares that are still in the selected pool.
     * Fills gaps with new selections.
     */
    public List<BoardSquare> updateBoardIntelligently(List<BoardSquare> existing,
                                                       Set<String> currentSelectedIds,
                                                       int boardSize) {
        int totalSquares = boardSize * boardSize;
        int centreIndex = totalSquares / 2;

        // Keep squares still in selected pool
        Set<String> usedIds = new HashSet<>();
        BoardSquare[] result = new BoardSquare[totalSquares];

        for (BoardSquare sq : existing) {
            if (sq.getPosition() == centreIndex) {
                result[sq.getPosition()] = new BoardSquare(sq.getPosition(), "FREE");
            } else if (currentSelectedIds.contains(sq.getSuggestionId())) {
                result[sq.getPosition()] = sq;
                usedIds.add(sq.getSuggestionId());
            }
        }

        // Collect unused suggestions for filling gaps
        List<String> unused = currentSelectedIds.stream()
            .filter(id -> !usedIds.contains(id))
            .collect(Collectors.toList());
        Collections.shuffle(unused);

        int unusedIdx = 0;
        for (int pos = 0; pos < totalSquares; pos++) {
            if (result[pos] == null) {
                if (pos == centreIndex) {
                    result[pos] = new BoardSquare(pos, "FREE");
                } else if (unusedIdx < unused.size()) {
                    result[pos] = new BoardSquare(pos, unused.get(unusedIdx++));
                }
            }
        }

        return Arrays.asList(result);
    }

    public record ScoreResult(int score, boolean hasBingo) {}
}
```

**Recalculation triggers:**
1. `GET /rounds/{id}/boards/{userId}` — always recalculates on read
2. `PUT /rounds/{id}/suggestions/{sid}` with `completed` change — batch recalculate all boards in round
3. `PUT /rounds/{id}/phase` to `boards` — initial score is 0

---

## 6. Docker Setup

### docker-compose.yml (Local Development)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: motobingo
      POSTGRES_USER: motobingo
      POSTGRES_PASSWORD: localdev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U motobingo"]
      interval: 5s
      timeout: 3s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      SPRING_PROFILES_ACTIVE: dev
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/motobingo
      SPRING_DATASOURCE_USERNAME: motobingo
      SPRING_DATASOURCE_PASSWORD: localdev
      APP_CORS_ORIGIN: http://localhost:4200
      APP_ADMIN_USERNAME: admin
      APP_ADMIN_PASSWORD: testpass123
      APP_JWT_SECRET: testsecret123
    ports:
      - "8787:8080"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
```

**Note**: Backend listens on 8080 internally but maps to 8787 externally to match the port the frontend/tests expect.

### Dockerfile (Production Build)

```dockerfile
# --- Build stage ---
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app
COPY pom.xml .
COPY .mvn .mvn
COPY mvnw .
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B
COPY src src
RUN ./mvnw package -DskipTests -B

# --- Runtime stage ---
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Create non-root user
RUN addgroup -S app && adduser -S app -G app
USER app

COPY --from=build /app/target/motobingo-api-*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", \
    "-XX:+UseSerialGC", \
    "-XX:MaxRAMPercentage=75.0", \
    "-XX:+TieredCompilation", \
    "-XX:TieredStopAtLevel=1", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-jar", "app.jar"]
```

### docker-compose.prod.yml (Production on Oracle Cloud)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: motobingo
      POSTGRES_USER: motobingo
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U motobingo"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 256M

  backend:
    image: ghcr.io/YOUR_ORG/motobingo-api:latest
    restart: unless-stopped
    environment:
      SPRING_PROFILES_ACTIVE: prod
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/motobingo
      SPRING_DATASOURCE_USERNAME: motobingo
      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD}
      APP_CORS_ORIGIN: ${CORS_ORIGIN}
      APP_ADMIN_USERNAME: admin
      APP_ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      APP_JWT_SECRET: ${JWT_SECRET}
      APP_AUTH0_DOMAIN: dev-xlhmy2q3ti2zo0ad.us.auth0.com
      APP_AUTH0_AUDIENCE: https://motobingo-api
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 512M

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - backend
    deploy:
      resources:
        limits:
          memory: 64M

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

### Caddyfile (Reverse Proxy + Auto TLS)

```
api-turkeymxbingo.thefryup.com {
    reverse_proxy backend:8080
}
```

---

## 7. Deployment Pipeline

### GitHub Actions Workflow (`.github/workflows/deploy.yml`)

```yaml
name: Build & Deploy

on:
  push:
    branches: [main]
    paths: ['backend/**']
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/motobingo-api

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: motobingo_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: maven
      - name: Run tests
        working-directory: backend
        env:
          SPRING_DATASOURCE_URL: jdbc:postgresql://localhost:5432/motobingo_test
          SPRING_DATASOURCE_USERNAME: test
          SPRING_DATASOURCE_PASSWORD: test
        run: ./mvnw verify -B

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: ./backend
          platforms: linux/arm64
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Oracle Cloud
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.OCI_HOST }}
          username: ubuntu
          key: ${{ secrets.OCI_SSH_KEY }}
          script: |
            cd /opt/motobingo
            docker compose -f docker-compose.prod.yml pull backend
            docker compose -f docker-compose.prod.yml up -d backend
            docker image prune -f
```

### Key points:
- Builds ARM64 image (matches Oracle Cloud free-tier Ampere A1)
- Uses GitHub Container Registry (free for public repos)
- SSH deploy pulls and restarts only the backend container
- Postgres data persists across deploys via named volume
- Caddy handles TLS certificate renewal automatically

---

## 8. Oracle Cloud Instance Setup

### Instance Specs (Free Tier)

- **Shape**: VM.Standard.A1.Flex (ARM/Ampere)
- **OCPUs**: 1 (can use up to 4 free)
- **RAM**: 6GB (can use up to 24GB free, but we target 1GB budget for the app)
- **Boot Volume**: 50GB
- **OS**: Ubuntu 22.04 Minimal (aarch64)

### Setup Steps

```bash
# 1. SSH into instance
ssh -i ~/.ssh/oci_key ubuntu@<PUBLIC_IP>

# 2. Install Docker 
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker

# 3. Install Docker Compose plugin
sudo apt-get install docker-compose-plugin

# 4. Create app directory
sudo mkdir -p /opt/motobingo
sudo chown ubuntu:ubuntu /opt/motobingo
cd /opt/motobingo

# 5. Create .env file
cat > .env << 'EOF'
DB_PASSWORD=<generate-strong-password>
CORS_ORIGIN=https://turkeymxbingo.thefryup.com
ADMIN_PASSWORD=<your-admin-password>
JWT_SECRET=<generate-strong-secret>
EOF
chmod 600 .env

# 6. Create docker-compose.prod.yml and Caddyfile (from section 6)

# 7. Login to GitHub Container Registry
echo $GITHUB_PAT | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# 8. Start services
docker compose -f docker-compose.prod.yml up -d

# 9. Verify
docker compose -f docker-compose.prod.yml logs -f backend
curl http://localhost:8080/api/v1/championships
```

### OCI Network Security Rules

Add ingress rules to the VCN security list:

| Direction | Protocol | Port | Source | Description |
|-----------|----------|------|--------|-------------|
| Ingress | TCP | 80 | 0.0.0.0/0 | HTTP (Caddy redirect) |
| Ingress | TCP | 443 | 0.0.0.0/0 | HTTPS (Caddy TLS) |
| Ingress | TCP | 22 | Your IP | SSH |

Also open these ports in the instance's iptables:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### DNS Setup

Point `api-turkeymxbingo.thefryup.com` A record to the Oracle Cloud instance public IP. Remove the existing Cloudflare Workers route for that domain.

### Swap (optional safety net for 1GB target)

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 9. Data Migration Strategy

### Step 1: Export from KV

Create a Node.js script (`scripts/export-kv.ts`) that runs via wrangler:

```typescript
// Run: npx wrangler kv key list --binding KV --env prod | node scripts/export-kv.js
// Or use the REST API:

import { writeFileSync } from 'fs';

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const NAMESPACE_ID = 'c6de0c0c...'; // prod KV namespace
const API_TOKEN = process.env.CF_API_TOKEN;

async function exportAll() {
  const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}`;
  const headers = { Authorization: `Bearer ${API_TOKEN}` };

  // List all keys
  const keys = await fetch(`${base}/keys`, { headers }).then(r => r.json());

  const data: Record<string, any> = {};
  for (const key of keys.result) {
    const value = await fetch(`${base}/values/${encodeURIComponent(key.name)}`, { headers })
      .then(r => r.text());
    try { data[key.name] = JSON.parse(value); }
    catch { data[key.name] = value; }
  }

  writeFileSync('kv-export.json', JSON.stringify(data, null, 2));
  console.log(`Exported ${Object.keys(data).length} keys`);
}

exportAll();
```

### Step 2: Transform & Import to PostgreSQL

Create a migration script (`scripts/import-to-postgres.ts` or `.java`):

```typescript
import { readFileSync } from 'fs';
import { Pool } from 'pg';

const data = JSON.parse(readFileSync('kv-export.json', 'utf-8'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Users
    const users = data['users'] || [];
    for (const u of users) {
      await client.query(
        'INSERT INTO users (id, x_handle, display_name, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [u.id, u.xHandle, u.displayName, u.createdAt]
      );
    }

    // 2. Championships
    const champs = data['championships'] || [];
    for (const c of champs) {
      await client.query(
        'INSERT INTO championships (id, name, short_code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [c.id, c.name, c.shortCode]
      );
    }

    // 3. Seasons (iterate championship keys)
    for (const key of Object.keys(data)) {
      const match = key.match(/^championship:(.+):seasons$/);
      if (!match) continue;
      const seasons = data[key];
      for (const s of seasons) {
        await client.query(
          'INSERT INTO seasons (id, championship_id, year, active) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [s.id, s.championshipId, s.year, s.active]
        );
      }
    }

    // 4. Rounds + Suggestions
    for (const key of Object.keys(data)) {
      if (!key.match(/^round:[^:]+$/) || key.includes(':boards')) continue;
      const round = data[key];
      if (!round?.id) continue;

      await client.query(
        `INSERT INTO rounds (id, season_id, name, event_date, phase, suggestions_end, boards_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [round.id, round.seasonId, round.name, round.eventDate, round.phase,
         round.phaseDates?.suggestionsEnd, round.phaseDates?.boardsEnd]
      );

      // Players
      for (const pid of (round.playerIds || [])) {
        await client.query(
          'INSERT INTO round_players (round_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [round.id, pid]
        );
      }

      // Suggestions
      for (const s of (round.suggestions || [])) {
        await client.query(
          `INSERT INTO suggestions (id, round_id, text, status, selected, completed, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [s.id, round.id, s.text, s.status, s.selected, s.completed, s.createdAt]
        );
        // Votes
        for (const voterId of (s.votes || [])) {
          await client.query(
            'INSERT INTO votes (suggestion_id, voter_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [s.id, voterId]
          );
        }
      }
    }

    // 5. Boards
    for (const key of Object.keys(data)) {
      if (!key.match(/^round:.+:boards$/)) continue;
      const roundBoards = data[key];
      if (!roundBoards?.boards) continue;

      for (const [userId, board] of Object.entries(roundBoards.boards)) {
        const pb = board as any;
        await client.query(
          'INSERT INTO boards (round_id, user_id, board_size, score, has_bingo) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
          [roundBoards.roundId, userId, roundBoards.boardSize, pb.score || 0, pb.hasBingo || false]
        );
        for (const sq of (pb.squares || [])) {
          await client.query(
            'INSERT INTO board_squares (round_id, user_id, position, suggestion_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [roundBoards.roundId, userId, sq.position, sq.suggestionId]
          );
        }
      }
    }

    // 6. Active round
    const activeRoundId = data['active-round-id'];
    if (activeRoundId) {
      await client.query('UPDATE active_round SET round_id = $1 WHERE id = 1', [activeRoundId]);
    }

    await client.query('COMMIT');
    console.log('Migration complete');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

migrate();
```

### Verification

After import, run validation queries:
```sql
SELECT 'users' AS entity, COUNT(*) FROM users
UNION ALL SELECT 'championships', COUNT(*) FROM championships
UNION ALL SELECT 'seasons', COUNT(*) FROM seasons
UNION ALL SELECT 'rounds', COUNT(*) FROM rounds
UNION ALL SELECT 'suggestions', COUNT(*) FROM suggestions
UNION ALL SELECT 'boards', COUNT(*) FROM boards;
```

Compare counts against KV key counts from the export.

---

## 10. Cutover Plan

### Pre-cutover (days before)

1. Deploy Spring Boot backend to Oracle Cloud, run against migrated data
2. Smoke test all endpoints manually against prod data
3. Run Playwright e2e suite against the new backend (point `baseURL` to new host)
4. Verify Auth0 token validation works (test with real login)

### Cutover window (during low-activity period, ~5 min downtime)

1. **Freeze**: Set active round to null on the old Worker (prevents state changes)
2. **Export**: Run KV export script one final time to capture any last-minute changes
3. **Import**: Run import script against prod Postgres (idempotent with ON CONFLICT)
4. **DNS switch**: Update `api-turkeymxbingo.thefryup.com` A record from Cloudflare Workers route to Oracle Cloud IP
5. **Verify**: Hit `GET /api/v1/championships` on new backend via the domain
6. **Frontend**: No change needed — it already points to `api-turkeymxbingo.thefryup.com`
7. **Test**: Quick manual test of key flows (view active round, check leaderboard)

### Post-cutover

- Monitor logs: `docker compose -f docker-compose.prod.yml logs -f backend`
- Keep old Worker deployed but inactive for 7 days (rollback safety net)
- After 7 days stable: delete Worker and KV namespaces

### Zero-downtime alternative (if DNS propagation is a concern)

Use Cloudflare Workers as a proxy during transition:
```typescript
// Temporary worker that forwards to Oracle Cloud
export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = 'oci-motobingo.thefryup.com'; // temp subdomain pointing to OCI
    return fetch(new Request(url.toString(), request));
  }
};
```
This ensures all clients hit the new backend immediately regardless of DNS cache.

---

## 11. Environment Configuration

### application.yml (common)

```yaml
server:
  port: 8080

spring:
  application:
    name: motobingo-api
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: validate
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
  flyway:
    enabled: true
    locations: classpath:db/migration
  jackson:
    default-property-inclusion: non_null
    serialization:
      write-dates-as-timestamps: false

app:
  auth0:
    domain: dev-xlhmy2q3ti2zo0ad.us.auth0.com
    audience: https://motobingo-api

logging:
  level:
    com.motobingo: INFO
    org.springframework.security: WARN
```

### application-dev.yml

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/motobingo
    username: motobingo
    password: localdev
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://dev-xlhmy2q3ti2zo0ad.us.auth0.com/

app:
  cors:
    origin: http://localhost:4200
  admin:
    username: admin
    password: testpass123
  jwt:
    secret: testsecret123
  dev-bypass: true

logging:
  level:
    com.motobingo: DEBUG
    org.springframework.security: DEBUG
```

### application-test.yml

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/motobingo
    username: motobingo
    password: ${DB_PASSWORD}
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://dev-xlhmy2q3ti2zo0ad.us.auth0.com/

app:
  cors:
    origin: https://motobingo-test.pages.dev
  admin:
    username: admin
    password: ${ADMIN_PASSWORD}
  jwt:
    secret: ${JWT_SECRET}
  dev-bypass: false
```

### application-prod.yml

```yaml
spring:
  datasource:
    url: jdbc:postgresql://postgres:5432/motobingo
    username: motobingo
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 5
      minimum-idle: 2
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://dev-xlhmy2q3ti2zo0ad.us.auth0.com/

app:
  cors:
    origin: https://turkeymxbingo.thefryup.com
  admin:
    username: admin
    password: ${ADMIN_PASSWORD}
  jwt:
    secret: ${JWT_SECRET}
  dev-bypass: false

logging:
  level:
    root: WARN
    com.motobingo: INFO
```

---

## 12. JVM Tuning for 1GB RAM

The Oracle Cloud instance has more RAM available, but we target ~512MB for the JVM to leave room for Postgres (256MB) and Caddy + OS (remaining).

### Dockerfile ENTRYPOINT flags (already in section 6):

```
-XX:+UseSerialGC              # Lower memory overhead than G1 for small heaps
-XX:MaxRAMPercentage=75.0     # Use 75% of container memory limit (512MB * 0.75 = 384MB heap)
-XX:+TieredCompilation        # Enable tiered compilation
-XX:TieredStopAtLevel=1       # Only C1 compiler (faster startup, less memory for JIT)
-Djava.security.egd=file:/dev/./urandom  # Faster startup entropy
```

### Spring Boot optimizations:

```yaml
# In application-prod.yml
spring:
  jpa:
    open-in-view: false           # Already set — prevents lazy loading in views
    properties:
      hibernate:
        jdbc:
          batch_size: 20          # Batch inserts for board generation
        order_inserts: true
  datasource:
    hikari:
      maximum-pool-size: 5       # Small pool — few concurrent users
      minimum-idle: 2
```

### Memory budget breakdown:

| Component | Allocation |
|-----------|-----------|
| JVM heap (Spring Boot) | ~384MB |
| JVM non-heap (metaspace, threads) | ~128MB |
| PostgreSQL | ~256MB |
| Caddy | ~32MB |
| OS + buffers | ~200MB |
| **Total** | ~1000MB |

With 6GB available on the instance, this is very comfortable. The limits in docker-compose are conservative to ensure the app works even on a truly 1GB machine.

### Startup time optimization:

Consider Spring Boot AOT or CDS (Class Data Sharing) if startup time becomes an issue:
```bash
# Generate CDS archive (add to Dockerfile)
java -XX:ArchiveClassesAtExit=app-cds.jsa -jar app.jar --spring.context.exit=onRefresh
java -XX:SharedArchiveFile=app-cds.jsa -jar app.jar
```

For this app size (~tens of users, simple CRUD), these optimizations are likely unnecessary. The baseline should start in 3-5 seconds.

---

## 13. Testing Strategy

### Unit Tests (JUnit 5 + Mockito)

Priority test targets:
- **BoardService**: Scoring algorithm, board generation, intelligent update
- **LeaderboardService**: Season aggregation logic
- **RoundService**: Phase transition rules and side effects

```java
@ExtendWith(MockitoExtension.class)
class BoardServiceTest {

    @InjectMocks
    private BoardService boardService;

    @Test
    void calculateScore_allCompleted_5x5_returns1200() {
        // 5x5 board, all completed = 12 lines × 100 = 1200
        List<BoardSquare> squares = IntStream.range(0, 25)
            .mapToObj(i -> new BoardSquare(i, i == 12 ? "FREE" : "s" + i))
            .toList();
        List<Suggestion> suggestions = IntStream.range(0, 24)
            .mapToObj(i -> new Suggestion("s" + i, "text", "approved", false, true))
            .toList();

        ScoreResult result = boardService.calculateScore(squares, suggestions, 5);
        assertEquals(1200, result.score());
        assertTrue(result.hasBingo());
    }

    @Test
    void calculateScore_oneCompletedRow_returns100() { ... }

    @Test
    void calculateScore_consecutivePairs_returnsCorrectCount() { ... }

    @Test
    void generateBoard_placeFreeInCenter() {
        List<String> ids = IntStream.range(0, 24).mapToObj(i -> "s" + i).toList();
        List<BoardSquare> board = boardService.generateBoard(ids, 5);
        assertEquals(25, board.size());
        assertEquals("FREE", board.get(12).getSuggestionId());
    }

    @Test
    void calculateBoardSize_8suggestions_returns3() {
        assertEquals(3, boardService.calculateBoardSize(8)); // ceil(sqrt(9)) = 3
    }

    @Test
    void calculateBoardSize_24suggestions_returns5() {
        assertEquals(5, boardService.calculateBoardSize(24)); // ceil(sqrt(25)) = 5
    }
}
```

### Integration Tests (@SpringBootTest)

Test full request/response cycle with real DB:

```java
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("dev")
@Testcontainers
class RoundControllerIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void createRound_returnsRoundWithId() { ... }

    @Test
    void phaseTransition_toBboards_generatesBoards() { ... }
}
```

### Playwright E2E Tests (existing suite)

The existing Playwright tests must pass unchanged. Required setup:

1. **Backend must listen on port 8787** (use docker-compose port mapping or configure)
2. **Dev bypass auth must work** (X-Dev-User / X-Dev-Role headers)
3. **API contract must be identical** (same JSON field names, same status codes)

**Running e2e against new backend:**

```bash
# Terminal 1: Start new backend locally
cd backend
docker compose up  # postgres + spring boot on port 8787

# Terminal 2: Start frontend
cd ..  # root of bingogen
npm start  # Angular on port 4200

# Terminal 3: Run tests
npx playwright test
```

**Key compatibility requirements for tests to pass:**
- `POST /api/v1/auth/login` must still return `{ token }` (legacy JWT)
- All responses must use camelCase JSON (configure Jackson: `PropertyNamingStrategies.LOWER_CAMEL_CASE`)
- `201 Created` status codes must be preserved for POST endpoints that return them
- `GET /rounds/:id` must filter suggestions for non-admin (the test checks this)
- Board auto-creation on `GET /boards/:userId` must work (tests rely on this side effect)
- `{ ok: true }` responses for DELETE operations must match exactly

**Test environment docker-compose override:**

```yaml
# docker-compose.test.yml (extends base)
services:
  backend:
    ports:
      - "8787:8080"
    environment:
      SPRING_PROFILES_ACTIVE: dev
```

---

## 14. Rollback Plan

### If issues are found within first 7 days:

**Immediate rollback (< 5 minutes):**

1. **DNS**: Revert `api-turkeymxbingo.thefryup.com` to Cloudflare Workers route (or re-enable the Worker custom domain)
2. **Worker**: The old Worker is still deployed and KV data is intact
3. **Verify**: Frontend immediately routes back to old backend

**Data sync concern**: Any data written to Postgres after cutover won't be in KV. For a small app with tens of users, manually reconcile if needed (likely just a few suggestions or votes).

### If issues found after 7+ days:

1. Re-deploy the Cloudflare Worker from git history
2. Create fresh KV namespaces if old ones were deleted
3. Write a reverse migration script (Postgres → KV export)
4. This scenario is unlikely if e2e tests pass

### Monitoring for issues:

```bash
# Check backend health
curl -s https://api-turkeymxbingo.thefryup.com/api/v1/championships | jq

# Check logs
ssh ubuntu@<OCI_IP> 'cd /opt/motobingo && docker compose -f docker-compose.prod.yml logs --tail=50 backend'

# Check resource usage
ssh ubuntu@<OCI_IP> 'docker stats --no-stream'
```

### Decision criteria for rollback:

| Condition | Action |
|-----------|--------|
| API returning 500s on core endpoints | Rollback immediately |
| Auth0 token validation failing | Check jwks-uri config, fix forward if possible |
| Slow responses (> 2s) | Check Postgres, likely fixable without rollback |
| Data inconsistency | Investigate, may need targeted fix |
| One obscure edge case failing | Fix forward, no rollback needed |

---

## Summary: Implementation Order

1. **Week 1**: Set up Spring Boot project, Flyway schema, entity classes, repositories
2. **Week 2**: Implement controllers + services (start with championships/seasons/rounds — simplest)
3. **Week 3**: Board generation, scoring algorithm, leaderboards (most complex logic)
4. **Week 4**: Security (Auth0 + dev bypass), CORS, legacy login endpoint
5. **Week 5**: Docker setup, CI/CD pipeline, Oracle Cloud provisioning
6. **Week 6**: Data migration, e2e test pass, cutover

Total estimate: ~6 weeks part-time, ~2-3 weeks focused.
