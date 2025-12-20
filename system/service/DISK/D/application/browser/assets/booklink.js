// 浏览器书签数据
// 格式：{ name: "书签名称", url: "网址" }

const BOOKMARKS = [
    { name: "ParseMusic", url: "http://210.16.176.154/" },
    { name: "岑鬼鬼音乐", url: "https://kw-api.cenguigui.cn/music/#/" },
    { name: "GitHub", url: "https://github.com" },
];

// 导出到全局（如果POOL可用则存储到POOL）
if (typeof POOL !== 'undefined' && typeof POOL.__ADD__ === 'function') {
    try {
        if (!POOL.__HAS__("KERNEL_GLOBAL_POOL")) {
            POOL.__INIT__("KERNEL_GLOBAL_POOL");
        }
        POOL.__ADD__("KERNEL_GLOBAL_POOL", "BROWSER_BOOKMARKS", BOOKMARKS);
    } catch (e) {
        if (typeof window !== 'undefined') {
            window.BROWSER_BOOKMARKS = BOOKMARKS;
        }
    }
} else {
    if (typeof window !== 'undefined') {
        window.BROWSER_BOOKMARKS = BOOKMARKS;
    }
}

