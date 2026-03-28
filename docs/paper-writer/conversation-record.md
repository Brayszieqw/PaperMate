# paper-writer 会话记录（整理版）

> 说明：这里保存的是一次设计讨论的整理版记录，用于把关键决策转移到 `<opencode-root>`。它不是平台自动导出的原始逐 token 聊天日志，而是可复用的项目记录副本。

## 一、目标收束

用户目标：围绕论文工作流，搭建一个 OpenCode 内嵌的智能体团队，并以统一总入口方式使用。

最终方向：

- 顶层总 agent：`paper-writer`
- 平台形态：OpenCode 内嵌版
- 主场景：读论文 + 写 paper 并重
- 自动化风格：平衡型

## 二、选定的上游能力组合

确认使用的外部能力方向：

- 文献初筛：`ChatPaper`
- 长期文献库 / 笔记流：`dailypaper-skills`
- 中文论文规范生成 / 润色：`skill-thesis-writer`
- 综合学术平台：`gpt_academic`

## 三、架构决策

最初设计中曾用 `Paper-PaperMate-Gpt` 作为总入口，后续根据用户要求调整为：

- 顶层 orchestrator：`paper-writer`
- 为避免角色冲突，原写作子 agent 改名为：`Paper-Drafter`（当前在 OpenCode 配置中的规范名为：`paper-drafter`）

最终子 agent 体系：

- `paper-scout`
- `paper-library`
- `paper-drafter`
- `paper-research-ops`
- `paper-reviewer`

## 四、关键工作流决策

默认论文复合流程：

1. `paper-scout`：筛论文、排序、must-read 列表
2. `paper-library`：入库、结构化笔记、概念索引
3. `paper-drafter`：大纲、章节草稿、中文学术表达
4. `paper-research-ops`：PDF 问答、翻译、LaTeX、精读
5. `paper-reviewer`：claim-evidence、引用核验、review verdict

自动化边界：

- 可自动：筛选、摘要、入库、草稿、初步 review
- 需确认：覆盖已有正文、正式稿、定稿、批量替换引用

## 五、已经产出的项目文档

早期工作区 `<legacy-workspace>` 中曾有两份核心文档：

### 1. 设计 spec

`<legacy-workspace>/docs/papermates/specs/2026-03-20-paper-papermate-gpt-design.md`

核心内容包括：

- `paper-writer` 架构
- 路由规则
- mutation / checkpoint / stale-lock 安全约束
- Phase 1 边界与验收标准

### 2. implementation plan

`<legacy-workspace>/docs/papermates/plans/2026-03-20-paper-writer-implementation-plan.md`

核心内容包括：

- 文件结构
- TDD 顺序
- contracts / fingerprints / checkpoints / locks
- state / routing / adapters / workflows / cli
- OpenCode agents / skills 计划

## 六、已经完成的 git 提交

在早期原型仓库中已完成的提交：

- `45650e3` — `add paper papermate gpt design spec`
- `b17f2ba` — `refine paper-writer design spec`
- `3d9e739` — `add paper-writer implementation plan`

## 七、为什么把这份记录复制到 C 盘

用户明确说明：

- 希望真正的智能体配置放在 `<opencode-root>`
- 不希望仅停留在早期实验工作区

因此本记录用于：

- 把会话决策迁移到 OpenCode 配置目录
- 让后续可以直接从 C 盘的 agent / skill 配置继续扩展

## 八、当前在 C 盘需要创建的内容

目标位置示例：

- `<opencode-root>/agents/paper-writer/`
- `<opencode-root>/skills/paper-writer-orchestration/`
- `<opencode-root>/skills/paper-writer-review-checks/`

创建内容：

- `paper-writer.md`
- `paper-scout.md`
- `paper-library.md`
- `paper-drafter.md`
- `paper-research-ops.md`
- `paper-reviewer.md`
- 两个配套 skill 的 `SKILL.md`

## 九、后续建议

如果后续继续做实现，建议下一步：

1. 先让 OpenCode 成功识别这批 agent / skill
2. 再把 Python 运行时和本地 adapters 接到项目实现里
3. 最后才做真正的端到端自动化执行
