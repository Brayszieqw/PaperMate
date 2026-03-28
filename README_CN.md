<p align="center">
  <h1 align="center">PaperMate</h1>
  <p align="center">面向中国大学生的论文写作智能体 · Human-in-the-loop Thesis Copilot</p>
</p>

<p align="center">
  <a href="./README.md"><b>English</b></a> ·
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
> 它面向那些还不知道如何缩窄选题、检索文献、整理证据并将这些材料转化为论文结构的学生。PaperMate 的目标是辅助写作过程，而不是替代学生完成论文。

> **状态**：早期开源 WIP。运行时核心与搜索层已可用，端到端 LLM 起草功能正在开发中。

---

## 定位

PaperMate 不是"帮你把整篇论文写完"的工具。

第一个公开版本的范围有意收窄：

- 中国本科生和研究生的论文写作流程
- 人机协作的研究与写作辅助
- 证据优先的检索、笔记整理与草稿准备

长期架构可以支持其他语言和学术工作流，但这不是当前重点。

## 目标用户

- 需要学习论文写作流程的中国大学生
- 想要一个开放、可检查的论文写作运行时的开发者
- 研究受控、基于检查点的写作辅助的研究者

## 不是什么

- 全自动代写工具
- 成熟的端到端论文产品
- 适用于所有学校、领域和引用格式的通用方案

## 当前能做什么

- 将论文相关目标路由到对应的工作流阶段
- 通过 OpenAlex、Crossref 和 arXiv 进行多源文献检索
- 对候选论文进行融合、重排序和去重
- 生成带有明确筛选理由的结构化候选集
- 管理运行时状态、检查点和会话 artifact

## 为什么做这个项目

大多数写作智能体追求最大程度的自动化。PaperMate 走了一条不同的路：

- **人机协作**——在高风险操作前暂停，等待用户确认
- **证据优先**——每个论断都要追溯到你认可的来源
- **工作流感知**——选题收束、检索、笔记、起草、审查和修改是不同的阶段
- **开放可改**——运行时、数据契约和 prompt 全部在仓库里可见

这让 PaperMate 更适合需要支撑和结构的学生——他们仍然需要理解并能为自己写的内容辩护。

## 当前局限

- 搜索层是目前最成熟的部分
- 端到端 LLM 起草还未完全接入运行时
- 中文论文模板、学校专用规则和引用格式尚未标准化
- 浏览器辅助检索需要本地 Chrome DevTools 配置

## 快速开始

```bash
npm install
npm run test:paper-writer
npm run smoke:paper-writer
```

在代码中试用运行时：

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
├── .claude-plugin/         # Claude Code 插件清单
├── agents/                 # Agent prompt 与角色定义
├── commands/               # Slash command 入口
├── docs/                   # 设计文档与运行时契约
├── scripts/                # 运行时、搜索、会话与适配器代码
├── skills/                 # 自动激活的 skill 定义
├── README.md
└── ROADMAP.md
```

## 优先阅读

- `agents/paper-writer/paper-writer.md` — 核心工作流 prompt
- `scripts/paper-writer-search-layer.js` — 目前最成熟的实现
- `docs/paper-writer/paper-writer-runtime-contracts.md` — 运行时契约与数据模型
- `docs/paper-writer/progress-map.md` — 功能完成度与缺口

## 路线图

详见 [ROADMAP.md](./ROADMAP.md)。

## 参与贡献

欢迎提 Issue 和 PR。请先开 Issue 描述你想做的改动。

## 许可证

本项目采用 **GNU Affero General Public License v3.0（AGPL-3.0）** 授权。

这意味着：
- 你可以使用、学习、修改和分发本软件
- 如果你将修改版本部署为网络服务，必须以相同许可证开放源代码
- 允许商业使用，但不能将其闭源私有化

详见 [LICENSE](./LICENSE)。
