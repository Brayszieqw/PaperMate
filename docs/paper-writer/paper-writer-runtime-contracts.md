# paper-writer 最小 runtime 契约（v1）

> 目的：为 `paper-writer` 后续从“配置型智能体”演进到“半自主论文总控智能体”提供最小 runtime 契约层。
> 范围：本文件只定义 contract / schema / interface / 生命周期，不定义具体实现代码。

## 1. 设计目标

第一版 runtime 不追求重型平台，而追求 4 件事：

1. 让 `paper-writer` 真正具备**总控运行骨架**
2. 让多阶段工作流的**状态可见、可恢复、可续跑**
3. 让子 agent 之间的**handoff 有标准契约**
4. 让 checkpoint / artifact / review gate 有统一运行语义

## 2. 总体原则

### 2.1 总控唯一
- `paper-writer` 是唯一 orchestrator
- 子 agent 不直接持有总控职责

### 2.2 半自主优先
- 低风险阶段自动推进
- 高风险阶段触发 checkpoint

### 2.3 artifact-first
- runtime 围绕 artifact 流转，不围绕松散聊天历史流转

### 2.4 单 writer
- 所有正文写作型 artifact 的正式变更必须串行

### 2.5 reviewer 是质量闸门
- reviewer 不是装饰层，也不是第二 writer

## 3. 核心运行对象

第一版 runtime 至少需要 6 类核心对象：

1. `route_packet`
2. `phase_state`
3. `artifact_ref`
4. `handoff_packet`
5. `checkpoint_packet`
6. `session_memory`

## 4. route_packet 契约

`route_packet` 用于表达：当前任务该怎么走。

建议字段：

```yaml
route_packet:
  task_id: string
  user_goal: string
  task_kind: single_step | compound
  domain_focus: scout | library | draft | ops | review | mixed
  current_phase: intake | scout | library | draft | ops | review | finalize | paused
  risk_level: low | medium | high
  evidence_state: empty | weak | usable | strong
  automation_mode: conservative | balanced | aggressive
  route_strategy: direct | staged | review_first | evidence_first
  recommended_next_agent: paper-scout | paper-library | paper-drafter | paper-research-ops | paper-reviewer | paper-writer
  checkpoint_needed: none | soft | hard | block
```

### 设计意图
- 让 `paper-writer` 的“下一步判断”有显式对象
- 后续无论是 UI 还是 runtime，都能围绕它继续推进

## 5. phase_state 契约

`phase_state` 用于表达：任务现在运行到哪一步。

建议字段：

```yaml
phase_state:
  phase_id: string
  phase_name: intake | scout | library | draft | ops | review | finalize | recovery
  status: pending | in_progress | completed | blocked | paused
  started_at: datetime | null
  completed_at: datetime | null
  owner: paper-writer | paper-scout | paper-library | paper-drafter | paper-research-ops | paper-reviewer
  input_artifacts: []
  output_artifacts: []
  notes: string | null
```

### 设计意图
- 让流程不再只是“聊天里说到了哪”
- 支持恢复、续跑、阶段回退

## 6. artifact_ref 契约

artifact 是 `paper-writer` 工作流的第一公民。

建议第一版支持的 artifact 类型：

- `literature_candidate_set`
- `structured_note_bundle`
- `evidence_pack`
- `chapter_outline`
- `chapter_draft`
- `review_verdict`
- `revision_memo`

建议字段：

```yaml
artifact_ref:
  artifact_id: string
  artifact_type: literature_candidate_set | structured_note_bundle | evidence_pack | chapter_outline | chapter_draft | review_verdict | revision_memo
  version: string
  producer: paper-writer | paper-scout | paper-library | paper-drafter | paper-research-ops | paper-reviewer
  summary: string
  source_refs: []
  risk_flags: []
  supersedes: string | null
```

### 设计意图
- 为 checkpoint、review、恢复、回溯提供稳定抓手
- 降低“我以为我们在讨论同一个草稿”的混乱

## 7. handoff_packet 契约

多 agent 串联的关键是 handoff 规范化。

建议字段：

```yaml
handoff_packet:
  handoff_id: string
  handoff_from: paper-writer | paper-scout | paper-library | paper-drafter | paper-research-ops | paper-reviewer
  handoff_to: paper-writer | paper-scout | paper-library | paper-drafter | paper-research-ops | paper-reviewer
  task_goal: string
  current_phase: string
  input_artifacts: []
  expected_output_type: string | null
  risk_flags: []
  recommended_next_step: string | null
  notes_for_receiver: string | null
```

### 第一版 handoff 最低要求

#### `paper-scout -> paper-library`
- 输入：候选论文集
- 输出目标：结构化笔记包

