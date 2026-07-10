# 小报童归档-xiaobot-archive

登录小报童（微信扫码），批量导出付费专栏全部文章为 Markdown 文件。

## 依赖

| 工具 | 安装 | GitHub |
|------|------|--------|
| Python ≥ 3.10 | [官网下载](https://www.python.org/) | — |
| Playwright | `pip install playwright && playwright install chromium` | [microsoft/playwright](https://github.com/microsoft/playwright) |
| Chrome | [官网下载](https://www.google.com/chrome/) | — |

**Playwright** 是微软开源的浏览器自动化框架。本 skill 用它拦截小报童的 API 响应（绕过 sign 签名鉴权），获取文章列表和 HTML 全文，再转为 Markdown。

## 安装

```bash
# 1. 安装 Playwright
pip install playwright
playwright install chromium

# 2. 设置 Chrome 路径
# Windows
set CHROME_PATH=<LOCAL_PATH> Files\Google\Chrome\Application\chrome.exe
# Mac
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## 使用

在 Claude Code 中输入 `/小报童归档-xiaobot-archive`，提供专栏 URL 即可。

## 工作原理

1. Playwright 打开 Chrome（headed），自动点击登录按钮
2. 用户微信扫码完成登录，保存 localStorage 到 state 文件
3. Playwright headless 复用登录态，拦截 `/paper/{slug}/post` API 响应
4. 滚动触发全部分页，获取文章列表（含 HTML 全文）
5. HTML → Markdown 转换后逐篇保存
