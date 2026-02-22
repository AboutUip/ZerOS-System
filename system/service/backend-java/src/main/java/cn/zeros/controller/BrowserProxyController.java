package cn.zeros.controller;

import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 浏览器网页代理服务控制器（对应 PHP 端的 BrowserProxy.php）
 *
 * <p>功能说明：
 * 代理外部网页请求，绕过 X-Frame-Options、CSP frame-ancestors 等 iframe 嵌入限制，
 * 使 ZerOS 内置浏览器能够在 iframe 中正常加载各类网站。
 *
 * <p>核心处理流程：
 * <ol>
 *   <li>接收前端传入的目标 URL（支持多层 URL 编码自动解码）</li>
 *   <li>校验 URL 协议（仅允许 http/https，拒绝 data:/javascript:）</li>
 *   <li>通过 WebClient 向目标站点发起请求</li>
 *   <li>如果响应是 HTML → 使用 Jsoup 解析并重写所有资源链接为代理 URL</li>
 *   <li>如果响应是 CSS → 使用正则重写 url() 和 @import 中的链接</li>
 *   <li>注入 &lt;base href="目标站origin/"&gt; 使 JS 中的根相对路径正确解析</li>
 *   <li>故意不设置 X-Frame-Options 头，允许在 iframe 中显示</li>
 * </ol>
 *
 * <p>URL 重写范围：href、src、action 属性 + style 中的 url() + CSS @import
 *
 * <p>此接口无需 JWT 认证（代理服务）
 *
 * <p>调用方：D/application/browser/（ZerOS 内置浏览器）
 *
 * @author zeros
 */
@Slf4j
@RestController
@RequestMapping("/BrowserProxy")
public class BrowserProxyController {

    private final WebClient webClient;

    /** 匹配 CSS 中的 url(...) */
    private static final Pattern CSS_URL_PATTERN = Pattern.compile(
            "url\\s*\\(\\s*(['\"]?)([^'\"\\)\\s]+)\\1\\s*\\)", Pattern.CASE_INSENSITIVE);

    /** 匹配 CSS 中的 @import url(...) 或 @import "..." */
    private static final Pattern CSS_IMPORT_PATTERN = Pattern.compile(
            "@import\\s+(?:url\\()?\\s*(['\"]?)([^'\"\\)\\s]+)\\1\\s*\\)?([^;]*);", Pattern.CASE_INSENSITIVE);

