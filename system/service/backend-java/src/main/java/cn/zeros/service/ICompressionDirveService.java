package cn.zeros.service;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * 压缩驱动服务接口
 * 提供 ZIP、RAR、7Z、TAR、TAR.GZ 及加密 ZIP 的压缩与解压能力
 *
 * @author zeros
 * @date 2026-01-16
 */
public interface ICompressionDirveService {

    // ============ ZIP 操作 ============

    /**
     * 压缩文件/目录为 ZIP 格式
     *
     * @param targetPath  目标 ZIP 文件虚拟路径
     * @param sourcePath  单个源路径（与 sourcePaths 二选一）
     * @param sourcePaths 多个源路径（与 sourcePath 二选一）
     * @param options     可选参数（level 压缩级别等）
     * @return 压缩结果（含目标路径、文件大小等）
     * @throws IOException 压缩失败时抛出
     */
    Map<String, Object> compressZip(String targetPath,
                                    String sourcePath,
                                    List<String> sourcePaths,
                                    Map<String, Object> options) throws IOException;

    /**
     * 解压 ZIP 文件
     *
     * @param sourcePath 源 ZIP 文件虚拟路径
     * @param targetPath 解压目标目录虚拟路径
     * @param options    可选参数（overwrite 是否覆盖等）
     * @return 解压结果（含解压文件数量列表）
     * @throws IOException 解压失败时抛出
     */
    Map<String, Object> extractZip(String sourcePath,
                                   String targetPath,
                                   Map<String, Object> options) throws IOException;

    /**
     * 列出 ZIP 文件内容
     *
     * @param sourcePath 源 ZIP 文件虚拟路径
     * @return 文件列表（含每项的名称、大小、修改时间等）
     * @throws IOException 读取失败时抛出
     */
    Map<String, Object> listZip(String sourcePath) throws IOException;

    // ============ RAR 操作 ============

    /**
     * 检查压缩格式支持情况
     *
     * @return 各压缩格式的支持状态
     */
    Map<String, Object> checkSupport();

    /**
     * 解压 RAR 文件
     *
     * @param sourcePath 源 RAR 文件虚拟路径
     * @param targetPath 解压目标目录虚拟路径
     * @param options    可选参数
     * @return 解压结果
     * @throws IOException 解压失败时抛出
     */
    Map<String, Object> extractRar(String sourcePath,
                                   String targetPath,
                                   Map<String, Object> options) throws IOException;

    /**
     * 压缩文件/目录为 RAR 格式（需要系统安装 rar 命令行工具）
     *
     * @param sourcePath 源路径虚拟路径
     * @param targetPath 目标 RAR 文件虚拟路径
     * @param options    可选参数
     * @return 压缩结果
     * @throws IOException 压缩失败时抛出
     */
    Map<String, Object> compressRar(String sourcePath,
                                    String targetPath,
                                    Map<String, Object> options) throws IOException;

    /**
     * 列出 RAR 文件内容
     *
     * @param sourcePath 源 RAR 文件虚拟路径
     * @return 文件列表
     * @throws IOException 读取失败时抛出
     */
    Map<String, Object> listRar(String sourcePath) throws IOException;

    // ============ 7Z 操作 ============

    /**
     * 压缩文件/目录为 7Z 格式
     *
     * @param targetPath  目标 7Z 文件虚拟路径
     * @param sourcePath  单个源路径（与 sourcePaths 二选一）
     * @param sourcePaths 多个源路径（与 sourcePath 二选一）
     * @param options     可选参数（level 压缩级别、solid 是否固实压缩等）
     * @return 压缩结果
     * @throws IOException 压缩失败时抛出
     */
    Map<String, Object> compress7z(String targetPath,
                                   String sourcePath,
                                   List<String> sourcePaths,
                                   Map<String, Object> options) throws IOException;

    /**
     * 解压 7Z 文件
     *
     * @param sourcePath 源 7Z 文件虚拟路径
     * @param targetPath 解压目标目录虚拟路径
     * @param options    可选参数
     * @return 解压结果
     * @throws IOException 解压失败时抛出
     */
    Map<String, Object> extract7z(String sourcePath,
                                  String targetPath,
                                  Map<String, Object> options) throws IOException;

