package cn.zeros.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Announcement {
    private String title;       // 标题
    private int level;       // 等级（0-2）
    private String content;     // 内容（可以是HTML或纯文本）
    private Date updateTime;    // 更新时间
    private String author;      // 可选：作者
    private Boolean isActive;   // 是否激活
}