#### `paper-library -> paper-drafter`
- 输入：结构化笔记包 / 证据包
- 输出目标：章节大纲或草稿

#### `paper-drafter -> paper-reviewer`
- 输入：章节草稿 / 来源清单 / 弱证据标记
- 输出目标：review verdict

#### `paper-research-ops -> any`
- 输入：单篇深读问题
- 输出目标：evidence_pack / 技术事实 / 翻译片段

## 8. checkpoint_packet 契约

checkpoint 是半自主系统的关键控制器。

建议字段：

```yaml
checkpoint_packet:
  checkpoint_id: string
  checkpoint_type: entry | route | mutation | review | finalize | recovery | stale_state
  checkpoint_level: auto_pass | soft | hard | block
  current_phase: string
  why_pause: string
  current_result_summary: string
  risk_summary: string | null
  recommended_action: string
  alternative_actions: []
  resume_condition: string | null
  ui_policy: button_first_text_fallback
```

### 设计意图
- 让 checkpoint 不再只是“继续吗？”
- 而是一个有上下文、有风险说明、有推荐动作的决策对象

## 9. session_memory 契约

第一版不做重型 memory system，但至少需要一个最小会话记忆对象。

建议字段：

```yaml
session_memory:
  task_id: string
  current_goal: string
  current_phase: string
  active_artifacts: []
  evidence_pack_ids: []
  pending_checkpoint_id: string | null
  latest_review_verdict: pass | pass_with_risks | block | null
  user_preferences:
    automation_mode: conservative | balanced | aggressive
    writing_style: string | null
    review_strictness: string | null
  stale_state_flag: true | false
```

### 设计意图
- 先满足“够用的记忆”
- 不一上来建设复杂长期记忆系统

## 10. 最小生命周期

第一版建议的 runtime 生命周期：

1. `intake`
   - 读取用户目标
   - 形成 `route_packet`
2. `phase_start`
   - 进入当前阶段
   - 选择对应 agent
3. `handoff`
   - 生成 `handoff_packet`
   - 调用下游能力节点
4. `artifact_capture`
   - 把结果登记为 `artifact_ref`
5. `checkpoint_evaluate`
   - 判断是否继续 / 软停 / 硬停 / 阻断
6. `resume_or_reroute`
   - 用户确认后继续，或切换路线
7. `finalize`
   - 收束最终结果与下一步建议

## 11. 状态转换规则

### 允许的主要转换

```text
intake -> scout
intake -> review
scout -> library
scout -> ops
library -> drafter
ops -> library
ops -> drafter
drafter -> reviewer
reviewer -> finalize
reviewer -> recovery
any -> paused
paused -> previous_phase_or_next_phase
```

### 不允许的主要转换

```text
reviewer -> direct_overwrite_without_checkpoint
multiple_drafters -> same_chapter_write
finalize -> skip_review_when_required
```

## 12. 风险标签统一表

第一版建议统一这些 `risk_flags`：

- `weak_evidence`
- `needs_review`
- `stale_context`
- `translation_uncertain`
- `unsafe_finalize`
- `overwrite_risk`
- `citation_risk`
- `not_ready_for_finalize`

## 13. 最小恢复机制

runtime 至少要支持以下恢复语义：

### 13.1 Resume
- 从上一个 checkpoint 继续

### 13.2 Reroute
- 改走另一条阶段路径

### 13.3 Re-review
- 基于新草稿 / 新证据重新 review

### 13.4 Rollback target selection
- 至少能回到“上一个可信 artifact 版本”

## 14. UI 契约

由于你明确希望不要总是输入字母，checkpoint 的 UI 契约应固定为：

### button-first
- 优先按钮式选项

### text-fallback
- 宿主不支持按钮时，退化为文本选项

### 统一按钮字段

```yaml
choice_option:
  id: string
  label: string
  description: string
  recommended: true | false
```

## 15. 第一版不做什么

为了避免跑偏，第一版 runtime contract 明确**不要求**：

- 100-agent swarm 实现
- 完整长期 memory backend
- 真实工具执行调度器
- 跨进程状态同步
- 复杂 rollback engine
- 完整 UI 系统

## 16. 后续实现建议顺序

建议后续从以下顺序进入实现：

1. 先把这些 contract 写成文档锚点
2. 再把 route / checkpoint / artifact / handoff 定义成最小 schema
3. 再让 `paper-writer` 的提示词显式围绕这些 schema 思考
4. 然后才做 adapter / tool / persistence 的真实接入

## 17. 一句话总结

> `paper-writer` 的最小 runtime 不应先追求复杂自动化，而应先把“谁在总控、当前在哪一步、当前产物是什么、为什么要停、下一步怎么继续”这五件事标准化。
