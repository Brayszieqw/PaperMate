# paper-writer 上游能力映射说明

> 目的：把本项目已经确认的 4 个上游能力，明确映射到 `paper-writer` 体系中的 agent / skill / 工作流环节，作为后续开发、审查和防跑偏锚点。

## 1. 文档定位

这不是运行时适配说明，也不是 API 接线文档。

这份文档回答的是：

1. 我们为什么选这 4 个上游能力方向
2. 每个上游能力应该主要沉淀到哪个本地 agent / skill
3. 我们要继承什么能力，不继承什么东西
4. 后续开发时，哪些改动算对齐，哪些改动算跑偏

## 2. 事实来源

本映射以以下材料为准：

1. `docs/paper-writer/conversation-record.md`
2. `docs/paper-writer/working-guidelines.md`
3. `agents/paper-writer/paper-writer.md`
4. `agents/paper-writer/paper-scout.md`
5. `agents/paper-writer/paper-library.md`
6. `agents/paper-writer/paper-drafter.md`
7. `agents/paper-writer/paper-research-ops.md`
8. `agents/paper-writer/paper-reviewer.md`
9. `skills/paper-writer-orchestration/SKILL.md`
10. `skills/paper-writer-review-checks/SKILL.md`

## 3. 已确认的 4 个上游能力

根据会话记录，当前选定的上游能力组合为：

- `ChatPaper`
- `dailypaper-skills`
- `skill-thesis-writer`
- `gpt_academic`

注意：这里说的是**能力来源方向**，不是要求当前阶段立刻把它们全部做成真实 runtime 依赖。

当前阶段的目标仍然是：

- 先把 OpenCode 内的 agent / skill 架构稳定下来
- 再决定哪些能力做 prompt 吸收，哪些能力做 adapter / tool 接入

## 4. 总体映射原则

### 4.1 映射的是“能力职责”，不是“名字照搬”

我们并不把上游项目直接原样复制到本地，而是抽取它们最有价值的能力职责，再映射进 `paper-writer` 体系。

### 4.2 映射优先落在最匹配的本地角色

每个上游能力必须有：

- **主承接对象**：最主要承接该能力的本地 agent / skill
- **次承接对象**：必要时协同承接的其他本地角色

### 4.3 不引入角色混乱

映射后的结果仍然必须遵守本地边界：

- `paper-scout` 不是 writer
- `paper-library` 不是总控
- `paper-drafter` 不是 reviewer
- `paper-reviewer` 不是第二个 writer
- `paper-research-ops` 不是完整工作流 orchestrator

### 4.4 不因为有上游能力就绕过本地安全边界

即使某个上游系统支持更激进自动化，也不能覆盖本项目已定规则：

- 覆盖已有正文前必须确认
- 正式定稿前必须确认
- 批量替换引用前必须确认
- 高风险学术结论必须经过 review 视角核验

## 5. 总表：上游能力到本地角色的映射

| 上游能力 | 主承接对象 | 次承接对象 | 在本项目中的核心用途 |
|---|---|---|---|
| `ChatPaper` | `paper-scout` | `paper-research-ops` | 论文发现、初筛、候选集形成、快速判断是否值得继续读 |
| `dailypaper-skills` | `paper-library` | `paper-scout` | 文献沉淀、结构化笔记、长期知识库、概念索引 |
| `skill-thesis-writer` | `paper-drafter` | `paper-reviewer` | 中文论文写作、章节组织、学术表达、写作口径控制 |
| `gpt_academic` | `paper-research-ops` | `paper-writer` | PDF 问答、翻译、LaTeX、精读、综合学术操作能力 |

## 6. 逐项详细映射

## 6.1 `ChatPaper` -> `paper-scout`（主） / `paper-research-ops`（次）

### 为什么这样映射

在当前目标里，`ChatPaper` 最有价值的不是“完整论文平台外壳”，而是：

- 面向论文集合的快速发现能力
- 面向候选论文的初筛能力
- 对“值不值得读”的快速判断能力
- 在进入深读前给出简洁筛选依据

这些能力与 `paper-scout` 的定位高度一致。

### 主承接对象：`paper-scout`

`paper-scout` 应优先吸收的 `ChatPaper` 风格能力包括：

- 按主题 / 关键词 / 时间范围组织论文搜索问题
- 对论文进行相关度初判
- 给出 must-read / worth-reading / skip 三层筛选
- 输出“为什么推荐/不推荐”的简短依据
- 优先形成干净候选集，而不是直接开始写作

