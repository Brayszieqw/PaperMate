# paper-writer 分支工作准则

> 适用分支：`paper-writer-config`
> 目的：防止后续实现和讨论跑偏，始终围绕用户已经明确的 paper-writer 目标推进。

## 1. 北极星目标

在 `<opencode-root>` 中建设一套 **OpenCode 内嵌的论文工作流智能体体系**，并以 `paper-writer` 作为统一总入口使用。

这套体系服务的主场景不是单点功能，而是完整的：

- 读论文
- 筛论文
- 沉淀笔记
- 起草论文
- 审查 claim / evidence / citation

## 2. 已确认的核心决策

### 2.1 顶层入口
- 顶层 orchestrator：`paper-writer`

### 2.2 子 agent 体系
- `paper-scout`
- `paper-library`
- `paper-drafter`
- `paper-research-ops`
- `paper-reviewer`

### 2.3 自动化风格
- 默认采用：**平衡型自动化**

含义：
- 可自动执行：筛选、摘要、入库、草稿、初步 review
- 必须先确认：覆盖已有正文、正式稿、定稿、批量替换引用

### 2.4 默认复合流程
默认按以下顺序组织：

1. `paper-scout`：筛论文、排序、must-read 列表
2. `paper-library`：入库、结构化笔记、概念索引
3. `paper-drafter`：大纲、章节草稿、中文学术表达
4. `paper-research-ops`：PDF 问答、翻译、LaTeX、精读
5. `paper-reviewer`：claim-evidence、引用核验、review verdict

## 3. 当前阶段的工作边界

现阶段重点不是扩展实现面，而是先确保 **OpenCode 能稳定识别并使用这套 agents / skills 配置**。

因此当前优先级为：

1. agents 配置正确
2. skills 配置正确
3. 命名、职责、路由、边界一致
4. 文档与记录可作为后续实现依据

现阶段**不优先**做的事：

- 不急着接完整 Python runtime
- 不急着做端到端自动化执行
- 不为了“看起来完整”而扩展无关能力
- 不把 paper-reviewer 变成 writer

## 4. 本轮工作范围

除非用户明确改变目标，否则后续工作默认只围绕以下路径展开：

- `agents/paper-writer/`
- `skills/paper-writer-orchestration/`
- `skills/paper-writer-review-checks/`
- `docs/paper-writer/`

如果需要引用历史设计，可参考：

- `<legacy-workspace>/docs/papermates/specs/2026-03-20-paper-papermate-gpt-design.md`
- `<legacy-workspace>/docs/papermates/plans/2026-03-20-paper-writer-implementation-plan.md`

## 5. 不跑偏约束

后续讨论、修改、审查都应满足以下约束：

1. **始终围绕论文工作流**，不扩展到无关通用 agent 设计。
2. **始终以 `paper-writer` 为统一入口**，不重新发明新的顶层命名。
3. **单 writer 原则**：正文写作与正式改写必须串行。
4. **证据优先**：没有来源支持的内容不能包装成确定性学术结论。
5. **review 不越权**：`paper-reviewer` 默认做审查，不默认重写整章。
6. **高风险动作先确认**：覆盖、定稿、批量替换引用必须停下来。

## 6. 事实来源优先级

当后续出现理解偏差时，按以下顺序回对齐：

1. 用户当前明确指令
2. `docs/paper-writer/conversation-record.md`
3. `agents/paper-writer/paper-writer.md`
4. 两个 paper-writer skills 的 contract
5. D 盘已有 spec / implementation plan

## 7. 后续默认执行原则

如果用户没有另行指定，后续我应默认：

- 先读记录再行动
- 先保证方向一致，再做实现细化
- 小步推进，避免无关发散
- 做任何新增前，先检查是否真的服务于既定 paper-writer 目标

## 8. 当前下一步

当前最合理的下一步应继续围绕：

- 检查其余 5 个 agent 是否与总控目标一致
- 检查两个 skill 与 agent 路由是否完全对齐
- 只在完成一致性确认后，再进入下一层实现
