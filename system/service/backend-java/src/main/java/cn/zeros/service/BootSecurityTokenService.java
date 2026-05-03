package cn.zeros.service;

import cn.zeros.config.DiskConfig;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.function.Consumer;

/**
 * 启动安全令牌服务（对应 PHP 端 BootSecurityToken.json 的读写管理）
 *
 * <p>核心职责：
 * 统一管理 DISK/D/BootSecurityToken.json 文件，该文件存储两类数据：
 * <ol>
 *   <li><b>tokens[]</b> — JWT 令牌列表（最多 2 个：1 个 SystemToken + 1 个 UserToken）</li>
 *   <li><b>programPermissionsMap</b> — 程序权限映射 { upid → permissions[] }，
 *       记录每个程序声明的权限，用于 JwtAuthInterceptor 进行 upid 鉴权</li>
 * </ol>
 *
 * <p>文件格式示例：
 * <pre>
 * {
 *   "tokens": [
 *     { "token": "eyJ...", "type": "SystemToken", "randomValue": "abc123...", ... },
 *     { "token": "eyJ...", "type": "UserToken", "userLevel": "ADMIN", "permissions": [...], ... }
 *   ],
 *   "count": 2,
 *   "max_count": 2,
 *   "programPermissionsMap": {
 *     "a1b2c3d4...": ["KERNEL_DISK_READ", "KERNEL_DISK_WRITE"],
 *     "e5f6g7h8...": ["KERNEL_DISK_READ"]
 *   }
 * }
 * </pre>
 *
 * <p>并发安全：
 * 所有写操作通过 {@link #loadModifySave(Consumer)} 方法执行，
 * 内部使用 {@link FileLock} 文件锁保证并发写入安全（与 PHP 的 flock() 语义一致）。
 *
 * <p>被以下组件使用：
 * <ul>
 *   <li>RandomSecurityController — 调用 addToken/clearTokens 管理令牌</li>
 *   <li>ProgramPermissionsController — 调用 registerProgramPermission/reclaimUpid 管理 upid</li>
 *   <li>JwtAuthInterceptor — 调用 loadProgramPermissionsMap 校验 upid 权限</li>
 * </ul>
 *
 * @author zeros
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BootSecurityTokenService {

    private final DiskConfig diskConfig;
    private final ObjectMapper objectMapper;

    /** JWT 令牌最大数量：1 个 SystemToken + 1 个 UserToken */
    public static final int MAX_TOKEN_COUNT = 2;

    /**
     * 获取 BootSecurityToken.json 的文件路径
     * 固定位于 D 盘根目录（系统分区）
     */
    private Path getTokenFilePath() {
        return diskConfig.getPartitionPath("D").resolve("BootSecurityToken.json");
    }

    /**
     * 加载完整的安全令牌数据（只读，无文件锁）
     * 文件不存在时返回默认空数据结构
     */
    public Map<String, Object> loadData() {
        Path path = getTokenFilePath();
        if (!Files.exists(path)) {
            return createDefaultData();
        }
        try {
            String content = Files.readString(path);
            if (content.isBlank()) {
                return createDefaultData();
            }
            Map<String, Object> data = objectMapper.readValue(content, new TypeReference<>() {});
            if (data == null) {
                return createDefaultData();
            }
            data.putIfAbsent("tokens", new ArrayList<>());
            data.putIfAbsent("count", 0);
            data.putIfAbsent("max_count", MAX_TOKEN_COUNT);
            data.putIfAbsent("programPermissionsMap", new LinkedHashMap<>());
            return data;
        } catch (IOException e) {
            log.error("读取 BootSecurityToken.json 失败", e);
            return createDefaultData();
        }
    }

    /**
     * 在文件锁保护下执行「加载 → 修改 → 保存」原子操作
     * 这是所有写操作的核心方法，等同于 PHP 端的 loadModifySaveBootSecurity()
     *
     * @param modifier 修改函数，接收当前数据 Map 进行原地修改
     * @return 是否保存成功
     */
    public boolean loadModifySave(Consumer<Map<String, Object>> modifier) {
        Path path = getTokenFilePath();
        try {
            Files.createDirectories(path.getParent());
        } catch (IOException e) {
            log.error("创建目录失败: {}", path.getParent(), e);
            return false;
        }

        // 使用 RandomAccessFile + FileLock 实现文件级排他锁
        try (RandomAccessFile raf = new RandomAccessFile(path.toFile(), "rw");
             FileChannel channel = raf.getChannel();
             FileLock lock = channel.lock()) {

            // 1. 加载现有数据
            Map<String, Object> data;
            if (raf.length() > 0) {
                byte[] bytes = new byte[(int) raf.length()];
                raf.readFully(bytes);
                String content = new String(bytes);
                data = objectMapper.readValue(content, new TypeReference<>() {});
                if (data == null) {
                    data = createDefaultData();
                }
            } else {
                data = createDefaultData();
            }

            data.putIfAbsent("tokens", new ArrayList<>());
            data.putIfAbsent("programPermissionsMap", new LinkedHashMap<>());

            // 2. 执行修改
            modifier.accept(data);

            // 3. 自动更新 count 字段
            List<Map<String, Object>> tokens = tokenRecords(data.get("tokens"));
            data.put("count", tokens != null ? tokens.size() : 0);
            data.put("max_count", MAX_TOKEN_COUNT);

            // 4. 写回文件（先清空再写入，保证数据完整）
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(data);
            raf.seek(0);
            raf.setLength(0);
            raf.write(json.getBytes());
            return true;
        } catch (IOException e) {
            log.error("操作 BootSecurityToken.json 失败", e);
            return false;
        }
    }

    /**
     * 获取当前令牌列表
     */
    public List<Map<String, Object>> getTokens() {
        Map<String, Object> data = loadData();
        return tokenRecords(data.get("tokens"));
    }

    /**
     * 清除所有令牌（保留 programPermissionsMap 不受影响）
     * 系统关机/重启时由 RandomSecurityController 调用
     */
    public boolean clearTokens() {
        Path path = getTokenFilePath();
        if (!Files.exists(path)) {
            return true;
        }
        return loadModifySave(data -> {
            data.put("tokens", new ArrayList<>());
            data.put("count", 0);
        });
    }

    /**
     * 添加令牌记录，自动处理令牌类型的覆盖逻辑：
     * - SystemToken → 清空已有的全部令牌后再添加
     * - UserToken  → 移除已有的 UserToken 后再添加（保留 SystemToken）
     *
     * @param tokenRecord 令牌记录 Map，包含 token、type、randomValue 等字段
     */
    public boolean addToken(Map<String, Object> tokenRecord) {
        String type = (String) tokenRecord.get("type");
        return loadModifySave(data -> {
            List<Map<String, Object>> tokens = mutableTokenRecords(data);

            // SystemToken 签发时清空所有已有令牌
            if ("SystemToken".equals(type)) {
                tokens.clear();
            }
            // UserToken 签发时移除旧的 UserToken（单用户会话）
            else if ("UserToken".equals(type)) {
                tokens.removeIf(t -> "UserToken".equals(t.get("type")));
            }

            tokens.add(tokenRecord);
        });
    }

    /**
     * 加载 programPermissionsMap：{ upid → permissions[] }
     * 被 JwtAuthInterceptor 在每次鉴权时调用，用于校验程序权限
     *
     * @return 程序权限映射表，key 为 upid，value 为权限列表
     */
    public Map<String, List<String>> loadProgramPermissionsMap() {
        Map<String, Object> data = loadData();
        Map<String, Object> raw = objectMap(data.get("programPermissionsMap"));
        Map<String, List<String>> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : raw.entrySet()) {
            if (entry.getValue() instanceof List<?> rawPermissions) {
                List<String> permissions = new ArrayList<>();
                for (Object item : rawPermissions) {
                    if (item != null) {
                        permissions.add(item.toString());
                    }
                }
                result.put(entry.getKey(), permissions);
            }
        }
        return result;
    }

    /**
     * 注册程序权限：生成 upid 并将 {upid: permissions[]} 写入 programPermissionsMap
     *
     * @param programName 程序名称（参与 upid 生成算法）
     * @param permissions 程序声明的权限列表
     * @return 生成的 32 位十六进制 upid，失败返回 null
     */
    public String registerProgramPermission(String programName, List<String> permissions) {
        final String[] upidHolder = new String[1];
        boolean ok = loadModifySave(data -> {
            Map<String, Object> map = mutableObjectMap(data, "programPermissionsMap");
            String upid = generateUpid(programName, map.keySet());
            map.put(upid, permissions);
            upidHolder[0] = upid;
        });
        return ok ? upidHolder[0] : null;
    }

    /**
     * 回收 upid：程序退出时从 programPermissionsMap 中移除对应记录
     *
     * @param upid 要回收的用户进程 ID
     */
    public boolean reclaimUpid(String upid) {
        return loadModifySave(data -> {
            Map<String, Object> map = mutableObjectMap(data, "programPermissionsMap");
            map.remove(upid);
        });
    }

    /**
     * 更新或创建指定 upid 的权限列表。
     *
     * <p>前端可能在程序注册后追加权限声明，因此该方法保持与 PHP 端 update 行为一致：
     * upid 已存在时替换权限列表，不存在时创建新记录。
     */
    public boolean updateProgramPermissions(String upid, List<String> permissions) {
        return loadModifySave(data -> {
            Map<String, Object> map = mutableObjectMap(data, "programPermissionsMap");
            map.put(upid, permissions != null ? permissions : new ArrayList<String>());
        });
    }

    /**
     * upid 生成算法（与 PHP 端 programPermissions.php 完全一致）：
     * 1. 生成 2 个随机 16 位整数 rand1、rand2
     * 2. hash1 = SHA-256(rand1 + programName)
     * 3. hash2 = SHA-256(rand2 + programName)
     * 4. 随机决定拼接顺序：hash1+hash2 或 hash2+hash1
     * 5. upid = MD5(拼接结果)，得到 32 位十六进制字符串
     * 6. 如果与已有 upid 碰撞则重试
     */
    private String generateUpid(String programName, Set<String> existingKeys) {
        String encoded = (programName != null) ? programName : "";
        Random random = new Random();
        String upid;
        do {
            long rand1 = 1000000000000000L + (long) (random.nextDouble() * 8999999999999999L);
            long rand2 = 1000000000000000L + (long) (random.nextDouble() * 8999999999999999L);
            String hash1 = sha256(rand1 + encoded);
            String hash2 = sha256(rand2 + encoded);
            String concatenated = random.nextBoolean() ? (hash1 + hash2) : (hash2 + hash1);
            upid = md5(concatenated);
        } while (existingKeys.contains(upid));
        return upid;
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return bytesToHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 算法不可用", e);
        }
    }

    private String md5(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return bytesToHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("MD5 算法不可用", e);
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xff));
        }
        return sb.toString();
    }

    private Map<String, Object> createDefaultData() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("tokens", new ArrayList<>());
        data.put("count", 0);
        data.put("max_count", MAX_TOKEN_COUNT);
        data.put("programPermissionsMap", new LinkedHashMap<>());
        return data;
    }

    private List<Map<String, Object>> tokenRecords(Object value) {
        List<Map<String, Object>> records = new ArrayList<>();
        if (!(value instanceof List<?> rawList)) {
            return records;
        }
        for (Object item : rawList) {
            if (item instanceof Map<?, ?> rawMap) {
                records.add(toStringKeyMap(rawMap));
            }
        }
        return records;
    }

    private List<Map<String, Object>> mutableTokenRecords(Map<String, Object> data) {
        List<Map<String, Object>> tokens = tokenRecords(data.get("tokens"));
        data.put("tokens", tokens);
        return tokens;
    }

    private Map<String, Object> mutableObjectMap(Map<String, Object> data, String key) {
        Map<String, Object> map = objectMap(data.get(key));
        data.put(key, map);
        return map;
    }

    private Map<String, Object> objectMap(Object value) {
        if (!(value instanceof Map<?, ?> rawMap)) {
            return new LinkedHashMap<>();
        }
        return toStringKeyMap(rawMap);
    }

    private Map<String, Object> toStringKeyMap(Map<?, ?> rawMap) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
            if (entry.getKey() != null) {
                result.put(entry.getKey().toString(), entry.getValue());
            }
        }
        return result;
    }
}
