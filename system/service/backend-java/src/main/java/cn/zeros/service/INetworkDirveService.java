package cn.zeros.service;

import java.util.List;
import java.util.Map;

/**
 * 网络驱动服务接口
 * 支持 TCP 端口监听、注册/注销、数据收发
 *
 * @author zeros
 */
public interface INetworkDirveService {

    /**
     * 注册端口监听
     */
    Map<String, Object> registerPort(int port, String pid, String programName);

    /**
     * 取消端口监听
     */
    Map<String, Object> unregisterPort(int port);

    /**
     * 检查端口（接受新连接并读取数据）
     */
    Map<String, Object> checkPort(int port);

    /**
     * 获取端口状态
     */
    Map<String, Object> getPortStatus(int port);

    /**
     * 向指定 host:port 发送数据
     */
    Map<String, Object> sendData(String host, int port, String data);

    /**
     * 列出所有已注册端口
     */
    Map<String, Object> listPorts();
}
