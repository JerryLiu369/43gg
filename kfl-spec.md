# KFL 规格契约 — 43gg 小游戏

本文件依据 [`skills/kasidia-frontend-law/SKILL.md`](./skills/kasidia-frontend-law/SKILL.md) 与 [`references/spec-template.md`](./skills/kasidia-frontend-law/references/spec-template.md) 建立，记录 43gg 工作区外壳与子应用接入的视觉基线、作用域契约、保留决策与核验状态，作为跨迭代的工作记忆。

## 上下文概览（Context）

- **当前模式 / 阶段**：Change / Stage 6（基线固化与持续演进）
- **适用范围**：43gg 统一外壳（`src/App.tsx`、`src/shell/HomeHub.tsx`、`src/shell/AppErrorBoundary.tsx`、`src/index.css`）及子应用接入边界
- **视觉路径**：`Inherit`（外壳沿用既有瑞士暖纸极简设计系统；独立子应用视口内部按各自题材沿用既有基线或在新立项时单独声明 `Explore`）
- **授权依据**：用户指令要求全仓长期遵循 `AngleNaris/KFL` 前端法则，文档统一采用简体中文

| 维度 | 已确立事实 / 来源 / 关键范围界定 |
| :--- | :--- |
| 核心任务与主操作 | 用户在工作区目录快速浏览、按类别筛选并一键启动隔离的 WebApp / 游戏原型；运行态可随时一键返回目录或重新加载当前应用 |
| 支持平台、输入与窗口范围 | 全端覆盖：桌面端（1280–1920 CSS px 常规视口）与平板/手机竖屏视口（`390×844` 起）同等支持；输入同时兼容鼠标/键盘、触屏（战棋双点确认预览、动作类虚拟摇杆+技能键）与手柄（Gamepad API） |
| 真实内容与数据来源 | 注册表 `src/apps/registry.ts` 中的真实内置应用（`璇玑破阵`、`墨刃：一闪`、`天枢浑仪`、`吉星包租公`、`CHRONO STAGE`、`经纬铁道`、`方寸山河`、`寸阴`）；各子应用进度、难度偏好与新手指引状态持久化于浏览器本地独立命名空间 `localStorage` |
| 品牌、主题与几何语言 | 对外品牌名 `43gg` / `43gg 小游戏`；外壳采用单色明亮瑞士暖纸主题（`#FAF8F4` 纸底 + `#FFFFFF` 卡片 + `#1C1917` 主墨色 + `#C2410C` 朱砂印章色）；克制小圆角体系（按钮/标签 `6px`、筛选组 `8px`、应用卡片 `12px`） |
| 既有系统与界面基线 | `src/index.css` 语义变量、`src/shell/HomeHub.tsx` 纯净卡片网格与几何线条封面图、`src/App.tsx` `44px`（`h-11`）顶栏 |
| 图标体系、语言与排版方向 | `lucide-react` 线性矢量图标 + 手绘几何 SVG 封面（`ICO-1`）；全中文界面与全中文仓库文档（LTR 横排，`Noto Sans SC` + `Plus Jakarta Sans` + `Barlow Condensed` + `JetBrains Mono`） |
| 作用域与需保留决策 | 保持外壳大厅“零冗余文案、零假状态指示器、零引擎空转”的纯净目录体验；不改动既有三款子应用的成熟核心玩法与各自题材美术风格 |

待确认阻塞问题：无。

---

## 设计契约（Design Contract）

- **视觉意图与优先级**：以克制、耐看、诚实的瑞士网格秩序呈现应用目录，让作品封面与标题成为绝对视觉主角；严格按 KFL `GOV-1..4` 排序，杜绝一切无意义的装饰条、假状态绿点与凑数文案。
- **视觉基线**：以当前线上/本地运行的 `HomeHub` 与运行态顶栏实际渲染效果为 `Inherit` 基线，后续常规维护与新增子应用卡片直接复用该基线，无需重新生成概念设计图。
- **内容与层级**：
  - 顶栏仅保留左侧站点标识 `43gg` 与右侧分类筛选器（`全部 / 动作 / 增量 / 策略 / 竞速`）。
  - 每张应用卡片仅展示 `16:10` 瑞士几何线条矢量封面、应用主标题、精炼副标题与右上角启动箭头，通过删减测试（`CON-4`）剔除重复技术标签堆砌。
