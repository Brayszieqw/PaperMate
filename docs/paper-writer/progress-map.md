# paper-writer 进度地图（Progress Map）

> 目的：用结构树方式固定当前 `paper-writer` 的完成度、下一阶段目标与防跑偏边界。

## 1. 我们现在做到哪里了

如果把目标拆成三层：

1. **方向与架构层**
2. **runtime core 层**
3. **真实执行接入层**

那么当前状态可以概括为：

- 方向与架构层：**高完成度**
- runtime core 层：**中高完成度**
- 真实执行接入层：**刚起步**

## 2. 当前结构树

```text
paper-writer
├─ A. 方向与边界（已基本完成）
│  ├─ working-guidelines.md
│  ├─ conversation-record.md
│  ├─ upstream-capability-mapping.md
│  ├─ kimi-agent-design-distillation.md
│  └─ paper-writer-kimi-style-architecture-design.md
│
├─ B. contract / schema（已完成骨架）
│  ├─ paper-writer-runtime-contracts.md
│  ├─ 2026-03-21-paper-writer-runtime-schema-plan.md
│  └─ runtime-schemas/
│     ├─ route-packet.schema.json
│     ├─ phase-state.schema.json
│     ├─ artifact-ref.schema.json
│     ├─ handoff-packet.schema.json
│     ├─ checkpoint-packet.schema.json
│     └─ session-memory.schema.json
│
├─ C. 单入口智能体形态（已完成）
│  ├─ agents/paper-writer/paper-writer.md
│  ├─ 只保留一个可见 agent
│  └─ 子能力改为内部阶段：
│     ├─ paper-scout
│     ├─ paper-library
│     ├─ paper-drafter
│     ├─ paper-research-ops
│     └─ paper-reviewer
│
├─ D. runtime helper core（已完成第一版）
│  ├─ schema loader
│  ├─ packet factory
│  ├─ runtime state shell
│  ├─ lifecycle helpers
│  ├─ reroute / attach artifact / apply review verdict
│  ├─ orchestrator decision helpers
│  ├─ checkpoint view helper
│  ├─ next action plan helper
│  └─ reusable run ui payload helper
│
├─ E. smoke / demo 层（已完成第一版）
│  ├─ paused review smoke flow
│  ├─ active drafting smoke flow
│  ├─ runtime + ui 两层输出
│  └─ thin entry adapter: runPaperWriterEntry()
│
└─ F. 真正可用执行层（未完成）
   ├─ route-based entry（下一步重点）
   ├─ 真正根据用户目标选择流程，而不是 demoScenario
   ├─ 与 paper-writer prompt 的实际执行回路对齐
   ├─ 持久化 / 恢复
   ├─ 工具 / adapter 接线
   └─ 真正用户可见交互接入
```

## 3. 进度判断（按阶段）

### A. 方向与架构层
- 完成度：**90%+**
- 说明：目标、边界、命名、Kimi 参考、总控架构、上游映射都已经固定住了。

### B. contract / schema 层
- 完成度：**85%+**
- 说明：最小 runtime contract 与 schema 骨架都已存在，已经足够支持下一阶段实现。

### C. 单入口产品形态
- 完成度：**90%**
- 说明：对外只保留一个 `paper-writer` 已完成，方向没有再分裂成列表型多 agent。

### D. runtime helper core
- 完成度：**70% 左右**
- 说明：已经有运行核心骨架，但还没有真正接到真实目标路由与持久化。

### E. smoke / demo 层
- 完成度：**75% 左右**
- 说明：已经能演示 paused / active 两类 flow，但还是 demo 型，不是真正按任意用户目标运行。

### F. 真正可用执行层
- 完成度：**20% 左右**
- 说明：入口 adapter 已出现，但目前还是 demoScenario 驱动，不是完整 route-based execution。

## 4. “什么时候能做好”——分版本说

## 4.1 如果“做好”定义为：
**有单入口、能展示半自主行为、结构稳定、不再跑偏**

那可以说：

- **已经完成了大半**
- 当前大约在 **65%~75%** 区间

## 4.2 如果“做好”定义为：
**真正能按用户目标自动判断路线并返回 runtime + ui，不再只是 smoke demo**

那还差关键的一段：

- route-based entry
- 真实 prompt/runtime 执行对齐
- 至少一条真实用户目标链路打通

这个阶段我判断还需要：

- **2~4 个聚焦迭代**

## 4.3 如果“做好”定义为：
**接近你理想中的主流半自主智能体（可恢复、可持续、可接工具、可真实交互）**

那还需要后续几层：

- route-based execution
- state persistence
- tool / adapter integration
- real UI / host integration

这个属于下一阶段，不是当前这轮就能彻底收尾的。

## 5. 当前最关键的未完成项

下一阶段最关键的不是再补文档，也不是再补零散 helper，而是：

### 1. route-based entry
- 让 `runPaperWriterEntry()` 不再依赖 demoScenario
- 改为根据 goal / context / automation_mode 选择真实路线

### 2. prompt/runtime 对齐闭环
- 让 `paper-writer` 的提示词输出，与 runtime core 的 route / pause / ui 结构真正一致

### 3. 至少打通一条真实链路
- 例如：
  - 用户说“先筛论文再写 related work”
  - entry 选路
  - runtime 返回 paused 或 active
  - ui payload 可直接展示

## 6. 防跑偏红线

后续如果出现以下倾向，就说明开始跑偏：

### 不能跑偏到：
- 再重新暴露多个对外可见 paper 子 agent
- 把 helper 越补越碎但不进入真实入口
- 一直写文档，不打通 route-based entry
- 一上来做重型 persistence / tool system
- 让 reviewer 退化成装饰层

### 应持续对齐到：
- 单可见智能体：`paper-writer`
- 内部阶段能力模型
- Kimi 风格半自主 orchestrator
- button-first / text-fallback
- runtime + ui 双层输出

## 7. 下一阶段建议顺序

```text
当前阶段结束
-> route-based entry
-> 真实 goal 到 route 的最小判断
-> 打通一条真实用户链路
-> 再考虑持久化与工具接线
```

## 8. 一句话收束

> 我们现在已经把 paper-writer 从“多个提示词文件”推进成了“单入口半自主智能体雏形”；下一步真正决定成败的，是把 demo 型入口推进成 route-based 的真实执行入口。
