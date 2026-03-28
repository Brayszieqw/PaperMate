# paper-writer runtime schema skeleton

这些文件是 `paper-writer` 最小 runtime 契约的**机器可读骨架**。

它们的作用不是立刻驱动完整实现，而是先把 `paper-writer` 的关键运行对象固定下来，避免后续 runtime、adapter、memory、checkpoint 实现各自发明字段。

## 目录说明

- `route-packet.schema.json`：描述当前任务该怎么走
- `phase-state.schema.json`：描述当前阶段运行状态
- `artifact-ref.schema.json`：描述阶段产物引用
- `handoff-packet.schema.json`：描述子 agent / 阶段交接
- `checkpoint-packet.schema.json`：描述半自主停顿与恢复决策
- `session-memory.schema.json`：描述当前会话最小记忆对象

## 设计边界

- 这些 schema 是 **v1 skeleton**，强调最小够用
- 它们服务于 `docs/paper-writer/paper-writer-runtime-contracts.md`
- 它们不要求当前仓库已经存在完整 runtime 代码
- 它们不等价于最终持久化格式，也不强行规定后端技术选型

## 使用原则

1. 先用这些 schema 统一字段命名
2. 再围绕这些字段做最小接口 / adapter
3. 后续如需扩展，只增补，不随意重命名核心字段
