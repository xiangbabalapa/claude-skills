---
name: SPA课程提取-spa-course-extractor
description: |
  从需要登录的 SPA 课程平台（如一堂 yitang.top）提取完整课程文档（文本+图片）到本地 Markdown。
  TRIGGER: 用户发来课程链接要求下载/保存/离线阅读/复刻到本地；要求提取课程内容；要求把课程文档存到 Obsidian。
  TRIGGER: 用户要求批量下载一堂课程（如「把选修课都下载下来」「看看还有哪些课程没拷贝」）。
  覆盖：yitang.top（一堂）等基于 Vue + 虚拟滚动的 SPA 课程平台。
  不覆盖：纯静态网页（用链接读取 skill）；飞书文档（用飞书文档 skill）；视频课程（只提取文档部分）。
---

# SPA 课程文档提取器

## 执行前必读检查清单

- [ ] **直接运行现有脚本，不要重写**：`scripts/extract.mjs`、`scripts/collect-links.mjs`、`scripts/batch-extract.mjs` 已验证可用
- [ ] **连接浏览器**：`opencli daemon status` 确认 connected
- [ ] **授权码**：从 `reference_credentials.md` 的「Tabbit Browser」section 读取 profile name
- [ ] **daemon 健康**：如果 `opencli eval` 无响应，执行 `opencli daemon restart`，然后对已打开的 SPA 页面 `location.reload()`
- [ ] **输出目录确认**：批量提取前必须问用户确认 Obsidian Vault 目标路径
- [ ] **登录态**：目标页面需要登录时，先在 Tabbit 里完成登录
- [ ] **确认所有步骤完成**

## Before You Start

**必需输入**：
- 目标课程页面 URL
- Obsidian Vault 输出目录路径

**可选输入**：
- 自定义文件名（默认用课程标题）

**依赖安装**：

