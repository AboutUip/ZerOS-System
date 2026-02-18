<?php
/**
 * ZerOS JWT (JSON Web Token) 工具类
 * 提供 JWT 的生成与校验功能
 * 
 * 使用方法:
 * require_once __DIR__ . '/JWT.php';
 * 
 * // 生成 Token
 * $token = JWT::encode(['user_id' => 123, 'username' => 'test'], 3600); // 1小时过期
 * 
 * // 校验 Token
 * $payload = JWT::decode($token);
 * if ($payload === false) {
 *     // Token 无效或已过期
 * } else {
 *     // Token 有效，$payload 包含原始数据
 * }
 */

class JWT {
    /**
     * 默认密钥（建议在生产环境中从配置文件读取）
     * 注意：密钥长度应至少 32 字符，建议使用随机生成的 256 位密钥
     */
    private static $defaultSecret = 'ZerOS_JWT_Secret_Key_Change_In_Production_Environment_256bit';
    
    /**
     * 默认算法
     */
    private static $algorithm = 'HS256';
    
    /**
     * Base64Url 编码（JWT 标准）
     * @param string $data 要编码的数据
     * @return string Base64Url 编码后的字符串
     */
    private static function base64UrlEncode($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
    
    /**
     * Base64Url 解码（JWT 标准）
     * @param string $data Base64Url 编码的字符串
     * @return string|false 解码后的数据，失败返回 false
     */
    private static function base64UrlDecode($data) {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $padlen = 4 - $remainder;
            $data .= str_repeat('=', $padlen);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    }
    
    /**
     * 生成 JWT Token
     * @param array $payload 要编码的数据（payload）
     * @param int $expiration 过期时间（秒），默认 3600（1小时），0 表示永不过期
     * @param string|null $secret 密钥，如果为 null 则使用默认密钥
     * @return string JWT Token
     */
    public static function encode($payload, $expiration = 3600, $secret = null) {
        // 使用提供的密钥或默认密钥
        $secretKey = $secret !== null ? $secret : self::$defaultSecret;
        
        // 构建 Header
        $header = [
            'typ' => 'JWT',
            'alg' => self::$algorithm
        ];
        
        // 添加过期时间（如果指定）
        if ($expiration > 0) {
            $payload['exp'] = time() + $expiration;
        }
        
        // 添加签发时间
        $payload['iat'] = time();
        
        // 编码 Header 和 Payload
        $headerEncoded = self::base64UrlEncode(json_encode($header, JSON_UNESCAPED_UNICODE));
        $payloadEncoded = self::base64UrlEncode(json_encode($payload, JSON_UNESCAPED_UNICODE));
        
        // 生成签名
        $signature = self::base64UrlEncode(
            hash_hmac('sha256', $headerEncoded . '.' . $payloadEncoded, $secretKey, true)
        );
        
        // 组合 Token
        return $headerEncoded . '.' . $payloadEncoded . '.' . $signature;
    }
    
    /**
     * 校验并解码 JWT Token
     * @param string $token JWT Token
     * @param string|null $secret 密钥，如果为 null 则使用默认密钥
     * @return array|false 解码后的 payload，失败返回 false
     */
    public static function decode($token, $secret = null) {
        // 使用提供的密钥或默认密钥
        $secretKey = $secret !== null ? $secret : self::$defaultSecret;
        
        // 分割 Token
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return false; // Token 格式错误
        }
        
        list($headerEncoded, $payloadEncoded, $signatureEncoded) = $parts;
        
        // 验证签名
        $signature = self::base64UrlDecode($signatureEncoded);
        if ($signature === false) {
            return false; // 签名解码失败
        }
        
        $expectedSignature = hash_hmac('sha256', $headerEncoded . '.' . $payloadEncoded, $secretKey, true);
        
        // 使用时间安全的比较函数防止时序攻击
        if (!hash_equals($signature, $expectedSignature)) {
            return false; // 签名验证失败
        }
        
        // 解码 Header
        $header = json_decode(self::base64UrlDecode($headerEncoded), true);
        if ($header === null || !isset($header['alg']) || $header['alg'] !== self::$algorithm) {
            return false; // Header 解码失败或算法不匹配
        }
        
        // 解码 Payload
        $payload = json_decode(self::base64UrlDecode($payloadEncoded), true);
        if ($payload === null) {
            return false; // Payload 解码失败
        }
        
        // 检查过期时间
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return false; // Token 已过期
        }
        
        // 移除系统字段（可选，根据需要决定是否返回）
        // unset($payload['exp'], $payload['iat']);
        
        return $payload;
    }
    
    /**
     * 验证 Token 是否有效（不返回 payload，只返回 true/false）
     * @param string $token JWT Token
     * @param string|null $secret 密钥，如果为 null 则使用默认密钥
     * @return bool Token 是否有效
     */
    public static function verify($token, $secret = null) {
        return self::decode($token, $secret) !== false;
    }
    
    /**
     * 设置默认密钥（用于动态配置）
     * @param string $secret 新的默认密钥
     */
    public static function setSecret($secret) {
        self::$defaultSecret = $secret;
    }
    
    /**
     * 获取默认密钥（用于调试，生产环境不建议暴露）
     * @return string 默认密钥
     */
    public static function getSecret() {
        return self::$defaultSecret;
    }
    
    /**
     * 从 Token 中提取 payload（不验证签名，仅用于调试）
     * 警告：此方法不验证签名，仅用于调试，生产环境请使用 decode()
     * @param string $token JWT Token
     * @return array|false Payload 数据，失败返回 false
     */
    public static function extractPayload($token) {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return false;
        }
        
        $payloadEncoded = $parts[1];
        $payload = json_decode(self::base64UrlDecode($payloadEncoded), true);
        
        return $payload !== null ? $payload : false;
    }
}
