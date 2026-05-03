package cn.zeros.service;

import cn.zeros.config.DiskConfig;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Stores short-lived boot randomValue commits before issuing a SystemToken.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BootCommitService {

    static final long COMMIT_TTL_SECONDS = 30;
    static final long SAME_IP_REPLACE_SECONDS = 5;

    private final DiskConfig diskConfig;
    private final ObjectMapper objectMapper;

    public CommitResult commit(String randomValue, String clientIp) {
        if (clientIp == null || clientIp.isBlank()) {
            return CommitResult.error("Cannot resolve client IP");
        }

        try {
            Map<String, Map<String, Object>> commits = loadCommits();
            long now = nowSeconds();
            removeExpired(commits, now);

            for (Iterator<Map.Entry<String, Map<String, Object>>> it = commits.entrySet().iterator(); it.hasNext();) {
                Map.Entry<String, Map<String, Object>> entry = it.next();
                Map<String, Object> info = entry.getValue();
                if (clientIp.equals(String.valueOf(info.getOrDefault("ip", "")))) {
                    long age = now - asLong(info.get("created_at"), 0);
                    if (age < SAME_IP_REPLACE_SECONDS) {
                        saveCommits(commits);
                        return CommitResult.error("This IP already has an unconsumed boot commit");
                    }
                    it.remove();
                    break;
                }
            }

            Map<String, Object> info = new LinkedHashMap<>();
            info.put("ip", clientIp);
            info.put("created_at", now);
            commits.put(randomValue, info);
            saveCommits(commits);
            return CommitResult.ok();
        } catch (IOException e) {
            log.error("Failed to write boot commit", e);
            return CommitResult.error("Failed to write boot commit");
        }
    }

    public ConsumeResult consume(String randomValue, String clientIp) {
        if (clientIp == null || clientIp.isBlank()) {
            return ConsumeResult.error("Cannot resolve client IP", false);
        }

        try {
            Map<String, Map<String, Object>> commits = loadCommits();
            long now = nowSeconds();
            removeExpired(commits, now);

            Map<String, Object> info = commits.get(randomValue);
            if (info == null || !clientIp.equals(String.valueOf(info.getOrDefault("ip", "")))) {
                saveCommits(commits);
                return ConsumeResult.error("SystemToken requires a prior boot commit", false);
            }

            if (asLong(info.get("created_at"), 0) < now - COMMIT_TTL_SECONDS) {
                commits.remove(randomValue);
                saveCommits(commits);
                return ConsumeResult.error("Boot commit has expired", true);
            }

            commits.remove(randomValue);
            removeExpired(commits, now);
            saveCommits(commits);
            return ConsumeResult.ok();
        } catch (IOException e) {
            log.error("Failed to consume boot commit", e);
            return ConsumeResult.error("Failed to consume boot commit", false);
        }
    }

    Path getCommitFilePath() {
        return diskConfig.getPartitionPath("D")
                .resolve("cache")
                .resolve("temp")
                .resolve("boot_commit.json");
    }

    long nowSeconds() {
        return System.currentTimeMillis() / 1000;
    }

    private void removeExpired(Map<String, Map<String, Object>> commits, long now) {
        commits.entrySet().removeIf(entry -> {
            Map<String, Object> info = entry.getValue();
            return info == null || asLong(info.get("created_at"), 0) < now - COMMIT_TTL_SECONDS;
        });
    }

    private Map<String, Map<String, Object>> loadCommits() throws IOException {
        Path file = getCommitFilePath();
        if (!Files.exists(file)) {
            return new LinkedHashMap<>();
        }
        Map<String, Object> root = objectMapper.readValue(file.toFile(), new TypeReference<>() {});
        Object rawCommits = root != null ? root.get("commits") : null;
        Map<String, Map<String, Object>> commits = new LinkedHashMap<>();
        if (rawCommits instanceof Map<?, ?> rawMap) {
            for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                if (entry.getKey() != null && entry.getValue() instanceof Map<?, ?> rawInfo) {
                    Map<String, Object> info = new LinkedHashMap<>();
                    for (Map.Entry<?, ?> infoEntry : rawInfo.entrySet()) {
                        if (infoEntry.getKey() != null) {
                            info.put(infoEntry.getKey().toString(), infoEntry.getValue());
                        }
                    }
                    commits.put(entry.getKey().toString(), info);
                }
            }
        }
        return commits;
    }

    private void saveCommits(Map<String, Map<String, Object>> commits) throws IOException {
        Path file = getCommitFilePath();
        Files.createDirectories(file.getParent());
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("commits", commits);
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), root);
    }

    private long asLong(Object value, long defaultValue) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String str) {
            try {
                return Long.parseLong(str);
            } catch (NumberFormatException ignored) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    public record CommitResult(boolean success, String message) {
        static CommitResult ok() {
            return new CommitResult(true, null);
        }

        static CommitResult error(String message) {
            return new CommitResult(false, message);
        }
    }

    public record ConsumeResult(boolean success, String message, boolean expired) {
        static ConsumeResult ok() {
            return new ConsumeResult(true, null, false);
        }

        static ConsumeResult error(String message, boolean expired) {
            return new ConsumeResult(false, message, expired);
        }
    }
}
