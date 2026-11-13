# Kasidia Frontend Law (KFL)

本目录完整收录仓库级前端设计与评审技能包 **Kasidia Frontend Law**（上游来源：[AngleNaris/KFL](https://github.com/AngleNaris/KFL)），以美学优先、规格驱动与真实渲染证据为核心，消除常见 AI 生成界面的视觉堆砌与坏味道。

## 优先级与适用准则

严格遵循以下裁决顺序：
1. 当前明确的用户指令与范围界定；
2. 项目已确立的视觉方向与设计系统（本仓见根目录 [`../../kfl-spec.md`](../../kfl-spec.md) 与 [`../../AGENTS.md`](../../AGENTS.md)）；
3. 视觉品质与辨识度 → 日常易懂性与任务效率 → 一致性与工程质量 → 无障碍增强与数值诊断参考。

KFL 将每条规则的**要求等级**（`required` 硬性要求 / `default` 默认导向 / `advisory` 诊断参考）与**实测状态**分离：对比度、字号下限、圆角层级与触控尺寸等数值启发式诊断不会自动推翻经审定成立的视觉设计；保留真实测量数据并在规格契约中记录设计取舍即可。内容真实性、数据完整性与控件真实可用始终为硬性要求。

## 四大核心法则

| 法则 | 核心目标 |
| :--- | :--- |
| 瑞士网格与作用域对齐（Swiss Grid, Scoped Alignment） | 通过共享布局拥有者（页面外框 / 区域轨道 / 组件内部）对齐关联内容；保留有意义的呼吸留白，清除删减遗留空隙。 |
| 共享组件契约（Shared Component Contracts） | 按语义职责与交互行为复用组件，保持跨页面的尺寸、状态与行为一致性。 |
| 可逆动效（Reversible Motion） | 为可逆的展开/收起交互提供连贯对称的返回过渡；单向业务流程无需强求逆向动画。 |
| 极简、有权重、易辨识（Minimal, Weighted, Recognizable） | 剔除无依据的填充文案与装饰干扰；紧凑熟悉动作用纯图标，核心业务主操作用图标+文字，导航/Tab/筛选项直接展示清晰文字标签（导航无需强配图标）。 |

## 六类重点拦截的高频反模式

- 无业务依据或重复堆砌的装饰性凑数文案；
- 无真实数据源支撑的绿色圆点、“Live / Ready”假状态徽章与伪遥测；
- 给无序平级分区标题强加 `01 / 02 / 03` 编号；
- 滥用纯文字动作按钮、将必要导航标签藏进纯图标，或给所有文字导航硬塞图标；
- 删除内容或隐藏节点后遗留的空行与断层间距（正常层级留白予以保留）；
- 新注入的卡片/列表侧边彩色强调竖条与标题下方装饰性横条。

## 目录结构

| 路径 | 职责说明 |
| :--- | :--- |
| [`SKILL.md`](SKILL.md) | 技能主入口：工作模式（Build / Change / Review）、Stage 0→6 阶段门禁与决策规则 |
| [`references/rules.md`](references/rules.md) | 全部稳定规则编号（`GOV`、`ALN`、`REU`、`MOT`、`MIN`、`CON`、`STA`、`ICO`、`COL`、`RAD`、`TYP`、`SCR`、`INT`、`VER`）与细则 |
| [`references/spec-template.md`](references/spec-template.md) | 项目规格契约与核验记录模板（本仓实例位于根目录 `kfl-spec.md`） |
| [`references/design-review.md`](references/design-review.md) | 基于真实运行证据的视觉与交互评审指南 |
| [`references/workflow.md`](references/workflow.md) | 工作流阶段集成与 Inherit / Explore 基线确认细则 |
| [`references/tools.md`](references/tools.md) | 可选网格生成、几何审计与表面诊断工具说明 |
| [`tools/`](tools/) | 独立隔离的本地诊断脚本（网格清单生成/审计、圆角/字号/滚动条表面审计） |
| [`examples/`](examples/) | 参考组件与网格标本（仅供按需取用，非强制架构模板） |
| [`THIRD_PARTY.md`](THIRD_PARTY.md) | 上游来源声明与第三方许可边界说明 |

## 许可与来源声明

遵循上游仓库 MIT 声明；第三方引用声明与许可核验边界请查阅 [`THIRD_PARTY.md`](THIRD_PARTY.md)。
