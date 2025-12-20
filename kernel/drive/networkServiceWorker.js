// NetworkManager Service Worker
// 拦截所有网络请求进行统一处理

const CACHE_NAME = 'zeros-network-cache-v1';
const requestHandlers = new Map();

// Service Worker 安装事件
self.addEventListener('install', (event) => {
    console.log('[NetworkServiceWorker] Service Worker 安装中...');
    self.skipWaiting(); // 立即激活
});

// Service Worker 激活事件
self.addEventListener('activate', (event) => {
    console.log('[NetworkServiceWorker] Service Worker 激活中...');
    event.waitUntil(
        clients.claim() // 立即控制所有页面
    );
});

// 网络启用状态（从主线程同步）
let networkEnabled = true;

// 拦截 fetch 请求
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // 只处理 HTTP/HTTPS 请求
    if (!url.protocol.startsWith('http')) {
        return;
    }
    
    // 检查网络是否被禁用
    if (!networkEnabled) {
        // 发送请求拦截消息到主线程
        sendMessageToClient({
            type: 'REQUEST_INTERCEPTED',
            data: {
                url: request.url,
                method: request.method,
                headers: Object.fromEntries(request.headers.entries()),
                body: request.body ? '存在' : null
            }
        });
        
        // 发送请求被拒绝消息
        sendMessageToClient({
            type: 'REQUEST_FAILED',
            data: {
                url: request.url,
                error: 'Network is disabled by NetworkManager'
            }
        });
        
        // 返回错误响应
        event.respondWith(
            Promise.reject(new Error('Network is disabled by NetworkManager'))
        );
        return;
    }
    
    // 发送请求拦截消息到主线程
    sendMessageToClient({
        type: 'REQUEST_INTERCEPTED',
        data: {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: request.body ? '存在' : null
        }
    });
    
    // 处理请求
    event.respondWith(
        handleRequest(request)
    );
});

/**
 * 处理请求
 */
async function handleRequest(request) {
    try {
        // 检查是否有自定义处理器
        for (const [pattern, handler] of requestHandlers.entries()) {
            const regex = new RegExp(pattern);
            if (regex.test(request.url)) {
                // 执行自定义处理器
                const response = await handler(request);
                if (response) {
                    return response;
                }
            }
        }
        
        // 默认处理：发送网络请求
        const response = await fetch(request);
        
        // 获取响应大小
        const clonedResponse = response.clone();
        const body = await clonedResponse.text();
        const size = new Blob([body]).size;
        
        // 发送响应接收消息到主线程
        sendMessageToClient({
            type: 'RESPONSE_RECEIVED',
            data: {
                url: request.url,
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: body.substring(0, 1000), // 只发送前1000字符
                size: size
            }
        });
        
        // 创建新的响应头，确保缓存控制头被正确传递
        const newHeaders = new Headers(response.headers);
        
        // 对于 module-proxy.php 的响应，确保不缓存
        if (request.url.includes('module-proxy.php')) {
            newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
            newHeaders.set('Pragma', 'no-cache');
            newHeaders.set('Expires', '0');
        }
        
        return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
        
    } catch (error) {
        // 发送请求失败消息到主线程
        sendMessageToClient({
            type: 'REQUEST_FAILED',
            data: {
                url: request.url,
                error: error.message
            }
        });
        
        // 返回错误响应
        return new Response(JSON.stringify({
            error: error.message
        }), {
            status: 500,
            statusText: 'Internal Server Error',
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}

/**
 * 发送消息到客户端
 */
function sendMessageToClient(message) {
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage(message);
        });
    });
}

// 监听来自主线程的消息
self.addEventListener('message', (event) => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'REGISTER_HANDLER':
            // 注意：Service Worker 中不能直接存储函数
            // 这里只存储模式，实际处理逻辑需要在主线程中实现
            console.log(`[NetworkServiceWorker] 注册处理器: ${data.pattern}`);
            break;
            
        case 'UNREGISTER_HANDLER':
            requestHandlers.delete(data.pattern);
            console.log(`[NetworkServiceWorker] 注销处理器: ${data.pattern}`);
            break;
            
        case 'NETWORK_ENABLED':
            // 更新网络启用状态
            networkEnabled = data.enabled !== false;
            console.log(`[NetworkServiceWorker] 网络状态已更新: ${networkEnabled ? '启用' : '禁用'}`);
            break;
            
        default:
            console.warn(`[NetworkServiceWorker] 未知消息类型: ${type}`);
    }
});

console.log('[NetworkServiceWorker] Service Worker 已加载');

