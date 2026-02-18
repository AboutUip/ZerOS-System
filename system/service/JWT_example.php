<?php
/**
 * JWT 使用示例
 * 演示如何在其他 PHP 文件中使用 JWT 工具类
 * 
 * 访问地址: http://localhost:8089/system/service/JWT_example.php
 */

// 引入 JWT 工具类
require_once __DIR__ . '/JWT.php';

// 设置响应头
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// 处理 OPTIONS 预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 获取请求方法
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'demo';

$response = [
    'status' => 'success',
    'message' => '',
    'timestamp' => date('Y-m-d H:i:s'),
    'timestamp_unix' => time()
];

try {
    switch ($action) {
        case 'generate':
            // 生成 Token 示例
            $payload = [
                'user_id' => 12345,
                'username' => 'test_user',
                'role' => 'admin'
            ];
            $expiration = isset($_GET['exp']) ? (int)$_GET['exp'] : 3600; // 默认1小时
            
            $token = JWT::encode($payload, $expiration);
            
            $response['message'] = 'Token 生成成功';
            $response['data'] = [
                'token' => $token,
                'payload' => $payload,
                'expiration' => $expiration . ' 秒',
                'expires_at' => date('Y-m-d H:i:s', time() + $expiration)
            ];
            break;
            
        case 'verify':
            // 校验 Token 示例
            $token = $_GET['token'] ?? $_POST['token'] ?? null;
            
            if (!$token) {
                throw new Exception('缺少 token 参数');
            }
            
            $payload = JWT::decode($token);
            
            if ($payload === false) {
                $response['status'] = 'error';
                $response['message'] = 'Token 无效或已过期';
                $response['data'] = [
                    'valid' => false
                ];
            } else {
                $response['message'] = 'Token 验证成功';
                $response['data'] = [
                    'valid' => true,
                    'payload' => $payload,
                    'issued_at' => isset($payload['iat']) ? date('Y-m-d H:i:s', $payload['iat']) : null,
                    'expires_at' => isset($payload['exp']) ? date('Y-m-d H:i:s', $payload['exp']) : '永不过期'
                ];
            }
            break;
            
        case 'demo':
        default:
            // 演示完整流程
            $demoPayload = [
                'user_id' => 12345,
                'username' => 'demo_user',
                'role' => 'user'
            ];
            
            // 生成 Token（1小时过期）
            $demoToken = JWT::encode($demoPayload, 3600);
            
            // 立即验证
            $verifiedPayload = JWT::decode($demoToken);
            
            // 验证无效 Token
            $invalidToken = 'invalid.token.here';
            $invalidResult = JWT::decode($invalidToken);
            
            $response['message'] = 'JWT 演示';
            $response['data'] = [
                'generated_token' => $demoToken,
                'token_length' => strlen($demoToken),
                'original_payload' => $demoPayload,
                'verified_payload' => $verifiedPayload,
                'verification_result' => $verifiedPayload !== false ? '成功' : '失败',
                'invalid_token_test' => $invalidResult === false ? '正确拒绝无效 Token' : '错误：接受了无效 Token'
            ];
            break;
    }
} catch (Exception $e) {
    $response['status'] = 'error';
    $response['message'] = $e->getMessage();
    http_response_code(400);
}

// 输出 JSON 响应
echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

?>
