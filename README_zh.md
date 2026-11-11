[English](./README.md) | **简体中文**

# gaistudio — Google AI Studio 多项目工作区

本仓库用于统一整理和存放 Google AI Studio 原型与小型 Web 项目。

为了同时兼容 Google AI Studio 当前的根目录双向同步入口与现有 GitHub Pages 部署（`/` 与 `/ds/`），仓库保留根目录作为默认/活跃 AI Studio 工作区（`CHRONO STAGE`），并将其他独立小项目统一收口到 `apps/<project-slug>/` 目录下各自自包含维护。

---

## 一、项目总目录

| 项目标识 | 目录位置 | 类型 / 技术栈 | 本地运行方式 | 文档与线上入口 |
| :--- | :--- | :--- | :--- | :--- |
| `chrono-stage` | `.`（根目录默认项目） | React 19 + Vite 8 + TypeScript + Tailwind CSS 4 + WebGL 3D 拉力模拟 | `npm run dev` | [游戏手册](docs/chrono-stage_zh.md) · Pages `/` |
| `ds-stage` | `apps/ds-stage/` | 纯静态 HTML + 原生 JS + WebGL 1.0 拉力模拟（零构建，镜像自 `ds-stage` 分支） | `npm run dev:ds` 或直接打开 `apps/ds-stage/index.html` | [项目说明](apps/ds-stage/README.md) · Pages `/ds/` |

---

## 二、目录结构

```text
gaistudio/
├── apps/
│   └── ds-stage/          # 独立静态项目（STAGE，保留自包含结构与相对路径资源）
├── docs/
│   └── chrono-stage_zh.md # 原根目录 CHRONO STAGE 完整中文手册存档
├── scripts/
│   └── workspace.mjs      # 无外部依赖的多项目列表、静态预览、校验与 Pages 打包辅助脚本
├── src/                   # 根目录默认项目（CHRONO STAGE）源码
├── index.html             # 根目录默认项目入口
├── metadata.json          # Google AI Studio 应用元数据
├── package.json           # 根目录依赖与工作区命令
├── vite.config.ts         # Vite 构建配置（base: '/gaistudio/'）
├── .env.example           # 根目录环境变量模板（不含真实密钥）
├── .gitignore             # 递归忽略 node_modules/、dist/、.env* 等本地产物
├── README.md              # 英文文档（Pure English）
└── README_zh.md           # 中文文档（当前文件）
```

---

## 三、常用命令

在仓库根目录执行：

```bash
npm install          # 安装根目录依赖
npm run dev          # 启动根目录默认项目（CHRONO STAGE，端口 3000）
npm run dev:ds       # 启动 apps/ds-stage 静态预览（端口 3001）
npm run typecheck    # TypeScript 类型检查（tsc --noEmit）
npm test             # 运行根目录物理与赛道单元测试
npm run build        # 构建根目录项目到 dist/
npm run apps:list    # 列出工作区内全部项目与运行方式
npm run apps:check   # 执行环境变量安全检查、根项目校验/构建以及全部 apps/* 语法与资源校验
npm run build:pages  # 本地组装兼容 gh-pages 的 dist/（/ 与 /ds/），仅生成产物不自动推送
```

---

## 四、Google AI Studio 集成边界与多项目工作流

根据 Google 官方文档（[Sync your AI Studio apps with GitHub](https://aistudio.google.com/learn/sync-your-ai-studio-apps-with-github) 与 [Build apps in Google AI Studio](https://ai.google.dev/gemini-api/docs/aistudio-build-mode)）：

- **已核实的平台边界**：Google AI Studio Build 模式的双向 GitHub 同步仅支持**以整个仓库根目录为粒度**进行绑定（1 个 AI Studio 工作区 ↔ 1 个 GitHub 仓库根目录）。官方文档**未提供**绑定 `apps/<project-slug>/` 子目录或选择特定分支的选项，也不支持多个独立 AI Studio 网页会话无冲突并行同步到同一个仓库的不同子目录；此外，首次导入已有仓库并建立同步时，AI Studio 可能要求执行 Force push 覆盖根目录兼容性改动。
- **因此，在本单仓内沉淀多个小项目的推荐工作流如下**：

### 方式 A（推荐）：AI Studio 开发导出 ZIP → 落盘 `apps/<project-slug>/`

适合积累大量独立小项目，完全避免多会话互踩或强推风险：

1. 在 Google AI Studio 中创建并调试小项目，完成后点击下载 ZIP（或导出源码）。
2. 在本地工作区先执行 `git pull origin main`。
3. 将源码解压到 `apps/<project-slug>/`（如 `apps/json-diff-tool/`），确保资源路径与依赖自包含。
4. 本地测试并执行 `npm run apps:check`，更新本总目录表格后提交并 `git push`。

### 方式 B：根目录作为唯一活跃 AI Studio 同步槽位（轮转归档）

如果你希望某一个正在高频迭代的项目直接使用 AI Studio 双向同步：

1. 将**仓库根目录**视为当前唯一接入 AI Studio 双向同步的活跃工作区（当前为 `CHRONO STAGE`）。
2. 每次在 AI Studio 与本地之间切换编辑前，先 Pull 再改、改完及时 Push，**切勿无脑 Force push** 以免影响仓库历史或其它目录。
3. 当根目录项目开发告一段落、准备切入下一个新项目时，先在本地将根目录旧项目归档复制到 `apps/<project-slug>/` 并提交推送，再替换根目录内容继续下一个项目。

---

## 五、添加新小项目与环境变量规则

1. **目录命名**：统一放在 `apps/<project-slug>/`（小写字母、数字和连字符，例如 `apps/markdown-preview/`）。
2. **项目自包含**：
   - 纯静态项目：至少包含 `index.html`，CSS/JS/图片等资源全部放在各自目录内并使用相对路径引用。
   - Vite / React / Node 项目：各自目录保留独立的 `package.json`、`index.html`、`src/`、`metadata.json` 等文件；如需部署到 GitHub Pages 子路径，注意配置相对路径或匹配的 `vite` `base`。
3. **资源与构建产物**：按项目各自存放，禁止把业务资源堆到仓库根目录；`node_modules/`、`dist/`、`build/` 已由根 `.gitignore` 统一忽略。
4. **密钥管理（重要）**：
   - 任何真实 API Key（如 `GEMINI_API_KEY`）**严禁提交进 Git**。
   - 如需环境变量，仅在项目目录内提交 `.env.example`（只写变量名和占位符），真实值写在本地 `.env` 中。根 `.gitignore` 的 `.env*` 与 `!.env.example` 规则会在根目录及所有 `apps/*` 子目录生效。

---

## 六、分支与 GitHub Pages 说明

- `main`：默认分支，存放完整多项目工作区。
- `ds-stage`：保留的历史分支（`STAGE` 源码；已同步保留一份在 `main` 的 `apps/ds-stage/`）。
- `gh-pages`：GitHub Pages 静态发布分支（`/` 对应 `CHRONO STAGE`，`/ds/` 对应 `STAGE`）。
- **仓库与站点可见性提醒**：虽然 `JerryLiu369/gaistudio` 仓库本身为 **Private（私有）**，但当前开启的 GitHub Pages 站点（`https://jerryliu369.github.io/gaistudio/`）仍为 **Public（公开访问）**。部署静态页面前请确认站点内容不包含敏感信息。
