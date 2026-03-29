# paper-writer Kimi 风格总体架构设计稿（v1）

> 目的：基于 Kimi 公开设计蒸馏结果，结合当前 `paper-writer` 已有 agent / skill 骨架，为后续配置内化、runtime 设计与最小实现骨架提供统一架构方向。

## 1. 设计目标

`paper-writer` 不应停留在“论文领域的几个提示词文件”，而应发展为一个：

- 统一入口
- 半自主推进
- 会判断下一步
- 会调用论文域子能力
- 会在关键点停下来确认
- 会输出阶段产物
- 会在最终阶段做证据与风险收束

的论文工作流智能体。

这个目标同时继承两条设计脉络：

1. **Kimi 风格**：总控、动态路由、产物导向、半自主、可并行、可恢复
2. **papermate-router 风格**：方法纪律、单 writer、checkpoint、review 闸门、风险边界

## 2. 用户目标与优先级约束

根据当前对话，`paper-writer` 的优先级不是“先堆工具”，而是：

1. **像 orchestrator 一样判断下一步**
2. **自动串联论文工作流**
3. **具备状态 / 记忆**
4. **再接工具 / 外部能力**

并且整体运行风格应为：

- **半自主协同型**
- 低风险阶段自动继续
- 关键阶段返回中间结果并等待用户确认

## 3. 顶层定位

`paper-writer` 是唯一的论文总控 orchestrator。

它不是：

- 第二个 writer
- 第二个 reviewer
- 具体单篇 PDF 精读器
- 单纯的 router 文本模板

它的职责是：

- 解析用户目标
- 判断任务类型与阶段
- 决定是否进入复合流程
- 选择应调用的子 agent
- 判断是否继续自动推进或触发 checkpoint
- 收束阶段产物与最终结果

## 4. 两层结构

## 4.1 总控层（paper-writer）

负责：

- intent interpretation
- route selection
- phase progression
- checkpoint management
- artifact aggregation
- reconciliation
- final response formatting

## 4.2 能力层（子 agent）

由以下能力节点构成：

- `paper-scout`：发现 / 初筛 / 排序
- `paper-library`：入库 / 结构化笔记 / 索引
- `paper-drafter`：大纲 / 草稿 / 中文学术表达
- `paper-research-ops`：PDF 问答 / 精读 / 翻译 / LaTeX / 技术提取
- `paper-reviewer`：claim-evidence / citation / overclaim / verdict

这些节点不是平权总控，而是由 `paper-writer` 动态调用的能力位。

## 5. 默认运行风格：半自主协同

`paper-writer` 的第一版不应是全自动代理，而应是半自主系统。

### 自动推进的部分
- 文献初筛
- 摘要与排序
- 笔记入库
- 草稿生成
- 初步 review

### 必须确认的部分
- 覆盖已有正文
- 从草稿升级为正式稿
- 批量替换引用
- 接受带风险的 review 结果继续推进
- 正式定稿 / 对外使用

这与 Kimi Code 的“会执行，但有 approval flow”思路一致。

## 6. 动态路由，而不是僵硬流水线

虽然 `paper-writer` 有默认主流程：

`paper-scout -> paper-library -> paper-drafter -> paper-reviewer`

但系统不应被固定死。

### 允许的动态行为
- 在证据不足时插入 `paper-research-ops`
- 在已有材料充分时跳过 `paper-library`
- 在用户只要审查时直接调用 `paper-reviewer`
- 在单篇精读任务中只调用 `paper-research-ops`
- 在复合任务中按阶段串行推进

### 不允许的动态行为
- 并行修改同一正文目标
- 让 reviewer 默认替代 writer
- 让 ops 抢走总控职责

## 7. Checkpoint 模型（策略驱动版）

第一版建议采用策略驱动 checkpoint，而不是只靠固定节点。

### Checkpoint 类型
- `entry_checkpoint`
- `route_checkpoint`
- `mutation_checkpoint`
- `review_checkpoint`
- `finalize_checkpoint`
- `recovery_checkpoint`
- `stale_state_checkpoint`

### Checkpoint 分级
- `L0 auto_pass`
- `L1 soft_checkpoint`
- `L2 hard_checkpoint`
- `L3 block_checkpoint`

### 核心能力
- 可解释
- 可恢复
- 可续跑
- 可改道
- 可阻断

### UI 原则
- **button-first**
- **text-fallback**

也就是：宿主支持按钮时优先给按钮；不支持时退化为文本选项。

