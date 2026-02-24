package cn.zeros.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * 公告实体类
 *
 * @author zeros
 * @date 2026-01-16
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Announcement {

    /**
     * 公告标题
     */
    private String title;

    /**
     * 公告等级（0-2，数字越大优先级越高）
     */
    private int level;

    /**
     * 公告内容（支持 HTML 或纯文本）
     */
    private String content;

    /**
     * 公告最后更新时间
     */
    private Date updateTime;

    /**
     * 公告作者（可选）
     */
    private String author;

    /**
     * 是否激活，{@code true} 表示正在展示
     */
    private Boolean isActive;
}