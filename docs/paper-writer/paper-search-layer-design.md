# paper-writer 搜索层设计稿

> 目的：为 `paper-writer` 增加高质量论文检索层，使其在“找得到论文”的基础上，进一步做到“找得准、找得全、解释得清、答辩时说得明白”。

## 1. 设计目标

搜索层不只是返回论文列表，而要同时提升：

1. **数量**：不要漏掉关键论文
2. **质量**：优先把真正相关、可用、可信的论文排前
3. **准确度**：减少跑题结果、重复结果、低价值结果
4. **可解释性**：说明为什么选这篇、不选那篇
5. **答辩可回答性**：让后续起草与答辩时能说清楚“为什么这样选文献”

## 2. 搜索层在整体架构中的位置

```text
user goal
-> paper-writer entry
-> routePacket
-> paper search layer
   -> multi-source recall
   -> normalize + dedup
   -> citation/reference expansion
   -> rerank
   -> search artifacts
-> paper-writer runtime/ui
-> downstream draft/review
```

它不替代总控，而是作为 `paper-writer` 在 `paper-scout` / `paper-library` / `paper-research-ops` 阶段下方的统一检索底座。

## 3. 搜索层的核心原则

### 3.1 多源召回，不信单一来源
- OpenAlex
- Semantic Scholar
- arXiv
- Crossref

### 3.2 先广后精
- 先做多源粗召回
- 再做去重与重排

### 3.3 先证据，后文风
搜索层输出必须服务于：
- 相关性判断
- claim 支撑
- 方法/对比/背景分类

### 3.4 defense-ready 默认弱约束
搜索层默认要保留：
- 为什么选这篇
- 它支持什么内容
- 替代候选为什么没被优先选中

## 4. Provider Registry 设计

第一版建议采用声明式 provider registry，而不是把查询逻辑写死在总控里。

## 4.1 第一版 provider

### Tier A：主 provider
- `openalex`
- `semantic_scholar`

### Tier B：补充 provider
- `arxiv`
- `crossref`

## 4.2 每个 provider 的最小输出字段

```text
provider_name
provider_record_id
title
authors
year
venue
abstract_or_summary
doi
url
citation_count
reference_count
source_type
provider_score
```

## 4.3 provider registry 作用

让 `paper-writer` 后续可以：
- 按优先级调用多个 provider
- 做 source fusion
- 做回退
- 在 quota / 失败时降级

## 5. 搜索流水线设计

### 阶段 1：Query Rewrite
把用户问题改写成多视角查询：

1. 原始自然语言查询
2. 关键词浓缩查询
3. title-like 短查询
4. seed-paper 扩展查询（有种子论文时）

### 阶段 2：Multi-source Recall
对多个 provider 并行粗召回。

### 阶段 3：Normalize + Dedup

按以下顺序去重：

1. DOI / arXiv ID / 外部主键
2. 标题规范化 + 年份
3. 近似重复（后续可加）

### 阶段 4：Graph Expansion

基于初筛优质论文做：
- references expansion
- citations expansion
- related/recommended expansion

### 阶段 5：Fusion + Rerank

建议第一版：
- RRF 或简单加权融合
- top-K rerank

### 阶段 6：Artifact 化输出

输出可被下游消费的结构化结果，而不是散乱文本。

## 6. 搜索层产物（Artifacts）

建议第一版新增 3 类核心产物：

### 6.1 `literature_candidate_set`
候选论文列表，适合下游筛选与入库。

### 6.2 `evidence_pack`
按 claim / topic / section 组织的证据集合。

### 6.3 `search_trace`
记录这轮搜索怎么来的，方便解释与复现。

## 6.4 当前代码接线说明（v1）

当前仓库中的第一版接线位于：

- `scripts/paper-writer-search-layer.js`
  - `getDefaultSearchProviders()`
  - `createSearchProviderRegistry()`
  - `createPaperCandidateItem()`
  - `createSearchArtifact()`
  - `searchWithMockProviders()`
  - `fuseMockSearchResults()`
  - `buildMockCandidateSet()`

### 当前接法

