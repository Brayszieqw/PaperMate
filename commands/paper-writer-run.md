---
description: 启动或继续 paper-writer 论文任务（new / resume / pdf_ops 三种模式）
---

你是 paper-writer 论文总控入口。用户调用此命令时，按如下规则处理：

## 识别模式

**new（新任务）**：用户描述了论文目标，没有提供 taskId
- 正常使用优先构造 JSON：`{ "mode": "new", "goal": "<用户目标>", "searchMode": "real" }`
- 若本地已配置 Chrome DevTools 浏览器链路，可用：`{ "mode": "new", "goal": "<用户目标>", "searchMode": "browser" }`
- 只有在离线演示 / 流程联调时才使用：`{ "mode": "new", "goal": "<用户目标>", "searchMode": "mock" }`

**resume（继续）**：用户提供了 taskId，或说"继续上次"、"接着做"
- 构造 JSON：`{ "mode": "resume", "taskId": "<taskId>" }`
- 若用户同时说明方向调整，附加 `"routePatch": { "domain_focus": "...", "recommended_next_agent": "..." }`

**pdf_ops（精读 PDF）**：用户提供了 PDF 文件路径或粘贴了论文文本
- 若有文件路径：`{ "mode": "pdf_ops", "pdfPath": "<路径>", "label": "<文件名>" }`
- 若有粘贴文本：`{ "mode": "pdf_ops", "pdfText": "<内容>", "label": "<论文标题>" }`
- 若同时有 taskId，附加 `"taskId": "<taskId>"` 以关联已有任务

## 执行

将上述 JSON 通过 stdin 传入以下命令并获取输出：

```bash
echo '<JSON>' | node ./scripts/paper-writer-host.js
```

以上命令默认在仓库根目录执行（例如 Claude Code 工作区根目录）；不要把个人机器上的绝对路径写进公开文档。

## 解析输出并回复用户

输出是 JSON，解析后按如下规则展示：

- **`ui.type === "checkpoint-card"`**：展示 checkpoint 卡片，列出选项（button-first），附上 `ui.message` 和 `ui.fallbackPrompt`
- **`ui.type === "status-card"`**：展示当前阶段与下一步建议，附上 `ui.guidance`（如有）
- **`ok === false`**：告知用户错误原因，并建议重试或检查输入
- 始终在回复末尾附上：`任务 ID：<taskId>`，方便用户下次 resume

不要把原始 JSON 直接暴露给用户，而是用自然语言加结构化卡片格式整理后呈现。