    /**
     * 列出 7Z 文件内容
     *
     * @param sourcePath 源 7Z 文件虚拟路径
     * @return 文件列表
     * @throws IOException 读取失败时抛出
     */
    Map<String, Object> list7z(String sourcePath) throws IOException;

    // ============ TAR 操作 ============

    /**
     * 打包文件/目录为 TAR 格式（不压缩）
     *
     * @param targetPath  目标 TAR 文件虚拟路径
     * @param sourcePath  单个源路径（与 sourcePaths 二选一）
     * @param sourcePaths 多个源路径（与 sourcePath 二选一）
     * @param options     可选参数
     * @return 打包结果
     * @throws IOException 打包失败时抛出
     */
    Map<String, Object> compressTar(String targetPath,
                                    String sourcePath,
                                    List<String> sourcePaths,
                                    Map<String, Object> options) throws IOException;

    /**
     * 解包 TAR 文件
     *
     * @param sourcePath 源 TAR 文件虚拟路径
     * @param targetPath 解包目标目录虚拟路径
     * @param options    可选参数
     * @return 解包结果
     * @throws IOException 解包失败时抛出
     */
    Map<String, Object> extractTar(String sourcePath,
                                   String targetPath,
                                   Map<String, Object> options) throws IOException;

    /**
     * 列出 TAR 文件内容
     *
     * @param sourcePath 源 TAR 文件虚拟路径
     * @return 文件列表
     * @throws IOException 读取失败时抛出
     */
    Map<String, Object> listTar(String sourcePath) throws IOException;

    // ============ TAR.GZ 操作 ============

    /**
     * 压缩文件/目录为 TAR.GZ 格式（GZip 压缩）
     *
     * @param targetPath  目标 TAR.GZ 文件虚拟路径
     * @param sourcePath  单个源路径（与 sourcePaths 二选一）
     * @param sourcePaths 多个源路径（与 sourcePath 二选一）
     * @param options     可选参数
     * @return 压缩结果
     * @throws IOException 压缩失败时抛出
     */
    Map<String, Object> compressTarGz(String targetPath,
                                      String sourcePath,
                                      List<String> sourcePaths,
                                      Map<String, Object> options) throws IOException;

    /**
     * 解压 TAR.GZ 文件
     *
     * @param sourcePath 源 TAR.GZ 文件虚拟路径
     * @param targetPath 解压目标目录虚拟路径
     * @param options    可选参数
     * @return 解压结果
     * @throws IOException 解压失败时抛出
     */
    Map<String, Object> extractTarGz(String sourcePath,
                                     String targetPath,
                                     Map<String, Object> options) throws IOException;

    /**
     * 列出 TAR.GZ 文件内容
     *
     * @param sourcePath 源 TAR.GZ 文件虚拟路径
     * @return 文件列表
     * @throws IOException 读取失败时抛出
     */
    Map<String, Object> listTarGz(String sourcePath) throws IOException;

    // ============ 加密 ZIP 操作 ============

    /**
     * 压缩文件/目录为带密码的 ZIP 格式
     *
     * @param targetPath  目标加密 ZIP 文件虚拟路径
     * @param sourcePath  单个源路径（与 sourcePaths 二选一）
     * @param sourcePaths 多个源路径（与 sourcePath 二选一）
     * @param options     可选参数（password 密码为必填项）
     * @return 压缩结果
     * @throws IOException 压缩失败时抛出
     */
    Map<String, Object> compressZipEncrypted(String targetPath,
                                             String sourcePath,
                                             List<String> sourcePaths,
                                             Map<String, Object> options) throws IOException;

    /**
     * 解压带密码的 ZIP 文件
     *
     * @param sourcePath 源加密 ZIP 文件虚拟路径
     * @param targetPath 解压目标目录虚拟路径
     * @param options    可选参数（password 密码为必填项）
     * @return 解压结果
     * @throws IOException 解压失败或密码错误时抛出
     */
    Map<String, Object> extractZipEncrypted(String sourcePath,
                                            String targetPath,
                                            Map<String, Object> options) throws IOException;
}


