> **在线访问 (GitHub Pages)：** [https://jerryliu369.github.io/gaistudio/](https://jerryliu369.github.io/gaistudio/)（推送 `main` 后由 GitHub Actions 自动校验并发布）  
> 直达应用：[墨刃：一闪](https://jerryliu369.github.io/gaistudio/?app=ink-blade) | [天枢浑仪](https://jerryliu369.github.io/gaistudio/?app=astral-orrery) | [吉星包租公](https://jerryliu369.github.io/gaistudio/?app=lucky-landlord) | [CHRONO STAGE](https://jerryliu369.github.io/gaistudio/?app=chrono-stage)

# gaistudio — 统一 React WebApp 多应用工作区

`gaistudio` 是一个基于 React 19 + Vite 8 + TypeScript + Tailwind CSS 4 的统一 WebApp 外壳工作区，通过单一入口与单一预览端口收口多个相互隔离的小应用、增量工坊与 3D 模拟原型。

---

## 内置小应用列表

| 应用标识 (`id`) | 名称 | 隔离方式 | 目录位置 | 直接访问路由 | 说明文档 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ink-blade` | `墨刃：一闪` | `React.lazy` 按需懒加载 + 离屏墨痕画布与音频完整释放 | `src/apps/ink-blade/` | `/?app=ink-blade` | 内置剑谱心法与敌阵图谱 |
| `astral-orrery` | `天枢浑仪` | `React.lazy` 按需懒加载 + 退出完整释放 Three.js 场景与音频 | `src/apps/astral-orrery/` | `/?app=astral-orrery` | 内置天工典籍与星盘引导 |
| `lucky-landlord` | `吉星包租公` | `React.lazy` 按需懒加载 + 本地自动存档与音频释放 | `src/apps/lucky-landlord/` | `/?app=lucky-landlord` | 内置全图鉴与规则引导 |
| `chrono-stage` | `CHRONO STAGE` | `React.lazy` 按需懒加载 + 退出完整释放 WebGL/音频/全局监听 | `src/apps/chrono-stage/` | `/?app=chrono-stage` | [驾驶与调校手册](docs/chrono-stage.md) |

---

## 目录结构与核心机制

```text
gaistudio/
├── AGENTS.md                        # Agent 持久记忆库：用户偏好、能力规范、自有工程方法与沉淀日志
├── kfl-spec.md                      # Kasidia Frontend Law (KFL) 工作区视觉与交互规格契约
├── skills/
│   └── kasidia-frontend-law/        # 仓库级前端设计与评审规范技能包（源自 AngleNaris/KFL）
├── src/
│   ├── App.tsx                      # 统一 React 外壳：路由分发、顶部导航条、子应用隔离视口
│   ├── apps/
│   │   ├── registry.ts              # 唯一清晰的小应用注册清单
│   │   ├── ink-blade/               # 墨刃：一闪（水墨瞬身弹反剑戟动作坊）
│   │   ├── astral-orrery/           # 天枢浑仪（发条星轨共鸣增量工坊）
│   │   ├── lucky-landlord/          # 吉星包租公（四乘五账本控盘收租构筑）
│   │   └── chrono-stage/            # CHRONO STAGE 懒加载 React 入口
│   ├── shell/
│   │   ├── HomeHub.tsx              # 自适应首页应用大厅（瑞士暖纸极简目录）
│   │   ├── IframeAppHost.tsx        # Iframe 隔离宿主（退出时主动释放音频/WebGL/事件）
│   │   ├── AppErrorBoundary.tsx     # 子应用异常兜底与返回目录恢复
│   │   ├── router.ts                # 兼容根路径 `/` 与 `/gaistudio/` 子路径的路由工具
│   │   └── shell.test.ts            # 注册表、路由与工作区规范单元测试
│   ├── components/                  # CHRONO STAGE 弹窗与 SVG 路书组件
│   ├── game/                        # CHRONO STAGE 120Hz 物理、6 大赛段、WRC 锦标赛与单测
│   └── render/                      # CHRONO STAGE WebGL 3D 大气山脉与赛段渲染器
├── docs/
│   └── chrono-stage.md              # CHRONO STAGE 驾驶与调校手册
├── scripts/
│   └── workspace.mjs                # 工作区列表、全量校验与静态打包脚本
├── vite.config.ts                   # 相对路径 base (`./`) + apps/* 静态服务与构建同步插件
├── index.html                       # 标准 React/Vite 根入口
├── metadata.json                    # Google AI Studio 应用元数据
└── .gitignore                       # 忽略 node_modules/、dist/、.env* 等本地与临时文件
```

核心设计特性：

- **单一启动与预览入口**：只需执行 `npm run dev`（固定端口 `3000`），首页即可启动任意子应用并随时切回目录，无需维护多套开发服务器。
- **首页零引擎空转**：停留在应用大厅（`/`）时，不会提前初始化任何子应用的 WebGL 上下文、`requestAnimationFrame` 循环或 Web Audio 实例。
- **退出资源完整释放**：从任意小应用返回目录时，自动卸载模块或清空沙盒，彻底释放 WebGL 纹理/缓冲、动画帧、Web Audio / 语音合成与全局键盘/窗口监听。
- **双路径无缝兼容**：采用 Vite 相对资源基准（`base: './'`）与查询/哈希路由（`?app=<id>` 与 `#/apps/<id>`），构建产物同时兼容根路径 `/`（本地开发、Google AI Studio）与 GitHub Pages 子路径 `/gaistudio/`。

---

## 前端设计规范与 Agent 协作记忆

本仓库统一执行以下两项协作治理文件：

- **[`skills/kasidia-frontend-law/SKILL.md`](skills/kasidia-frontend-law/SKILL.md) 与 [`kfl-spec.md`](kfl-spec.md)**：所有前端界面设计、组件复用、交互微动效与视觉走查均严格遵循 **Kasidia Frontend Law (KFL)** 四大法则与六类反 AI 堆砌防线，在 `kfl-spec.md` 中持续维护工作区视觉基线与决策记录。
- **[`AGENTS.md`](AGENTS.md)**：作为跨会话持久记忆库，沉淀用户偏好（全中文单语文档、瑞士暖纸克制审美）、Agent 能力加强规范（纯逻辑单测先行、资源零泄漏、真实浏览器截图与交互验收）及本仓自有工程方法论。

---

## 开发与校验命令

在仓库根目录执行：

```bash
npm install          # 安装工作区依赖
npm run dev          # 启动统一 React 外壳与子应用开发服务器（端口 3000）
npm run typecheck    # TypeScript 严格类型检查（tsc --noEmit）
npm test             # 运行物理引擎、增量引擎、收租引擎与外壳规范单元测试
npm run build        # 构建生产产物 dist/（含根外壳与 apps/* 纯静态运行时资源）
npm run preview      # 本地预览 dist/ 构建产物
npm run apps:list    # 列出工作区外壳与已发现的小应用
npm run apps:check   # 执行 .env 安全检查、工作区契约校验、tsc、单测与 vite build 全量门禁
```

---

## 新增小应用接入方式

只需新增小应用目录并在 `src/apps/registry.ts` 增加一条登记项，无需改动 `vite.config.ts`、`package.json` 或底层路由：

### 接入 React 小应用（推荐）

1. 在 `src/apps/<slug>/` 下实现并默认导出根组件，在 `useEffect` 清理函数中完整释放定时器、全局监听、RAF 循环及 WebGL/Web Audio 资源。
2. 在 `src/apps/registry.ts` 的 `APP_REGISTRY` 中新增配置项，指定 `kind: 'react-lazy'` 与 `loader: () => import('./<slug>/...')`。
3. 为核心纯逻辑编写 `src/apps/<slug>/engine.test.ts` 单元测试并纳入 `package.json` 与 `scripts/workspace.mjs` 的校验链路。

### 接入自包含静态 HTML / 原生 JS 小应用

1. 将自包含静态目录放入 `apps/<slug>/`（包含 `index.html` 与相对路径静态资源）。
2. 在 `src/apps/registry.ts` 的 `APP_REGISTRY` 中新增配置项，指定 `kind: 'iframe'` 与 `entryPath: 'apps/<slug>/index.html'`。
3. `vite.config.ts` 会在开发态自动托管 `/apps/<slug>/`，并在构建时自动过滤文档与 `.env*` 后复制纯静态运行时资源至 `dist/apps/<slug>/`。

---

## Google AI Studio 同步与 GitHub Pages 部署说明

- **整仓统一工作流**：在 Google AI Studio Build 模式中直接绑定 `JerryLiu369/gaistudio` 整仓（框架选择 **React**），各子应用通过 `src/apps/<slug>/` 与 `src/apps/registry.ts` 模块化隔离演进。协作时先拉取最新 `main` 再编辑提交，禁止使用强制推送（`force push`）。
- **源码私有与静态站点公开隔离**：
  - `main` 为工作区唯一活跃主分支，源码仓库保持 **Private（私有）**；`ds-stage` 与 `gh-pages` 仅作为历史归档留存，不再作为发布源。
  - 推送 `main` 会自动触发 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)，运行 `npm run apps:check` 全量校验后仅将 `./dist` 纯静态编译产物发布至公开的 `https://jerryliu369.github.io/gaistudio/`，绝不泄露 `src/`、`skills/`、`AGENTS.md`、`.env*` 或凭据文件。
- **密钥安全**：真实密钥仅存放于本地未跟踪的 `.env` 或服务端环境变量，严禁提交进版本历史；占位说明仅写入 `.env.example`。
