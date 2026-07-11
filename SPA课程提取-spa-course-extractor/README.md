# SPA 课程文档提取器

从需要登录的 SPA 课程平台（如一堂 yitang.top）提取完整课程文档（文本+图片）到本地 Markdown。

## 功能

- **单课提取**：给一个课程 URL，自动提取全部文档块和图片
- **批量提取**：从选修课列表自动遍历，跳过已下载课程，支持中断恢复
- **智能解析**：DFS 遍历 Vue 组件树，支持 heading/text/bullet/quote/image/table 等块类型
- **图片下载**：自动下载所有配图到本地，生成带 frontmatter 的 Markdown

## 文件列表

```
SPA课程提取-spa-course-extractor/
├── SKILL.md                  # Claude Code skill 定义（完整工作流）
├── README.md                 # 本文件
├── CONFIG_TEMPLATE.md        # 配置占位符说明
├── scripts/
│   ├── extract.mjs           # 单课提取脚本
│   ├── collect-links.mjs     # 批量链接收集脚本
│   └── batch-extract.mjs     # 批量提取脚本
└── references/
    └── block-types.md        # 块类型映射参考
```

## 依赖工具

| 工具 | 安装 | GitHub |
|------|------|--------|
| [Node.js](https://nodejs.org/) | 官网下载 >= 18 | - |
| [OpenCLI](https://github.com/jackwener/OpenCLI) | `npm i -g @jackwener/opencli` | [jackwener/OpenCLI](https://github.com/jackwener/OpenCLI) |
| [Tabbit Browser](https://www.tabbit.com/) | 官网下载安装 | - |

## 安装

在 Claude Code 中说：

```
帮我安装这个 skill：https://github.com/xiangbabalapa/claude-skills/tree/main/SPA课程提取-spa-course-extractor
```

或手动复制到 `~/.claude/skills/SPA课程提取-spa-course-extractor/` 下。

## 配置

设置环境变量 Tabbit Browser profile name：

```bash
export OPENCLI_PROFILE=your-profile-name
```

> 在 Tabbit Browser 的设置中可以找到 profile name。

## 使用

### 单课提取

对 Claude Code 说：

```
帮我提取这个课程：https://yitang.top/fs-doc/xxx
输出到 ~/Documents/Obsidian Vault/一堂课程/
```

### 批量提取

```
把一堂选修课都下载下来，输出到 ~/Documents/Obsidian Vault/一堂课程/
```

## 工作原理

1. **连接浏览器**：通过 OpenCLI 连接 Tabbit Browser（反指纹浏览器，保持登录态）
2. **提取 Vue 数据**：从 SPA 页面的 `dataJson.childrens` 提取全部文档块（DFS 遍历）
3. **解析块类型**：heading -> `## 标题`，text -> 段落，image -> `![](url)`，table -> 递归 children
4. **下载图片**：从 CDN 下载所有配图到 `images/` 目录
5. **生成 Markdown**：带 frontmatter（title/source/extracted/images），图片引用指向本地路径

## 已知限制

- 仅支持基于 Vue + 虚拟滚动的 SPA 课程平台
- 需要登录态（在 Tabbit Browser 中手动登录）
- 纯视频/图文材料课程无文档链接，无法提取
- daemon 重启后 SPA 数据丢失，需 `location.reload()` 刷新