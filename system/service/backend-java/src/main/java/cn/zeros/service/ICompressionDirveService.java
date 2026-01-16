package cn.zeros.service;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * 压缩驱动服务接口
 *
 * @author zeros
 * @date 2026-01-16
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

    // ============ 7Z 操作 ============

    Map<String, Object> compress7z(String targetPath,
                                   String sourcePath,
                                   List<String> sourcePaths,
                                   Map<String, Object> options) throws IOException;

    Map<String, Object> extract7z(String sourcePath,
                                  String targetPath,
                                  Map<String, Object> options) throws IOException;

    Map<String, Object> list7z(String sourcePath) throws IOException;

    // ============ TAR 操作 ============

    Map<String, Object> compressTar(String targetPath,
                                    String sourcePath,
                                    List<String> sourcePaths,
                                    Map<String, Object> options) throws IOException;

    Map<String, Object> extractTar(String sourcePath,
                                   String targetPath,
                                   Map<String, Object> options) throws IOException;

    Map<String, Object> listTar(String sourcePath) throws IOException;

    // ============ TAR.GZ 操作 ============

    Map<String, Object> compressTarGz(String targetPath,
                                      String sourcePath,
                                      List<String> sourcePaths,
                                      Map<String, Object> options) throws IOException;

    Map<String, Object> extractTarGz(String sourcePath,
                                     String targetPath,
                                     Map<String, Object> options) throws IOException;

    Map<String, Object> listTarGz(String sourcePath) throws IOException;

    // ============ 加密 ZIP 操作 ============

    Map<String, Object> compressZipEncrypted(String targetPath,
                                             String sourcePath,
                                             List<String> sourcePaths,
                                             Map<String, Object> options) throws IOException;

    Map<String, Object> extractZipEncrypted(String sourcePath,
                                            String targetPath,
                                            Map<String, Object> options) throws IOException;
}


