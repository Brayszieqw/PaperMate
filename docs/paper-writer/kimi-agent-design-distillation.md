# Kimi Agent 设计蒸馏（面向 paper-writer）

> 目的：把 Kimi 公开资料中与智能体架构相关的可复用设计，提炼成适合 `paper-writer` 参考的设计锚点。
> 范围：只蒸馏公开可见的论文、技术博客、产品资源与主流媒体线索；明确区分“直接证据”和“设计推断”。

## 1. 结论先行

Kimi 最值得借鉴的，不是“固定写死很多 agent 名字”，而是：

- 一个中央 orchestrator
- 动态生成 / 调度子 agent
- 强工具使用
- 可并行执行
- 产物导向输出
- 分层记忆 / 上下文压缩
- 关键动作审批闸门

换句话说，Kimi 更像一个会临时组建团队、会自动推进阶段、会在关键点停下来确认的**半自主总控系统**，而不是一个静态的多 agent 菜单页。

## 2. 资料范围与来源分级

## 2.1 官方 / 一手资料

1. **Kimi K2.5: Visual Agentic Intelligence**  
   https://www.kimi.com/blog/kimi-k2-5
2. **Kimi Introduces Agent Swarm: Let 100 AI Agents Work for You**  
   https://www.kimi.com/blog/agent-swarm
3. **Kimi K2.5 模型页**  
   https://www.kimi.com/ai-models/kimi-k2-5
4. **Kimi Features**  
   https://www.kimi.com/features/
5. **Moonshot API Platform**  
   https://platform.moonshot.ai/
6. **Kimi Code introduction**  
   https://www.kimi.com/resources/kimi-code-introduction
7. **Kimi Claw introduction**  
   https://www.kimi.com/resources/kimi-claw-introduction

## 2.2 论文 / 技术报告

1. **Kimi k1.5: Scaling Reinforcement Learning with LLMs**  
   https://arxiv.org/abs/2501.12599
2. **MoBA: Mixture of Block Attention for Long-Context LLMs**  
   https://arxiv.org/abs/2502.13189
3. **Mooncake: A KVCache-centric Disaggregated Architecture for LLM Serving**  
   https://arxiv.org/abs/2407.00079

## 2.3 主流媒体 / 高质量二手资料

1. TechCrunch（2026）Moonshot 发布 Kimi K2.5 与 coding agent 综述  
2. TechCrunch（2024）Moonshot 长上下文定位背景报道  
3. The Decoder 对 K2.5 / agent swarm 的总结性报道

这些二手资料可辅助理解，但设计锚点主要以官方与论文材料为准。

## 3. 直接证据：Kimi 公开材料明确支持什么

## 3.1 中央 orchestrator 存在

来自 Kimi K2.5 官方技术博客的直接表述：

- K2.5 可以自我调度一个 agent swarm
- 可以自动创建并协调子 agent
- 存在 **trainable orchestrator agent**

这意味着 Kimi 的核心不是平权多 agent，而是明显存在一个中心调度者。

## 3.2 动态子 agent 与并行执行存在

官方博客直接写到：

- 最多 **100 sub-agents**
- 最多 **1,500 tool calls**
- 相比单 agent 可提升 **4.5x** 执行效率
- 不依赖预定义 subagents 或手工 workflow

这说明其运行方式偏向：

- 动态分解任务
- 并行分配子任务
- 再汇总结果

## 3.3 工具使用是核心组成部分

Kimi 并不是“只会思考的对话模型”，公开产品和平台页面表明它有明显的工具侧能力：

- Web Search
- Memory
- Excel
- Code-Runner
- Fetch
- 文档 / 表格 / 幻灯片 / 网站等产物型工作面

这说明其 agentic 设计不是纯 prompt 编排，而是工具型工作流。

## 3.4 长上下文基础设施是其关键支撑

从 MoBA、Mooncake 等论文可见：

- Kimi 长上下文能力有明确系统支撑
- MoBA 摘要甚至直接写到其已支持 Kimi 的 long-context requests

因此，Kimi 的“长任务处理能力”并不是只靠提示词，而是有模型与 serving 双侧支撑。

## 3.5 产品交互是产物导向的

从官方 Features / model page 可见，Kimi 不只提供聊天：

- Docs
- Sheets
- Slides
- Websites
- Deep Research
- Code
- Claw

这意味着其交互设计是：

- 自然语言是入口
- 产物才是工作结果

## 3.6 记忆 / 持久化能力存在，但形态分层

公开资料支持以下几种记忆相关能力：

- API 层的 memory 能力
- Kimi Code 的 session persistence 与 `/compact`
- Kimi Claw 的 persistent memory / personality / scheduled tasks

虽然公开资料没有完整说明其统一 backend，但可以确定其记忆不是单层的。

## 3.7 审批 / 闸门式动作控制存在

从 Kimi Code 资源页可见：

- 会做 planning
- 会执行命令
- 但存在 approval flow

这说明它不是“无约束自动代理”，而是更接近**半自主系统**。

## 4. 仍然属于推断的部分

以下内容目前没有在公开资料中拿到完整、严谨、结构化证据，因此只能作为设计推断，不应伪装成已被公开证实的 Kimi 内部实现：

- 完整 inter-agent communication protocol
- 共享 scratchpad 的具体结构
- 真正的冲突裁决算法
- 统一 memory backend 设计
- 每个产品 surface 是否真的对应独立 agent team

