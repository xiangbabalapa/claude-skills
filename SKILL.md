---
name: 小报童归档-xiaobot-archive
description: |
  登录小报童（微信扫码），批量导出付费专栏全部文章为 Markdown 文件，保存到 Obsidian Vault。
  核心技术：Playwright 拦截 API 响应（绕过 sign 签名鉴权）+ HTML→Markdown 转换。
  TRIGGER: 用户说"存小报童"、"小报童文章下载"、"xiaobot 导出"、"归档专栏"、"保存小报童"、发来 xiaobot.net 链接要求存文章。
  NOT FOR: 单篇文章读取（用链接读取-link-reader）、小报童付费购买、非小报童站点的文章抓取。
---

## 执行前必读检查清单

- [ ] **Chrome 路径**：从 `user_software_location.md` 读取 Chrome 路径，设置 `$env:CHROME_PATH`
- [ ] **Playwright 已安装**：Python 环境中已有 playwright（`pip install playwright && playwright install chromium`）
- [ ] **提取 paper_slug**：从小报童 URL 中提取（`/p/{slug}` 中的 `{slug}`）
- [ ] **运行 login.py**：headed 浏览器打开 → 用户扫码 → 保存 state JSON
- [ ] **运行 extract.py**：headless → API 拦截获取全部文章 → HTML→MD
- [ ] **移动到 Vault**：`.md` 文件复制到 Obsidian Vault 对应位置
- [ ] **清理临时文件**：state JSON 和临时输出目录

## Before You Start

**必需输入**：小报童专栏 URL（格式 `https://xiaobot.net/p/{slug}`）
**可选输入**：Obsidian Vault 目标路径
**前置条件**：用户已订阅该专栏（付费内容需订阅才能导出）

提取 paper_slug：URL 中 `/p/` 后面、`?` 之前的部分。

**依赖安装**：

| 工具 | 安装 | GitHub |
|------|------|--------|
| [Python](https://www.python.org/) ≥ 3.10 | 官网下载 | — |
| [Playwright](https://github.com/microsoft/playwright) | `pip install playwright && playwright install chromium` | [microsoft/playwright](https://github.com/microsoft/playwright) |
| [Chrome](https://www.google.com/chrome/) | 官网下载 | — |

环境变量设置：
```powershell
$env:CHROME_PATH = "你的 Chrome 可执行文件路径"
```

## Workflow

### 1. 登录（headed 浏览器，用户扫码）

```powershell
$env:PYTHONUTF8=1; & python "SKILL_DIR/scripts/login.py" "<state_path>"
```

- `<state_path>`: state JSON 保存路径
- 脚本打开 Chrome → 自动点击登录 → 用户微信扫码 → 保存 localStorage
- 输出 `LOGIN_OK|<path>` 表示成功；`LOGIN_TIMEOUT` 表示超时需重试

### 2. 批量提取（headless，API 拦截）

```powershell
$env:PYTHONUTF8=1; & python "SKILL_DIR/scripts/extract.py" "<state_path>" "<paper_slug>" "<output_dir>"
```

- 自动拦截 API 响应获取文章列表（含 HTML 全文），无需逆向签名
- 滚动触发全部分页，HTML→Markdown 转换后逐篇保存
- 输出 `EXTRACT_OK|成功数|总数|目录`；`EXTRACT_FAIL` 表示登录态失效

### 3. 移动到 Obsidian Vault

```powershell
$dest = "你的 Obsidian Vault 路径\专栏名"
New-Item -ItemType Directory -Path $dest -Force
Copy-Item "<output_dir>\*.md" -Destination $dest -Force
```

### 4. 清理临时文件

```powershell
Remove-Item "<state_path>" -Force
Remove-Item "<output_dir>" -Recurse -Force
```

## 技术细节（排查用）

### 为什么用 API 拦截而非直接调 API

小报童 API 需要 `sign`（MD5 签名）header，每次请求值不同，无法逆向。
解法：让浏览器自己发请求（JS 自动算 sign），Playwright 拦截响应拿数据。

### 登录态存在哪

小报童用微信 OAuth 登录，token 存在 `localStorage.vuex`（非 cookie）。
`storage_state()` 会保存 localStorage，用于 headless 复用。

### API 端点

- `GET /paper/{slug}/post?limit=20&offset={n}` — 返回文章列表，content 字段含 HTML 全文
- 每次 20 篇，滚动触发前端自动请求下一页

## Quality Gates

- 登录后 state 文件非空且含 `origins` 字段
- 提取文章数通常 ≥ 50（专栏一般几十到几百篇）
- 每篇 `.md` > 1KB（过小说明转换失败）
- 抽查 3 篇：标题正确、有结构（标题/段落/图片链接）、无 HTML 残留

## Exit Criteria

- 全部 `.md` 文件复制到 Obsidian Vault
- 文件数与 `_article_list.json` 记录一致
- 向用户报告：总篇数、总大小、存放路径
- 临时文件已清理
