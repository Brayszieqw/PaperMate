<p align="center">
  <h1 align="center">PaperMate</h1>
  <p align="center">面向中国大学生的论文写作智能体 · Human-in-the-loop Thesis Copilot</p>
</p>

<p align="center">
  <a href="./README.md"><b>English</b></a> |
  <a href="./README_CN.md"><b>简体中文</b></a>
</p>

<p align="center">
  <a href="https://github.com/Brayszieqw/PaperMate/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License" />
  </a>
  <a href="https://github.com/Brayszieqw/PaperMate/releases">
    <img src="https://img.shields.io/github/v/release/Brayszieqw/PaperMate?color=green" alt="Release" />
  </a>
  <a href="https://github.com/Brayszieqw/PaperMate/stargazers">
    <img src="https://img.shields.io/github/stars/Brayszieqw/PaperMate?style=social" alt="Stars" />
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome" />
</p>

---

> PaperMate 是一个面向中国大学生的早期开源论文写作智能体。
>
> 它面向那些还不知道如何缩小选题、检索文献、整理证据并把这些材料转化为论文结构的学生。PaperMate 的目标是辅助写作过程，而不是替代学生完成论文。

> **状态**：早期开源 WIP。运行时核心和搜索层已经可用，端到端 LLM 起草仍在开发中。

---

## 定位

PaperMate 不是“帮你把整篇论文写完”的工具。

第一阶段公开版本的范围刻意收窄为：

- 中国本科生和研究生的论文写作流程
- 人机协作的研究与写作辅助
- 证据优先的检索、笔记整理与草稿准备

长期来看，架构可以支持其他语言和学术工作流，但这不是当前重点。

## 目标用户

- 需要学习论文写作流程的中国大学生
- 想要一个开放、可检查的论文写作 runtime 的开发者
- 研究受控、基于检查点的写作辅助系统的研究者

## 不是什么

- 全自动代写工具
- 成熟的端到端论文产品
- 适用于所有学校、学科和引用格式的通用方案

## 当前能做什么

- 将论文相关目标路由到对应的工作流阶段
- 通过 OpenAlex、Crossref 和 arXiv 进行多源文献检索
- 对候选论文进行融合、重排序和去重
- 生成带有明确筛选理由的结构化候选集
- 管理运行时状态、检查点和会话 artifacts

## 为什么做这个项目

大多数写作智能体追求尽可能强的自动化。PaperMate 走的是另一条路线：

- **人机协作**：在高风险动作前暂停，等待用户确认
- **证据优先**：每个论断都尽量能回到来源
- **工作流感知**：缩题、检索、笔记、起草、审查和修改是不同阶段
- **开放可改**：runtime、contracts 和 prompts 都在仓库里可见

这让 PaperMate 更适合需要支持和结构的学生，同时保留对内容的理解和答辩能力。

## 当前限制

- 搜索层是目前最成熟的部分
- 端到端 LLM 起草还没有完全接入 runtime
- 中文论文模板、学校专用规范和引用格式还未标准化
- 浏览器辅助检索需要本地 Chrome DevTools，并且需要显式允许本地 `bb-sites` 适配器执行

## 快速开始

```bash
npm install
npm run test:paper-writer
npm run smoke:paper-writer
```

## 作为 Claude Code 插件使用

本地开发时，可以把这个仓库作为 session-level plugin directory 加载：

```bash
claude --plugin-dir ~/PaperMate
```

加载后，Claude Code 可用：

- `/paper-writer-run`
- `papermate-*` agents
- `paper-writer` 论文工作流 agent
- `skills/` 下的 repo-local skills

如果后续发布到 Claude Code marketplace，可使用：

```bash
claude plugin install papermate
```

## 在代码中试用 runtime

```js
const { runPaperWriterEntry } = require('./scripts/paper-writer-entry');

const result = await runPaperWriterEntry({
  goal: '综述用于生物医学问答的检索增强生成方法',
  searchMode: 'real',
});

console.log(result.ui.guidance);
console.log(result.runtime.searchArtifact.items.length, '篇候选论文');
```

## 仓库结构

```text
PaperMate/
|- .claude-plugin/         # Claude Code 插件清单
|- agents/                 # Agent prompt 与角色定义
|- commands/               # Slash command 入口
|- docs/                   # 设计文档与运行时契约
|- scripts/                # runtime、搜索、会话与适配器代码
|- skills/                 # repo-local skills
|- examples/
|- README.md
|- ROADMAP.md
```

## 优先阅读

- `agents/paper-writer/paper-writer.md`：核心工作流 prompt
- `scripts/paper-writer-search-layer.js`：目前最成熟的实现
- `docs/paper-writer/paper-writer-runtime-contracts.md`：runtime 契约与数据模型
- `docs/paper-writer/progress-map.md`：功能完成度与缺口

## 路线图

详见 [ROADMAP.md](./ROADMAP.md)。

## 示例流程

完整示例参见 [examples/cs-master-related-work.md](./examples/cs-master-related-work.md)，包含：

- 论文任务路由
- 文献检索和候选集构建
- related work 草稿

## 参与贡献

欢迎提交 Issue 和 PR。建议先开 Issue 讨论想做的改动。

## 许可证

本项目采用 **GNU Affero General Public License v3.0 (AGPL-3.0)** 授权。

这意味着：

- 你可以使用、学习、修改和分发本软件
- 如果你将修改版本部署为网络服务，必须以同样许可证开放源代码
- 允许商业使用，但不能将其闭源私有化

详见 [LICENSE](./LICENSE)。
