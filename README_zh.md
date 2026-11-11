[English](./README.md) | **简体中文**

> **在线访问 (GitHub Pages)：** [https://jerryliu369.github.io/gaistudio/](https://jerryliu369.github.io/gaistudio/)（推送 `main` 后由 GitHub Actions 自动构建并发布）  
> 直达应用：[吉星包租公](https://jerryliu369.github.io/gaistudio/?app=lucky-landlord) | [CHRONO STAGE](https://jerryliu369.github.io/gaistudio/?app=chrono-stage)

# gaistudio — 统一 React WebApp 多应用工作区

`gaistudio` 是一个基于 React 19 + Vite 8 + TypeScript + Tailwind CSS 4 的统一 WebApp 外壳工作区，通过单一入口与单一预览端口收口多个相互隔离的小应用与原型。

---

## 一、内置小应用列表

| 应用标识 (`id`) | 名称 | 隔离方式 | 目录位置 | 直接访问路由 | 说明文档 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `lucky-landlord` | `吉星包租公` | `React.lazy` 按需懒加载 + 本地自动存档与音频释放 | `src/apps/lucky-landlord/` | `/?app=lucky-landlord` | 游戏内全图鉴与规则提示 |
| `chrono-stage` | `CHRONO STAGE` | `React.lazy` 按需懒加载 + 退出完整释放 WebGL/音频/监听 | `src/apps/chrono-stage/` | `/?app=chrono-stage` | [中文游戏手册](docs/chrono-stage_zh.md) |

---

## 二、目录结构与核心特性

```text
gaistudio/
├── src/
│   ├── App.tsx                  # 统一 React 外壳：路由分发、顶部返回导航条、应用视口
│   ├── apps/
│   │   ├── registry.ts          # 唯一清晰的小应用注册清单
│   │   ├── lucky-landlord/      # 吉星包租公（策略收租构筑卡牌）
│   │   └── chrono-stage/        # CHRONO STAGE 懒加载 React 入口
│   ├── shell/
│   │   ├── HomeHub.tsx          # 桌面与移动端自适应首页应用大厅
│   │   ├── IframeAppHost.tsx    # Iframe 隔离宿主（退出时主动释放音频/WebGL/事件）
│   │   ├── AppErrorBoundary.tsx # 子应用异常兜底与返回首页恢复
│   │   ├── router.ts            # 兼容根路径 `/` 与 `/gaistudio/` 子路径的路由工具
│   │   └── shell.test.ts        # 注册表与路由单元测试
│   ├── components/              # CHRONO STAGE 弹窗与 SVG 路书组件
│   ├── game/                    # CHRONO STAGE 120Hz 物理、6 大赛段、WRC 锦标赛与单元测试
│   └── render/                  # CHRONO STAGE WebGL 3D 大气山脉与赛段渲染器
├── docs/
│   └── chrono-stage_zh.md       # CHRONO STAGE 完整中文驾驶手册
├── scripts/
│   └── workspace.mjs            # 工作区列表、全量校验与静态打包脚本
├── vite.config.ts               # 相对路径 base (`./`) + apps/* 静态服务与构建同步插件
├── index.html                   # 标准 React/Vite 根入口
├── metadata.json                # Google AI Studio 应用元数据
├── .env.example                 # 环境变量模板（禁止存放真实密钥）
└── .gitignore                   # 忽略 node_modules/、dist/、.env* 等本地文件
```

核心设计：

- **单一启动与预览入口**：只需执行 `npm run dev`（端口 `3000`），首页即可直接启动两款应用并随时返回，无需多个 dev server 或手动切端口。
- **首页零引擎空转**：停留在应用大厅（`/`）时，不会提前初始化任何游戏的 WebGL 上下文、`requestAnimationFrame` 循环或 Web Audio 引擎。
- **退出资源释放**：从任意小应用返回首页时，自动卸载组件或清空沙盒，释放 WebGL、动画帧、WebAudio / 语音合成与全局键盘/窗口监听。
- **双路径兼容**：使用 Vite 相对资源基准（`base: './'`）与查询/哈希路由（`?app=<id>` 与 `#/apps/<id>`），构建产物同时兼容根路径 `/`（本地开发/预览、Google AI Studio）与 GitHub Pages 子路径 `/gaistudio/`。

---

## 三、开发与校验命令

在仓库根目录执行：

```bash
npm install          # 安装依赖
npm run dev          # 单一命令启动统一 React 外壳与内置子应用（端口 3000）
npm run typecheck    # TypeScript 类型检查（tsc --noEmit）
npm test             # 运行物理引擎与外壳注册表/路由单元测试
npm run build        # 构建生产产物 dist/（含根外壳与 apps/* 纯静态运行时资源）
npm run preview      # 本地预览 dist/ 构建产物
npm run apps:list    # 列出工作区外壳与各小应用
npm run apps:check   # 执行 .env 安全检查、tsc、单元测试与 vite build 全量校验
```

---

## 四、如何加入新的小应用

只需新增小应用目录，并在 `src/apps/registry.ts` 增加一条登记项，无需改动 `vite.config.ts`、`package.json` 或多套构建脚本：

### 方式一：新增 React 小应用（推荐与 AI Studio React 渲染搭配）

1. 在 `src/apps/<slug>/index.tsx` 实现并默认导出 React 组件（在 `useEffect` 清理函数中释放自身定时器、监听、RAF 或 WebGL/音频资源）。
2. 在 `src/apps/registry.ts` 的 `APP_REGISTRY` 数组添加一条配置，设置 `kind: 'react-lazy'` 与 `loader: () => import('./<slug>/index.tsx')`。

### 方式二：新增纯静态 HTML / 原生 JS 小应用

1. 将自包含静态目录放到 `apps/<slug>/`（包含 `index.html` 与相对路径资源）。
2. 在 `src/apps/registry.ts` 的 `APP_REGISTRY` 数组添加一条配置，设置 `kind: 'iframe'` 与 `entryPath: 'apps/<slug>/index.html'`。
3. `vite.config.ts` 会在 `npm run dev` 时自动托管 `/apps/<slug>/`，并在 `npm run build` 时自动过滤文档和 `.env` 后把纯静态运行时文件复制到 `dist/apps/<slug>/`。

---

## 五、Google AI Studio 使用与同步说明

参考 Google 官方文档（[Sync your AI Studio apps with GitHub](https://aistudio.google.com/learn/sync-your-ai-studio-apps-with-github) 与 [Build apps in Google AI Studio](https://ai.google.dev/gemini-api/docs/aistudio-build-mode)）：

- 官方文档目前说明了在 Build 模式中以**整仓**为单位导入与双向同步 GitHub 仓库（可选 React 等前端框架），并未提供只绑定仓库内某个子目录（如 `apps/<slug>/`）或按子应用绑定不同分支的机制。
- **推荐工作流**：在 Google AI Studio 中直接导入同一个 `JerryLiu369/gaistudio` 仓库，在架构/渲染选项中选择 **React**，将仓库作为统一的 React 应用工作区来维护；不同功能各自隔离放在 `src/apps/<slug>/` 或 `apps/<slug>/`，统一在 `src/apps/registry.ts` 登记即可。
- 协作习惯：编辑前先拉取最新 `main`，修改后及时提交推送，不使用强制推送（`force push`）。
- 验证边界说明：当前已在本地完成 `npm run dev`、`npm run build`、`npm run preview` 与真实浏览器全流程测试及 GitHub Pages 线上访问核验；尚未在已登录的真实 Google AI Studio 网页工作台内实测导入。

---

## 六、仓库私有性与 GitHub Pages 部署隔离

- `main`：工作区源码主分支，仓库保持 **Private（私有）**。
- `ds-stage`：保留的 `STAGE` 历史独立分支。
- `gh-pages`：历史静态发布分支，现仅作历史留存，**不再作为 GitHub Pages 发布源**。
- **自动部署流程（推送 `main` 自动更新 Pages）**：向 `main` 推送提交会自动触发 [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml)（`workflow` 模式），自动执行 `npm run apps:check`（`.env` 安全检查、TypeScript 类型检查、单元测试与 `vite build`）并将编译产物 `./dist` 自动部署至 `https://jerryliu369.github.io/gaistudio/`（也支持 `workflow_dispatch` 手动触发）。
- **有意采用的隔离策略**：源码仓库 **Private（私有）**、线上静态 WebApp **Public（公开访问）** 是当前明确选择。自动部署仅发布 `./dist` 下的纯静态运行时产物（`index.html`、`assets/` 及可能存在的 `apps/*` 静态运行时资源），绝不会公开 `src/` 源码、`.env*`、凭据或 `.aistudio/` 临时文件。
- **密钥规范**：真实 API Key 仅保存在本地 `.env`，严禁提交进 Git 历史；示例占位请放在 `.env.example`。