### 次承接对象：`paper-research-ops`

当某篇论文从“候选”进入“需要快速确认内容细节”阶段时，可由 `paper-research-ops` 承接次级能力：

- 对单篇论文做局部确认
- 快速回答论文在方法、实验、结论上的具体问题
- 为 `paper-scout` 的筛选结论提供更强证据

### 明确不继承的部分

当前阶段不要求把 `ChatPaper` 整个平台式交互原样搬进来，也不要求：

- 复制完整 UI 形态
- 强行绑定特定外部接口
- 把 `paper-scout` 变成 PDF 精读 agent

### 对后续开发的约束

如果未来修改 `paper-scout`，应优先增强：

- 筛选理由清晰度
- 论文排序逻辑
- 候选集质量

而不是让它去承担：

- 正文章节生成
- 长篇 review
- 全流程总控

## 6.2 `dailypaper-skills` -> `paper-library`（主） / `paper-scout`（次）

### 为什么这样映射

在当前项目里，`dailypaper-skills` 的核心价值是“把一次性阅读结果沉淀成长期可复用资产”。

这与 `paper-library` 的定位完全一致：

- 入库
- 结构化笔记
- 概念索引
- 长期文献库

### 主承接对象：`paper-library`

`paper-library` 应优先吸收的能力包括：

- 把论文信息整理成结构化笔记，而不是散乱摘要
- 把方法、发现、局限性、适用边界拆开记录
- 建立概念页、方法页、问题域索引
- 保持笔记可回链、可复用、可检索

### 次承接对象：`paper-scout`

`paper-scout` 可吸收少量前置能力，例如：

- 在筛选阶段就按后续入库需要保留基础元信息
- 输出便于入库的候选结构，而不是纯口头推荐

### 明确不继承的部分

当前阶段不需要为了模仿上游而引入复杂的长期知识库系统实现，也不要求：

- 先上数据库再开始做 agent
- 先做完整 Obsidian / 笔记系统集成
- 让 `paper-library` 直接承担章节写作

### 对后续开发的约束

如果未来修改 `paper-library`，应优先增强：

- 笔记结构统一性
- 概念索引和来源回链
- 对 `paper-drafter` 的证据供给能力

不应把重点放在：

- 文风润色
- reviewer verdict
- 顶层路由控制

## 6.3 `skill-thesis-writer` -> `paper-drafter`（主） / `paper-reviewer`（次）

### 为什么这样映射

在用户目标里，“写 paper”不是随便生成一段学术口吻文本，而是要：

- 有章节结构
- 有中文论文风格
- 有论证节奏
- 能控制表达强弱

这与 `paper-drafter` 的职责直接对应。

### 主承接对象：`paper-drafter`

`paper-drafter` 应优先吸收的能力包括：

- 章节大纲生成
- 基于来源和笔记起草正文草稿
- 中文学术表达的规整化
- 控制段落衔接、结构推进、表达层次
- 在证据不足时主动弱化措辞

### 次承接对象：`paper-reviewer`

`paper-reviewer` 不是 writer，但可吸收与论文写作规范相关的“反向校验”能力，例如：

- 识别不自然、空泛、AI 味重的表述
- 识别结论口气过强的问题
- 指出哪些句子需要减弱、补证据或拆分

### 明确不继承的部分

当前阶段不应因为有 thesis-writer 能力，就让 `paper-drafter` 越过本地边界：

- 不能默认独立定稿
- 不能跳过 review
- 不能在没有确认时覆盖用户现有正文

### 对后续开发的约束

如果未来修改 `paper-drafter`，应优先增强：

- 大纲质量
- 草稿质量
- 中文学术表达稳定性
- 来源约束下的写作能力

不应把重点放在：

- 自己宣布正式通过
- 自己做引用真实性裁决
- 自己替代总控路由

## 6.4 `gpt_academic` -> `paper-research-ops`（主） / `paper-writer`（次）

### 为什么这样映射

`gpt_academic` 的价值在当前项目里，不是照搬整个平台，而是吸收其“综合学术操作层”的能力，包括：

- PDF 问答
- 精读辅助
- 翻译
- LaTeX 相关支持
- 对单篇论文和局部技术问题的操作性处理

这些能力与 `paper-research-ops` 最匹配。