- **三级对齐作用域（`ALN-2..4`）**：
  - **Page Frame**：`max-w-5xl` 居中容器，水平内边距 `px-6 sm:px-10`，顶栏与主内容网格严格共享左右内容边缘（`ALN-12`）。
  - **Region Layout**：应用卡片区采用 CSS Grid 等宽轨道（`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`，统一间距 `gap-6`）。
  - **Component Interior**：卡片内部图片区与文字信息区通过 `1px` 细线（`#EFECE5`）分隔，内边距 `p-5`，标题与箭头单行对齐且支持 `min-w-0` 安全截断（`ALN-17`）。
- **字体、色彩与滚动条语义变量（`COL / TYP / SCR`）**：
  - 统一由 `src/index.css` `:root` 持有暖纸色板、等宽数字 `tabular-nums`（`.font-mono-num`）与全局暖石滚动条（同时声明标准 `scrollbar-width / scrollbar-color` 与 `::-webkit-scrollbar`）。
- **图标与文字语义分工（`MIN-5`）**：
  - 分类筛选器按钮（`全部 / 动作 / 增量 / 策略 / 竞速`）作为同级导航切换，仅使用清晰文字标签与 `aria-pressed` 状态，不强塞多余图标。
  - 运行态顶栏「目录」（返回）与「刷新」（重载）属于高频主操作，采用「线性语义图标 + 简短中文标签」。
- **交互与克制焦点契约（`INT-1..3a`）**：
  - 全部可交互项均使用原生 `<button type="button">`，严禁使用可点击 `<div>`。
  - 键盘 `:focus-visible` 采用与暖纸调色板协调的现有边框/底色变化（如卡片与顶栏按钮聚焦时边框转为 `#C2410C` 朱砂色），不添加刺眼的外部轮廓发光环，也不注入卡片侧边装饰彩条。
  - 严格保留 `@media (prefers-reduced-motion: reduce)` 无障碍降级规则（`MOT-6`）。

---

## 规则核验清单（Rule Checklist）