所以我们可以借鉴其设计哲学，但不能声称已经拿到了完整内部架构蓝图。

## 5. 设计蒸馏：Kimi 风格智能体的 8 个关键特征

## 5.1 单总控入口

Kimi 最像“一个会组建团队的总控”，不是一组平权 agent 同时各说各话。

**蒸馏原则：** 必须有一个统一的 chief orchestrator。

## 5.2 动态分解，而不是固定流水线

即便公开页面会展示“研究员 / 分析师 / fact-checker”这类角色名，它们更像可读化标签，而不是固定写死的系统菜单。

**蒸馏原则：** 保留角色边界，但运行路径动态决定。

## 5.3 会判断下一步，而不只是执行当前指令

Kimi 的 agent 感来自：

- 识别任务属于哪类工作
- 拆分子任务
- 决定先搜、先读、先写还是先审

**蒸馏原则：** 下一步判断能力比“工具数量”更核心。

## 5.4 强调并行，但不盲目并行

Kimi Agent Swarm 的亮点是并行扩展。但官方材料也暗示，并行并不是为了热闹，而是为了缩短 critical path。

**蒸馏原则：** 只有在适合横向分解的阶段才并行；写作、收束、正式 review 应保持谨慎。

## 5.5 产物导向输出

它不是只生成一段答复，而是生成：

- 报告
- 表格
- 文档
- 幻灯片
- 网站

**蒸馏原则：** 聊天只是入口，阶段产物才是核心工作对象。

## 5.6 分层记忆

Kimi 的公开能力显示它至少具有：

- 会话态保持
- 压缩态上下文
- 长期偏好 / 用户级记忆
- 工具侧状态

**蒸馏原则：** 不要做一个笼统“大记忆箱”，而要区分不同时间尺度和不同用途的状态。

## 5.7 半自主而非失控自动化

Kimi Code 的 approval flow 表明：

- 允许 agent 主动推进
- 但关键动作仍然要停下

**蒸馏原则：** 低风险自动，高风险闸门。

## 5.8 允许“有结构的分歧”

Kimi Agent Swarm 官方特别强调 **productive disagreement**。

这意味着优秀系统不是总让所有子 agent 得出一样结论，而是允许不同结论并存，再由系统收束。

**蒸馏原则：** 需要有对立校验路径，而不是只有单一路径产出。

## 6. 对 paper-writer 最直接可借鉴的设计

## 6.1 最该借的是“总控方法”，不是“100 个 agent”

对于 `paper-writer` 而言，Kimi 的真正可借鉴价值不是：

- 做 100 个子 agent
- 模仿产品 marketing 表达

而是：

- 总控统一入口
- 动态路由
- 半自主推进
- 可恢复 checkpoint
- 分层记忆
- 产物导向

## 6.2 最适合 paper-writer 的 Kimi 化改造方向

### (1) `paper-writer` 做唯一 orchestrator
- 负责任务理解
- 负责下一步判断
- 负责 checkpoint
- 负责结果收束

### (2) 子 agent 做能力节点而非平权主脑
- `paper-scout`
- `paper-library`
- `paper-drafter`
- `paper-research-ops`
- `paper-reviewer`

### (3) 用 `paper-reviewer` 承接 productive disagreement
- 主写路径给出草稿
- reviewer 路径给出风险、反例、弱证据提示
- 最终由总控 reconcile

### (4) 以产物为中心，而不是以聊天轮次为中心
- 论文候选集
- 入库笔记包
- 草稿章节
- 证据表
- review verdict

### (5) 分层维护状态
- 当前任务状态
- 当前工作集 / artifact 集
- 长期项目锚点
- checkpoint resume 状态

## 7. 对 paper-writer 不建议照搬的部分

## 7.1 不建议追求“超宽 swarm”

当前 `paper-writer` 最需要的不是夸张的并行宽度，而是：

- 稳定总控
- 明确 handoff
- 半自主 checkpoint

## 7.2 不建议现在就追求“完全无预定义 workflow”

Kimi 可以宣称无预定义 workflow，是因为底层能力足够强。

对 `paper-writer` 而言，更合理的是：

- 有稳定角色边界
- 有默认主流程
- 同时允许动态插入 / 跳过 / 改道

## 7.3 不建议把工具数量当成第一目标

对 `paper-writer` 来说，优先级仍应是：

1. 下一步判断
2. 自动串联流程
3. 状态与 handoff
4. 再扩工具与 adapter

## 8. 可直接沉淀为本项目原则的 Kimi 设计句式

后续可以把以下原则吸收进 `paper-writer`：

1. `paper-writer` 是统一总控，不是众多 agent 之一。
2. 子 agent 是按任务动态选择的能力位，不是固定顺序菜单。
3. 优先做“下一步判断”，而不是优先堆工具。
4. 只在适合横向拆分的阶段并行。
5. 真正的交付对象是 artifact，不是长聊天。
6. 需要分层状态与记忆，而不是单一上下文块。
7. 高风险动作必须有 checkpoint 闸门。
8. 系统应允许分歧并进行收束，而不是消灭分歧。

## 9. 最终蒸馏

如果只保留一句总锚点：

> Kimi 的 agent 设计本质不是“很多 agent”，而是“一个会组建团队、会分工、会暂停确认、会收束产物的半自主总控系统”。

这也是 `paper-writer` 应该持续对齐的方向。