### 主承接对象：`paper-research-ops`

`paper-research-ops` 应优先吸收的能力包括：

- 面向单篇论文做深读和问答
- 提取方法、实验、指标、局限性
- 做段落或章节级翻译
- 处理 LaTeX 辅助问题
- 为 `paper-library` 和 `paper-drafter` 输出高质量中间材料

### 次承接对象：`paper-writer`

`paper-writer` 作为总控，需要继承少量“综合调度视角”的启发：

- 判断什么时候要插入 `paper-research-ops`
- 在复合流程中把深读/翻译/LaTeX 作为中间阶段，而不是默认第一步
- 在需要单篇强证据时，把任务从 broad search 路由到 deep-read

### 明确不继承的部分

当前阶段不要求原样复制 `gpt_academic` 的完整工具平台能力，也不要求：

- 把所有学术工具都塞进一个 agent
- 让 `paper-research-ops` 抢走 `paper-scout`、`paper-library`、`paper-drafter`、`paper-reviewer` 的职责

### 对后续开发的约束

如果未来修改 `paper-research-ops`，应优先增强：

- 单篇论文深读质量
- 技术细节提取准确性
- 翻译 / LaTeX 辅助稳定性
- 为上下游提供可复用中间材料的能力

不应把它扩展成：

- 默认总控入口
- 默认章节生成 agent
- reviewer verdict 输出者

## 7. 为什么 `paper-reviewer` 不直接对应 4 个上游能力之一

当前 4 个上游能力覆盖的是：

- 筛选
- 入库
- 写作
- 学术操作

但 `paper-reviewer` 的核心价值是本项目为了安全边界和学术可靠性而强化出来的本地角色：

- claim-evidence 核验
- 引用真实性检查
- 过度结论审查
- reviewer verdict 输出

因此：

- `paper-reviewer` 可以吸收 `skill-thesis-writer` 的部分规范感知能力
- 但它本质上是本地流程中**额外强化的质量闸门**
- 不能因为上游能力组合里没有一个叫 reviewer 的系统，就弱化它的重要性

## 8. 映射到两个本地 skill 的方式

## 8.1 `paper-writer-orchestration`

这个 skill 负责把上游能力映射落实到复合流程里：

- `ChatPaper` 风格能力 -> `paper-scout`
- `dailypaper-skills` 风格能力 -> `paper-library`
- `skill-thesis-writer` 风格能力 -> `paper-drafter`
- `gpt_academic` 风格能力 -> `paper-research-ops`
- 正式输出前 -> `paper-reviewer`

它负责的是**流程层编排**，不是某个单点能力的实现细节。

## 8.2 `paper-writer-review-checks`

这个 skill 负责把“写得像论文”与“真的站得住”分开。

也就是说：

- 上游写作能力可以帮助我们写得更像学术文本
- 但最终是否通过，仍由 review-checks 约束 claim / evidence / citation 风险

这保证本项目不会因为写作能力增强而牺牲证据纪律。

## 9. 后续开发时的对齐标准

后续任何关于 `paper-writer` 的新增或修改，都可以用以下问题自查：

1. 这项改动主要服务于哪一个上游能力映射？
2. 它落到的本地对象是不是正确的主承接角色？
3. 它有没有让某个子 agent 越权？
4. 它有没有破坏 balanced automation 边界？
5. 它有没有削弱 `paper-reviewer` 的质量闸门作用？

如果一项改动答不清这 5 个问题，就说明它很可能还不该进入本轮实现。

## 10. 当前阶段建议的开发优先级

基于本映射，当前最稳妥的开发顺序是：

1. 先把这份映射作为锚点固定下来
2. 再把映射逐步内化到各 agent / skill 文本里
3. 然后再做本地 adapter / runtime 设计
4. 最后才做真正的端到端自动化执行

## 11. 结论

当前 `paper-writer` 体系并不是随机拼接的 5 个子 agent，而是围绕 4 个已确认上游能力方向做的本地化重组：

- `ChatPaper` 负责启发“怎么筛”
- `dailypaper-skills` 负责启发“怎么沉淀”
- `skill-thesis-writer` 负责启发“怎么写”
- `gpt_academic` 负责启发“怎么做学术操作”

在此基础上，本项目额外用 `paper-reviewer` 和 review skill 补上“怎么审”的本地安全闸门。

这就是后续所有开发都应持续对齐的总锚点。