    public BrowserProxyController() {
        this.webClient = WebClient.builder()
                .defaultHeader(HttpHeaders.USER_AGENT,
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .defaultHeader(HttpHeaders.ACCEPT,
                        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
                .defaultHeader(HttpHeaders.ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9,en;q=0.8")
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(50 * 1024 * 1024))
                .build();
    }

    /**
     * 代理入口：支持 GET 和 POST
     *
     * @param url            目标网站 URL（必填，支持多层 URL 编码）
     * @param requestBody    POST 时的请求体（转发到目标站）
     * @param requestHeaders 原始请求头（用于判断 POST 方法）
     */
    @RequestMapping(method = {RequestMethod.GET, RequestMethod.POST})
    public Mono<ResponseEntity<byte[]>> proxy(
            @RequestParam String url,
            @RequestBody(required = false) byte[] requestBody,
            @RequestHeader HttpHeaders requestHeaders) {

        // 自动解码多层 URL 编码（最多 5 层）
        String targetUrl = decodeUrl(url);

        URI uri;
        try {
            uri = URI.create(targetUrl);
        } catch (Exception e) {
            return Mono.just(errorResponse(HttpStatus.BAD_REQUEST, "Invalid URL format"));
        }

        // 仅允许 http/https 协议
        String scheme = uri.getScheme();
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            return Mono.just(errorResponse(HttpStatus.BAD_REQUEST, "Only HTTP and HTTPS URLs are allowed"));
        }

        // 拒绝 data: 和 javascript: 伪协议
        if (targetUrl.contains("data:") || targetUrl.contains("javascript:")) {
            return Mono.just(errorResponse(HttpStatus.BAD_REQUEST, "Invalid URL: data and javascript schemes are not allowed"));
        }

        // 根据请求方法决定使用 GET 或 POST 转发
        WebClient.RequestHeadersSpec<?> spec;
        String method = requestHeaders.getFirst("X-Original-Method");
        if ("POST".equalsIgnoreCase(method) && requestBody != null && requestBody.length > 0) {
            spec = webClient.post()
                    .uri(uri)
                    .bodyValue(requestBody);
        } else {
            spec = webClient.get().uri(uri);
        }

        // 代理路径前缀（含 context-path），用于生成代理 URL
        String proxyBasePath = "/system/service/BrowserProxy";

        return spec
                .exchangeToMono(response -> {
                    HttpStatusCode statusCode = response.statusCode();
                    MediaType contentType = response.headers().contentType().orElse(MediaType.TEXT_HTML);

                    return response.bodyToMono(byte[].class)
                            .defaultIfEmpty(new byte[0])
                            .map(body -> {
                                String ct = contentType.toString();
                                boolean isHtml = ct.contains("text/html") || ct.contains("application/xhtml");
                                boolean isCss = ct.contains("text/css");

                                // HTML 内容：重写所有链接为代理 URL
                                if (isHtml && body.length > 0) {
                                    String html = new String(body, StandardCharsets.UTF_8);
                                    html = rewriteHtmlUrls(html, targetUrl, proxyBasePath);
                                    body = html.getBytes(StandardCharsets.UTF_8);
                                }
                                // CSS 内容：重写 url() 和 @import
                                else if (isCss && body.length > 0) {
                                    String css = new String(body, StandardCharsets.UTF_8);
                                    css = rewriteCssUrls(css, targetUrl, proxyBasePath);
                                    body = css.getBytes(StandardCharsets.UTF_8);
                                }

                                // 不设置 X-Frame-Options，允许 iframe 嵌入
                                HttpHeaders headers = new HttpHeaders();
                                headers.setContentType(contentType);
                                headers.setCacheControl("public, max-age=300");
                                headers.set("X-Content-Type-Options", "nosniff");

                                return ResponseEntity.status(statusCode)
                                        .headers(headers)
                                        .body(body);
                            });
                })
                .timeout(Duration.ofSeconds(30))
                .onErrorResume(e -> {
                    log.warn("代理请求失败: {}", e.getMessage());
                    return Mono.just(errorResponse(HttpStatus.BAD_GATEWAY,
                            "页面加载失败: " + e.getMessage()));
                });
    }

    /**
     * 重写 HTML 中的 URL，使所有资源链接通过代理加载
     * 使用 Jsoup 进行 DOM 解析，比正则更准确
     */
    private String rewriteHtmlUrls(String html, String pageUrl, String proxyBasePath) {
        try {
            URI pageUri = URI.create(pageUrl);
            String targetOrigin = pageUri.getScheme() + "://" + pageUri.getAuthority();

            Document doc = Jsoup.parse(html, pageUrl);

            // 注入 <base> 标签，使 JS 中的根相对路径 (/rp/xxx.js) 解析到目标站
            Element head = doc.head();
            if (head != null) {
                head.prepend("<base href=\"" + targetOrigin + "/\">");
            }

            // 重写 <a href>, <img src>, <script src>, <link href>, <form action> 等
            rewriteAttributes(doc, "a", "href", pageUrl, proxyBasePath);
            rewriteAttributes(doc, "[src]", "src", pageUrl, proxyBasePath);
            rewriteAttributes(doc, "form", "action", pageUrl, proxyBasePath);
            rewriteAttributes(doc, "link[href]", "href", pageUrl, proxyBasePath);

            // 重写 <style> 标签内的 url()
            Elements styles = doc.select("style");
            for (Element style : styles) {
                String css = style.html();
                String rewritten = rewriteCssUrls(css, pageUrl, proxyBasePath);
                if (!css.equals(rewritten)) {
                    style.html(rewritten);
                }
            }

            // 重写 style 属性中的 url()
            Elements inlineStyles = doc.select("[style]");
            for (Element el : inlineStyles) {
                String style = el.attr("style");
                String rewritten = rewriteCssUrlsInline(style, pageUrl, proxyBasePath);
                if (!style.equals(rewritten)) {
                    el.attr("style", rewritten);
                }
            }

            // 移除多余的 <base> 标签（保留第一个，即我们注入的那个）
            Elements existingBases = doc.select("base[href]");
            boolean first = true;
            for (Element base : existingBases) {
                if (first) {
                    first = false;
                    continue;
                }
                base.remove();
            }

            doc.outputSettings()
                    .charset(StandardCharsets.UTF_8)
                    .escapeMode(org.jsoup.nodes.Entities.EscapeMode.xhtml)
                    .prettyPrint(false);

            return doc.html();
        } catch (Exception e) {
            log.debug("HTML 重写失败，返回原始内容: {}", e.getMessage());
            return html;
        }
    }

    /**
     * 重写 DOM 元素的属性值：将相对/绝对 URL 替换为代理 URL
     */
    private void rewriteAttributes(Document doc, String selector, String attr, String pageUrl, String proxyBasePath) {
        Elements elements = doc.select(selector + "[" + attr + "]");
        for (Element el : elements) {
            String value = el.attr(attr);
            if (shouldSkipUrl(value)) continue;
            if (value.contains("BrowserProxy")) continue;  // 已经是代理 URL

            String absoluteUrl = resolveUrl(value, pageUrl);
            if (absoluteUrl != null && !absoluteUrl.contains("data:")) {
                el.attr(attr, proxyBasePath + "?url=" + encodeUrl(absoluteUrl));
            }
        }
    }

    /**
     * 重写 CSS 中的 url() 和 @import 链接为代理 URL
     */
    private String rewriteCssUrls(String css, String pageUrl, String proxyBasePath) {
        // 第一遍：重写 url(...)
        Matcher matcher = CSS_URL_PATTERN.matcher(css);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String innerUrl = matcher.group(2).trim();
            if (shouldSkipUrl(innerUrl)) {
                matcher.appendReplacement(sb, Matcher.quoteReplacement(matcher.group()));
                continue;
            }
            String absoluteUrl = resolveUrl(innerUrl, pageUrl);
            if (absoluteUrl != null && !absoluteUrl.contains("data:")) {
                matcher.appendReplacement(sb, "url(\"" + proxyBasePath + "?url=" + encodeUrl(absoluteUrl) + "\")");
            } else {
                matcher.appendReplacement(sb, Matcher.quoteReplacement(matcher.group()));
            }
        }
        matcher.appendTail(sb);

        // 第二遍：重写 @import
        Matcher importMatcher = CSS_IMPORT_PATTERN.matcher(sb.toString());
        StringBuffer sb2 = new StringBuffer();
        while (importMatcher.find()) {
            String importUrl = importMatcher.group(2).trim();
            if (shouldSkipUrl(importUrl)) {
                importMatcher.appendReplacement(sb2, Matcher.quoteReplacement(importMatcher.group()));
                continue;
            }
            String absoluteUrl = resolveUrl(importUrl, pageUrl);
            if (absoluteUrl != null) {
                String media = importMatcher.group(3) != null ? importMatcher.group(3).trim() : "";
                importMatcher.appendReplacement(sb2,
                        "@import url(\"" + proxyBasePath + "?url=" + encodeUrl(absoluteUrl) + "\")"
                                + (media.isEmpty() ? "" : " " + media) + ";");
            } else {
                importMatcher.appendReplacement(sb2, Matcher.quoteReplacement(importMatcher.group()));
            }
        }
        importMatcher.appendTail(sb2);

        return sb2.toString();
    }

