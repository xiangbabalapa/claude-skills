# 配置说明

本 skill 需要以下环境变量配置。

## OPENCLI_PROFILE

- **用途**：Tabbit Browser 的 profile name，用于 `opencli browser <profile>` 命令
- **如何获取**：
  1. 打开 Tabbit Browser
  2. 进入设置 -> Profile 管理
  3. 找到你使用的 profile 名称
- **设置方式**：
  ```bash
  export OPENCLI_PROFILE=your-profile-name
  ```
- **必需**：是（三个脚本均依赖此变量）

## 输出目录

- **用途**：提取的 Markdown 和图片的保存路径
- **如何获取**：由用户在运行时指定，可以是任意本地目录
- **示例**：`~/Documents/Obsidian Vault/一堂课程/`
- **必需**：是（运行时作为参数传入）