| Rule ID | 适用范围 | 等级与来源 | 状态 | 处置结论 | 证据与依据 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GOV-1` | 全仓文档与界面 | required：用户指令优先 | pass | conforms | 全仓自建文档统一为简体中文，接入 KFL 技能与 `AGENTS.md` 记忆库 |
| `ALN-2 / ALN-12` | 外壳顶栏与目录网格 | default：共享容器边缘 | pass | conforms | `HomeHub` 顶栏与主目录共用 `max-w-5xl px-6 sm:px-10` 左右锚点 |
| `REU-1 / REU-6` | 外壳色彩、字体、滚动条 | default：共享语义变量 | pass | conforms | 集中定义于 `src/index.css` 与 `APP_REGISTRY` 单一数据源 |
| `MOT-6` | 全局动画与过渡 | required：保留减弱动态偏好 | pass | conforms | `src/index.css` 声明 `prefers-reduced-motion: reduce` 兜底 |
| `MIN-2 / CON-4` | 首页大厅与顶栏文案 | default：删减测试与无编号标题 | pass | conforms | 无凑数标语、无无序标题编号、无虚构统计指标 |
| `MIN-5` | 筛选标签与顶栏动作按钮 | default：按语义角色配置图标/文字 | pass | conforms | 分类筛选用纯文字标签；返回目录与刷新用语义图标+文字 |
| `STA-2` | 外壳与文档状态呈现 | required：禁止虚假在线绿点与遥测 | pass | conforms | 全壳层零装饰性状态点或伪实时监控面板 |
| `ICO-1` | 封面与控件图标 | required：纯正矢量图标 | pass | conforms | 统一使用 `lucide-react` 与内联几何 SVG，无 Emoji 充当 UI 图标 |
| `SCR-1 / SCR-3` | 全局滚动容器 | default：共享克制滚动条样式 | pass | conforms | `src/index.css` 同时配置标准 `scrollbar-color/width` 与 WebKit 样式 |
| `INT-1..3a` | 卡片、筛选器与顶栏按钮 | default：原生按钮与调色板协调焦点 | pass | conforms | 原生 `<button>` + `aria-pressed` + 朱砂色边框焦点态，无外发光环与侧边彩条 |
| `COL-3` | 次级辅助文字对比度 | advisory：诊断参考 | pass | intentional choice | `#78716C` 在 `#FAF8F4 / #FFFFFF` 上保持柔和次级层级且实际清晰可读 |
| `INT-11` | 移动端触屏操控与防误触 | required：用户明确要求多端可玩 | pass | conforms | 战棋支持触屏首点预览/二次确认与紧凑双行拇指坞，动作类支持虚拟摇杆与大触控键 |
| `VER-1 / VER-2` | 桌面 `1440×900` 与移动 `390×844` 渲染交互 | required：真实双端截图与交互验证 | pass | conforms | 经无头 Chromium 1440×900 与 390×844 双视口实机快照、新手指引与触屏链路验证 |

---

## 决策日志（Decision Log）

