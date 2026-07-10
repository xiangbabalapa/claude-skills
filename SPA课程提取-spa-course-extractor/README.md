# SPA课程提取-spa-course-extractor

从需要登录的 SPA 课程平台（如一堂 yitang.top）提取完整课程文档（文本+图片）到本地 Markdown。

## 依赖

| 工具 | 安装 | GitHub |
|------|------|--------|
| Node.js ≥ 18 | [官网下载](https://nodejs.org/) | — |
| OpenCLI | `npm i -g @jackwener/opencli` | [jackwener/OpenCLI](https://github.com/jackwener/OpenCLI) |
| Tabbit Browser | [官网下载](https://www.tabbit.com/) | — |

**OpenCLI** 是一个浏览器自动化工具，通过 Chrome 扩展桥接真实浏览器，复用登录态。本 skill 用它连接 Tabbit Browser 执行页面内 JS 提取 Vue 组件数据。

**Tabbit Browser** 是反指纹浏览器，支持 OpenCLI 扩展。在其中登录课程平台后，OpenCLI 可以直接操作已登录的页面。

## 安装

```bash
# 1. 安装 OpenCLI
npm i -g @jackwener/opencli

# 2. 安装并启动 Tabbit Browser，安装 OpenCLI 扩展

# 3. 确认连接
opencli daemon status
```

## 使用

在 Claude Code 中输入 `/SPA课程提取-spa-course-extractor`，提供课程 URL 即可。

## 工作原理

1. OpenCLI 连接 Tabbit Browser，打开课程页面
2. 从 Vue 组件 `dataJson.childrens` DFS 遍历提取全部文档块
3. 解析文本（heading/text/bullet/quote 等）和图片（cdnUrl）
4. 下载所有配图到本地
5. 生成带 frontmatter 的 Markdown，图片引用改为本地相对路径
6. 自动验证所有图片引用完整性