    /**
     * 重写内联 style 属性中的 url()
     */
    private String rewriteCssUrlsInline(String style, String pageUrl, String proxyBasePath) {
        Matcher matcher = CSS_URL_PATTERN.matcher(style);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String innerUrl = matcher.group(2).trim();
            if (shouldSkipUrl(innerUrl)) {
                matcher.appendReplacement(sb, Matcher.quoteReplacement(matcher.group()));
                continue;
            }
            String absoluteUrl = resolveUrl(innerUrl, pageUrl);
            if (absoluteUrl != null && !absoluteUrl.contains("data:")) {
                matcher.appendReplacement(sb, "url(\"" + proxyBasePath + "?url=" + encodeUrl(absoluteUrl) + "\")");
            } else {
                matcher.appendReplacement(sb, Matcher.quoteReplacement(matcher.group()));
            }
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    /**
     * 判断是否应该跳过某个 URL（内联协议、锚点等不需要代理）
     */
    private boolean shouldSkipUrl(String url) {
        if (url == null || url.isBlank()) return true;
        String lower = url.trim().toLowerCase();
        return lower.startsWith("data:") || lower.startsWith("javascript:")
                || lower.startsWith("mailto:") || lower.startsWith("tel:")
                || lower.startsWith("blob:") || lower.startsWith("#")
                || lower.startsWith("about:");
    }

    /**
     * 将相对 URL 解析为绝对 URL
     */
    private String resolveUrl(String url, String baseUrl) {
        if (url == null || url.isBlank()) return null;
        url = url.trim();
        if (shouldSkipUrl(url)) return null;

        // 已经是绝对 URL
        if (url.matches("^https?://.*")) return url;

        // 协议相对 URL（//example.com/path）
        if (url.startsWith("//")) {
            try {
                URI base = URI.create(baseUrl);
                return base.getScheme() + ":" + url;
            } catch (Exception e) {
                return "https:" + url;
            }
        }

        // 其他相对路径：使用 URI.resolve() 解析
        try {
            URI base = URI.create(baseUrl);
            return base.resolve(url).toString();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 自动解码多层 URL 编码（最多 5 层，如 %253A → %3A → :）
     */
    private String decodeUrl(String url) {
        String decoded = url;
        for (int i = 0; i < 5; i++) {
            try {
                String next = URLDecoder.decode(decoded, StandardCharsets.UTF_8);
                if (next.equals(decoded)) break;
                decoded = next;
            } catch (Exception e) {
                break;
            }
        }
        return decoded;
    }

    private String encodeUrl(String url) {
        return URLEncoder.encode(url, StandardCharsets.UTF_8);
    }

    /**
     * 生成错误响应的 HTML 页面
     */
    private ResponseEntity<byte[]> errorResponse(HttpStatus status, String message) {
        String html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>加载失败</title></head><body>"
                + "<h2>页面加载失败</h2><p>" + message + "</p></body></html>";
        return ResponseEntity.status(status)
                .contentType(MediaType.TEXT_HTML)
                .body(html.getBytes(StandardCharsets.UTF_8));
    }
}