| 日期 | 决策内容与设计理由 | 依据来源 | 影响范围与关联规则 |
| :--- | :--- | :--- | :--- |
| 2026-11-12 | 确立 `gaistudio` 外壳采用瑞士暖纸极简基线（`#FAF8F4` 纸底、`#1C1917` 主墨、`#C2410C` 朱砂强调色），后续新增子应用入口一律继承该目录卡片契约，不重复发起风格探索。 | 既有线上基线 + KFL `Inherit` | `src/App.tsx`、`src/shell/*`（`GOV-1`、`REU-3`、`COL-1`） |
| 2026-11-12 | 外壳交互控件采用边框色切换至 `#C2410C` 的无外环 `:focus-visible` 方案，兼顾键盘可辨识度与纸面干净度。 | KFL `INT-2` / `INT-3` | `src/App.tsx`、`src/shell/HomeHub.tsx` |
| 2026-11-12 | 仓库文档全面收敛为简体中文单语体系，移除 `README_zh.md` 冗余副本并将手册命名为 `docs/chrono-stage.md`。 | 用户明确指令 | 全仓文档与 `scripts/workspace.mjs` 门禁（`GOV-1`、`CON-4`） |
| 2026-11-12 | 新增水墨瞬身剑戟动作子应用《墨刃：一闪》（`ink-blade`）：外壳沿用 `Inherit` 暖纸卡片与 `动作` 分类筛选；子应用视口内部采用宣纸庭院、玄墨笔触与朱砂印章视觉基线，保持 `>= 88%` 无遮挡战斗视野与零 `backdrop-filter` 合成负担。 | 用户新建高质量游戏指令 | `src/apps/ink-blade/*`、`src/apps/registry.ts`、`src/shell/HomeHub.tsx`（`GOV-4`、`ALN-2`、`MIN-5`、`INT-2`） |
| 2026-11-12 | 新增全明牌立体沙盘战棋子应用《璇玑破阵》（`xuanji-breach`）：外壳继承瑞士暖纸卡片与 `策略` 分类筛选；子应用内部采用青铜秘色瓷 2.5D 等轴测沙盘、中央 3×3 璇玑转盘 90° 偏转弹道预演与统一底栏指挥台，杜绝无源状态点与 `backdrop-filter`。 | 用户自主命题精品独立游戏指令 | `src/apps/xuanji-breach/*`、`src/apps/registry.ts`、`src/shell/HomeHub.tsx`（`GOV-4`、`ALN-2`、`MIN-5`、`INT-2`） |
| 2026-11-12 | 采纳用户明确治理要求：所有游戏统一配备「非阻塞分步实战新手指引 + 图文速查手册」、「平滑适中的三档难度曲线（轻松/标准/宗师）」与「桌面+手机触屏原生双端适配（战棋双点确认预览、动作类虚拟摇杆）」，将 `INT-11` 与 `VER-2`（含 `390×844` 竖屏）升级为游戏子应用 `required` 门禁。 | 用户明确指令 | `AGENTS.md`、`src/apps/xuanji-breach/*`、`src/apps/ink-blade/*`（`GOV-1`、`INT-11`、`VER-2`） |
| 2026-11-13 | 将实战分步新手指引与多端适配对齐至其余三款既有子应用：《天枢浑仪》支持随时重温五步实战带教；《吉星包租公》新增四步动作驱动实战带教与「难度 0 轻松休闲」档；《CHRONO STAGE》新增路书过弯图解手册、四步领航实战带教、三档难度及 `390×844` 竖屏零重叠双拇指操控。 | 用户明确指令 | `src/apps/astral-orrery/*`、`src/apps/lucky-landlord/*`、`src/apps/chrono-stage/*`、`src/components/RallyTutorialModal.tsx`、`src/game/*`（`GOV-1`、`ALN-15`、`INT-11`、`VER-1..2`） |
| 2026-11-13 | 按用户指令将对外站点品牌统一为 **`43gg` / `43gg 小游戏`**（界面不再展示 `gaistudio` 与模型代号），并将首页目录升级为面向未来任意 N 款游戏可扩展的均等三列卡片网格 + 紧凑列表双视图、自动分类标签派生、实时搜索过滤、本地真实进度摘要及程序化封面兜底。 | 用户明确指令 | `src/shell/HomeHub.tsx`、`src/apps/registry.ts`、`src/App.tsx`、`index.html`、`metadata.json`（`GOV-1`、`ALN-11`、`REU-4`、`CON-3`、`INT-2..3`） |
| 2026-11-13 | 移植并纯前端离线化《经纬铁道》（`ticket-to-ride-europe`）与《方寸山河》（`carcassonne-bigbox`）两款策略桌游子应用：移除联机/房间/登录与假状态点，保留完整纯逻辑引擎、三档难度本地 AI 对战、交互式新手指引、内置规则弹窗、独立 `43gg.*` 本地存档及桌面/移动端双端视口适配，并在 `HomeHub` 补齐瑞士几何封面。 | 用户明确指令 | `src/apps/ticket-to-ride-europe/*`、`src/apps/carcassonne-bigbox/*`、`src/apps/registry.ts`、`src/shell/*`（`GOV-1`、`STA-2`、`MIN-2`、`INT-11`、`VER-1..2`） |
| 2026-11-13 | 新增日晷光影解谜子应用《寸阴》（`inch-of-shade`）：外壳继承瑞士暖纸卡片并新增线条封面，大厅首次出现 `解谜` 分类（自动派生）；子应用内部以 `Explore` 确立「盛夏庭院」基线——暖沙地砖、蓝紫冷阴影（正片叠底）、粉墙黛瓦与朱砂主按钮，衬线标题字体按需子集加载并在卸载时移除。触屏采用首点预览路线、再点或点「前往」执行的双阶段交互，「等日头」同样先预览后确认；预览以虚线框、白爪印（安全等待格）与橙色斜纹（即将晒到）表达，不使用 `backdrop-filter`。 | 用户自主创意新游戏指令 | `src/apps/inch-of-shade/*`、`src/apps/registry.ts`、`src/shell/HomeHub.tsx`、`src/shell/hubProgress.ts`（`GOV-1`、`MIN-5`、`INT-2`、`INT-11`、`VER-2`） |
