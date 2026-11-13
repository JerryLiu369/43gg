# 参与贡献

43gg 是个人兴趣项目，欢迎提 Issue 和 PR。维护者会尽量查看，但不保证一定合入或及时回复。

## 项目怎么开发

`main` 是唯一的主分支，推送到 `main` 后会自动发布到 GitHub Pages。改动有两个来源：

- **Google AI Studio**：维护者每次从最新的 `main` 新建一个 AI Studio 工程，在里面开发新游戏，完成后强制推送回 `main`。AI Studio 内的 Agent 按 [`AGENTS.md`](AGENTS.md) 工作。
- **外部维护与 PR**：维护者使用的其他编码 Agent，以及外部贡献者，通过普通提交或 PR 修改 `main`。

AI Studio 的强制推送会覆盖它开工之后 `main` 上的新提交。所以 PR 合入后，维护者下一次在 AI Studio 开工前会先从最新 `main` 新建工程。如果你的 PR 合入后又消失了，请开 Issue 说明。

## 提交前检查

```bash
npm install
npm run apps:check
```

`apps:check` 依次做以下检查：确认没有提交 `.env` 文件、确认必需的文件齐全、`tsc` 类型检查、全部单元测试、`vite build`，以及检查构建产物里没有源码映射或密钥。PR 会在 CI 中跑同一套检查。

涉及界面的改动，请在浏览器里实际打开看一遍（桌面宽屏和手机竖屏 `390×844` 都要看），并在 PR 中附上截图。

## 新增一款游戏

1. 在 `src/apps/<id>/` 下实现游戏，`id` 只用小写字母、数字和连字符。推荐结构：`types.ts` 类型、`content.ts` 配置、`engine.ts` 纯逻辑、`engine.test.ts` 单测、`storage.ts` 存档、`audio.ts` 音效、`<Name>App.tsx` 视图（默认导出）。
2. 在 `src/apps/registry.ts` 的 `APP_REGISTRY` 中添加一条，`kind: 'react-lazy'`，`loader` 指向视图组件。必须填写 `author`（你的 GitHub 用户名或署名）、`model`（开发时主要用的 AI 模型，多个用 ` + ` 连接；纯手写就填 `无`）和 `highlights`（2–3 个简短卖点，如 `['四步实战指引', '三档难度', '触屏可玩']`），它们会显示在大厅卡片上，是你作品的展示位。大厅的分类、搜索和封面会自动生成；需要专属封面时，在 `src/shell/HomeHub.tsx` 的 `AppCoverGraphic` 中添加。
3. 组件卸载时完整清理：动画帧、定时器、全局事件监听、WebGL 资源、`AudioContext`。
4. 存档键名按 [`docs/compatibility.md`](docs/compatibility.md) 的规则命名，读到损坏数据时安全回退。
5. 游戏要求：内置可跳过的分步新手引导、至少三档难度（默认「标准」）、支持触屏操作。具体标准见 [`AGENTS.md`](AGENTS.md) 中的「游戏设计三大铁律」。
6. 上线后，把新 `id` 追加到 `src/shell/shell.test.ts` 的 `PUBLISHED_IDS` 中，并在 `README.md` 的游戏列表中添加一行（含作者与模型）。

不依赖 React 的纯静态 HTML 游戏也可以接入：把目录放到 `apps/<id>/`（需包含 `index.html`），注册表中使用 `kind: 'iframe'` 和 `entryPath: 'apps/<id>/index.html'`。

## 约定

- **文档只写简体中文**，不维护英文版或双语版。代码标识符和专有名词保留原文。
- **界面设计**遵循 [`skills/kasidia-frontend-law/`](skills/kasidia-frontend-law/SKILL.md) 和 [`kfl-spec.md`](kfl-spec.md)：不编造数据，不加假的在线状态，不加装饰性的编号和彩条。
- **核心逻辑与界面分离**：物理、结算、存档迁移等逻辑放在纯 TypeScript 模块中，用 `node:test` 编写确定性测试。
- **不要提交密钥**。仓库是公开的，`.env*`（`.env.example` 除外）已被忽略。
- 提交信息推荐使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式，例如 `feat(ink-blade): ...`、`fix: ...`。

提交 PR 即表示你同意以本项目的 [MIT 许可证](LICENSE) 发布你的贡献。
