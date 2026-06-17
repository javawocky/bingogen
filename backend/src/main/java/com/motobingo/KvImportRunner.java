package com.motobingo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Run with: java -jar target/motobingo-api-1.0.0.jar --spring.profiles.active=import --import.dir=/path/to/backups/prod
 */
@Component
@Profile("import")
public class KvImportRunner implements CommandLineRunner {

    private final JdbcTemplate jdbc;
    private final org.springframework.core.env.Environment env;

    public KvImportRunner(JdbcTemplate jdbc, org.springframework.core.env.Environment env) {
        this.jdbc = jdbc;
        this.env = env;
    }

    @Override
    public void run(String... args) throws Exception {
        String dir = env.getProperty("import.dir");
        if (dir == null) {
            System.err.println("Usage: --import.dir=/path/to/backups/prod");
            return;
        }
        Path base = Path.of(dir);
        ObjectMapper om = new ObjectMapper();

        // Clear existing data (order matters for FK constraints)
        jdbc.execute("DELETE FROM board_squares");
        jdbc.execute("DELETE FROM boards");
        jdbc.execute("DELETE FROM votes");
        jdbc.execute("DELETE FROM suggestions");
        jdbc.execute("DELETE FROM round_players");
        jdbc.execute("DELETE FROM rounds");
        jdbc.execute("DELETE FROM seasons");
        jdbc.execute("DELETE FROM championships");
        jdbc.execute("DELETE FROM users");
        jdbc.execute("UPDATE active_round SET round_id = NULL");
        System.out.println("Cleared existing data");

        // 1. Import championships
        JsonNode champs = om.readTree(base.resolve("championships.json").toFile());
        for (JsonNode c : champs) {
            jdbc.update("INSERT INTO championships (id, name, short_code) VALUES (?, ?, ?)",
                c.get("id").asText(), c.get("name").asText(), c.get("shortCode").asText());
        }
        System.out.println("Imported " + champs.size() + " championships");

        // 2. Import seasons
        for (File f : base.toFile().listFiles((d, name) -> name.startsWith("championship_") && name.endsWith("_seasons.json"))) {
            JsonNode seasons = om.readTree(f);
            for (JsonNode s : seasons) {
                jdbc.update("INSERT INTO seasons (id, championship_id, year, active) VALUES (?, ?, ?, ?)",
                    s.get("id").asText(), s.get("championshipId").asText(), s.get("year").asInt(), s.get("active").asBoolean());
            }
            System.out.println("Imported " + seasons.size() + " seasons");
        }

        // 3. Import users
        JsonNode users = om.readTree(base.resolve("users.json").toFile());
        for (JsonNode u : users) {
            jdbc.update("INSERT INTO users (id, x_handle, display_name, created_at) VALUES (?, ?, ?, ?::timestamptz)",
                u.get("id").asText(), u.get("xHandle").asText(), u.get("displayName").asText(), u.get("createdAt").asText());
        }
        System.out.println("Imported " + users.size() + " users");

        // 4. Import rounds
        Set<String> importedRoundIds = new HashSet<>();
        for (File f : base.toFile().listFiles((d, name) -> name.startsWith("season_") && name.endsWith("_rounds.json"))) {
            JsonNode roundRefs = om.readTree(f);
            for (JsonNode rr : roundRefs) {
                String roundId = rr.get("id").asText();
                if (importedRoundIds.contains(roundId)) continue;

                File roundFile = base.resolve("round_" + roundId + ".json").toFile();
                if (!roundFile.exists()) continue;

                JsonNode r = om.readTree(roundFile);
                jdbc.update("INSERT INTO rounds (id, season_id, name, event_date, phase) VALUES (?, ?, ?, ?::date, ?)",
                    r.get("id").asText(), r.get("seasonId").asText(), r.get("name").asText(),
                    r.get("eventDate").asText(), r.get("phase").asText());

                JsonNode suggestions = r.get("suggestions");
                if (suggestions != null) {
                    for (JsonNode s : suggestions) {
                        jdbc.update("INSERT INTO suggestions (id, round_id, text, status, selected, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?::timestamptz)",
                            s.get("id").asText(), roundId, s.get("text").asText(), s.get("status").asText(),
                            s.get("selected").asBoolean(), s.get("completed").asBoolean(), s.get("createdAt").asText());

                        JsonNode votes = s.get("votes");
                        if (votes != null && votes.isArray()) {
                            for (JsonNode voterId : votes) {
                                jdbc.update("INSERT INTO votes (id, suggestion_id, voter_id) VALUES (?, ?, ?)",
                                    UUID.randomUUID().toString(), s.get("id").asText(), voterId.asText());
                            }
                        }
                    }
                }

                JsonNode playerIds = r.get("playerIds");
                if (playerIds != null) {
                    for (JsonNode pid : playerIds) {
                        try {
                            jdbc.update("INSERT INTO round_players (round_id, user_id) VALUES (?, ?)", roundId, pid.asText());
                        } catch (Exception e) { /* skip if user doesn't exist */ }
                    }
                }
                importedRoundIds.add(roundId);
            }
        }
        System.out.println("Imported " + importedRoundIds.size() + " rounds with suggestions and votes");

        // 5. Import boards
        int boardCount = 0;
        for (File f : base.toFile().listFiles((d, name) -> name.startsWith("round_") && name.endsWith("_boards.json"))) {
            JsonNode boardsData = om.readTree(f);
            String roundId = boardsData.get("roundId").asText();
            int boardSize = boardsData.get("boardSize").asInt();
            JsonNode boards = boardsData.get("boards");

            Iterator<Map.Entry<String, JsonNode>> it = boards.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> entry = it.next();
                String userId = entry.getKey();

                Integer userCount = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id = ?", Integer.class, userId);
                if (userCount == null || userCount == 0) continue;

                String boardId = UUID.randomUUID().toString();
                jdbc.update("INSERT INTO boards (id, round_id, user_id, board_size) VALUES (?, ?, ?, ?)",
                    boardId, roundId, userId, boardSize);

                JsonNode squares = entry.getValue().get("squares");
                if (squares != null) {
                    for (JsonNode sq : squares) {
                        jdbc.update("INSERT INTO board_squares (id, board_id, position, suggestion_id) VALUES (?, ?, ?, ?)",
                            UUID.randomUUID().toString(), boardId, sq.get("position").asInt(), sq.get("suggestionId").asText());
                    }
                }
                boardCount++;
            }
        }
        System.out.println("Imported " + boardCount + " boards with squares");

        // 6. Set active round
        File activeFile = base.resolve("active-round-id.json").toFile();
        if (activeFile.exists()) {
            String activeRoundId = Files.readString(activeFile.toPath()).trim();
            if (!activeRoundId.isEmpty() && !activeRoundId.equals("null")) {
                jdbc.update("UPDATE active_round SET round_id = ? WHERE id = 1", activeRoundId);
                System.out.println("Set active round: " + activeRoundId);
            }
        }

        System.out.println("\nImport complete!");
        System.exit(0);
    }
}

