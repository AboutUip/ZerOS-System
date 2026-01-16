package cn.zeros.service;

import java.io.IOException;
import java.util.Map;

/**
 * 文件系统驱动服务接口
 * 
 * @author zeros
 * @date 2026-01-16
 */
public interface IFSDirveService {
    
    // ============ 目录操作 ============
    
    /**
     * 创建目录
     * 
     * @param path 父目录路径
     * @param name 目录名称
     * @return 创建结果
     * @throws IOException IO异常
     */
    Map<String, Object> createDirectory(String path, String name) throws IOException;
    
    /**
     * 删除目录
     * 
     * @param path 目录路径
     * @return 删除结果
     * @throws IOException IO异常
     */
    Map<String, Object> deleteDirectory(String path) throws IOException;
    
    /**
     * 递归删除目录
     * 
     * @param path 目录路径
     * @return 删除结果
     * @throws IOException IO异常
     */
    Map<String, Object> deleteDirectoryRecursive(String path) throws IOException;
    
    /**
     * 列出目录内容
     * 
     * @param path 目录路径
     * @return 目录内容列表
     * @throws IOException IO异常
     */
    Map<String, Object> listDirectory(String path) throws IOException;
    
    /**
     * 重命名目录
     * 
     * @param path 父目录路径
     * @param oldName 旧目录名
     * @param newName 新目录名
     * @return 重命名结果
     * @throws IOException IO异常
     */
    Map<String, Object> renameDirectory(String path, String oldName, String newName) throws IOException;
    
    /**
     * 移动目录
     * 
     * @param sourcePath 源目录路径
     * @param targetPath 目标目录路径
     * @return 移动结果
     * @throws IOException IO异常
     */
    Map<String, Object> moveDirectory(String sourcePath, String targetPath) throws IOException;
    
    /**
     * 复制目录
     * 
     * @param sourcePath 源目录路径
     * @param targetPath 目标目录路径
     * @return 复制结果
     * @throws IOException IO异常
     */
    Map<String, Object> copyDirectory(String sourcePath, String targetPath) throws IOException;
    
    // ============ 文件操作 ============
    
    /**
     * 创建文件
     * 
     * @param path 目录路径
     * @param fileName 文件名
     * @param content 文件内容
     * @return 创建结果
     * @throws IOException IO异常
     */
    Map<String, Object> createFile(String path, String fileName, String content) throws IOException;
    
    /**
     * 读取文件
     * 
     * @param path 目录路径
     * @param fileName 文件名
     * @param asBase64 是否以Base64编码返回
     * @return 文件内容
     * @throws IOException IO异常
     */
    Map<String, Object> readFile(String path, String fileName, boolean asBase64) throws IOException;
    
    /**
     * 写入文件
     * 
     * @param path 目录路径
     * @param fileName 文件名
     * @param content 文件内容
     * @param writeMod 写入模式
     * @param isBase64 内容是否为Base64编码
     * @return 写入结果
     * @throws IOException IO异常
     */
    Map<String, Object> writeFile(String path, String fileName, String content, String writeMod, boolean isBase64) throws IOException;
    
    /**
     * 删除文件
     * 
     * @param path 目录路径
     * @param fileName 文件名
     * @return 删除结果
     * @throws IOException IO异常
     */
    Map<String, Object> deleteFile(String path, String fileName) throws IOException;
    
    /**
     * 重命名文件
     * 
     * @param path 目录路径
     * @param oldFileName 旧文件名
     * @param newFileName 新文件名
     * @return 重命名结果
     * @throws IOException IO异常
     */
    Map<String, Object> renameFile(String path, String oldFileName, String newFileName) throws IOException;
    
    /**
     * 移动文件
     * 
     * @param sourcePath 源目录路径
     * @param sourceFileName 源文件名
     * @param targetPath 目标目录路径
     * @param targetFileName 目标文件名（可为null，使用源文件名）
     * @return 移动结果
     * @throws IOException IO异常
     */
    Map<String, Object> moveFile(String sourcePath, String sourceFileName, String targetPath, String targetFileName) throws IOException;
    
    /**
     * 复制文件
     * 
     * @param sourcePath 源目录路径
     * @param sourceFileName 源文件名
     * @param targetPath 目标目录路径
     * @param targetFileName 目标文件名（可为null，使用源文件名）
     * @return 复制结果
     * @throws IOException IO异常
     */
    Map<String, Object> copyFile(String sourcePath, String sourceFileName, String targetPath, String targetFileName) throws IOException;
    
    /**
     * 获取文件信息
     * 
     * @param path 目录路径
     * @param fileName 文件名
     * @return 文件信息
     * @throws IOException IO异常
     */
    Map<String, Object> getFileInfo(String path, String fileName) throws IOException;
    
    // ============ 其他操作 ============
    
    /**
     * 检查路径是否存在
     * 
     * @param path 路径
     * @return 路径信息
     */
    Map<String, Object> checkPathExists(String path);
    
    /**
     * 获取磁盘信息
     * 
     * @param disk 磁盘标识（C或D）
     * @return 磁盘信息
     * @throws IOException IO异常
     */
    Map<String, Object> getDiskInfo(String disk) throws IOException;
}