## 8. 子 agent handoff 契约

系统的稳定性不应依赖“上下文碰巧够用”，而应依赖 handoff 契约。

### handoff 最小字段
- `handoff_from`
- `handoff_to`
- `task_goal`
- `input_artifacts`
- `output_artifacts`
- `risk_flags`
- `recommended_next_step`

### 核心 handoff 链

#### `paper-scout -> paper-library`
- 候选论文列表
- must-read / worth-reading / skip
- 简短筛选理由
- 基本元信息

#### `paper-scout -> paper-research-ops`
- 目标论文
- 需要确认的问题
- 当前不确定点

#### `paper-library -> paper-drafter`
- 结构化笔记
- 概念 / 方法 / 局限性索引
- 可引用来源清单
- 相关证据包

#### `paper-drafter -> paper-reviewer`
- 草稿正文
- 使用的来源清单
- 弱证据句子标记
- 重点待审 claim

#### `paper-research-ops -> 其他节点`
- 精读结果
- 关键技术事实
- 翻译片段
- 不确定点标记

### 风险标签
每个 handoff 允许附带：

- `weak_evidence`
- `needs_review`
- `stale_context`
- `translation_uncertain`
- `not_ready_for_finalize`

## 9. 状态 / 记忆模型（分层版）

`paper-writer` 不应依赖单一会话上下文，而应逐步形成分层状态模型。

### 9.1 会话态状态
- 当前用户目标
- 当前 phase
- 当前 route
- 当前 pending checkpoint

### 9.2 工作态状态
- 当前候选论文集
- 当前笔记包
- 当前草稿版本
- 当前 review verdict
- 当前 evidence pack

### 9.3 项目级记忆
- 长期研究方向
- 偏好的写作风格
- 已确认的术语与命名
- 已稳定的文献库与概念索引
- 已确认的流程策略

### 9.4 恢复态状态
- 最近一次 checkpoint
- 最近一次可恢复的 artifact 版本
- 最近一次 review 对应的草稿版本

## 10. 交互体验原则

用户体验应更像“懂论文流程的总控工作台”，而不是单轮问答机器人。

### 每阶段的标准交互结构
- 当前我理解的目标
- 我准备怎么推进
- 我已经完成了什么
- 为什么在这里停
- 推荐下一步是什么
- 你可以如何选择

### 结果输出尽量统一为
- 结果
- 关键依据 / 来源
- 已执行步骤
- 风险 / 不确定点
- 下一步建议

## 11. 产物导向（artifact-first）

借鉴 Kimi 的设计，`paper-writer` 的核心交付应围绕 artifact，而不是只围绕聊天文本。

建议第一版围绕以下 artifact 类型：

- literature_candidate_set
- structured_note_bundle
- evidence_pack
- chapter_outline
- chapter_draft
- review_verdict
- revision_memo

这将决定后续 runtime 与 adapter 层如何组织数据。

## 12. 受控并行原则

Kimi 强调并行，但 `paper-writer` 的并行必须受领域约束。

### 可并行
- 多方向初筛
- 多篇论文快速初判
- 多角度证据搜集
- 多个只读研究子任务

### 不可并行
- 多 writer 同时改同一章节
- 正式 verdict 与写入混并
- 最终收束与正式验证并行

## 13. 为什么这套设计适合 paper-writer

因为它同时满足：

### Kimi 化要求
- 有真正总控
- 有下一步判断
- 有半自主推进
- 有 artifact 产出
- 有状态与恢复

### papermate-router 化要求
- 有纪律
- 有边界
- 有 checkpoint
- 有 reviewer 闸门
- 有单 writer 原则

### 论文场景要求
- 证据优先
- 引用可回链
- 不把写作能力误当事实能力
- 不让 reviewer 退化成装饰角色

## 14. 当前阶段的落地顺序

基于当前目标，建议按以下顺序推进：

1. 把 Kimi 蒸馏结果写入文档锚点
2. 把 Kimi 风格原则内化到 `paper-writer` 与相关 agent / skill 文本
3. 设计最小 runtime 契约：route / phase / checkpoint / handoff / state
4. 创建最小实现骨架（仅 contract / schema / interface，不先做重实现）
5. 再评估 adapter / tool / memory 的真实接线

## 15. 一句话架构总锚点

> `paper-writer` 应被做成一个会判断下一步、会调用论文域子能力、会在关键点暂停确认、会围绕 artifact 收束结果的半自主论文总控智能体。