```text
runPaperWriterEntry()
-> createEntryRoutePacket()
-> if route needs search artifact
-> buildMockCandidateSet()
-> attach searchArtifact into runtime
-> expose searchSummary in ui
```

### 后续替换路径

将来接真实 provider 时，优先替换：

- `searchWithMockProviders()` -> real provider calls
- `fuseMockSearchResults()` -> normalize + dedup + fusion
- `buildMockCandidateSet()` -> real candidate-set builder

因此当前代码骨架不是临时分支，而是搜索层正式接线的第一版落点。

## 7. Candidate Item 结构建议

每篇候选论文除了基础 bibliographic 字段，建议额外加：

```text
selection_reason
claim_support_scope
topic_tags
method_tags
limitation_tags
defense_notes
dedup_cluster_id
canonical_preference
```

### 字段含义

- `selection_reason`：为什么把它放进候选集
- `claim_support_scope`：它更适合支持什么论断
- `defense_notes`：如果老师问“为什么选它”，可以怎么答
- `canonical_preference`：是否优先保留正式发表版本而不是预印本

## 8. Rerank 策略建议

第一版建议简单但有效：

### 8.1 排序信号
- query relevance
- topic match
- method match
- citation/reference graph proximity
- metadata completeness
- source confidence

### 8.2 避免过度依赖 citation count
引用数可以辅助，但不能让老论文天然垄断前排。

### 8.3 可选后续增强
- cross-encoder reranker
- scholarly embedding reranker
- claim-aware reranking

## 9. defense-ready 搜索输出

这是这层设计最重要的增强点之一。

搜索层不仅要说：
- 这篇相关

还要尽量能说：
- 它为什么相关
- 它支持哪类 claim
- 它和其他候选比优势在哪
- 如果答辩老师问“为什么用这篇不用那篇”，该如何回应

### 第一版建议至少输出

```text
selection_reason
alternative_rejection_reason
claim_support_scope
defense_notes
```

### 示例

```text
selection_reason:
  该文直接研究多模态教育反馈，且实验设置与当前问题域接近。

alternative_rejection_reason:
  另一篇虽引用更高，但聚焦通用反馈生成，不够贴近教育场景。

claim_support_scope:
  适合支持“多模态输入能提升反馈质量”这一弱到中等强度论断。

defense_notes:
  若被问为何选这篇，可回答：它与本研究场景、输入模态和评价维度都更接近。
```

## 10. routePacket 接法

搜索层不应孤立存在，而应受入口路由影响。

### 不同 entry route 的默认搜索行为

#### `domain_focus = scout`
- 多源广搜
- 注重 recall

#### `domain_focus = library`
- 搜索较少，偏元数据补全与去重

#### `domain_focus = draft`
- 搜索结果更偏 section-aware evidence pack

#### `domain_focus = ops`
- 偏单篇论文深读与局部问题检索

#### `domain_focus = review`
- 偏 claim-aware supporting/contradicting evidence retrieval

## 11. 最小评估思路

第一版不必上重 benchmark 系统，但至少要记住三件事：

### 11.1 数量
- 有没有漏掉关键基础论文 / 代表方法论文

### 11.2 质量
- 前 N 条结果中真正可用的比例是多少

### 11.3 可解释性
- 能不能说清楚为什么这篇进入结果

## 12. 第一版不做什么

为避免跑偏，第一版搜索层明确不做：

- 自研大型 scholarly retriever 训练
- 重型 distributed index
- 复杂长期缓存系统
- 过度追求全自动 end-to-end 论文搜索平台

## 13. 推荐实现顺序

### 第一步
实现 provider registry 骨架。

### 第二步
实现 query rewrite + multi-source recall。

### 第三步
实现 normalize + dedup。

### 第四步
实现 search artifacts。

### 第五步
加入 defense-ready 字段。

### 第六步
再做 rerank / graph expansion 增强。

## 14. 一句话收束

> `paper-writer` 的搜索层不应只是“帮我搜论文”，而应升级成“能多源召回、去重融合、解释选择理由，并为写作和答辩同时提供证据支撑的论文检索底座”。
