package cn.zeros.constant;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * 文件相关常量
 * 
 * @author zeros
 * @date 2026-01-16
 */
public final class FileConstants {
    
    private FileConstants() {
        throw new UnsupportedOperationException("工具类不允许实例化");
    }
    
    /**
     * 支持的图片扩展名
     */
    public static final List<String> IMAGE_EXTENSIONS = Arrays.asList(
            "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico"
    );

    /**
     * 需要按二进制内容处理的视频扩展名
     */
    public static final List<String> VIDEO_EXTENSIONS = Arrays.asList(
            "mp4", "webm", "ogg", "mov", "avi", "mkv"
    );
    
    /**
     * 音频文件Content-Type映射
     */
    public static final Map<String, String> AUDIO_CONTENT_TYPES = Map.of(
            "wav", "audio/wav",
            "mp3", "audio/mpeg",
            "ogg", "audio/ogg",
            "m4a", "audio/mp4",
            "aac", "audio/aac",
            "flac", "audio/flac",
            "webm", "audio/webm",
            "opus", "audio/opus"
    );

    /**
     * 视频文件 Content-Type 映射
     */
    public static final Map<String, String> VIDEO_CONTENT_TYPES = Map.of(
            "mp4", "video/mp4",
            "webm", "video/webm",
            "ogg", "video/ogg",
            "m3u8", "application/vnd.apple.mpegurl"
    );
    
    /**
     * 图片文件Content-Type映射
     */
    public static final Map<String, String> IMAGE_CONTENT_TYPES = Map.of(
            "jpg", "image/jpeg",
            "jpeg", "image/jpeg",
            "png", "image/png",
            "gif", "image/gif",
            "webp", "image/webp",
            "svg", "image/svg+xml"
    );
    
    /**
     * 默认音频Content-Type
     */
    public static final String DEFAULT_AUDIO_CONTENT_TYPE = "audio/wav";

    /**
     * 默认视频 Content-Type
     */
    public static final String DEFAULT_VIDEO_CONTENT_TYPE = "video/mp4";
    
    /**
     * 默认图片Content-Type
     */
    public static final String DEFAULT_IMAGE_CONTENT_TYPE = "image/jpeg";
    
    /**
     * 图片文件魔数签名（用于检测文件类型）
     */
    public static final class ImageMagicNumbers {
        private ImageMagicNumbers() {
            throw new UnsupportedOperationException("工具类不允许实例化");
        }

        public static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
        public static final byte[] PNG = {(byte) 0x89, 0x50, 0x4E, 0x47};
        public static final byte[] GIF = {0x47, 0x49, 0x46, 0x38};
        public static final byte[] WEBP_PREFIX = {0x52, 0x49, 0x46, 0x46};
        public static final byte[] WEBP_SUFFIX = {0x57, 0x45, 0x42, 0x50};
    }
}

