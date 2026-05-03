package cn.zeros.service;

import cn.zeros.util.ProjectRootUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Whitelisted Node/npm command bridge matching the PHP nodeLib services.
 */
@Slf4j
@Service
public class NodeLibService {

    private static final Set<String> SCRIPT_WHITELIST = Set.of("check", "perf");
    private static final Set<String> PACKAGE_WHITELIST = Set.of(
            "systeminformation",
            "node-system-stats",
            "microstats"
    );

    private final Path projectRoot;

    public NodeLibService() {
        this.projectRoot = ProjectRootUtil.resolveProjectRoot();
    }

    public Set<String> getScriptWhitelist() {
        return SCRIPT_WHITELIST;
    }

    public Set<String> getPackageWhitelist() {
        return PACKAGE_WHITELIST;
    }

    public Map<String, Object> executeScript(String scriptId) throws IOException, InterruptedException {
        if (scriptId == null || !SCRIPT_WHITELIST.contains(scriptId)) {
            throw new IllegalArgumentException("scriptId must be one of: " + String.join(", ", SCRIPT_WHITELIST));
        }

        if ("check".equals(scriptId)) {
            CommandResult result = runCommand(Duration.ofSeconds(5), nodeCommand("--version"));
            boolean nodeAvailable = result.success() && !result.stdout().trim().isEmpty();
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("nodeAvailable", nodeAvailable);
            data.put("version", nodeAvailable ? result.stdout().trim() : null);
            data.put("stdout", result.stdout());
            data.put("stderr", result.stderr());
            data.put("code", result.code());
            return data;
        }

        Path baseDir = projectRoot.resolve("system").resolve("assets").resolve("nodeLibs").normalize();
        Path scriptPath = baseDir.resolve(scriptId + ".js").normalize();
        if (!scriptPath.startsWith(baseDir) || !Files.isRegularFile(scriptPath)) {
            throw new IOException("Script is not whitelisted or does not exist: " + scriptId);
        }

        CommandResult result = runCommand(Duration.ofSeconds(15), nodeCommand(scriptPath.toString()));
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("stdout", result.stdout());
        data.put("stderr", result.stderr());
        data.put("code", result.code());
        return data;
    }

    public Map<String, Object> initializePackages(List<?> requestedPackages) throws IOException, InterruptedException {
        List<String> packages = normalizePackages(requestedPackages);
        List<String> alreadyInstalled = new ArrayList<>();
        List<String> toInstall = new ArrayList<>();

        for (String pkg : packages) {
            CommandResult result = runCommand(Duration.ofSeconds(10),
                    npmCommand("list", "-g", pkg, "--depth=0"));
            if (result.success() && !result.stdout().trim().isEmpty()) {
                alreadyInstalled.add(pkg);
            } else {
                toInstall.add(pkg);
            }
        }

        List<String> installed = new ArrayList<>();
        List<String> failed = new ArrayList<>();

        if (!toInstall.isEmpty()) {
            List<String> bulkCommand = new ArrayList<>(npmCommand("install", "-g"));
            bulkCommand.addAll(toInstall);
            CommandResult bulkResult = runCommand(Duration.ofSeconds(120), bulkCommand);
            if (bulkResult.success()) {
                installed.addAll(toInstall);
            } else {
                for (String pkg : toInstall) {
                    CommandResult singleResult = runCommand(Duration.ofSeconds(60),
                            npmCommand("install", "-g", pkg));
                    if (singleResult.success()) {
                        installed.add(pkg);
                    } else {
                        failed.add(pkg);
                    }
                }
            }
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("alreadyInstalled", alreadyInstalled);
        data.put("installed", installed);
        data.put("failed", failed);
        return data;
    }

    private List<String> normalizePackages(List<?> requestedPackages) {
        if (requestedPackages == null) {
            return List.of();
        }
        Set<String> result = new LinkedHashSet<>();
        for (Object item : requestedPackages) {
            if (item == null) {
                continue;
            }
            String pkg = item.toString().trim();
            if (PACKAGE_WHITELIST.contains(pkg)) {
                result.add(pkg);
            }
        }
        return new ArrayList<>(result);
    }

    protected CommandResult runCommand(Duration timeout, List<String> command) throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(command);
        builder.directory(projectRoot.toFile());
        Process process = builder.start();

        ByteArrayOutputStream stdout = new ByteArrayOutputStream();
        ByteArrayOutputStream stderr = new ByteArrayOutputStream();
        Thread outThread = streamTo(process.getInputStream(), stdout);
        Thread errThread = streamTo(process.getErrorStream(), stderr);

        boolean finished = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
        if (!finished) {
            process.destroyForcibly();
            process.waitFor(5, TimeUnit.SECONDS);
        }
        outThread.join(1000);
        errThread.join(1000);

        int code = finished ? process.exitValue() : -1;
        String err = stderr.toString(StandardCharsets.UTF_8);
        if (!finished) {
            err = err + (err.isEmpty() ? "" : System.lineSeparator()) + "command timed out";
        }
        return new CommandResult(finished && code == 0,
                stdout.toString(StandardCharsets.UTF_8),
                err,
                code);
    }

    private Thread streamTo(java.io.InputStream inputStream, ByteArrayOutputStream outputStream) {
        Thread thread = new Thread(() -> {
            try (inputStream; outputStream) {
                inputStream.transferTo(outputStream);
            } catch (IOException e) {
                log.debug("Failed to read command stream: {}", e.getMessage());
            }
        });
        thread.setDaemon(true);
        thread.start();
        return thread;
    }

    private List<String> nodeCommand(String... args) {
        List<String> command = new ArrayList<>();
        command.add(isWindows() ? "node.exe" : "node");
        command.addAll(List.of(args));
        return command;
    }

    private List<String> npmCommand(String... args) {
        List<String> command = new ArrayList<>();
        command.add(isWindows() ? "npm.cmd" : "npm");
        command.addAll(List.of(args));
        return command;
    }

    private boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase().contains("win");
    }

    public record CommandResult(boolean success, String stdout, String stderr, int code) {
    }
}
