# PaperMate GPT Family for OpenCode

这是一套当前**唯一推荐**的默认 family：`papermate-gpt`。

它吸收了 `README-hive.md` 的轻量稳定主路径，也吸收了 `README-gpt-router.md` 的多角色扩展能力；但定位不再是“与旧 family 并存的另一个入口”，而是新的统一推荐入口。

## 当前定位

- `papermate-gpt` 是当前默认建议入口，也是这套 family 的统一收敛点
- 默认风格是：**轻量优先、升级按需、writer 串行、证据优先、用户优先**
- 旧 `hive-*` / `gpt-*` family 目前仅保留历史兼容与参考意义，不再作为默认建议入口

## 核心链条速览

默认核心链条如下：

1. `papermate-gpt`：入口收敛、路由判断、最终交付
2. `papermate-planner`：复杂任务拆成短计划，决定 owner / 并行边界 / papermates path
3. `papermate-validator`：高风险执行前做安全校验与护栏判断
4. `papermate-coder`：作为唯一 writer 串行落地实现并做最小验证
5. `papermate-oracle`：在多路线或复杂根因下做保守裁决
6. `papermate-reviewer`：最终独立复审，判断是否可交付

你可以把它理解为：

`入口 -> 规划 -> 护栏 -> 实施 -> 裁决 -> 复审`

## Agents

### 核心角色

- `papermate-gpt`: **唯一推荐主控入口**，负责路由、执行模式选择、交付收敛、最小观测策略
- `papermate-planner`: 复杂任务拆解、阶段划分、并行边界与流程纪律判定
- `papermate-validator`: 输入边界、命令风险、注入与敏感操作护栏
- `papermate-coder`: 最小实现、局部验证、单 writer 修改
- `papermate-oracle`: 路线裁决、复杂根因收敛、架构权衡
- `papermate-reviewer`: 独立复核、回归与风险检查

### 扩展角色

- `papermate-explorer`: 仓库内部只读勘探、入口与影响范围定位
- `papermate-librarian`: 外部资料与官方文档搜集、来源质量排序
- `papermate-researcher`: 长材料压缩、证据整合、结论提炼
- `papermate-monitor`: plugin 健康、轨迹缺口、超时与成本异常巡检
- `papermate-optimizer`: 基于历史轨迹总结调度优化建议
- `papermate-logger`: 仅在用户明确要求 digest / 复盘稿时生成自然语言摘要
- `papermate-checkpoint`: 关键决策点交互与用户确认
- `papermate-snapshot`: 改动前快照、回滚管理、历史追踪

## Blended Style

- **默认像 Hive**：轻量、短链路、单 agent 优先、稳定优先，不为小任务强行拉长路径
- **复杂任务像 GPT**：当任务进入高歧义、多阶段、外部研究、复杂根因、路线冲突或高风险写入时，再启用更完整的角色分工、探索、研究与裁决能力
- **PaperMates 只提供流程纪律**：它们用于补充设计、计划、调试、验证、review 的方法约束，不替代主控路由，也不把所有任务强制拖入重流程

## Design Rules

- `papermate-gpt` 是当前唯一推荐入口；旧 `hive-*` / `gpt-*` family 保留为历史兼容参考，不再作为默认建议
- 小任务优先 direct mode；复杂任务再升级到 `plan` 或 `swarm`
- 完成路径不依赖 plugin；plugin 健康时优先用它承担主要 telemetry
- 默认不写重型本地 raw audit；只有 plugin 不可用、任务失败、或用户明确要求日志时才写最小必要记录
- `papermate-logger` 不在默认主路径，只在用户显式要求时负责可读摘要
- 高风险命令、删除、权限、密钥、不可信输入优先走 `papermate-validator`
- 代码任务优先遵循“先定位范围，再改动，再验证，再 review”
- `papermate-coder` 作为单 writer 落地；`papermate-reviewer` 作为最终质量门
- `papermate-oracle` 只在确有多路线取舍或复杂根因裁决时介入，不作为默认步骤
- swarm 仅用于低耦合只读子目标；writer / review / merge 始终串行
- 链路异常、插件轨迹缺口、超时或超预算时再调 `papermate-monitor`
- 长期调度复盘时再调 `papermate-optimizer`

## Route Packet

