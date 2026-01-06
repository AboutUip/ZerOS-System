package cn.zeros.service;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * 压缩驱动服务接口
 *
 * @author zeros
 * @date 2024
 */
public interface ICompressionDirveService {

    // ============ ZIP 操作 ============

    Map<String, Object> compressZip(String targetPath,
                                    String sourcePath,
                                    List<String> sourcePaths,
                                    Map<String, Object> options) throws IOException;

    Map<String, Object> extractZip(String sourcePath,
                                   String targetPath,
                                   Map<String, Object> options) throws IOException;

    Map<String, Object> listZip(String sourcePath) throws IOException;

    // ============ RAR 操作 ============

    Map<String, Object> checkSupport();

    Map<String, Object> extractRar(String sourcePath,
                                   String targetPath,
                                   Map<String, Object> options) throws IOException;

    Map<String, Object> compressRar(String sourcePath,
                                    String targetPath,
                                    Map<String, Object> options) throws IOException;

    Map<String, Object> listRar(String sourcePath) throws IOException;
}