| 工具 | 安装 | 说明 |
|------|------|------|
| [Node.js](https://nodejs.org/) | 官网下载 ≥ 18 | 运行提取脚本 |
| [OpenCLI](https://github.com/jackwener/OpenCLI) | `npm i -g @jackwener/opencli` | 浏览器自动化，连接 Tabbit |
| [Tabbit Browser](https://www.tabbit.com/) | 官网下载安装 | 反指纹浏览器，提供登录态 |

连接步骤：
1. 安装 Tabbit Browser 并启动
2. 在 Tabbit 中安装 OpenCLI 扩展
3. 运行 `opencli daemon status` 确认 connected
4. 授权码（profile name）存到 `reference_credentials.md`

## Workflow

### 1. 连接浏览器并登录

```
# 检查 daemon 状态
opencli daemon status

# 打开目标页面
opencli browser <profile> open "<course-url>"
```

- 如果页面跳转到登录页 → 截图展示二维码 → 等用户扫码
- 登录后重新导航到课程页面
- Profile name 从 `reference_credentials.md` 读取

### 2. 运行提取脚本

⚠️ 核心规则：脚本已存在且已验证，直接运行，不要重写。

```bash
node <CLAUDE_PATH> "<output-dir>"
```

脚本自动完成：
1. 从 Vue 组件 `dataJson.childrens` 提取全部文档块（DFS 遍历）
2. 解析文本（heading/text/bullet/quote 等）和图片（cdnUrl）
3. 下载所有图片到 `images/` 子目录
4. 生成带 frontmatter 的 Markdown
5. 验证所有图片引用存在

### 3. 复制到 Obsidian Vault

多课程共存时，所有课程 md 和图片放在同一目录，图片用课程名前缀区分：

```
一堂课程/
├── 课程A.md
├── 课程B.md
└── images/
    ├── 课程A前缀-img-000.png
    └── 课程B前缀-img-000.png
```

```powershell
# 将输出目录的 md 和 images 复制到 Vault 对应目录
Copy-Item "<output-dir>/*.md" "<vault-target-dir>/"
Copy-Item "<output-dir>/images/*" "<vault-target-dir>/images/"
```

### 4. 验证

- 脚本已自动验证图片引用完整性
- 提示用户在 Obsidian 中刷新（Ctrl+P → Reload app）确认图片显示正常

---

## 批量提取流程（从选修课列表自动遍历）

当用户要求「把课程都下载下来」「批量提取」时，使用此流程。

### 步骤 0：确认输出目录

**必须先问用户确认目标路径**。例如：`~/Documents/Obsidian Vault/一堂课程`

### 课程页面结构（2026-07-10 实测）

一堂课程导航路径：

```
选修课列表 (/elective-lesson)
  └─ .list-item JS click → 课程详情 (/lesson/{id})
       └─ .detail-section-item JS click → 章节页 (/lesson/section/{id})
            └─ <a href="/fs-doc/..."> 课程文档/课程文稿 </a>
```

**关键实测发现**：
- 所有课程都是 section-based 结构（`.detail-section-item`），无直接文档链接
- 子课程数量不固定（1~12 个），部分子课程无文档（AI 教练、视频入口等）
- 链接文本不统一（`课程文档` / `课程文稿`），**用 `href` 路径 `/fs-doc/` 匹配**
- SPA 加载需要 5~12 秒（3 秒不够）
- **daemon 重启后 SPA 数据清空**：必须 `location.reload()` 刷新页面

**无文档课程清单**（2026-07-10，11 门纯视频/图文材料，无 fs-doc 链接）：
五步法进阶5（项目壁垒）、抖音起盘4/5/6、华熙生物抖音复盘、起盘篇、销售五步法、预判篇、商业篇、团队篇、入学礼包（12个子课程全是图文材料）、业务高手第一课

### 步骤 1：收集链接

⚠️ 核心规则：脚本已存在且已验证，直接运行，不要重写。

```powershell
node <skill-dir>/scripts/collect-links.mjs `
  --skip-links "url1,url2,..." `
  --limit 5 `
  --output course-links.json
```

- `--skip-links`：逗号分隔的 URL 列表，脚本会跳过这些链接
- `--limit N`：只处理前 N 门课程（测试用）
- 输出 `course-links.json`（含 `allLinks` 数组）

### 步骤 2：批量提取

⚠️ 核心规则：脚本已存在且已验证，直接运行，不要重写。

```powershell
node <skill-dir>/scripts/batch-extract.mjs `
  --links course-links.json `
  --outdir "<your-output-dir>"
```

- `--start N`：从第 N 个链接开始（中断恢复用）
- `--dry-run`：只打印链接不执行
- 脚本自动：打开页面 → reload → 提取 → 跳过已有 MD → 复制到 Vault → 清理临时目录
- EBUSY（百度同步盘锁文件）自动重试 3 次

### 步骤 3：验证

```powershell
(Get-ChildItem "<vault-dir>" -Filter "*.md").Count
(Get-ChildItem "<vault-dir>\images" -EA SilentlyContinue).Count
```

提示用户在 Obsidian 中刷新（Ctrl+P → Reload app）确认图片显示正常。

## 脚本调用技巧（OpenCLI eval）

当需要修改提取逻辑时，注意：

- **PowerShell 转义问题**：复杂 JS 不能直接传给 `opencli eval`
- **解决方案**：写 `.mjs` 文件 → latin1 中转 → base64 编码 → `eval(atob("..."))` 包装 → Node.js `execSync` 调用
- **⚠️ atob 中文编码损坏**：`Buffer.from(code).toString('base64')` 在浏览器 `atob()` 后中文变乱码。必须用 `Buffer.from(code,'utf8').toString('latin1')` 再 base64。eval 中避免中文字符串比较，改用 `href.indexOf('/fs-doc/')` 等 ASCII 匹配
- **⚠️ daemon 重启后 SPA 数据丢失**：`opencli daemon restart` 后已打开的 SPA 页面 `dataJson` 为空，必须 `location.reload()` 才能重新加载
- **模板字符串陷阱**：`$children` 会被 JS 解释，用 `["$children"]` 替代
- **图片 URL 路径**：在 `blockAttr.cdnUrl`，不是 `blockAttr.image.cdnUrl`
- **百度同步盘 EBUSY**：`copyFileSync` 可能因云同步锁文件失败，`batch-extract.mjs` 已内置重试

## 块类型映射（参考）

详见 [references/block-types.md](references/block-types.md)

| type | 名称 | 输出格式 |
|------|------|---------|
| 2 | text | 段落文本 |
| 3 | heading1 | `## 标题` |
| 4 | heading2 | `### 标题` |
| 12 | ordered | 有序列表项 |
| 13 | bullet | `- 列表项` |
| 22 | divider | `---` |
| 24 | grid | 递归 children（网格布局） |
| 25 | grid_column | 递归 children（网格列） |
| 27 | image | `![](url)` |
| 31 | table | 递归 children（表格） |
| 34 | column | 递归 children（列布局） |

## Quality Gates

- [ ] 提取的文本块数 > 100（一堂课程通常 500+ 块）
- [ ] 图片数量 > 30（课程通常有大量配图）
- [ ] 图片文件名带课程名前缀（如 `一堂笔记-img-000.png`），避免多课程覆盖
- [ ] 所有图片引用在磁盘上有对应文件（PowerShell 验证时用 UTF-8 编码读取 md）
- [ ] 无空的 `![]()` 图片引用
- [ ] Markdown frontmatter title 来自 `document.title`，非内容第一个 heading
- [ ] frontmatter 包含 title/source/extracted/images

## Exit Criteria

**交付物**：
- `<课程标题>.md` — 带 frontmatter 的完整课程 Markdown（标题来自 `document.title`）
- `images/` — 所有配图（`{前缀}-img-000.png`, `{前缀}-img-001.jpg`, ...）

**必须报告**：
- 课程标题和图片前缀
- 提取的文本块数和图片数
- 是否有下载失败的图片
- Obsidian 中是否需要刷新索引