建议复杂任务先压缩成：

- `priority`: `P0|P1|P2|P3`
- `cost_budget`: `low|balanced|high`
- `timeout_s`: `60|180|300|900`
- `checkpoint`: `auto|yes|no`
- `ambiguity`: `low|medium|high`
- `repo_familiarity`: `known|unknown`
- `external_info`: `no|optional|required`
- `risk`: `low|medium|high`
- `route_hint`: `auto|explore-first|research-first|code-first|decision-first`
- `plugin_health`: `unknown|healthy|degraded|unavailable`
- `telemetry_gap`: `none|minor|major|critical`
- `observability_mode`: `plugin|minimal|local-debug|off`
- `execution_mode`: `direct|plan|swarm`
- `swarm_width`: `1|2|3|4|5|6`

## Swarm Notes

- 通过固定 `papermate-*` 子角色 + worker 语义复用运行时能力，而不是临时发明新 agent 名称
- 只读探索、资料整理、证据比较可并行；写入、正式验证、review、汇总保持串行
- 共享状态通过极简 `blackboard` 维护：`goal / repo_map / facts / evidence_refs / decisions / open_questions`
- `papermate-monitor` 负责把 plugin 判定为 `healthy|degraded|unavailable|unknown`，并识别 `telemetry_gap`

## PaperMates Integration

- 当前推荐的是**安全版整合**：只接入 `papermates` skills，不启用全局 `using-papermates` takeover
- skills 入口应位于 `C:\Users\ljx\.config\opencode\skills\papermates\`
- `papermate-gpt` 继续负责路由、委派、并行边界与最终交付；`papermates` 只补流程纪律
- 推荐映射：
  - 功能/行为变更、且复杂度已超过极小改动：`papermates/brainstorming` -> `papermates/writing-plans`
  - bug/异常：`papermates/systematic-debugging`
  - 完成前核验：`papermates/verification-before-completion`
  - 正式 review 或交付前：可加载 `papermates/requesting-code-review`
- 不启用 `using-papermates` 的全局 takeover，以免破坏默认轻量主路径

## Notes

- 这套 family 的目标不是把 Hive 和 GPT 简单叠加，而是保留 Hive 的稳态默认风格，并在复杂任务时按需升级到 GPT 式多角色能力
- 默认只做会话内缓存，避免额外引入复杂持久化缓存层
- 如果你追求速度，优先保持 `plugin` 或 `minimal` 观测模式，而不是恢复旧式重日志链路

## Legacy / Compatibility Runtime Files

- 以下 runtime/config 文件目前仍作为历史兼容样例存在，但**不是** `papermate-gpt` 默认轻量主路径的必需前提
- 在这些文件完成统一命名前，不要把它们当成 `papermate-*` family 已完全收口的证据
- plugin health contract: `C:\Users\ljx\.config\opencode\api-config\plugin-telemetry-packet.schema.json`
- minimal swarm executor: `C:\Users\ljx\.config\opencode\api-config\swarm-executor.yaml`
- benchmark pack: `C:\Users\ljx\.config\opencode\api-config\swarm-benchmark-tasks.yaml`
- runtime implementation: `C:\Users\ljx\.config\opencode\scripts\swarm-runtime.js`
- runtime bridge: `C:\Users\ljx\.config\opencode\scripts\swarm-runtime-cli.js`
- runtime smoke test: `C:\Users\ljx\.config\opencode\scripts\swarm-runtime-smoke.js`
- example runtime plan: `C:\Users\ljx\.config\opencode\api-config\swarm-runtime-example-plan.json`
- vibe-coding plan builder: `C:\Users\ljx\.config\opencode\scripts\vibe-plan-builder.js`
- vibe-coding smoke test: `C:\Users\ljx\.config\opencode\scripts\vibe-coding-smoke.js`
- vibe-coding example spec: `C:\Users\ljx\.config\opencode\api-config\vibe-coding-example-spec.json`
- note: the current minimal runtime implementation caps read workers at 4; router-level widths 5-6 remain future capacity, not this runtime's default

## Known Limitations

- 当前最小 vibe-coding runtime 默认**不会自动回滚**；当 writer 成功但 verify 失败时，会返回 `verification_failed`，并保留已写入内容供人工检查或下一轮修复
