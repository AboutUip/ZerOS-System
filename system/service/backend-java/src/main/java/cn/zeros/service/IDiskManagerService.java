package cn.zeros.service;

import java.io.IOException;
import java.util.Map;

/**
 * 磁盘分区管理服务接口
 *
 * @author zeros
 * @date 2026-01-16
 */
public interface IDiskManagerService {

    /**
     * 检查分区是否存在
     *
     * @param partition 分区名称（如 "C:"）
     * @return 分区信息
     */
    Map<String, Object> checkPartition(String partition);

    /**
     * 创建分区
     *
     * @param partition 分区名称（如 "C:"）
     * @return 创建结果
     * @throws IOException 创建失败时抛出
     */
    Map<String, Object> createPartition(String partition) throws IOException;

    /**
     * 删除分区
     *
     * @param partition 分区名称（如 "C:"）
     * @param force     是否强制删除（即使分区不为空）
     * @return 删除结果
     * @throws IOException 删除失败时抛出
     */
    Map<String, Object> deletePartition(String partition, boolean force) throws IOException;

    /**
     * 合并分区
     *
     * @param source       源分区名称
     * @param target       目标分区名称
     * @param deleteSource 合并后是否删除源分区
     * @return 合并结果
     * @throws IOException 合并失败时抛出
     */
    Map<String, Object> mergePartitions(String source, String target, boolean deleteSource) throws IOException;

    /**
     * 列出所有分区
     *
     * @return 分区列表
     */
    Map<String, Object> listPartitions();

    /**
     * 读取 DiskData.json
     *
     * @return DiskData 内容
     * @throws IOException 读取失败时抛出
     */
    Map<String, Object> readDiskData() throws IOException;

    /**
     * 同步磁盘数据到 DiskData.json
     *
     * @return 同步结果
     * @throws IOException 同步失败时抛出
     */
    Map<String, Object> syncDiskData() throws IOException;

    /**
     * 格式化分区（清空分区内容）
     *
     * @param partition 分区名称（如 "C:"）
     * @param quick     是否快速格式化（仅删除文件，保留目录结构）
     * @return 格式化结果
     * @throws IOException 格式化失败时抛出
     */
    Map<String, Object> formatPartition(String partition, boolean quick) throws IOException;

    /**
     * 调整分区大小
     *
     * @param partition 分区名称（如 "C:"）
     * @param newSize   新的分区大小（字节）
     * @return 调整结果
     * @throws IOException 调整失败时抛出
     */
    Map<String, Object> resizePartition(String partition, long newSize) throws IOException;

    /**
     * 磁盘健康检查
     *
     * @return 所有分区的健康状态信息
     */
    Map<String, Object> checkHealth();

    /**
     * 克隆分区
     *
     * @param source 源分区名称
     * @param target 目标分区名称
     * @return 克隆结果
     * @throws IOException 克隆失败时抛出
     */
    Map<String, Object> clonePartition(String source, String target) throws IOException;
}
