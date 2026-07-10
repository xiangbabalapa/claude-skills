---
name: SPA课程提取-spa-course-extractor
description: |
  从需要登录的 SPA 课程平台（如一堂 yitang.top）提取完整课程文档（文本+图片）到本地 Markdown。
  TRIGGER: 用户发来课程链接要求下载/保存/离线阅读/复刻到本地；要求提取课程内容；要求把课程文档存到 Obsidian。
  覆盖：yitang.top（一堂）等基于 Vue + 虚拟滚动的 SPA 课程平台。
  不覆盖：纯静态网页（用链接读取 skill）；飞书文档（用飞书文档 skill）；视频课程（只提取文档部分）。
---

# SPA 课程文档提取器

## 执行前必读检查清单

- [ ] **连接浏览器**：OpenCLI daemon 运行中，Tabbit Browser 已连接
- [ ] **授权码**：从 `reference_credentials.md` 的「Tabbit Browser」section 读取 profile name
- [ ] **运行脚本**：直接运行 `scripts/extract.mjs`，不要重写
- [ ] **登录态**：目标页面需要登录时，先在 Tabbit 里完成登录
- [ ] **图片验证**：脚本自动验证，但 Obsidian 里还需手动确认显示正常
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
node ~/.claude/skills/SPA课程提取-spa-course-extractor/scripts/extract.mjs "<output-dir>"
```

脚本自动完成：
1. 从 Vue 组件 `dataJson.childrens` 提取全部文档块（DFS 遍历）
2. 解析文本（heading/text/bullet/quote 等）和图片（cdnUrl）
3. 下载所有图片到 `images/` 子目录
4. 生成带 frontmatter 的 Markdown
5. 验证所有图片引用存在

### 3. 复制到 Obsidian Vault

```powershell
# 将输出目录的 md 和 images 复制到 Vault 对应目录
Copy-Item "<output-dir>/*.md" "<vault-target-dir>/"
Copy-Item "<output-dir>/images/*" "<vault-target-dir>/images/"
```

### 4. 验证

- 脚本已自动验证图片引用完整性
- 提示用户在 Obsidian 中刷新（Ctrl+P → Reload app）确认图片显示正常

## 脚本调用技巧（OpenCLI eval）

当需要修改提取逻辑时，注意：

- **PowerShell 转义问题**：复杂 JS 不能直接传给 `opencli eval`
- **解决方案**：写 `.mjs` 文件 → base64 编码 → `eval(atob("..."))` 包装 → Node.js `execSync` 调用
- **模板字符串陷阱**：`$children` 会被 JS 解释，用 `["$children"]` 替代
- **图片 URL 路径**：在 `blockAttr.cdnUrl`，不是 `blockAttr.image.cdnUrl`

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
- [ ] 所有图片引用在磁盘上有对应文件
- [ ] 无空的 `![]()` 图片引用
- [ ] Markdown frontmatter 包含 title/source/extracted/images

## Exit Criteria

**交付物**：
- `<课程标题>.md` — 带 frontmatter 的完整课程 Markdown
- `images/` — 所有配图（img-000.png, img-001.jpg, ...）

**必须报告**：
- 提取的文本块数和图片数
- 是否有下载失败的图片
- Obsidian 中是否需要刷新索引
